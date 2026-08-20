/**
 * fechaAR.ts — el ÚNICO formateador de fechas de la app.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LO QUE HAY QUE ENTENDER ANTES DE TOCAR ESTO
 *
 * En `servicios` conviven DOS COSAS DISTINTAS que parecen lo mismo, y se
 * formatean AL REVÉS una de la otra:
 *
 *   1. INSTANTES — `fecha_ingreso`, `fecha_finalizacion`, `fecha_entregado`.
 *      Los escribe el código con `new Date().toISOString()`: es el momento
 *      exacto en que alguien apretó un botón. Se muestran CONVERTIDOS a la
 *      hora de Argentina. Si no, un service finalizado un martes a las 22:30
 *      figura como miércoles (en UTC ya son las 01:30 del día siguiente).
 *
 *   2. DÍAS DE CALENDARIO — `fecha_entrega` (la fecha PROMETIDA).
 *      La escribe un `<input type="date">` como texto pelado ("2026-08-10").
 *      Postgres lo guarda como `2026-08-10T00:00:00+00:00`, pero no es un
 *      instante: es "el día 10". Se muestra TAL CUAL, sin convertir nunca.
 *      Convertirlo a hora argentina le resta 3 horas y devuelve el 9: toda
 *      fecha prometida aparecería un día antes de lo que eligió el mecánico.
 *
 * ⚠️ Este es exactamente el "9 vs 10" que vio Iara en la orden 311 (20-ago-2026):
 * el comprobante hacía `new Date(fecha_entrega).toLocaleDateString('es-AR')`
 * y mostraba 9; el historial partía el ISO y mostraba 10. El 10 es el correcto
 * (es el día que se eligió en el formulario) y el comprobante era el que
 * mentía. La regla de la casa "formatear siempre en hora de Argentina" vale
 * para los INSTANTES; aplicarla a un día de calendario lo corre un día.
 *
 * Antes de esto había dos copias de `formatSafeDate` (Workshop e History) más
 * media docena de `new Date(x).toLocaleDateString('es-AR')` sueltos, o sea que
 * la misma fecha se veía distinta según la pantalla.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const ZONA_AR = 'America/Argentina/Buenos_Aires';

/** Vacío se dibuja como un guion, no como "Invalid Date". */
const VACIO = '-';

// ─────────────────────────────────────────────────────────────────────────────
// 1. INSTANTES (fecha_ingreso · fecha_finalizacion · fecha_entregado)
// ─────────────────────────────────────────────────────────────────────────────

function partesAR(iso: string): Record<string, string> | null {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const fmt = new Intl.DateTimeFormat('es-AR', {
        timeZone: ZONA_AR,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const partes: Record<string, string> = {};
    for (const p of fmt.formatToParts(new Date(t))) partes[p.type] = p.value;
    return partes;
}

/** Un instante → `DD/MM/AA` en hora de Argentina. Ej: 18/08/26 */
export function instanteAR(iso: string | null | undefined): string {
    if (!iso) return VACIO;
    const p = partesAR(iso);
    if (!p) return VACIO;
    return `${p.day}/${p.month}/${p.year.slice(-2)}`;
}

/** Un instante → `DD/MM/AAAA` en hora de Argentina. Para el PDF del cliente. */
export function instanteARLargo(iso: string | null | undefined): string {
    if (!iso) return VACIO;
    const p = partesAR(iso);
    if (!p) return VACIO;
    return `${p.day}/${p.month}/${p.year}`;
}

/** Un instante → `DD/MM/AA HH:MM` en hora de Argentina. Para cuando la hora importa. */
export function instanteARConHora(iso: string | null | undefined): string {
    if (!iso) return VACIO;
    const p = partesAR(iso);
    if (!p) return VACIO;
    // El 24 de Intl para la medianoche es "24", no "00".
    const hora = p.hour === '24' ? '00' : p.hour;
    return `${p.day}/${p.month}/${p.year.slice(-2)} ${hora}:${p.minute}`;
}

/** Un instante → `lunes, 18 de agosto de 2026` en hora de Argentina. */
export function instanteARTexto(iso: string | null | undefined): string {
    if (!iso) return VACIO;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return VACIO;
    return new Intl.DateTimeFormat('es-AR', {
        timeZone: ZONA_AR, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DÍAS DE CALENDARIO (fecha_entrega — la prometida)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 `fecha_entrega` es una columna MIXTA. Medido contra producción el
 * 20-ago-2026: de 118 filas con fecha, **73 son días de calendario** (medianoche
 * UTC exacta, las que escribe el `<input type="date">`) y **45 son instantes
 * legacy** (feb/mar-2026, cuando la misma columna se usaba para marcar el
 * momento en que se cerraba el service, antes de que existieran
 * `fecha_finalizacion` y `fecha_entregado`).
 *
 * Los dos casos se distinguen solos: una fecha elegida en un formulario cae
 * SIEMPRE en `T00:00:00+00:00`. Cualquier otra hora es un instante y hay que
 * convertirlo, o un service cerrado a las 22:30 aparece al día siguiente.
 * (Hoy ninguna de las 45 legacy cae entre 00:00 y 03:00 UTC, que es la franja
 * donde el día UTC y el argentino difieren, así que este camino no cambia
 * ninguna pantalla: está por si aparece una.)
 */
const ES_MEDIANOCHE_UTC = /T00:00:00(\.0+)?(\+00:00|Z)$/;

function esDiaDeCalendario(valor: string): boolean {
    return !valor.includes('T') || ES_MEDIANOCHE_UTC.test(valor);
}

/** Saca el `YYYY-MM-DD` sin pasar por `new Date()`, que es lo que corre el día. */
function partesDia(valor: string): [string, string, string] | null {
    const soloFecha = valor.split('T')[0];
    const [a, m, d] = soloFecha.split('-');
    if (!a || !m || !d || a.length !== 4) return null;
    return [a, m, d];
}

/** Un día de calendario → `DD/MM/AA`, tal cual se eligió. Ej: 10/08/26 */
export function diaCalendario(valor: string | null | undefined): string {
    if (!valor) return VACIO;
    if (!esDiaDeCalendario(valor)) return instanteAR(valor);   // fila legacy: es un instante
    const p = partesDia(valor);
    if (!p) return VACIO;
    return `${p[2]}/${p[1]}/${p[0].slice(-2)}`;
}

/** Un día de calendario → `DD/MM/AAAA`. Para el PDF del cliente. */
export function diaCalendarioLargo(valor: string | null | undefined): string {
    if (!valor) return VACIO;
    if (!esDiaDeCalendario(valor)) return instanteARLargo(valor);
    const p = partesDia(valor);
    if (!p) return VACIO;
    return `${p[2]}/${p[1]}/${p[0]}`;
}

/** El `YYYY-MM-DD` que necesita un `<input type="date">`. */
export function diaParaInput(valor: string | null | undefined): string {
    if (!valor) return '';
    if (!esDiaDeCalendario(valor)) {
        // Fila legacy: el día que corresponde es el argentino, no el UTC.
        const p = partesAR(valor);
        return p ? `${p.year}-${p.month}-${p.day}` : '';
    }
    const p = partesDia(valor);
    return p ? `${p[0]}-${p[1]}-${p[2]}` : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. La fecha de entrega que se le muestra al cliente
// ─────────────────────────────────────────────────────────────────────────────

export interface EntregaMostrable {
    texto: string;
    /** true = la bici ya se entregó (dato duro). false = es la fecha prometida. */
    real: boolean;
    /** Rótulo listo para poner al lado: nunca se muestra una fecha sin decir cuál es. */
    etiqueta: string;
}

/**
 * Qué fecha de entrega mostrar: la REAL si la bici ya se retiró, y si no la
 * prometida. Nunca se muestra una sin decir cuál de las dos es — "Entrega:
 * 10/08/26" al lado de una bici que todavía está en el taller se lee como que
 * ya se entregó.
 */
export function entregaMostrable(
    fechaEntregado: string | null | undefined,
    fechaPrometida: string | null | undefined,
    { largo = false }: { largo?: boolean } = {},
): EntregaMostrable | null {
    if (fechaEntregado) {
        return {
            texto: largo ? instanteARLargo(fechaEntregado) : instanteAR(fechaEntregado),
            real: true,
            etiqueta: 'Entregada el',
        };
    }
    if (fechaPrometida) {
        return {
            texto: largo ? diaCalendarioLargo(fechaPrometida) : diaCalendario(fechaPrometida),
            real: false,
            etiqueta: 'Entrega estimada',
        };
    }
    return null;
}
