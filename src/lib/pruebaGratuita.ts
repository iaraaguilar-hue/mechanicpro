/**
 * La prueba gratuita (2-oct-2026): 15 días desde la PRIMERA CARGA del taller
 * (su primer cliente u orden), no desde el alta.
 *
 * La base es la que manda: `vencer_pruebas()` (pg_cron, cada 15 minutos) pone
 * `acceso_suspendido_at` al vencer, y eso frena también los envíos automáticos.
 * Esto es el mismo cálculo del lado de la app, para que el cartel aparezca en el
 * momento justo y para que el SuperAdmin vea en qué está cada taller.
 * 🚩 Espejo de `vencer_pruebas()` en 20261002120000_prueba_desde_la_primera_carga.sql:
 * si cambia la cuenta de un lado, cambia en el otro.
 */
import { ZONA_AR } from './fechaAR';

export const DIAS_DE_PRUEBA = 15;
const DIA_MS = 86_400_000;

export interface TallerConPrueba {
    prueba_dias?: number | null;
    prueba_inicio_at?: string | null;
    acceso_suspendido_at?: string | null;
    acceso_suspendido_motivo?: string | null;
}

export type EstadoPrueba =
    /** No está en prueba: paga. */
    | { tipo: 'sin_prueba' }
    /** En prueba, pero todavía no cargó nada: el reloj no arrancó. */
    | { tipo: 'sin_empezar'; dias: number }
    | { tipo: 'corriendo'; dias: number; inicio: string; vence: string; diasRestantes: number }
    | { tipo: 'vencida'; dias: number; inicio: string; vence: string };

export function estadoPrueba(t: TallerConPrueba, ahoraMs: number = Date.now()): EstadoPrueba {
    const dias = t.prueba_dias;
    if (dias == null || !(dias > 0)) return { tipo: 'sin_prueba' };
    const inicioMs = t.prueba_inicio_at ? Date.parse(t.prueba_inicio_at) : NaN;
    if (Number.isNaN(inicioMs)) return { tipo: 'sin_empezar', dias };
    const venceMs = inicioMs + dias * DIA_MS;
    const inicio = new Date(inicioMs).toISOString();
    const vence = new Date(venceMs).toISOString();
    if (ahoraMs >= venceMs) return { tipo: 'vencida', dias, inicio, vence };
    return { tipo: 'corriendo', dias, inicio, vence, diasRestantes: Math.ceil((venceMs - ahoraMs) / DIA_MS) };
}

/** ¿La app tiene que mostrar solo el cartel? Corte a mano, o prueba vencida. */
export function accesoCortado(t: TallerConPrueba, ahoraMs: number = Date.now()): boolean {
    return !!t.acceso_suspendido_at || estadoPrueba(t, ahoraMs).tipo === 'vencida';
}

/** ¿El cartel es el de la prueba? (lo cortó el reloj, o se cortó a mano con ese motivo) */
export function cortePorPrueba(t: TallerConPrueba, ahoraMs: number = Date.now()): boolean {
    if (t.acceso_suspendido_at) return t.acceso_suspendido_motivo === 'prueba_finalizada';
    return estadoPrueba(t, ahoraMs).tipo === 'vencida';
}

/** Cuándo venció, para decirlo en el cartel. null si no se sabe. */
export function fechaDelCorte(t: TallerConPrueba, ahoraMs: number = Date.now()): string | null {
    if (t.acceso_suspendido_at) return t.acceso_suspendido_at;
    const e = estadoPrueba(t, ahoraMs);
    return e.tipo === 'vencida' ? e.vence : null;
}

/** Lo que ve el super admin en su panel: en qué está la prueba de cada taller. */
export function etiquetaPrueba(t: TallerConPrueba, ahoraMs: number = Date.now()): string {
    const e = estadoPrueba(t, ahoraMs);
    if (e.tipo === 'sin_prueba') {
        if (!t.acceso_suspendido_at) return 'Paga';
        return t.acceso_suspendido_motivo === 'prueba_finalizada'
            ? `Prueba terminada (corte a mano, ${diaYMes(t.acceso_suspendido_at)})`
            : `Acceso cortado a mano (${diaYMes(t.acceso_suspendido_at)})`;
    }
    if (e.tipo === 'sin_empezar') return `En prueba (${e.dias} días) · todavía no cargó datos`;
    if (e.tipo === 'vencida') return `Prueba vencida el ${diaYMes(e.vence)} · acceso cortado`;
    const quedan = e.diasRestantes === 1 ? 'queda 1 día' : `quedan ${e.diasRestantes} días`;
    return `En prueba desde el ${diaYMes(e.inicio)} · vence el ${diaYMes(e.vence)} (${quedan})`;
}

/** Un instante → `10 de octubre`, en hora de Argentina. Vacío si no se puede leer. */
export function diaYMes(iso: string | null | undefined): string {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_AR, day: 'numeric', month: 'long' }).format(new Date(t));
}

/**
 * Prueba EXTENDIDA (7-oct-2026, Bike Pro Alvear): si el taller tiene más días que la
 * prueba de siempre, el Taller Activo se lo dice, con el último día entero en hora de
 * Argentina. Se extiende desde el SuperAdmin subiendo los días: el aviso sale solo.
 * Para que termine al final de un día, el inicio va a las 00:00 de Argentina.
 */
export function avisoPruebaExtendida(t: TallerConPrueba, ahoraMs: number = Date.now()): string | null {
    const e = estadoPrueba(t, ahoraMs);
    if (e.tipo !== 'corriendo' || e.dias <= DIAS_DE_PRUEBA) return null;
    const ultimoDia = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_AR, weekday: 'long', day: 'numeric', month: 'long' })
        .format(new Date(Date.parse(e.vence) - 1))
        .replace(',', '');
    return `Extendimos tu prueba gratuita hasta el ${ultimoDia} inclusive, para que puedas ver con tiempo todo lo que tiene Mechanic Pro.`;
}
