// ─────────────────────────────────────────────────────────────────────────────
// Leer una BICI COMPLETA del catálogo del taller (idea 15: cruzar el stock
// parado contra la base de clientes).
//
// 🚩 Por qué esto existe y no alcanza con `familia = 'Bike'`: medido contra el
// catálogo real de Probikes, de los 67 productos de familia "Bike" con stock, la
// MAYORÍA no son bicis — son repuestos y kits de service que el ERP archiva en
// el mismo rubro: "HGR MY18 ROAD DISC ... DERAILLEUR HANGER", "RIM STOUT XC 29",
// "SUB ROCKSHOX ... 200HR SERVICE KIT", "TOL PRAXIS BOTTOM BRACKET TOOL".
// Contar esos como bicis paradas infla la plata parada y llena la lista del
// dueño de cosas que no le puede vender a nadie.
//
// La regla: es bici si reconozco el MODELO. Lo que no reconozco no se adivina,
// se descarta y se cuenta aparte para poder decir cuántas quedaron afuera.
// ─────────────────────────────────────────────────────────────────────────────

export type Disciplina = 'ruta' | 'gravel' | 'mtb' | 'urbana' | 'niños';

/** Modelo → disciplina. Ampliar acá cuando el taller venda otra marca. */
const MODELOS: [RegExp, Disciplina][] = [
    [/\b(tarmac|allez|aethos|roubaix|amira|ruby|venge|shiv)\b/i, 'ruta'],
    [/\b(diverge|crux)\b/i, 'gravel'],
    [/\b(epic|chisel|rockhopper|stumpjumper|pitch|fuse|hardrock|camber|enduro|status|levo|s-?works)\b/i, 'mtb'],
    [/\b(sirrus|vado|como|roll|crossroads|turbo\s+vado)\b/i, 'urbana'],
    [/\b(riprock|hotrock|jett)\b/i, 'niños'],
    [/\bp\.?\s?[34]\b/i, 'mtb'], // P.3 / P.4 — dirt jump
];

/** Prefijos con los que el ERP nombra los REPUESTOS dentro del rubro Bike. */
const REPUESTO = /^(hgr|rim|stc|sub|axl|bar|stm|hds|tol|fork|frm|whl|crk|brk|cbl|sdl|tir)\b|\b(service kit|derailleur hanger|seatpost|handlebar|bottom bracket|thru-?axle|spacer|shim|frmset|frameset)\b/i;

/** Basura de ERP: productos de prueba que quedaron cargados. */
const BASURA = /^(prueba|test|xxx+|aaa+|zzz+)\b|^\W*$/i;

/**
 * El talle de una bici, leído del nombre del producto. Dos formatos reales:
 *   "ALLEZ E5 BRA SKYBLU/TARBLK 52"        → 52   (ruta: al final)
 *   "ROCKHOPPER EXPERT EMDMET/SHDWSIL S - 29" → S  (MTB: talle ANTES del rodado)
 *   "CHISEL BASE PST/WHT M"                → M
 * El segundo formato es el que se nos escapaba: buscar solo al final daba 45%
 * de cobertura en vez de 90%.
 */
export function talleDeBici(nombre: string | null | undefined): string | null {
    const t = String(nombre ?? '').trim();
    if (!t) return null;
    // "TALLE - RODADO" (29 / 27.5 / 26 / 24 / 20): el talle es lo de antes.
    const conRodado = t.match(/\b(XXS|XS|S|M|L|XL|XXL|4[4-9]|5[0-9]|6[0-4])\s*[-–]\s*(?:29|27\.5|26|24|20)\b/i);
    if (conRodado) return conRodado[1].toUpperCase();
    // Talle numérico de ruta al final.
    const num = t.match(/\b(4[4-9]|5[0-9]|6[0-4])\s*$/);
    if (num) return num[1];
    // Talle de letra al final.
    const letra = t.match(/\b(XXS|XS|S|M|L|XL|XXL)\s*$/i);
    if (letra) return letra[1].toUpperCase();
    return null;
}

export function disciplinaDeBici(nombre: string | null | undefined): Disciplina | null {
    const t = String(nombre ?? '');
    for (const [re, d] of MODELOS) if (re.test(t)) return d;
    return null;
}

export interface BiciDeCatalogo {
    disciplina: Disciplina;
    talle: string | null;
}

/**
 * ¿Este producto del catálogo es una bici completa que se le puede ofrecer a
 * un cliente? Devuelve null cuando no lo es o cuando no se puede afirmar.
 *
 * `stock` entra en la decisión solo para atajar la basura del ERP: nadie tiene
 * 599.985 unidades de una bici (es un producto de prueba cargado en Contabilium).
 */
export function biciDeCatalogo(
    producto: { nombre?: string | null; precio?: number | null; stock?: number | null },
): BiciDeCatalogo | null {
    const nombre = String(producto.nombre ?? '').trim();
    if (!nombre || BASURA.test(nombre)) return null;
    if (REPUESTO.test(nombre)) return null;
    // Un stock absurdo delata un producto de prueba, no un depósito lleno.
    if ((producto.stock ?? 0) > 60) return null;
    const disciplina = disciplinaDeBici(nombre);
    if (!disciplina) return null;
    return { disciplina, talle: talleDeBici(nombre) };
}
