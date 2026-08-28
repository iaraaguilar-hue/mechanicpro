/**
 * chequeoOrdenERP.ts — el candado que se para ANTES de finalizar el service.
 *
 * QUÉ RESUELVE (el caso real que lo hizo nacer, 20-ago-2026):
 *
 *   · Orden 311 de Probikes: un renglón de repuesto quedó guardado con la
 *     descripción VACÍA y $50.288. El webhook salió igual, la automatización
 *     recibió un producto sin nombre, no pudo matchear nada y la orden de venta
 *     NUNCA se generó. Nadie se enteró: ni el mecánico ni el sistema.
 *   · Orden 319: dos renglones "Camara Specialized Ruta 20-28 48mm". Ese
 *     producto existe en el catálogo del taller pero como `origen: aprendido`,
 *     sin SKU y sin id del ERP: lo tipeó alguien una vez y el buscador lo
 *     aprendió. En Contabilium esa cámara se llama "PV TUBE 700X20-28 48MM".
 *     La automatización buscó por nombre, no encontró nada y la orden de venta
 *     tampoco se generó.
 *
 * O sea: los dos fallos son del MISMO tipo. El webhook manda un nombre suelto;
 * si ese nombre no le sirve al ERP, la orden de venta muere río abajo y en el
 * taller nadie lo ve. La reparación de fondo es que el payload lleve el SKU
 * (ver `ordenWebhook.ts`), pero eso solo funciona si el ítem está vinculado al
 * catálogo del ERP. Este módulo es la otra mitad: avisar en el momento en que
 * todavía se puede arreglar, que es antes de apretar Finalizar.
 *
 * REGLAS DE PRODUCTO (no negociables):
 *   · NUNCA bloquea. Avisa fuerte y deja finalizar igual. El mecánico puede
 *     tener razones que el sistema no conoce.
 *   · El aviso CITA el ítem. "Hay un problema" no sirve; "'Camara Specialized
 *     Ruta 20-28 48mm' no está en el catálogo del ERP" sí.
 *   · El aviso de "sin nombre" vale para CUALQUIER taller (un renglón sin
 *     nombre es basura en el comprobante del cliente, haya ERP o no).
 *     El de vínculo con el ERP solo para el taller que dispara el webhook.
 */

import { claveProducto } from './buscadorProductos';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemOrden {
    descripcion?: string | null;
    categoria?: string | null;
    precio?: number | null;
}

/** Lo que el catálogo del taller sabe de un producto, para decidir si está vinculado al ERP. */
export interface VinculoProducto {
    nombre: string;
    sku?: string | null;
    id_externo?: string | null;
    origen?: string | null;
    /** Cuántas veces el taller cargó este producto como repuesto (`productos_taller.veces_part`). */
    veces_part?: number | null;
    /** Cuántas veces lo cargó como mano de obra (`productos_taller.veces_labor`). */
    veces_labor?: number | null;
}

export type TipoAviso = 'sin_nombre' | 'sin_vinculo' | 'parece_repuesto';

export interface AvisoOrdenERP {
    tipo: TipoAviso;
    /** El texto del ítem tal cual lo escribió el mecánico ('' si está vacío). */
    descripcion: string;
    /** Suma de los renglones que dispararon este aviso (para poder nombrarlo por su precio). */
    precio: number;
    /** Cuántos renglones idénticos lo dispararon (la 319 tenía la misma cámara dos veces). */
    veces: number;
    /** El producto del ERP más parecido, si el buscador encontró alguno. */
    sugerencia?: string | null;
    /** Solo en 'parece_repuesto': cuántas veces se cargó como repuesto antes. */
    vecesComoRepuesto?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. El filtro de ítems que viajan al ERP
//
// 🚩 ESPEJO: esta es la MISMA cadena que arma el payload del webhook en
// `Workshop.tsx` (doFinalize). Si el candado midiera un conjunto distinto del
// que se manda, avisaría de ítems que no viajan o callaría los que sí. Por eso
// vive acá y la usan los dos: el que manda y el que chequea.
// ─────────────────────────────────────────────────────────────────────────────

/** Los productos de Mercado Libre ya se facturan por otro lado: no van al ERP. */
export function esItemMercadoLibre(descripcion: string | null | undefined): boolean {
    return /\(ml\)|\(mercado libre\)/i.test(descripcion || '');
}

/** Los ítems que efectivamente viajan en el webhook de la orden de venta. */
export function itemsQueVanAlERP<T extends ItemOrden>(items: T[] | null | undefined): T[] {
    return (items || []).filter(
        (p) => p && p.categoria === 'part' && !esItemMercadoLibre(p.descripcion),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-bis. "Esto parece un repuesto, no mano de obra"
//
// EL CASO REAL (orden 318 de Probikes, 28-ago-2026): el único ítem de la orden
// era `Pastillas de freno de resina Shimano K05S` $18.935, guardado con
// categoria = 'labor'. Como el payload filtra por 'part', la orden salió con
// CERO repuestos, el webhook nunca se disparó y la orden de venta no existió
// nunca en Contabilium. El defecto es peor que el de la 311/319: ahí el
// webhook al menos salía. Acá no sale nada, y el candado de arriba tampoco lo
// ve, porque también mira solo lo que pasó el filtro.
//
// LA SEÑAL (medida contra los 586 ítems de Probikes, no elegida a ojo): el
// MISMO nombre ya se venía cargando como repuesto. Las pastillas K05S: 6 veces
// repuesto, 1 vez mano de obra (esa 1 es la 318). "Recarga tubeless x2":
// 15 y 1. La categoría del catálogo NO sirve para esto: se congela con la que
// se aprendió la primera vez y no dice qué tan firme es el dato.
//
// EL UMBRAL sale de mirar los contraejemplos, que son los que fijan el número:
//   · `Centrado 1 Rueda`  → 1 repuesto / 1 mano de obra. Empate: NO avisa.
//   · `M.O.`              → 1 repuesto / 70 mano de obra. Es el caso inverso
//                           (una vez se cargó mal como repuesto): NO avisa.
// Con "2 o más veces como repuesto Y mayoría", en el catálogo de Probikes
// quedan 52 productos de 5.636 capaces de disparar el aviso, y en el historial
// habría saltado 3 veces en 586 ítems (0,5%). Un aviso que salta poco es un
// aviso que se lee: ver la calibración del 54% → 25% más abajo.
// ─────────────────────────────────────────────────────────────────────────────

/** Mínimo de veces cargado como repuesto para animarse a avisar. Ver arriba. */
export const VECES_PART_MINIMO = 2;

/**
 * ¿Este producto lo viene cargando el taller como repuesto?
 * Se le pregunta al historial, no a la categoría con la que se aprendió.
 */
export function vieneComoRepuesto(v: VinculoProducto | null | undefined): boolean {
    const part = Number(v?.veces_part) || 0;
    const labor = Number(v?.veces_labor) || 0;
    return part >= VECES_PART_MINIMO && part > labor;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. El chequeo
// ─────────────────────────────────────────────────────────────────────────────

/** Un producto está vinculado al ERP si tiene con qué buscarlo allá: id o SKU. */
export function estaVinculadoAlERP(v: VinculoProducto | null | undefined): boolean {
    if (!v) return false;
    return !!(v.id_externo && String(v.id_externo).trim()) || !!(v.sku && String(v.sku).trim());
}

export interface ParametrosChequeo {
    /** Todos los ítems de la orden (el filtro de los que van al ERP lo hace este módulo). */
    items: ItemOrden[] | null | undefined;
    /**
     * Catálogo del taller indexado por `clave` (la clave normalizada de la base).
     * Solo hace falta para los ítems que se van a chequear: quien llama resuelve
     * el lookup contra `productos_taller` y arma este mapa.
     */
    vinculos: Map<string, VinculoProducto>;
    /** ¿Este taller dispara el webhook de orden de venta al ERP? */
    erpActivo: boolean;
    /** Devuelve el nombre del producto del ERP más parecido, o null. Opcional. */
    sugerir?: (descripcion: string) => string | null;
    /**
     * ¿Un matcher POR TEXTO del otro lado va a encontrar este ítem igual?
     *
     * 🔴 POR QUÉ EXISTE. Medido contra las últimas 120 órdenes reales de
     * Probikes: avisando por "no está vinculado" a secas, el cartel saltaba en
     * el **54% de las órdenes**. Un aviso que aparece en más de la mitad de los
     * cierres deja de leerse en dos semanas, y ahí el candado no sirve para
     * nada.
     *
     * Y avisaba de más: la pregunta que le importa al mecánico no es "¿está
     * vinculado en NUESTRA base?" sino "¿el ERP lo va a encontrar?". Un
     * "Piñón a cassette Shimano Acera CS-HG200-9" no está vinculado, pero en
     * Contabilium existe "PINONES A CASSETTE SHIMANO ACERA CS-HG200-9" y
     * cualquier matcher por texto lo encuentra: ese ítem no corre riesgo.
     *
     * Con este filtro el aviso baja al **25% de las órdenes** y sigue cazando
     * los dos casos que lo hicieron nacer (311 y 319), porque
     * "Camara Specialized Ruta 20-28 48mm" y "PV TUBE 700X20-28 48MM" no
     * comparten una sola palabra.
     */
    encontrableEnERP?: (descripcion: string) => boolean;
}

/**
 * Devuelve la lista de avisos que hay que mostrarle al mecánico antes de cerrar.
 * Lista vacía = la orden está sana y se finaliza sin molestar a nadie.
 */
export function chequearOrdenParaERP({
    items,
    vinculos,
    erpActivo,
    sugerir,
    encontrableEnERP,
}: ParametrosChequeo): AvisoOrdenERP[] {
    const todos = items || [];

    // ── (1) Renglones sin nombre — el caso de la orden 311 ───────────────────
    // Vale para cualquier taller y para cualquier categoría: un ítem sin nombre
    // sale en blanco en el comprobante del cliente, tenga ERP o no.
    const sinNombre = todos.filter((p) => p && !(p.descripcion || '').trim());

    const avisos: AvisoOrdenERP[] = [];

    if (sinNombre.length > 0) {
        avisos.push({
            tipo: 'sin_nombre',
            descripcion: '',
            precio: sinNombre.reduce((s, p) => s + (Number(p.precio) || 0), 0),
            veces: sinNombre.length,
        });
    }

    if (!erpActivo) return avisos;

    // ── (2) Cargado como mano de obra, pero el taller lo usa como repuesto ───
    // El caso de la orden 318. Va ANTES del chequeo de vínculo porque es más
    // grave: un repuesto en la casilla equivocada no es que llegue mal al ERP,
    // es que NO SALE NADA (sin repuestos el webhook ni se dispara).
    const porClaveLabor = new Map<string, { descripcion: string; precio: number; veces: number; vecesComoRepuesto: number }>();
    for (const p of todos) {
        if (!p || p.categoria !== 'labor') continue;
        const desc = (p.descripcion || '').trim();
        if (!desc) continue; // ya avisado como "sin nombre"

        const clave = claveProducto(desc);
        const enCatalogo = vinculos.get(clave);
        if (!vieneComoRepuesto(enCatalogo)) continue;

        const previo = porClaveLabor.get(clave);
        if (previo) {
            previo.precio += Number(p.precio) || 0;
            previo.veces += 1;
        } else {
            porClaveLabor.set(clave, {
                descripcion: desc,
                precio: Number(p.precio) || 0,
                veces: 1,
                vecesComoRepuesto: Number(enCatalogo?.veces_part) || 0,
            });
        }
    }

    for (const entrada of porClaveLabor.values()) {
        avisos.push({
            tipo: 'parece_repuesto',
            descripcion: entrada.descripcion,
            precio: entrada.precio,
            veces: entrada.veces,
            vecesComoRepuesto: entrada.vecesComoRepuesto,
        });
    }

    // ── (3) Repuestos que el ERP no va a poder encontrar — la orden 319 ──────
    // Se agrupan por clave: la 319 tenía la misma cámara en dos renglones y el
    // mecánico tiene que leer un aviso, no dos idénticos.
    const porClave = new Map<string, { descripcion: string; precio: number; veces: number }>();

    for (const p of itemsQueVanAlERP(todos)) {
        const desc = (p.descripcion || '').trim();
        if (!desc) continue; // ya avisado arriba como "sin nombre"

        const clave = claveProducto(desc);
        if (estaVinculadoAlERP(vinculos.get(clave))) continue;
        // No está vinculado, pero si el ERP lo encuentra por el nombre igual,
        // no hay nada que avisar. Ver el porqué en `encontrableEnERP`.
        if (encontrableEnERP && encontrableEnERP(desc)) continue;

        const previo = porClave.get(clave);
        if (previo) {
            previo.precio += Number(p.precio) || 0;
            previo.veces += 1;
        } else {
            porClave.set(clave, { descripcion: desc, precio: Number(p.precio) || 0, veces: 1 });
        }
    }

    for (const entrada of porClave.values()) {
        avisos.push({
            tipo: 'sin_vinculo',
            descripcion: entrada.descripcion,
            precio: entrada.precio,
            veces: entrada.veces,
            sugerencia: sugerir ? sugerir(entrada.descripcion) : null,
        });
    }

    return avisos;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. La sugerencia ("¿no será este otro?")
//
// POR QUÉ NO ALCANZA `buscarProductos`: el buscador exige que TODAS las palabras
// escritas aparezcan en el producto, y ese es justo el caso que falló. Nadie va
// a encontrar "PV TUBE 700X20-28 48MM" escribiendo "Camara Specialized Ruta
// 20-28 48mm": no comparten una sola palabra de texto. Lo que sí comparten son
// las MEDIDAS, que en un repuesto de bici son la parte que identifica.
//
// Por eso la sugerencia puntúa distinto: pesa los tokens con números (medidas,
// SKU, rodados) y exige que al menos uno de esos coincida. Sin eso, "Cadena
// Shimano" sugeriría cualquier cosa que tenga la palabra "cadena".
// ─────────────────────────────────────────────────────────────────────────────

const tieneDigito = (t: string) => /[0-9]/.test(t);

/** Puntaje mínimo para animarse a sugerir. Calibrado contra el catálogo real de Probikes. */
const UMBRAL_SUGERENCIA = 6;

export function sugerirProductoERP(
    descripcion: string,
    catalogo: (VinculoProducto & { clave?: string | null })[],
): string | null {
    const crudos = claveProducto(descripcion).split(' ').filter(Boolean);
    const tokensQuery = crudos.filter((t) => t.length > 1);
    if (tokensQuery.length === 0) return null;

    const conMedida = tokensQuery.filter(tieneDigito);
    if (conMedida.length === 0) return null; // sin medidas no hay con qué desambiguar

    // Los números sueltos ("...CS-HG50-**8**-S") no suman puntos (un "8" común
    // no prueba nada), pero sí CASTIGAN cuando no están: son los que separan un
    // piñón de 8 velocidades de uno de 9.
    const numerosDelPedido = crudos.filter(tieneDigito);

    let mejor: { nombre: string; score: number } | null = null;

    for (const p of catalogo) {
        if (!estaVinculadoAlERP(p)) continue;

        const clave = p.clave || claveProducto(p.nombre);
        const tokens = new Set(clave.split(' ').filter((t) => t.length > 1));
        if (tokens.size === 0) continue;

        let score = 0;
        let compartidos = 0;
        let medidaCompartida = false;

        for (const t of tokensQuery) {
            if (tokens.has(t)) {
                compartidos += 1;
                if (tieneDigito(t)) { score += 4; medidaCompartida = true; }
                else score += 1;
                continue;
            }
        }

        // ── El castigo por el número que NO está ─────────────────────────────
        // Sin esto, "Disco de freno Shimano CL-900 140mm" sugería
        // "DISCO DE FRENO SHIMANO SM-RT64 140MM": comparte las cuatro palabras
        // y la medida, pero es OTRO modelo. Un número del pedido que no aparece
        // en el candidato es la señal de que no es el mismo.
        // Se mira como SUBCADENA porque el ERP pega las medidas ("20" vive
        // dentro de "700X20-28"), y ahí sí es la misma medida.
        for (const n of numerosDelPedido) {
            if (!clave.includes(n)) score -= 3;
        }

        // Dos condiciones duras: tiene que compartir una MEDIDA y algo más.
        // Con una sola coincidencia numérica ("29") sugeriría media bicicletería.
        if (!medidaCompartida || compartidos < 2) continue;
        // Entre dos empatados gana el nombre más corto: es el menos ruidoso.
        score -= Math.min(tokens.size, 12) * 0.1;

        if (score >= UMBRAL_SUGERENCIA && (!mejor || score > mejor.score)) {
            mejor = { nombre: p.nombre, score };
        }
    }

    return mejor ? mejor.nombre : null;
}

/** Las claves que hay que ir a buscar al catálogo para poder chequear la orden. */
export function clavesAChequear(items: ItemOrden[] | null | undefined): string[] {
    const claves = new Set<string>();
    // Los que viajan al ERP (para el chequeo de vínculo) Y los de mano de obra
    // (para el de "esto parece un repuesto"). Si la mano de obra no entrara acá,
    // el lookup no traería su fila del catálogo y el aviso de la 318 no podría
    // dispararse nunca: sería un check mudo.
    for (const p of itemsQueVanAlERP(items)) {
        const desc = (p.descripcion || '').trim();
        if (desc) claves.add(claveProducto(desc));
    }
    for (const p of items || []) {
        if (!p || p.categoria !== 'labor') continue;
        const desc = (p.descripcion || '').trim();
        if (desc) claves.add(claveProducto(desc));
    }
    return [...claves];
}
