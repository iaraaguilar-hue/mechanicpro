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

/** Modelo → disciplina para el CATÁLOGO del ERP. Solo Specialized a
 *  propósito: el catálogo del taller es Specialized, y las palabras de
 *  otras marcas acá cazan repuestos — medido 19-ago contra el lote real:
 *  "QUICK LINK"→Cannondale Quick, "SENSOR DE CADENCIA"→GT Sensor, la
 *  báscula "DIGITAL SCALE"→Scott Scale. 12 falsos positivos. Las otras
 *  marcas viven en MODELOS_CLIENTE, que solo mira bicis de clientes. */
const MODELOS: [RegExp, Disciplina][] = [
    [/\b(tarmac|allez|aethos|roubaix|amira|ruby|venge|shiv)\b/i, 'ruta'],
    [/\b(diverge|crux)\b/i, 'gravel'],
    [/\b(epic|chisel|rockhopper|stumpjumper|pitch|fuse|hardrock|camber|enduro|status|levo|s-?works)\b/i, 'mtb'],
    [/\b(sirrus|vado|como|roll|crossroads|turbo\s+vado)\b/i, 'urbana'],
    [/\b(riprock|hotrock|jett)\b/i, 'niños'],
    [/\bp\.?\s?[34]\b/i, 'mtb'], // P.3 / P.4 — dirt jump
];

/** Modelos de OTRAS marcas + apodos. SOLO para bicis de clientes (el
 *  registro es una bici por definición, así que acá una palabra ambigua
 *  no puede cazar un repuesto). Marcas medidas en la base real de
 *  Probikes: Giant/Trek/Cannondale/Pinarello/Scott/Cube/Merida/GT/
 *  Canyon/BMC/Cervelo/Colnago + las argentinas (Vairo/Venzo/Raleigh). */
const MODELOS_CLIENTE: [RegExp, Disciplina][] = [
    // Giant / Liv
    [/\b(tcr|defy|propel|contend|content|langma|avail|trinity)\b/i, 'ruta'],
    [/\b(revolt)\b/i, 'gravel'],
    [/\b(talon|trance|anthem|fathom|stance|xtc)\b/i, 'mtb'],
    [/\b(escape)\b/i, 'urbana'],
    // Trek
    [/\b(madone|emonda|domane)\b/i, 'ruta'],
    [/\b(checkpoint)\b/i, 'gravel'],
    [/\b(marlin|x-?caliber|procaliber|supercaliber|roscoe|fuel\s?ex|top\s?fuel|slash|remedy)\b/i, 'mtb'],
    [/\b(fx\s?\d|dual\s+sport)\b/i, 'urbana'],
    // Cannondale
    [/\b(supersix|synapse|caad\s?\d*|systemsix)\b/i, 'ruta'],
    [/\b(topstone)\b/i, 'gravel'],
    [/\b(scalpel|habit|jekyll|f-?si|trail\s?\d)\b/i, 'mtb'],
    [/\b(quick\s?\d?)\b/i, 'urbana'],
    // Pinarello
    [/\b(dogma|prince|paris|razha|marvel|fp\s?\d)\b/i, 'ruta'],
    [/\b(grevil)\b/i, 'gravel'],
    // Scott
    [/\b(addict|foil|speedster)\b/i, 'ruta'],
    [/\b(spark|scale|genius|aspect|ransom)\b/i, 'mtb'],
    // Cube
    [/\b(agree|attain|litening)\b/i, 'ruta'],
    [/\b(nuroad)\b/i, 'gravel'],
    [/\b(aim|acid|reaction|stereo)\b/i, 'mtb'],
    // Merida
    [/\b(scultura|reacto)\b/i, 'ruta'],
    [/\b(silex)\b/i, 'gravel'],
    [/\b(matts|big\s?(nine|seven)|one-?twenty|one-?forty)\b/i, 'mtb'],
    [/\b(speeder)\b/i, 'urbana'],
    // GT
    [/\b(aggressor|avalanche|sensor|zaskar)\b/i, 'mtb'],
    [/\b(grade)\b/i, 'gravel'],
    [/\b(traffic)\b/i, 'urbana'],
    // Canyon / BMC / Jamis / Marin / Fuji / Raleigh / Vairo / Venzo
    [/\b(aeroad|ultimate|endurace|teammachine|xenith)\b/i, 'ruta'],
    [/\b(nicasio)\b/i, 'gravel'],
    [/\b(nevada|mojave|loki|stinger)\b/i, 'mtb'],
    [/\bxr\s?\d/i, 'mtb'], // Vairo XR 3.8
    // Specialized que el catálogo no nombra así
    [/\bworld\s?cup\b/i, 'mtb'],     // Epic World Cup anotada como "World Cup Expert"
    [/\b(crosstrail)\b/i, 'urbana'],
    // Marcas que SOLO hacen ruta/triatlón: la marca alcanza
    [/\b(cervelo|cervélo|colnago|argon\s?18)\b/i, 'ruta'],
];

/** Apodos con los que el mecánico anota la bici del cliente.
 *  "SL7 Sport" es una Tarmac; "RH X1" es una Rockhopper. */
const APODOS: [RegExp, Disciplina][] = [
    [/\bsl\s?[5-8]\b/i, 'ruta'],   // SL5/6/7/8 = Tarmac
    [/\brh\b/i, 'mtb'],            // RH = Rockhopper
    [/\bsj\b/i, 'mtb'],            // SJ = Stumpjumper
];

/** Palabras genéricas: cuando el modelo ES la disciplina ("Spy Gravel").
 *  Último recurso, después de modelos y apodos. */
const GENERICOS: [RegExp, Disciplina][] = [
    [/\bgravel\b/i, 'gravel'],
    [/\b(mtb|mountain|montania|montaña)\b/i, 'mtb'],
    [/\b(ruta|road)\b/i, 'ruta'],
    [/\b(urbana|paseo|playera|fixie|city)\b/i, 'urbana'],
    [/\b(rodado\s?(12|16|20)|ninios|niños|infantil|kids?)\b/i, 'niños'],
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

/**
 * Disciplina de la bici de un CLIENTE, inferida de marca + modelo como los
 * cargó el mecánico ("Specialized" + "RH X1 Pro Negra", "Spy" + "Gravel").
 * NO se escribe en la base: se infiere al momento del cruce, así el dato
 * inferido nunca se disfraza de dato cargado (bicicletas.categoria queda
 * para cuando alguien lo cargue a mano).
 * null = no se pudo afirmar; el cruce lo declara, no lo adivina.
 */
export function disciplinaDeBiciCliente(
    marca: string | null | undefined,
    modelo: string | null | undefined,
    categoria?: string | null,
): Disciplina | null {
    // Si el taller cargó la categoría a mano, ese dato manda.
    const cat = String(categoria ?? '').toLowerCase().trim();
    if (['ruta', 'gravel', 'mtb', 'urbana', 'niños', 'ninos'].includes(cat)) {
        return (cat === 'ninos' ? 'niños' : cat) as Disciplina;
    }
    const t = `${marca ?? ''} ${modelo ?? ''}`;
    for (const [re, d] of MODELOS) if (re.test(t)) return d;
    for (const [re, d] of MODELOS_CLIENTE) if (re.test(t)) return d;
    for (const [re, d] of APODOS) if (re.test(t)) return d;
    for (const [re, d] of GENERICOS) if (re.test(t)) return d;
    return null;
}

/** Talle de la bici de un cliente: el campo `talle` si está cargado; si no,
 *  se intenta leer del modelo (a veces el mecánico lo anota ahí). */
export function talleDeBiciCliente(
    talle: string | null | undefined,
    modelo: string | null | undefined,
): string | null {
    const t = String(talle ?? '').trim().toUpperCase();
    if (/^(XXS|XS|S|M|L|XL|XXL|4[4-9]|5[0-9]|6[0-4])$/.test(t)) return t;
    return talleDeBici(modelo);
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
