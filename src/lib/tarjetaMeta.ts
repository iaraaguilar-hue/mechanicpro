/**
 * El paso 2 de WhatsApp (7-oct-2026, Diego de Bike Pro trabado cargando la tarjeta):
 * después de conectar el número, el taller tiene que cargar una tarjeta en Meta, o los
 * mensajes automáticos no salen (Meta los rechaza con 131042).
 *
 * Meta no nos deja leer si la cuenta tiene medio de pago (`primary_funding_id` pide ser
 * BSP; medido el 7-oct con Probikes y Leira), así que se deduce de lo que ya pasó:
 * el último envío por PLANTILLA que tuvo un resultado claro dice si la tarjeta está.
 * Un mensaje libre (dentro de las 24 h) no prueba nada: no lo cobra Meta. Se guarda
 * con `plantilla = 'conversacion'` (whatsapp-enviar), así que se saltea.
 */

export type EstadoTarjeta =
    /** Ningún mensaje automático salió todavía: falta el paso 2 o nadie lo probó. */
    | 'pendiente'
    /** El último automático salió: la tarjeta está. */
    | 'lista'
    /** El último automático lo frenó Meta por pago: falta la tarjeta. */
    | 'falta';

export interface EnvioParaTarjeta {
    estado: string | null;
    error_codigo: string | null;
    plantilla: string | null;
}

const SALIO = new Set(['sent', 'delivered', 'read']);
export const ERROR_DE_PAGO = '131042';
const TEXTO_LIBRE = 'conversacion';

/** `envios` del más nuevo al más viejo. */
export function estadoTarjeta(envios: EnvioParaTarjeta[]): EstadoTarjeta {
    for (const e of envios) {
        if (!e.plantilla || e.plantilla === TEXTO_LIBRE) continue;
        if (e.estado && SALIO.has(e.estado)) return 'lista';
        if (e.estado === 'failed' && String(e.error_codigo ?? '') === ERROR_DE_PAGO) return 'falta';
    }
    return 'pendiente';
}

/** La página de Facturación y pagos de Meta (link de la doc de Meta para Tech Providers). */
export const URL_FACTURACION_META = 'https://business.facebook.com/billing_hub/';
