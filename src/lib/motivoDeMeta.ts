// ─────────────────────────────────────────────────────────────
// POR QUÉ WHATSAPP NO MANDÓ UN MENSAJE, en palabras del taller (27-sep-2026).
//
// Lo usa Retención para decir por qué un recordatorio que tenía que salir solo no
// le llegó al cliente (Meta lo rechazó al mandarlo, o avisó después por webhook),
// y dejar el botón para hacerlo a mano.
//
// 🚩 Espejo de `motivoDeMeta` en `supabase/functions/_shared/recordatorios_auto.ts`.
// Si se toca uno, el otro. Paridad: `node tools/paridad_motor_retencion.cjs`.
// ─────────────────────────────────────────────────────────────

export function motivoDeMeta(codigo: string | number | null | undefined, mensaje: string | null | undefined): { motivo: string; cortarTanda: boolean } {
    const c = String(codigo ?? '');
    const detalle = String(mensaje ?? '').trim();
    switch (c) {
        case '131042': return { motivo: 'WhatsApp frenó el envío por un problema de pago o de permisos de la cuenta del taller (131042)', cortarTanda: true };
        case '131031': return { motivo: 'WhatsApp bloqueó la cuenta del taller (131031)', cortarTanda: true };
        case '190': return { motivo: 'el permiso de WhatsApp del taller venció y hay que reconectarlo (190)', cortarTanda: true };
        case '10': case '200': return { motivo: `WhatsApp no le da permiso a la app para mandar desde este número (${c})`, cortarTanda: true };
        case '132001': return { motivo: 'la plantilla del recordatorio no está aprobada en la cuenta del taller (132001)', cortarTanda: true };
        case '131048': case '130429': case '80007': return { motivo: `WhatsApp frenó la tanda por mandar muchos seguidos (${c})`, cortarTanda: true };
        case '131026': return { motivo: 'ese número no pudo recibirlo, puede que no tenga WhatsApp (131026)', cortarTanda: false };
        default: {
            const entre = [detalle.slice(0, 160), c].filter(Boolean).join(', ');
            return { motivo: `WhatsApp lo rechazó${entre ? ` (${entre})` : ''}`, cortarTanda: false };
        }
    }
}
