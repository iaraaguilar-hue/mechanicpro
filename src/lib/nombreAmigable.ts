// ─────────────────────────────────────────────────────────────
// CÓMO SE NOMBRAN LAS COSAS CUANDO LE ESCRIBÍS A UN CLIENTE.
//
// En la ficha, en el remito y en el buscador la bici va con el nombre
// completo: ahí el nombre es un DATO y tiene que ser exacto. En un
// WhatsApp el nombre es HABLA, y nadie escribe como el sistema.
//
//   ficha:   Specialized Tarmac SL7 Comp Disc 2023
//   WhatsApp: tu Tarmac SL7
//
//   ficha:   L'Étape Argentina by Tour de France 2026
//   WhatsApp: letape
//
// Es la diferencia entre un mensaje que parece escrito por el mecánico y
// uno que parece salido de una base de datos. El cliente no razona por
// qué le suena raro: le suena raro y no contesta.
//
// Estas funciones se usan SOLO en lo que sale hacia el cliente (mensajes
// de retención, parámetros de plantilla de Meta, el expediente que lee la
// IA). Nunca en la ficha, el remito ni el historial.
//
// 🚩 `mensaje-ia/index.ts` tiene su copia (Deno no importa de acá). Si se
// toca esto, se toca allá.
// ─────────────────────────────────────────────────────────────

// Adjetivos de gama y de armado. Distinguen dos SKU en una lista de
// precios, pero nadie le dice a su bici "la Rockhopper Sport": le dice
// "la Rockhopper". Se sacan solo del FINAL, en cadena.
const SUFIJOS_BICI = new Set([
    "comp", "sport", "elite", "expert", "pro", "base", "evo", "advanced",
    "disc", "disco", "frameset", "carbon", "carbono", "alloy", "aluminio", "alu",
    "ltd", "limited", "edition", "edicion", "edición", "special",
    "hombre", "mujer", "dama", "caballero", "unisex", "men", "women", "wmn",
]);

// Lo que es medida, no nombre.
const MEDIDAS = /\b(r?\d{2}(?:[.,]\d)?["”']?|\d{3}c|rodado\s*\d{2}|talle\s*\S+|\d{1,2}v|\d{1,2}\s*vel(?:ocidades)?)\b/gi;
const AÑO = /\b(?:19|20)\d{2}\b/g;

const limpiarEspacios = (t: string) =>
    String(t ?? "").replace(/[\s_]+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Solo el nombre de pila. "¡Hola Juan Carlos Pérez!" no lo escribe nadie
 * que conozca al cliente — y este mensaje tiene que parecer justamente eso.
 */
export function primerNombre(nombre?: string | null, fallback = ""): string {
    const t = limpiarEspacios(nombre ?? "");
    return t.split(" ")[0] || fallback;
}

/**
 * El nombre con el que el cliente llama a su bici.
 *
 * La marca no entra: quien tiene la bici ya sabe de qué marca es, y
 * "tu Specialized Tarmac SL7 Comp" es exactamente el sonido de un
 * sistema hablando. Solo se usa la marca si no hay modelo.
 */
export function nombreBiciAmigable(
    marca?: string | null,
    modelo?: string | null,
    fallback = "tu bici",
): string {
    const m = limpiarEspacios(marca ?? "");
    let base = limpiarEspacios(modelo ?? "");

    // "Specialized Tarmac SL7" cargado entero en el modelo: la marca se va igual.
    if (m && base && sinTildes(base.toLowerCase()).startsWith(sinTildes(m.toLowerCase()))) {
        base = limpiarEspacios(base.slice(m.length));
    }
    if (!base) base = m;
    if (!base) return fallback;

    base = limpiarEspacios(base.replace(AÑO, " ").replace(MEDIDAS, " "));

    // Los adjetivos de gama se caen de atrás para adelante, pero nunca
    // hasta dejar el nombre vacío: si la bici se llama "Comp" a secas, ese
    // es su nombre.
    const palabras = base.split(" ").filter(Boolean);
    while (palabras.length > 1 && SUFIJOS_BICI.has(sinTildes(palabras[palabras.length - 1].toLowerCase()))) {
        palabras.pop();
    }

    const corto = palabras.join(" ");
    return corto || base || fallback;
}

/**
 * Los nombres cortos de TODAS las bicis de un cliente, resueltos juntos.
 *
 * Acortar de a una puede dejar dos bicis con el mismo nombre (una
 * Rockhopper Sport y una Rockhopper Comp quedan las dos en "Rockhopper"),
 * y decirle a alguien "tu Rockhopper" cuando tiene dos es peor que el
 * nombre largo: le demuestra que NO sabemos de cuál hablamos. Cuando hay
 * choque, las que chocan vuelven al nombre completo.
 */
export function nombresBicisAmigables<T extends { id: string; marca?: string | null; modelo?: string | null }>(
    bicis: T[],
    fallback = "tu bici",
): Map<string, string> {
    const corto = new Map<string, string>();
    const cuenta = new Map<string, number>();

    for (const b of bicis) {
        const n = nombreBiciAmigable(b.marca, b.modelo, fallback);
        corto.set(b.id, n);
        const k = sinTildes(n.toLowerCase());
        cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    }

    for (const b of bicis) {
        const n = corto.get(b.id)!;
        if ((cuenta.get(sinTildes(n.toLowerCase())) ?? 0) > 1) {
            // El modelo entero, no el nombre completo con marca: lo que las
            // distingue es "Sport" o "Comp", nunca la marca (es la misma).
            const completo = limpiarEspacios(b.modelo ?? "") || limpiarEspacios(b.marca ?? "");
            corto.set(b.id, completo || n);
        }
    }
    return corto;
}

// El nombre formal de una carrera es el del reglamento, no el que usa el
// que la corrió: "L'Étape Argentina by Tour de France 2026" en la charla
// del pelotón es "letape".
const RUIDO_CARRERA: RegExp[] = [
    /\bby\s+.+$/i,                                    // "... by Tour de France"
    /\bpresent(?:ado|ada)\s+por\s+.+$/i,
    /\b\d+\s*[ªº°]?\s*(?:edici[oó]n)\b/gi,
    /\bedici[oó]n\s*\d*\b/gi,
    /\b(?:fecha|etapa|round)\s*(?:n[°º.]?\s*)?\d+\b/gi,
    /\b\d+\s*[ªº°]\s*fecha\b/gi,
    /\bn[°º]\s*\d+\b/gi,
    /#\d+/g,
];

// Las que la gente nombra con artículo. Sin lista, "¿cómo te fue en Gran
// Fondo?" — que no lo dice nadie.
const ARTICULO_FEM = new Set(["vuelta", "doble", "copa", "maraton", "titan", "carrera", "clasica", "prueba", "rural"]);
const ARTICULO_MASC = new Set(["gran", "granfondo", "rally", "tour", "desafio", "campeonato", "torneo", "circuito", "maraton", "raid", "enduro", "cronoescalada"]);

/** El nombre de la carrera como la nombra el que la corrió. */
export function nombreCarreraAmigable(nombre?: string | null, fallback = ""): string {
    let t = limpiarEspacios(nombre ?? "");
    if (!t) return fallback;

    // El apóstrofe es de programa de inscripción, no de WhatsApp: L'Étape → Letape.
    // La tilde de la letra que queda pegada también se va: nadie escribe "Létape".
    t = t.replace(
        /\b([A-Za-zÁÉÍÓÚÑ])['’]([A-Za-zÁÉÍÓÚÑ])/g,
        (_, a: string, b: string) => a + sinTildes(b.toLowerCase()),
    );
    for (const r of RUIDO_CARRERA) t = t.replace(r, " ");
    t = t.replace(AÑO, " ");

    // Las carreras se cargan como "Rally Serie (Fecha 2)" o "Rally MTB Pilar
    // (Fecha 1 - El Estribo)": sacarle "Fecha N" deja el paréntesis colgado.
    // Si adentro no quedó nada, se va entero; si quedó el lugar, se queda solo el lugar.
    t = t
        .replace(/\(\s*[-–—·,;]*\s*\)/g, " ")
        .replace(/\(\s*[-–—·,;]+\s*/g, "(")
        .replace(/\s*[-–—·,;]+\s*\)/g, ")");
    t = limpiarEspacios(t.replace(/\s+\)/g, ")").replace(/\(\s+/g, "("));
    t = limpiarEspacios(t.replace(/[-–—·|,]+\s*$/, "").replace(/^\s*[-–—·|,]+/, ""));

    return t || fallback;
}

/**
 * La carrera lista para meter en una frase: "¿cómo te fue en ___?".
 * Con artículo cuando el nombre lo pide ("el Gran Fondo") y sin él cuando
 * el nombre ya funciona solo ("letape", "Chapadmalal").
 */
export function carreraEnFrase(nombre?: string | null, fallback = "la carrera"): string {
    const n = nombreCarreraAmigable(nombre);
    if (!n) return fallback;

    const primera = sinTildes(n.split(" ")[0].toLowerCase());
    if (["el", "la", "los", "las"].includes(primera)) return n;
    if (ARTICULO_FEM.has(primera)) return `la ${n}`;
    if (ARTICULO_MASC.has(primera)) return `el ${n}`;
    return n;
}
