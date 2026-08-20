/**
 * notasServicio.ts — el candado que separa lo que ve el cliente de lo que no.
 *
 * Desde el 20-ago-2026 una orden tiene DOS campos de notas (pedido de Iara):
 *
 *   · `notas_mecanico`  → LAS VE EL CLIENTE. Salen impresas en el comprobante
 *                          y la IA las puede usar para escribir un mensaje.
 *                          Es lo que existía hasta ahora, sin cambios.
 *   · `notas_internas`  → NO SALEN DEL TALLER. Nunca. Para lo que el mecánico
 *                          necesita recordar y no corresponde compartir: "el
 *                          cuadro venía rayado, saqué foto", "falta el repuesto,
 *                          pedirlo el lunes", "revisar el precio con Rami".
 *
 * POR QUÉ ESTO ES UNA FUNCIÓN Y NO UN COMENTARIO: "acordate de no mandar las
 * internas" no es un candado, es una intención. Todo lo que arma algo que sale
 * hacia el cliente (el PDF, un mensaje) pide las notas POR ACÁ, y esta función
 * ni siquiera mira el campo interno. Si alguien mañana agrega una pantalla
 * nueva que manda algo al cliente, el camino corto ya es el correcto.
 *
 * El espejo del lado del servidor: `supabase/functions/mensaje-ia` selecciona
 * `notas_mecanico` explícitamente y NO pide `notas_internas`. Si algún día se
 * cambia ese `select` a `*`, las internas entrarían al prompt del mensaje que
 * se le manda al cliente.
 */

export interface ServicioConNotas {
    notas_mecanico?: string | null;
    notas_internas?: string | null;
    /** Alias legacy que usan los objetos que se le pasan al generador de PDF. */
    mechanic_notes?: string | null;
    notes?: string | null;
}

/**
 * Las notas que PUEDEN salir hacia el cliente (comprobante, mensajes).
 * Lee `notas_mecanico` y sus alias legacy, y jamás `notas_internas`.
 */
export function notasParaElCliente(servicio: ServicioConNotas | null | undefined): string {
    if (!servicio) return '';
    const texto = servicio.notes ?? servicio.mechanic_notes ?? servicio.notas_mecanico ?? '';
    return typeof texto === 'string' ? texto : '';
}

/** Las notas que solo ve el taller. Nunca se las pase a nada que salga afuera. */
export function notasDelTaller(servicio: ServicioConNotas | null | undefined): string {
    const texto = servicio?.notas_internas ?? '';
    return typeof texto === 'string' ? texto : '';
}

export function tieneNotasInternas(servicio: ServicioConNotas | null | undefined): boolean {
    return notasDelTaller(servicio).trim().length > 0;
}

/** Rótulos, en un solo lugar: si cambian, cambian en todas las pantallas. */
export const ETIQUETAS_NOTAS = {
    cliente: 'Notas para el cliente',
    clienteAyuda: 'Salen impresas en el comprobante que se lleva.',
    clientePlaceholder: 'Lo que se le explica al cliente: qué se hizo, qué conviene mirar la próxima…',
    interna: 'Notas internas del taller',
    internaAyuda: 'Solo las ven ustedes. No salen en el comprobante ni en los mensajes.',
    internaPlaceholder: 'Para ustedes: el cuadro venía rayado, falta pedir el repuesto, revisar el precio…',
} as const;
