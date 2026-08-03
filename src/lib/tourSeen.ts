// ─────────────────────────────────────────────────────────────
// Recorrido guiado (onboarding): flag "visto" POR DISPOSITIVO, mismo
// criterio que las novedades (novedadesSeen.ts) — la cuenta del taller
// la comparten varios mecánicos, así el recorrido le aparece una vez a
// cada uno desde SU dispositivo.
// v2 en la llave: el rediseño interactivo de ago-2026 unificó todo en
// UN tour → todos lo ven una vez más. Si el guion vuelve a cambiar
// fuerte, subir a v3.
// ─────────────────────────────────────────────────────────────

import type { ContextoTour } from '@/lib/tourSteps';

const KEY = 'mechanicpro_tour_v2';

// Llaves de versiones anteriores (bienvenida v1 + tutoriales contextuales
// que hoy viven dentro del tour único): se limpian en el reset.
const KEYS_LEGADO = [
    'mechanicpro_tour_v1',
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
