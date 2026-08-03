// ─────────────────────────────────────────────────────────────
// Recorridos guiados (onboarding): flag "visto" POR DISPOSITIVO,
// mismo criterio que las novedades (novedadesSeen.ts) — la cuenta del
// taller la comparten varios mecánicos, así cada tutorial le aparece
// una vez a cada uno desde SU dispositivo.
//
// Hay varios contextos: 'bienvenida' (el recorrido general) y los
// contextuales ('garage', 'service', 'finalizar'). Cada uno guarda su
// propio flag. v1 en la llave: si un guion cambia fuerte, subir a v2
// para que todos lo vuelvan a ver una vez.
// ─────────────────────────────────────────────────────────────

import type { ContextoTour } from '@/lib/tourSteps';

// 'bienvenida' conserva la llave histórica (ya hay dispositivos con ella).
const KEY_BASE = 'mechanicpro_tour';
const keyDe = (ctx: ContextoTour) =>
    ctx === 'bienvenida' ? `${KEY_BASE}_v1` : `${KEY_BASE}_${ctx}_v1`;

const CONTEXTOS: ContextoTour[] = [
    'bienvenida', 'garage', 'service-cliente', 'service-bici', 'service', 'finalizar', 'retencion',
];

export function tourVisto(ctx: ContextoTour = 'bienvenida'): boolean {
    try {
        return localStorage.getItem(keyDe(ctx)) === 'visto';
    } catch {
        // Sin localStorage (modo privado raro) → no insistir con el tour.
        return true;
    }
}

export function marcarTourVisto(ctx: ContextoTour = 'bienvenida'): void {
    try {
        localStorage.setItem(keyDe(ctx), 'visto');
    } catch {
        // Sin localStorage no hay persistencia posible; seguir sin romper.
    }
}

/** Reset total (botón de Configuración): todos los tutoriales vuelven a aparecer. */
export function resetTours(): void {
    try {
        CONTEXTOS.forEach((ctx) => localStorage.removeItem(keyDe(ctx)));
    } catch {
        // Ídem: sin localStorage no hay nada que resetear.
    }
}
