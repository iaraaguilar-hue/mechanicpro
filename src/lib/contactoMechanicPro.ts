/**
 * Con quién habla un taller para seguir usando Mechanic Pro o para consultar algo.
 *
 * Una sola fuente (8-oct-2026): la usan el cartel del acceso cortado
 * (`components/AccesoSuspendido.tsx`) y el aviso de la prueba gratuita del Taller
 * Activo (`components/AvisoDePrueba.tsx`). Si cambia el número o el mail, cambia acá
 * y los dos dicen lo mismo.
 */

// El celular de Iara (factura de Personal, portfolio de Meta) y el mail de la app.
export const CONTACTO = 'Iara Aguilar';
export const CONTACTO_NOMBRE = 'Iara';
export const TELEFONO = '+54 9 11 2567-7858';
export const TELEFONO_WA = '5491125677858';
export const CORREO = 'iara@mechanicpro.com.ar';

/** El link de WhatsApp a Iara con el primer mensaje ya escrito. */
export function linkWhatsAppContacto(texto: string): string {
    return `https://wa.me/${TELEFONO_WA}?text=${encodeURIComponent(texto)}`;
}
