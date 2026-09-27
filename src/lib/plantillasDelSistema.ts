// ─────────────────────────────────────────────────────────────
// LOS TEXTOS DE LAS PLANTILLAS DEL SISTEMA, tal cual los aprobó Meta.
//
// Solo para MOSTRAR lo que le llega al cliente: el envío usa la versión de Meta.
// Vivía dentro de Campanas.tsx; se mudó acá el 27-sep-2026 porque Retención
// también la necesita para enseñar el texto exacto ANTES de mandar un
// recordatorio (con el WhatsApp conectado salía sin que el mecánico lo viera).
//
// 🚩 Espejo del catálogo de `supabase/functions/_shared/plantillas.ts`. Si allá se
// agrega o se cambia una, acá también (MensajesAutomaticos.tsx tiene las cuatro de
// los avisos automáticos con su título). La paridad la prueba
// `node tools/paridad_motor_retencion.cjs` en el repo mechanicpro-producto.
// ─────────────────────────────────────────────────────────────

import { primerNombre } from '@/lib/nombreAmigable';

export const PLANTILLAS_DEL_SISTEMA: Record<string, string> = {
    recordatorio_mantenimiento: 'Hola {{1}}! Te escribo de {{2}} para recordarte que toca revisar {{3}} en tu {{4}}. Querés que coordinemos un turno?',
    comprobante_service: 'Hola {{1}}! Terminamos el service de tu {{2}} en {{3}}. Te dejamos el comprobante con el detalle de todo lo que hicimos. Gracias por confiar en nosotros!',
    seguimiento_evento: 'Hola {{1}}! Cómo te fue en {{2}}? Contanos cómo se portó la bici.',
    pre_carrera: 'Hola {{1}}! Vi que se acerca {{2}}, querés que le demos una revisada a tu {{3}} antes de viajar?',
    recontacto_personal: 'Hola {{1}}! Cómo va? Te escribo yo, {{2}}, por tu bici. {{3}} Si querés lo vemos, escribime por acá.',
    bici_lista_pdf: 'Hola {{1}}! Soy {{2}}, de {{3}}. Ya está lista tu {{4}}. Te paso el comprobante con el detalle del trabajo. {{5}} Cuando quieras la pasás a buscar.',
    comprobante_entrega_pdf: 'Hola {{1}}! Soy {{2}}, de {{3}}. Te dejo el comprobante del service de tu {{4}}, con el detalle del trabajo. {{5}} Gracias por confiar en nosotros!',
    aviso_tienda_entrega: 'Bici entregada: {{1}} de {{2}}. Va el comprobante del service para la gestión del cobro.',
    seguimiento_service: 'Hola {{1}}! Soy {{2}}, de {{3}}. Te escribo por el service que le hicimos a tu {{4}} y quería saber cómo la venís sintiendo, contame si notaste algo raro.',
};

/**
 * Meta rechaza un parámetro con saltos de línea, tabs o corridas de espacios, y
 * `whatsapp-enviar` los limpia en su último punto de salida. Se limpian igual acá
 * para que el texto que se muestra sea el que llega.
 * 🚩 Mismo criterio que `limpioParaMeta` en `_shared/motor_wa.ts`.
 */
export const limpioParaMeta = (t: unknown) => String(t ?? '')
    .replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 1024);

/** El texto exacto que recibe el cliente: la plantilla con cada {{n}} reemplazado. */
export function componerPlantilla(plantilla: string, parametros: string[]): string | null {
    const cuerpo = PLANTILLAS_DEL_SISTEMA[plantilla];
    if (!cuerpo) return null;
    return cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n) => limpioParaMeta(parametros[Number(n) - 1] ?? ''));
}

/**
 * Los cuatro datos de `recordatorio_mantenimiento` cuando lo manda el mecánico
 * desde Retención: nombre de pila, taller, componente y el nombre corto de la bici.
 * El nombre del taller va porque, cuando lo manda un sistema y no una persona, no
 * decir de quién es se lee como spam.
 * 🚩 Los mismos que arma solo `recordatorios-auto` (`_shared/recordatorios_auto.ts`):
 * el cliente tiene que leer lo mismo salga a mano o solo. Paridad en
 * `tools/paridad_motor_retencion.cjs`.
 */
export function parametrosDelRecordatorio(cliente: string, taller: string | null | undefined, componente: string, bici: string): string[] {
    return [primerNombre(cliente), taller || 'tu taller', componente, bici];
}
