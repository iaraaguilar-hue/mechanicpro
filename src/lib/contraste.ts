/**
 * Que el texto se lea, elija el taller el color que elija.
 *
 * Origen (Ariel Leira, 10-sep-2026): eligió BLANCO como color secundario y
 * media app quedó con texto blanco sobre fondo blanco — el botón «Entregar
 * Bici», el contador de bicis listas, los íconos de Métricas. Iara: «hay partes
 * del sistema en el que no se ve nada (…) ese problema de mix de colores no
 * puede estar».
 *
 * La causa no era el color de Ariel: era que `--primary-foreground` y
 * `--secondary-foreground` estaban FIJOS en casi-blanco. Elegir un color claro
 * era suficiente para volver invisible el texto que va encima. Un aviso que
 * dice «ojo, puede quedar difícil de leer» no alcanza: se calcula.
 *
 * Fórmulas de la WCAG 2.1 (luminancia relativa y ratio de contraste).
 */

export type RGB = { r: number; g: number; b: number };

export function hexARgb(hex: string): RGB | null {
    const h = hex.trim().replace(/^#/, '');
    const largo = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    if (!/^[0-9a-fA-F]{6}$/.test(largo)) return null;
    return {
        r: parseInt(largo.slice(0, 2), 16),
        g: parseInt(largo.slice(2, 4), 16),
        b: parseInt(largo.slice(4, 6), 16),
    };
}

/** Luminancia relativa WCAG: 0 = negro, 1 = blanco. */
export function luminancia(c: RGB): number {
    const canal = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

/** Ratio de contraste entre dos colores: 1 = idénticos, 21 = negro sobre blanco. */
export function contraste(a: string, b: string): number {
    const ca = hexARgb(a), cb = hexARgb(b);
    if (!ca || !cb) return 1;
    const la = luminancia(ca), lb = luminancia(cb);
    const [claro, oscuro] = la > lb ? [la, lb] : [lb, la];
    return (claro + 0.05) / (oscuro + 0.05);
}

const TINTA_OSCURA = '#0F172A';   // slate-900, la tinta del resto de la app
const TINTA_CLARA = '#FFFFFF';

/**
 * Qué color de texto va ENCIMA de este fondo.
 *
 * 🔴 No es «el que más contrasta»: con esa regla el naranja de Mechanic Pro
 * (#F25A30, blanco 3.5:1 contra oscuro 4.8:1) daba texto OSCURO y le cambiaba
 * los botones a todos los talleres que hoy se ven bien. Lo cazó el test.
 *
 * La regla es: se mantiene el blanco de siempre mientras se lea, y recién
 * cuando deja de leerse se pasa a tinta oscura. El piso es 3:1, que es el que
 * la WCAG pide para texto grande o en negrita — que es lo que hay encima de
 * estos fondos (botones, contadores, badges). Un secundario blanco da 1:1 y
 * cae del lado oscuro, que es justo lo que había que arreglar.
 */
export const PISO_TEXTO_GRANDE = 3;

export function tintaSobre(fondo: string, piso = PISO_TEXTO_GRANDE): string {
    if (contraste(fondo, TINTA_CLARA) >= piso) return TINTA_CLARA;
    if (contraste(fondo, TINTA_OSCURA) >= piso) return TINTA_OSCURA;
    // Ninguna de las dos llega: se elige la mejor de las dos, que es lo máximo
    // que se puede hacer sin tocarle el color al taller.
    return contraste(fondo, TINTA_OSCURA) > contraste(fondo, TINTA_CLARA) ? TINTA_OSCURA : TINTA_CLARA;
}

/**
 * El mismo color de marca, corrido hasta que se LEA como texto sobre `fondo`.
 *
 * No lo reemplaza por gris: le baja (o le sube) la luminosidad en HSL hasta
 * llegar al 4.5:1 de la WCAG, así el tinte de la marca se conserva. Un
 * secundario blanco sobre página blanca termina en un gris oscuro; uno rojo
 * casi no se mueve.
 */
export function tintaLegible(color: string, fondo = '#FFFFFF', minimo = 4.5): string {
    if (!hexARgb(color)) return TINTA_OSCURA;
    if (contraste(color, fondo) >= minimo) return color;
    const { h, s } = hexAHsl(color);
    const fondoClaro = luminancia(hexARgb(fondo)!) > 0.5;
    // Se prueba de a 1% para quedarse con el primero que pasa: el más cercano
    // al color original que ya se lee.
    for (let paso = 1; paso <= 100; paso++) {
        const l = fondoClaro ? Math.max(0, 50 - paso / 2) : Math.min(100, 50 + paso / 2);
        const cand = hslAHex(h, s, l);
        if (contraste(cand, fondo) >= minimo) return cand;
    }
    return fondoClaro ? TINTA_OSCURA : TINTA_CLARA;
}

export function hexAHsl(hex: string): { h: number; s: number; l: number } {
    const c = hexARgb(hex);
    if (!c) return { h: 0, s: 0, l: 0 };
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslAHex(h: number, s: number, l: number): string {
    const S = s / 100, L = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = S * Math.min(L, 1 - L);
    const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const dos = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${dos(f(0))}${dos(f(8))}${dos(f(4))}`;
}

/** El formato que consumen las variables CSS del tema: "H S% L%". */
export function hexAHslCss(hex: string): string {
    const { h, s, l } = hexAHsl(hex);
    return `${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%`;
}
