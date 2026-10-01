/**
 * buscadorProductos.ts — El motor del buscador de repuestos.
 *
 * QUÉ RESUELVE: hasta ahora el mecánico escribía el repuesto letra por letra en
 * cada orden. Con esto escribe dos o tres letras y elige. El buscador sirve a
 * los dos tipos de taller que tenemos, con el MISMO código:
 *
 *   · Taller CON ERP (Contabilium): su catálogo maestro está importado en
 *     `productos_taller` (nombre + SKU). Busca sobre miles de productos.
 *   · Taller SIN integración: no hay catálogo que importar, así que el buscador
 *     aprende de él. Cada repuesto que carga sube su `veces_usado`, y el
 *     ranking pone adelante lo que ESE taller más usa. A las pocas semanas
 *     autocompleta igual de bien, sin que nadie haya cargado un catálogo.
 *
 * POR QUÉ ES LOCAL Y NO UNA CONSULTA POR TECLA: el catálogo entero del taller
 * se baja una vez (ver `fetchCatalogoProductos` en el store) y la búsqueda
 * corre en memoria. Con 5.400 productos son ~5 ms por tecla, o sea que la lista
 * se mueve mientras se escribe, sin esperar a la red. En un taller con wifi
 * malo eso es la diferencia entre usarlo y no usarlo.
 *
 * EL RANKING (por qué la primera opción suele ser la correcta) mezcla tres
 * señales: cuánto se parece lo escrito al nombre, cuántas veces ESE taller usó
 * ese producto, y hace cuánto lo usó. La frecuencia es lo que hace al buscador
 * "inteligente": un catálogo de 5.400 productos tiene 30 que se usan todos los
 * días, y son esos los que tienen que aparecer primero.
 */

import { levenshtein } from './productMatcher';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductoTaller {
    id: string;
    /** Lo que se muestra y lo que termina escrito en la orden. */
    nombre: string;
    /** Nombre normalizado. Lo calcula la BASE (columna generada) — acá solo se lee. */
    clave: string;
    sku?: string | null;
    /** Id del producto en el ERP (idConcepto de Contabilium). */
    id_externo?: string | null;
    /** Último precio conocido. Null cuando el catálogo se importó sin precios. */
    precio?: number | null;
    categoria: 'part' | 'labor' | string;
    origen?: string;
    /** Cuántas veces este taller lo cargó en una orden. Señal principal del ranking. */
    veces_usado: number;
    /** De esas veces, cuántas fue como repuesto. Alimenta el aviso "esto parece un repuesto". */
    veces_part?: number | null;
    /** ...y cuántas como mano de obra. */
    veces_labor?: number | null;
    ultima_vez?: string | null;
}

export interface OpcionesBusqueda {
    /** Filtra por tipo de ítem: repuesto o mano de obra. */
    categoria?: 'part' | 'labor';
    limite?: number;
    /** Solo para tests: congela "hoy" y hace determinístico el puntaje de recencia. */
    ahora?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Normalización
//
// `claveProducto` es el ESPEJO EXACTO de `public.clave_producto(text)` en la
// migración 20260809170000. Si se cambia una, se cambia la otra: la base usa esa
// función como llave de deduplicación y acá se normaliza lo que el usuario
// escribe para compararlo contra ella. Si divergen, el buscador deja de
// encontrar cosas que sí están.
// ─────────────────────────────────────────────────────────────────────────────

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

export function claveProducto(texto: string): string {
    return (texto || '')
        .normalize('NFD')
        .replace(MARCAS_DIACRITICAS, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * El código sin separadores: "21023-0613", "21023 0613" y "210230613" son el
 * mismo SKU. El mecánico lo copia de la etiqueta y el guion se lo saltea casi
 * siempre: comparando con guion, el buscador encontraba el 0,2% de los SKU
 * escritos así (medido sobre los 1.952 de Probikes, 1-oct-2026).
 */
export function skuCompacto(texto: string): string {
    return claveProducto(texto).replace(/ /g, '');
}

/** Cómo coincidió lo escrito con el SKU de un producto. */
type CoincidenciaSku = 'entero' | 'principio' | 'pedazo';

/**
 * Si lo escrito es el SKU del producto, o parte de él, y dónde empieza (en la
 * forma compacta). Recibe la consulta ya normalizada de las dos maneras para no
 * recalcularla por cada uno de los miles de productos.
 *
 *   · entero: el código completo, con o sin guiones.
 *   · principio: como siempre, el código desde el arranque. Sin guiones solo si
 *     lo escrito tiene un número: "mon" no es el principio de MO-NPH140 (un
 *     sellador Muc-Off), aunque sin el guion lo parezca; "2102306" sí es el
 *     principio de 21023-0613.
 *   · pedazo: del medio o del final, que es como se lee una etiqueta de Shimano
 *     ("M8100" de EPDM8100) o los últimos números de una de Specialized
 *     ("0613" de 21023-0613). Con 4 caracteres o más y algún número (tres
 *     letras sueltas aparecen adentro de cientos de códigos sin querer decir
 *     nada), y adentro de UN tramo del código: "1290" no está en 2812-9050,
 *     aunque sin el guion lo parezca.
 *
 * La usan el puntaje Y el resaltado: si midieran distinto, la fila marcaría en
 * negrita un SKU que no fue el motivo por el que apareció.
 */
function coincidirSku(
    skuProducto: string | null | undefined,
    q: string,
    consultaSku: string
): { tipo: CoincidenciaSku; donde: number } | null {
    if (!skuProducto || !consultaSku) return null;
    const sku = skuCompacto(skuProducto);
    if (!sku) return null;
    if (sku === consultaSku) return { tipo: 'entero', donde: 0 };
    if (claveProducto(skuProducto).startsWith(q)) return { tipo: 'principio', donde: 0 };
    if (consultaSku.length < 4 || !/\d/.test(consultaSku)) return null;
    if (sku.startsWith(consultaSku)) return { tipo: 'principio', donde: 0 };
    let corrido = 0;
    for (const tramo of claveProducto(skuProducto).split(' ')) {
        const i = tramo.indexOf(consultaSku);
        if (i >= 0) return { tipo: 'pedazo', donde: corrido + i };
        corrido += tramo.length;
    }
    return null;
}

/**
 * Normaliza CONSERVANDO LAS POSICIONES: el resultado tiene exactamente el mismo
 * largo que la entrada, carácter por carácter. `claveProducto` no sirve para
 * resaltar porque colapsa los espacios y corre los índices; esta sí, así que el
 * tramo que matcheó en el texto normalizado es el mismo tramo del nombre real.
 *
 * ⚠️ Espera el texto ya en NFC (una tilde = un carácter). En NFD la "á" son DOS
 * caracteres y la tilde suelta rompería la alineación, así que `resaltar()`
 * normaliza a NFC antes de llamar acá y corta los tramos sobre esa misma
 * cadena. Se ve idéntico en pantalla.
 */
function normalizarPosicional(texto: string): string {
    let salida = '';
    for (const ch of texto || '') {
        const base = ch.normalize('NFD').replace(MARCAS_DIACRITICAS, '').toLowerCase();
        const c = base.length >= 1 ? base[0] : ' ';
        salida += /[a-z0-9]/.test(c) ? c : ' ';
    }
    return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Puntaje
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que este taller más usa, con rendimiento decreciente: 1 uso ya despega al
 * producto sobre el catálogo frío, y de 20 usos en adelante casi no suma más
 * (si no, un solo producto muy repetido taparía todo lo demás).
 */
function puntajeFrecuencia(veces: number): number {
    const v = Math.max(0, veces || 0);
    return 30 * (v / (v + 3));
}

/** Un repuesto que se usó la semana pasada es mejor candidato que uno de 2023. */
function puntajeRecencia(ultimaVez: string | null | undefined, ahora: number): number {
    if (!ultimaVez) return 0;
    const t = Date.parse(ultimaVez);
    if (Number.isNaN(t)) return 0;
    const dias = (ahora - t) / 86_400_000;
    if (dias <= 90) return 10;
    if (dias <= 365) return 4;
    return 0;
}

/** Similitud de caracteres 0..1 sobre la distancia de edición. */
function similitud(a: string, b: string): number {
    if (!a.length && !b.length) return 1;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

interface Candidato { producto: ProductoTaller; score: number; }

// ─────────────────────────────────────────────────────────────────────────────
// 4. Búsqueda
// ─────────────────────────────────────────────────────────────────────────────

const LIMITE_DEFAULT = 8;

/**
 * Busca productos del taller y los devuelve ordenados por relevancia.
 *
 * Con la consulta VACÍA devuelve las sugerencias: lo que el taller más usa. Es
 * el caso más valioso y el más barato — el mecánico hace foco en el campo y ya
 * tiene sus 8 repuestos habituales a un clic, sin escribir nada.
 *
 * Con consulta, los términos van en CUALQUIER ORDEN y alcanza con el principio
 * de cada palabra: "past shim" encuentra "PASTILLAS DE FRENO SHIMANO B05S".
 * Si esa pasada estricta trae poco y nada, hace una segunda pasada tolerante a
 * errores de tipeo ("pastila" → "pastilla").
 */
export function buscarProductos(
    catalogo: ProductoTaller[],
    consulta: string,
    opciones: OpcionesBusqueda = {}
): ProductoTaller[] {
    const { categoria, limite = LIMITE_DEFAULT, ahora = Date.now() } = opciones;

    const universo = catalogo.filter(p =>
        p && p.clave && (!categoria || p.categoria === categoria)
    );

    const q = claveProducto(consulta);

    // ── Sin consulta: "lo que más usás" ──────────────────────────────────────
    // Solo productos con historial de uso. Listar el catálogo importado por
    // orden alfabético sería ruido: nadie quiere ver 8 zapatillas talle 39
    // cada vez que abre el campo.
    if (!q) {
        return universo
            .filter(p => (p.veces_usado || 0) > 0)
            .sort((a, b) =>
                (b.veces_usado || 0) - (a.veces_usado || 0) ||
                (Date.parse(b.ultima_vez || '') || 0) - (Date.parse(a.ultima_vez || '') || 0) ||
                a.nombre.localeCompare(b.nombre))
            .slice(0, limite);
    }

    const terminos = q.split(' ');
    const consultaSku = skuCompacto(consulta);
    const estrictos: Candidato[] = [];
    // Los que solo aparecen por un pedazo de su SKU van DESPUÉS de todo lo que
    // coincide por nombre: si lo escrito está en el nombre de algo, era una
    // búsqueda por nombre. Rescatan lo que el nombre no encuentra, no compiten.
    const porPedazoDeSku: Candidato[] = [];

    for (const p of universo) {
        const tokens = p.clave.split(' ');

        // El SKU se busca entero, no por palabras: quien lo escribe (o lo lee
        // con un lector de códigos) sabe exactamente qué quiere.
        const sku = coincidirSku(p.sku, q, consultaSku);
        const matchSku = !!sku;

        let cobertura = 0;
        let todosMatchean = true;
        for (const t of terminos) {
            let mejor = 0;
            for (const tok of tokens) {
                if (tok.startsWith(t)) mejor = Math.max(mejor, t.length / tok.length);
            }
            if (mejor === 0) { todosMatchean = false; break; }
            // Palabra completa suma el doble que un prefijo corto.
            cobertura += 10 * mejor;
        }

        if (!todosMatchean && !matchSku) continue;

        if (!todosMatchean && sku?.tipo === 'pedazo') {
            porPedazoDeSku.push({
                producto: p,
                score: puntajeFrecuencia(p.veces_usado) + puntajeRecencia(p.ultima_vez, ahora),
            });
            continue;
        }

        let score = todosMatchean ? cobertura : 0;
        // El código entero pesa más que su principio: con "49" tiene que salir
        // el producto cuyo SKU ES 49, no los que empiezan con 49. Un pedazo no
        // suma cuando el nombre también coincide: si sumara, "r8000" dejaba de
        // traer primero el piñón que el taller usa siempre para traer unos
        // pedales con R8000 en el código.
        if (sku?.tipo === 'entero') score += 150;
        else if (sku?.tipo === 'principio') score += 120;
        // El nombre arranca con lo que escribió → casi siempre es lo que busca.
        if (p.clave.startsWith(q)) score += 40;
        else if (tokens[0]?.startsWith(terminos[0])) score += 15;
        score += puntajeFrecuencia(p.veces_usado);
        score += puntajeRecencia(p.ultima_vez, ahora);
        // Ante todo lo demás igual, gana el nombre más corto: es el menos ruidoso.
        score -= Math.min(tokens.length, 12) * 0.4;

        estrictos.push({ producto: p, score });
    }

    const porPuntaje = (a: Candidato, b: Candidato) =>
        b.score - a.score || a.producto.nombre.localeCompare(b.producto.nombre);
    estrictos.sort(porPuntaje);
    porPedazoDeSku.sort(porPuntaje);
    estrictos.push(...porPedazoDeSku);

    // ── Segunda pasada: errores de tipeo ─────────────────────────────────────
    // Solo si la estricta casi no trajo nada, porque es la cara. El bloqueo por
    // primera letra la mantiene en pocos milisegundos aun con 5.400 productos.
    // Contrapartida asumida: un error en la PRIMERA letra no se recupera.
    if (estrictos.length < 3 && q.length >= 4) {
        const yaEstan = new Set(estrictos.map(c => c.producto.id));
        const difusos: Candidato[] = [];

        for (const p of universo) {
            if (yaEstan.has(p.id)) continue;
            const tokens = p.clave.split(' ');
            let cobertura = 0;
            let todosMatchean = true;
            for (const t of terminos) {
                let mejor = 0;
                for (const tok of tokens) {
                    if (tok[0] !== t[0]) continue;              // bloqueo barato
                    mejor = Math.max(mejor, similitud(t, tok.slice(0, t.length + 2)));
                }
                // Umbral 0,70 y no 0,60: con 0,60 "bujes" traía "BONES TEE"
                // (dos letras de diferencia sobre cinco da exactamente 0,60).
                // Medido contra el catálogo real de Probikes. Los errores de
                // tipeo de verdad quedan muy por encima: pastila→pastilla 0,88 ·
                // shimno→shimano 0,86 · cadna→cadena 0,83.
                if (mejor < 0.70) { todosMatchean = false; break; }
                cobertura += 8 * mejor;
            }
            if (!todosMatchean) continue;
            difusos.push({
                producto: p,
                score: cobertura + puntajeFrecuencia(p.veces_usado) + puntajeRecencia(p.ultima_vez, ahora),
            });
        }

        difusos.sort((a, b) => b.score - a.score || a.producto.nombre.localeCompare(b.producto.nombre));
        estrictos.push(...difusos);
    }

    return estrictos.slice(0, limite).map(c => c.producto);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Resaltado
// ─────────────────────────────────────────────────────────────────────────────

export interface Tramo { texto: string; match: boolean; }

/**
 * Parte el nombre en tramos marcando lo que coincide con lo escrito, para que
 * la lista muestre en negrita por qué apareció cada resultado.
 * Trabaja sobre la normalización posicional, así que respeta acentos, mayúsculas
 * y puntuación del nombre original.
 */
export function resaltar(nombreCrudo: string, consulta: string): Tramo[] {
    if (!nombreCrudo) return [];
    // A NFC para que una letra acentuada sea UN carácter y los índices de la
    // normalización posicional coincidan con los del nombre que se corta abajo.
    const nombre = nombreCrudo.normalize('NFC');
    const q = claveProducto(consulta);
    if (!q) return [{ texto: nombre, match: false }];

    const norm = normalizarPosicional(nombre);
    const marcado = new Array<boolean>(nombre.length).fill(false);

    for (const termino of q.split(' ')) {
        // Cada término se marca donde arranque una palabra (que es como matchea
        // la búsqueda: por prefijo). Se marcan TODAS las apariciones.
        let desde = 0;
        while (desde < norm.length) {
            const i = norm.indexOf(termino, desde);
            if (i < 0) break;
            const arrancaPalabra = i === 0 || norm[i - 1] === ' ';
            if (arrancaPalabra) {
                for (let k = i; k < i + termino.length; k++) marcado[k] = true;
            }
            desde = i + 1;
        }
    }

    const tramos: Tramo[] = [];
    let inicio = 0;
    for (let i = 1; i <= nombre.length; i++) {
        if (i === nombre.length || marcado[i] !== marcado[inicio]) {
            tramos.push({ texto: nombre.slice(inicio, i), match: marcado[inicio] });
            inicio = i;
        }
    }
    return tramos;
}

/**
 * Lo mismo para el SKU que se muestra abajo del nombre: marca el pedazo del
 * código que coincidió con lo escrito, salteando guiones y espacios ("2102306"
 * marca "21023-06" en "21023-0613"). Si el producto no apareció por su SKU, no
 * marca nada.
 */
export function resaltarSku(skuCrudo: string | null | undefined, consulta: string): Tramo[] {
    if (!skuCrudo) return [];
    const sku = skuCrudo.normalize('NFC');
    const consultaSku = skuCompacto(consulta);
    const coincidencia = coincidirSku(sku, claveProducto(consulta), consultaSku);
    if (!coincidencia) return [{ texto: sku, match: false }];
    const donde = coincidencia.donde;

    // Posición en el SKU real de cada carácter de la forma compacta.
    const norm = normalizarPosicional(sku);
    const posiciones: number[] = [];
    for (let i = 0; i < norm.length; i++) if (norm[i] !== ' ') posiciones.push(i);
    const desde = posiciones[donde];
    const hasta = posiciones[donde + consultaSku.length - 1];
    if (desde === undefined || hasta === undefined) return [{ texto: sku, match: false }];

    return [
        { texto: sku.slice(0, desde), match: false },
        { texto: sku.slice(desde, hasta + 1), match: true },
        { texto: sku.slice(hasta + 1), match: false },
    ].filter(t => t.texto);
}
