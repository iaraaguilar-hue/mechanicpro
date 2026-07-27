/**
 * productMatcher.ts — Entity resolution para nombres de repuestos escritos a mano.
 *
 * PROBLEMA: el mecánico tipea el mismo repuesto de N formas ("Pastillas de freno Shimano" /
 * "pastillas shimano" / "past. freno") y el ranking de "unidades más vendidas" los cuenta como
 * productos distintos. Este módulo reconoce que son el mismo producto y cuenta bien las unidades.
 *
 * PRINCIPIO (evitar falsos positivos > mergear de más): dos textos son el mismo producto solo si
 *   1) comparten el ANCLA (sustantivo cabeza: pastilla, cadena, cámara…), y
 *   2) sus DISCRIMINANTES son compatibles: código de modelo (HG601, B05S), velocidad (11v≠8v),
 *      medida (160mm), grupo/tier (NX≠GX). Estos son candados DUROS que corren ANTES del fuzzy.
 *   3) el resto del texto (tokens descriptivos) supera un umbral de similitud token-set.
 * Así "cadena 11v" nunca se funde con "cadena 8v", ni "HG40" con "HG601", por más parecidas que
 * se vean a nivel de caracteres.
 *
 * Es OFFLINE y sin dependencias (cero API paga): normalización Unicode nativa + token-set/Jaccard +
 * Levenshtein propio. Funciones puras → testeables (ver productMatcher.test).
 *
 * Referencias de diseño: pipeline normalización→blocking→scoring→threshold con guardias de
 * discriminante (Primentra master-data-matching; py_stringmatching TokenSort; FuzzyWuzzy).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Diccionarios de dominio (datos, no código: fáciles de extender sin tocar lógica)
// ─────────────────────────────────────────────────────────────────────────────

/** Abreviaturas y variantes → forma canónica. Se aplican token a token. */
const ABBREV: Record<string, string> = {
    past: 'pastilla', pastillas: 'pastilla',
    patines: 'patin',
    camaras: 'camara',
    cubiertas: 'cubierta', cub: 'cubierta',
    del: 'delantero', delant: 'delantero', delantera: 'delantero', delanteros: 'delantero',
    tra: 'trasero', tras: 'trasero', trasera: 'trasero', traseros: 'trasero',
    reg: 'regulacion', regulacio: 'regulacion',
    inst: 'instalacion', instal: 'instalacion',
    liq: 'liquido',
    manillar: 'manubrio', // "cinta de manillar" ≡ "cinta de manubrio"
    pinon: 'pinon', pinones: 'pinon',
    cassette: 'pinon', casete: 'pinon', // en el taller se usan indistinto para el mismo objeto
    disco: 'disco', discos: 'disco',
    frenos: 'freno',
    cadenas: 'cadena',
    ruedas: 'rueda',
};

/** Palabras de ruido que NO aportan identidad (se descartan). NUNCA meter acá marcas ni specs. */
const STOPWORDS = new Set([
    'de', 'para', 'con', 'y', 'o', 'a', 'la', 'el', 'los', 'las', 'un', 'una',
    'bici', 'bicicleta', 'compatible', 'tipo',
    // OJO: 'resina'/'goma' NO son ruido — distinguen pastilla de resina vs metálica (SKUs distintos).
]);

/** Grupos/tier de transmisión: son discriminantes DUROS (NX ≠ GX ≠ XT). Sin dígitos → no los pesca la regla de código. */
const GROUPSET_TIERS = new Set([
    'nx', 'gx', 'sx', 'xx1', 'x01', 'xo1',
    'xt', 'xtr', 'slx', 'grx', 'deore', 'cues', 'tourney', 'acera', 'alivio', 'sora', 'tiagra',
    'ultegra', 'dura-ace', 'duraace', 'rival', 'force', 'red', 'apex',
]);

/** Marcas conocidas (discriminante blando: si ambos declaran marca y difiere → no-match). */
const BRANDS = new Set([
    'shimano', 'sram', 'magene', 'specialized', 'rockshox', 'fox', 'avid', 'mti',
    'truvativ', 'roval', 'muc-off', 'mucoff', 'ceramicspeed', 'baral', 'deckas', 'zipp', 'rockbros',
]);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Normalización (función pura)
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedItem {
    /** ancla = sustantivo cabeza (primer token de contenido). "" si no hay. */
    anchor: string;
    /** tokens descriptivos (sin ruido, singularizados, sin códigos/specs). */
    tokens: string[];
    /** códigos de modelo canónicos (alfanuméricos con dígito): "HG601", "B05S", "CLM520". */
    codes: string[];
    /** velocidades individuales (una sola → discriminante; varias → rango de compatibilidad, se ignora). */
    speeds: number[];
    /** medidas en mm (discos): 160, 140. */
    sizesMm: number[];
    /** grupos/tier declarados: nx, gx, xt… */
    tiers: string[];
    /** marcas declaradas. */
    brands: string[];
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Singulariza tokens alfabéticos simples del español quitando solo la 's' final.
 * Conservador a propósito: NO quita "es" (rompía "cables"→"cabl", "parches"→"parch").
 * "cables"→"cable", "parches"→"parche", "frenos"→"freno". Los plurales en -es de palabras
 * que terminan en consonante (motor→motores) son raros en el catálogo y, si no colapsan,
 * simplemente forman su propio cluster de forma consistente.
 */
function singularize(t: string): string {
    if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
    return t;
}

export function normalizeItem(raw: string): NormalizedItem {
    const base = stripAccents((raw || '').toLowerCase());
    // Conservar letras, números y guiones (los guiones unen códigos: cn-hg601-11). El resto → espacio.
    const cleaned = base.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
    const rawTokens = cleaned.split(' ').filter(Boolean);

    const codes: string[] = [];
    const speeds: number[] = [];
    const sizesMm: number[] = [];
    const tiers: string[] = [];
    const brands: string[] = [];
    const contentTokens: string[] = [];

    for (const tok of rawTokens) {
        // multiplicador de cantidad ("x2", "x12") → no es identidad del producto, se ignora acá
        if (/^x\d+$/.test(tok)) continue;
        // velocidad: "11v", "8v"
        const mSpeed = tok.match(/^(\d{1,2})v$/);
        if (mSpeed) { speeds.push(parseInt(mSpeed[1], 10)); continue; }
        // medida en mm: "160mm"
        const mMm = tok.match(/^(\d{2,3})mm$/);
        if (mMm) { sizesMm.push(parseInt(mMm[1], 10)); continue; }
        // grupo/tier de transmisión
        if (GROUPSET_TIERS.has(tok)) { tiers.push(tok); continue; }
        // marca
        if (BRANDS.has(tok)) { brands.push(tok); continue; }
        // código de modelo: contiene al menos una letra Y un dígito (hg601, b05s, cn-hg40, rt-cl900)
        if (/[a-z]/.test(tok) && /\d/.test(tok)) {
            codes.push(canonCode(tok));
            continue;
        }
        // token puramente numérico corto (ej. medida de rueda "29") → discriminante suave vía code
        if (/^\d{2,4}$/.test(tok)) { codes.push(tok); continue; }
        // token de contenido: expandir abreviatura, singularizar, filtrar ruido
        let w = ABBREV[tok] ?? tok;
        w = ABBREV[w] ?? w;
        w = singularize(w);
        if (STOPWORDS.has(w) || w.length < 2) continue;
        contentTokens.push(w);
    }

    const anchor = contentTokens[0] || '';
    // tokens descriptivos como SET ordenado (anula orden de palabras y repetidos)
    const tokens = Array.from(new Set(contentTokens)).sort();
    return {
        anchor,
        tokens,
        codes: dedupe(codes),
        speeds: dedupe(speeds),
        sizesMm: dedupe(sizesMm),
        tiers: dedupe(tiers),
        brands: dedupe(brands),
    };
}

/** Canonicaliza un código de modelo: mayúsculas, solo alfanumérico (cn-hg601-11 → CNHG60111). */
function canonCode(tok: string): string {
    return tok.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const dedupe = <T>(a: T[]): T[] => Array.from(new Set(a));

// ─────────────────────────────────────────────────────────────────────────────
// 3. Similitud (Levenshtein propio + token-set)
// ─────────────────────────────────────────────────────────────────────────────

/** Distancia de edición (iterativa, O(n·m), sin dependencias). */
export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const curr = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = curr;
    }
    return prev[b.length];
}

const charSim = (a: string, b: string): number => {
    if (!a.length && !b.length) return 1;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
};

/** Similitud token-set: 0.5·Jaccard(tokens) + 0.5·char-sim de la unión ordenada. */
export function tokenSetScore(a: string[], b: string[]): number {
    if (!a.length && !b.length) return 1;
    const A = new Set(a), B = new Set(b);
    const inter = [...A].filter(t => B.has(t)).length;
    const union = A.size + B.size - inter;
    const jacc = union === 0 ? 0 : inter / union;
    const lev = charSim([...A].sort().join(' '), [...B].sort().join(' '));
    return 0.5 * jacc + 0.5 * lev;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ¿Dos ítems son el mismo producto? (guardias duras → luego fuzzy)
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_THRESHOLD = 0.72; // similitud de contenido para auto-merge (conservador)

/**
 * Variantes de un código para comparar: el código tal cual y sin el prefijo de 2 letras que indica
 * TIPO de componente Shimano/SRAM (CN=cadena, CS=cassette, FC=palanca, RD=cambio, SM/RT=rotor…).
 * El número de modelo que queda es la identidad real. Es seguro quitar el prefijo porque el ANCLA
 * (cadena/piñón/disco) ya separó los tipos de componente antes de llegar acá.
 */
function codeVariants(c: string): string[] {
    const stripped = c.replace(/^[A-Z]{2}(?=[A-Z0-9]{3,})/, '');
    return stripped !== c ? [c, stripped] : [c];
}

/** True si dos códigos refieren al mismo modelo. */
function codeEq(c1: string, c2: string): boolean {
    for (const v1 of codeVariants(c1)) {
        for (const v2 of codeVariants(c2)) {
            // Igualdad exacta (incluye códigos numéricos puros como "29" de rueda: Cámara 29 = Cámara 29).
            if (v1 === v2 && v1.length >= 2) return true;
            // El match por prefijo SOLO aplica a códigos alfanuméricos (con letra) y SOLO si el resto del
            // código largo es un sufijo de velocidad de 2 dígitos (HG601 ⊂ HG601-11). Así "HG601"="HG60111"
            // pero "HG50" ≠ "HG500" (el resto "0" no es velocidad) y "29" ≠ "299" (numérico puro no prefija).
            if (!/[a-z]/i.test(v1) || !/[a-z]/i.test(v2)) continue;
            const [short, long] = v1.length <= v2.length ? [v1, v2] : [v2, v1];
            if (short.length >= 4 && long.startsWith(short) && /^\d{2}$/.test(long.slice(short.length))) return true;
        }
    }
    return false;
}

/** ¿Todos los tokens del set más chico están en el más grande? (descripción terse ⊆ verbose). */
function isTokenSubset(a: string[], b: string[]): boolean {
    const [small, big] = a.length <= b.length ? [a, b] : [b, a];
    if (!small.length) return false;
    const B = new Set(big);
    return small.every(t => B.has(t));
}

/** Compatibilidad de listas de códigos: si ambas tienen códigos, deben compartir uno equivalente. */
function codesCompatible(a: string[], b: string[]): 'match' | 'conflict' | 'unknown' {
    if (!a.length || !b.length) return 'unknown';
    for (const c1 of a) for (const c2 of b) if (codeEq(c1, c2)) return 'match';
    return 'conflict';
}

/** Discriminante de conjunto (velocidad/tier/medida): ambos presentes y disjuntos → conflicto. */
function setDiscriminantConflict<T>(a: T[], b: T[]): boolean {
    if (!a.length || !b.length) return false;
    const B = new Set(b);
    return !a.some(x => B.has(x));
}

export function isSameProduct(a: NormalizedItem, b: NormalizedItem): boolean {
    // Guardia 0: ancla. Sin ancla compartida no hay match posible.
    if (!a.anchor || !b.anchor || a.anchor !== b.anchor) return false;

    // Guardia 1: código de modelo. Si ambos tienen código y ninguno matchea → productos distintos.
    const codes = codesCompatible(a.codes, b.codes);
    if (codes === 'conflict') return false;

    // Guardia 2: velocidad (solo si cada uno declara EXACTAMENTE una → discriminante; varias = rango, se ignora).
    if (a.speeds.length === 1 && b.speeds.length === 1 && a.speeds[0] !== b.speeds[0]) return false;

    // Guardia 3: medida en mm (disco 160 ≠ 140).
    if (setDiscriminantConflict(a.sizesMm, b.sizesMm)) return false;

    // Guardia 4: grupo/tier (NX ≠ GX).
    if (setDiscriminantConflict(a.tiers, b.tiers)) return false;

    // Guardia 5: marca (si ambos declaran marca y difiere → distinto).
    if (setDiscriminantConflict(a.brands, b.brands)) return false;

    // Si el código matchea explícitamente, ya es el mismo producto (mismo modelo exacto).
    if (codes === 'match') return true;

    // Descripción corta que es subconjunto de la larga → mismo producto, una es más verbosa.
    // SOLO cuando la identidad es puramente léxica (sin código ni tier en ninguno): "pastilla shimano"
    // ⊆ "pastilla freno shimano". Si hay código/tier, la identidad la mandan ellos, no el subconjunto
    // (si no, "Cadena Sram NX" —tier nx— se colaría en cualquier cadena por compartir solo "cadena").
    const lexicalOnly = !a.codes.length && !b.codes.length && !a.tiers.length && !b.tiers.length;
    if (lexicalOnly && isTokenSubset(a.tokens, b.tokens)) return true;

    // Sin códigos ni subconjunto que decidan: exigir alta similitud del texto descriptivo.
    return tokenSetScore(a.tokens, b.tokens) >= AUTO_THRESHOLD;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Clustering aglomerativo online + ranking de unidades
// ─────────────────────────────────────────────────────────────────────────────

export interface RankedProduct {
    /** nombre canónico mostrado (la variante cruda más frecuente del cluster). */
    name: string;
    /** unidades totales sumadas del cluster. */
    count: number;
    /** cantidad de variantes de texto colapsadas (para transparencia/QA). */
    variants: number;
}

interface Cluster {
    norm: NormalizedItem;
    count: number;
    // conteo de cada variante cruda → el nombre canónico es la más usada
    rawCounts: Map<string, number>;
}

/**
 * Agrupa items (nombre crudo + unidades) en productos canónicos y devuelve el ranking por unidades.
 * `items`: lista de { name: texto crudo del repuesto, qty: unidades }.
 * Determinístico: mismo input → mismo output (para tests).
 */
export function rankProducts(items: Array<{ name: string; qty: number }>, topN = 5): RankedProduct[] {
    // Normalizar una vez y ordenar determinísticamente ANTES de clusterizar. Dos motivos:
    //  1) Invarianza al orden de entrada (el array de servicios del store cambia entre cargas):
    //     imponemos nuestro propio orden → mismo multiset ⇒ mismo ranking.
    //  2) Sembrar primero los ítems MÁS específicos (más tokens/códigos) evita que un genérico
    //     terse ("pastilla") cree un cluster que sobre-absorba variantes distintas.
    const prepared = items
        .map(it => ({ raw: (it.name || '').trim(), qty: it.qty }))
        .filter(it => it.raw)
        .map(it => ({ ...it, norm: normalizeItem(it.raw) }));
    const specificity = (n: NormalizedItem) => n.tokens.length + n.codes.length + n.tiers.length + n.speeds.length + n.sizesMm.length;
    prepared.sort((a, b) =>
        specificity(b.norm) - specificity(a.norm) ||
        a.norm.anchor.localeCompare(b.norm.anchor) ||
        a.raw.localeCompare(b.raw));

    const clusters: Cluster[] = [];
    for (const { raw, qty, norm } of prepared) {
        // ítem sin ancla (basura como "asdas") → su propio cluster, no contamina a otros
        let target = norm.anchor
            ? clusters.find(c => isSameProduct(c.norm, norm))
            : undefined;
        if (!target) {
            target = { norm, count: 0, rawCounts: new Map() };
            clusters.push(target);
        }
        target.count += qty;
        target.rawCounts.set(raw, (target.rawCounts.get(raw) || 0) + qty);
    }

    const ranked: RankedProduct[] = clusters.map(c => ({
        name: canonicalDisplayName(c.rawCounts),
        count: c.count,
        variants: c.rawCounts.size,
    }));

    // orden estable: por unidades desc, y ante empate por nombre para determinismo
    ranked.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return topN > 0 ? ranked.slice(0, topN) : ranked;
}

/** Nombre a mostrar: la variante cruda más frecuente; ante empate, la más larga (más informativa). */
function canonicalDisplayName(rawCounts: Map<string, number>): string {
    let best = '';
    let bestCount = -1;
    for (const [raw, n] of rawCounts) {
        if (n > bestCount || (n === bestCount && raw.length > best.length)) {
            best = raw; bestCount = n;
        }
    }
    return prettify(best);
}

/** Limpieza cosmética mínima del nombre elegido (no altera la identidad). */
function prettify(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}
