// ─────────────────────────────────────────────────────────────
// EL CRONÓMETRO DE TRABAJO — lo puro (14-oct-2026, Pro Bike Salta).
//
// Cada mecánico tiene UN solo reloj andando: arrancar otra cosa pausa lo anterior, y eso lo
// hace la base (RPC `arrancar_trabajo`), no esta pantalla. Acá viven las cuentas y los textos,
// sin red, para probarlos sin navegador (cronometro.test.ts).
//
// El estado de verdad es la base: nada de esto se guarda en el navegador.
// ─────────────────────────────────────────────────────────────

export type TipoTrabajo = 'orden' | 'armado' | 'mostrador' | 'otro';

export interface TramoTrabajo {
    id: string;
    taller_id?: string;
    usuario_id: string;
    usuario_nombre: string | null;
    servicio_id: string | null;
    tipo: TipoTrabajo;
    detalle: string | null;
    inicio: string;
    fin: string | null;
    cerrado_solo: boolean;
    corregido_por: string | null;
    corregido_at: string | null;
    inicio_original: string | null;
    fin_original: string | null;
}

/** Un reloj abierto del taller (RPC `trabajos_andando`). */
export interface TrabajoAndando {
    tramo_id: string;
    usuario_id: string;
    usuario_nombre: string | null;
    servicio_id: string | null;
    tipo: TipoTrabajo;
    detalle: string | null;
    inicio: string;
}

export const NOMBRE_DE_TIPO: Record<Exclude<TipoTrabajo, 'orden'>, string> = {
    armado: 'Armado de bici para la venta',
    mostrador: 'Mostrador',
    otro: 'Otro trabajo',
};

/** "00:42", "03:07": horas y minutos, sin segundos. */
export function hhmm(ms: number): string {
    const min = Math.max(0, Math.floor(ms / 60000));
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "1 h 15 min", "42 min", "menos de 1 min": para leer en una lista. */
export function duracionLarga(ms: number): string {
    const min = Math.max(0, Math.floor(ms / 60000));
    if (min < 1) return 'menos de 1 min';
    const h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const msDe = (iso: string) => new Date(iso).getTime();

/** Cuánto duró un tramo; si sigue andando, hasta `ahora`. */
export function duracionDeTramo(t: { inicio: string; fin: string | null }, ahora: number): number {
    return Math.max(0, (t.fin ? msDe(t.fin) : ahora) - msDe(t.inicio));
}

/** Suma de los tramos CERRADOS de un usuario, por orden. Los abiertos se cuentan aparte, con el reloj. */
export function acumuladoPorOrden(tramos: Pick<TramoTrabajo, 'servicio_id' | 'inicio' | 'fin'>[]): Record<string, number> {
    const r: Record<string, number> = {};
    for (const t of tramos) {
        if (!t.servicio_id || !t.fin) continue;
        r[t.servicio_id] = (r[t.servicio_id] || 0) + duracionDeTramo(t, 0);
    }
    return r;
}

/** Clave de un trabajo sin orden (armado, mostrador, otro) para sumar su tiempo de hoy. */
export function claveLibre(tipo: string, detalle: string | null | undefined): string {
    return `${tipo}|${(detalle || '').trim().toLowerCase()}`;
}

/** Inicio del día de calendario argentino (UTC-3, sin horario de verano) de `ahora`, en ms UTC. */
export function inicioDelDiaAR(ahora: number): number {
    const d = new Date(ahora - 3 * 3600e3);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3);
}

/** Suma de los tramos CERRADOS sin orden desde `desde`, por tipo+detalle. */
export function acumuladoLibreDeHoy(
    tramos: { tipo: string; detalle: string | null; servicio_id: string | null; inicio: string; fin: string | null }[],
    desde: number,
): Record<string, number> {
    const r: Record<string, number> = {};
    for (const t of tramos) {
        if (t.servicio_id || !t.fin || msDe(t.inicio) < desde) continue;
        const k = claveLibre(t.tipo, t.detalle);
        r[k] = (r[k] || 0) + duracionDeTramo(t, 0);
    }
    return r;
}

/**
 * El número que muestra la barra fija: el MISMO que el chip de esa orden (todo mi tiempo en la
 * orden, tramos cerrados + el que anda). Sin orden: el total de ese trabajo hoy.
 */
export function totalDelReloj(
    mio: { servicio_id: string | null; tipo: string; detalle: string | null; inicio: string },
    acumulado: Record<string, number>,
    libreHoy: Record<string, number>,
    ahora: number,
): number {
    const base = mio.servicio_id ? (acumulado[mio.servicio_id] || 0) : (libreHoy[claveLibre(mio.tipo, mio.detalle)] || 0);
    return base + Math.max(0, ahora - msDe(mio.inicio));
}

/** Lo que dice el botón de una orden: Empezar, Seguir (ya tiene tiempo mío) o Pausar (anda ahora). */
export function accionDeLaOrden(andaAca: boolean, acumuladoMs: number): 'Pausar' | 'Seguir' | 'Empezar' {
    if (andaAca) return 'Pausar';
    return acumuladoMs > 0 ? 'Seguir' : 'Empezar';
}

/** Quién más está con esa bici ahora (sin contarme a mí). */
export function otrosConLaBici(andando: TrabajoAndando[], servicioId: string, miId: string | null): string[] {
    return andando
        .filter(a => a.servicio_id === servicioId && a.usuario_id !== miId)
        .map(a => (a.usuario_nombre || 'Alguien').trim());
}

/** "Lean está con esta bici" / "Lean y Juli están con esta bici" / "Lean, Juli y Ana están con esta bici". */
export function fraseOtrosConLaBici(nombres: string[]): string {
    if (nombres.length === 0) return '';
    const lista = nombres.length === 1 ? nombres[0]
        : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
    return `${lista} ${nombres.length === 1 ? 'está' : 'están'} con esta bici`;
}

/** El código de error de la base (`error.details`) en una frase que entienda el mecánico. */
export const FRASE_DE_ERROR: Record<string, string> = {
    cronometro_apagado: 'El cronómetro está apagado en este taller. Lo prende el administrador en Configuración.',
    orden_ajena: 'Esa orden no es de este taller.',
    orden_borrada: 'Esa orden ya no existe.',
    orden_finalizada: 'Esa orden ya está finalizada: no se puede cronometrar.',
    falta_orden: 'Elegí una orden para empezar el reloj.',
    orden_con_tipo_libre: 'Un armado o un trabajo de mostrador no lleva orden.',
    tipo_invalido: 'Ese tipo de trabajo no existe.',
    sin_sesion: 'Se cerró tu sesión. Entrá de nuevo para seguir.',
    sin_taller: 'Tu usuario no tiene un taller asignado. Avisale al administrador.',
};

export function fraseDeError(error: { message?: string; details?: string } | null | undefined): string {
    const texto = `${error?.details || ''} ${error?.message || ''}`;
    for (const codigo of Object.keys(FRASE_DE_ERROR)) {
        if (texto.includes(codigo)) return FRASE_DE_ERROR[codigo];
    }
    return 'No se pudo hacer. Probá de nuevo en un momento.';
}

/** Hora de un instante, en hora argentina: "14:05". */
export function horaAR(iso: string): string {
    return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** Día de un instante, en hora argentina: "14/10". */
export function diaCortoAR(iso: string): string {
    return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' }).format(new Date(iso));
}

/** Qué está haciendo el reloj, para el indicador: "Orden #0123 · Specialized Allez", "Armado: Allez 2026". */
export function descripcionDelTrabajo(
    a: { tipo: TipoTrabajo; detalle: string | null },
    orden?: { numero: string; bici: string } | null,
): string {
    if (a.tipo === 'orden') return orden ? `Orden ${orden.numero}${orden.bici ? ` · ${orden.bici}` : ''}` : 'una orden';
    const base = a.tipo === 'armado' ? 'Armado' : a.tipo === 'mostrador' ? 'Mostrador' : 'Otro trabajo';
    return a.detalle?.trim() ? `${base}: ${a.detalle.trim()}` : base;
}
