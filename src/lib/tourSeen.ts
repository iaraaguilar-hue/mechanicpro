// ─────────────────────────────────────────────────────────────
// Recorrido guiado (onboarding): flag "visto" POR DISPOSITIVO, mismo
// criterio que las novedades (novedadesSeen.ts) — la cuenta del taller
// la comparten varios mecánicos, así el recorrido le aparece una vez a
// cada uno desde SU dispositivo.
// v3 en la llave (9-sep-2026): el recorrido pasó de 36 a 46 pasos y ninguno de
// los nuevos existía en v2 — avisarle al cliente desde la orden, lo que trajeron
// los mensajes, la bandeja, las campañas, los mensajes automáticos, el WhatsApp
// propio, y tres pantallas enteras del menú (Bicis paradas, Preguntale,
// Auditoría) que el tour nunca abría. Sin subir la llave, los talleres que ya lo
// vieron NO verían nada de eso nunca: el trabajo de completarlo no llegaría a
// una sola persona. La regla la dejó escrita la v2 acá mismo ("si el guion
// vuelve a cambiar fuerte, subir a v3") y esta vez sí cambió fuerte.
// ─────────────────────────────────────────────────────────────

import type { ContextoTour } from '@/lib/tourSteps';

const KEY = 'mechanicpro_tour_v3';

// Llaves de versiones anteriores (bienvenida v1 + tutoriales contextuales
// que hoy viven dentro del tour único): se limpian en el reset.
const KEYS_LEGADO = [
    'mechanicpro_tour_v1',
    'mechanicpro_tour_v2',
    'mechanicpro_tour_garage_v1',
    'mechanicpro_tour_service-cliente_v1',
    'mechanicpro_tour_service-bici_v1',
    'mechanicpro_tour_service_v1',
    'mechanicpro_tour_finalizar_v1',
    'mechanicpro_tour_retencion_v1',
];

export function tourVisto(_ctx: ContextoTour = 'bienvenida'): boolean {
    try {
        return localStorage.getItem(KEY) === 'visto';
    } catch {
        // Sin localStorage (modo privado raro) → no insistir con el tour.
        return true;
    }
}

export function marcarTourVisto(_ctx: ContextoTour = 'bienvenida'): void {
    try {
        localStorage.setItem(KEY, 'visto');
    } catch {
        // Sin localStorage no hay persistencia posible; seguir sin romper.
    }
}

/** Reset (botón de Configuración): el recorrido vuelve a estar disponible. */
export function resetTours(): void {
    try {
        localStorage.removeItem(KEY);
        KEYS_LEGADO.forEach((k) => localStorage.removeItem(k));
    } catch {
        // Ídem: sin localStorage no hay nada que resetear.
    }
}
