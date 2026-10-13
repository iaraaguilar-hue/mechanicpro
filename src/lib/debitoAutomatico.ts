/**
 * El débito automático de Mercado Pago (13-oct-2026).
 *
 * Iara creó un plan de suscripción en su Mercado Pago. El taller abre el link una vez,
 * carga la tarjeta y Mercado Pago le cobra solo cada mes: el primer cobro es el día que
 * lo activa y después cada mes ese mismo día. Todavía no hay integración por API: el
 * aviso de que alguien se suscribió le llega a Iara por mail y ella lo marca a mano en
 * el SuperAdmin (`talleres.debito_automatico_at`).
 *
 * 🔴 En la app NO aparecen precios ni planes: el monto lo muestra Mercado Pago.
 * Esto decide DÓNDE se ofrece el botón; lo dibujan `AvisoDePrueba`, `AccesoSuspendido`
 * y `AvisoDeDebito`. Tests en `debitoAutomatico.test.ts`.
 */
import { accesoCortado, cortePorPrueba, estadoPrueba, type TallerConPrueba } from './pruebaGratuita';

export const LINK_DEBITO = 'https://mpago.la/1gWKULV';

export interface TallerConDebito extends TallerConPrueba {
    debito_automatico_at?: string | null;
}

/** Dónde corresponde ofrecer el botón, o null si en ningún lado. */
export type LugarDelDebito = 'prueba' | 'corte' | 'paga';

/**
 * Solo lo ve el ADMIN del taller (el mecánico no paga ni decide). Desaparece apenas el
 * super admin marca `debito_automatico_at`.
 */
export function lugarDelDebito(
    taller: TallerConDebito | null | undefined,
    rol: string | null | undefined,
    ahoraMs: number = Date.now(),
): LugarDelDebito | null {
    if (!taller || rol !== 'admin' || taller.debito_automatico_at) return null;
    if (accesoCortado(taller, ahoraMs)) return cortePorPrueba(taller, ahoraMs) ? 'corte' : null;
    const e = estadoPrueba(taller, ahoraMs);
    if (e.tipo === 'corriendo') return 'prueba';
    if (e.tipo === 'sin_prueba') return 'paga';
    return null;
}

/** Cada cuánto vuelve el aviso del que ya paga: una vez cerrado, no vuelve (por taller y navegador). */
export function claveDeAvisoCerrado(tallerId: string): string {
    return `mechanicpro_debito_cerrado_${tallerId}`;
}

/**
 * Lo que se escribe en `talleres` cuando Iara marca "Débito automático activo" (o lo
 * deshace). Un solo UPDATE: al activarlo el taller pasa a Paga (`prueba_dias = NULL`) y, si
 * estaba cortado por la prueba, se le devuelve el acceso. Un corte a mano por otro motivo
 * NO se toca. Mismo criterio que 20261002120000_prueba_desde_la_primera_carga.sql.
 * Deshacerlo solo saca la marca: no vuelve a poner la prueba ni corta nada.
 */
export function cambiosDelDebito(
    taller: TallerConDebito,
    activar: boolean,
    ahoraIso: string = new Date().toISOString(),
): Record<string, string | number | null> {
    if (!activar) return { debito_automatico_at: null };
    const cambios: Record<string, string | number | null> = { debito_automatico_at: ahoraIso, prueba_dias: null };
    if (taller.acceso_suspendido_at && taller.acceso_suspendido_motivo === 'prueba_finalizada') {
        cambios.acceso_suspendido_at = null;
        cambios.acceso_suspendido_motivo = null;
    }
    return cambios;
}
