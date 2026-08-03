// ─────────────────────────────────────────────────────────────
// Recorrido de bienvenida (onboarding): flag "visto" POR DISPOSITIVO,
// mismo criterio que las novedades (novedadesSeen.ts) — la cuenta del
// taller la comparten varios mecánicos, así el recorrido le aparece
// una vez a cada uno desde SU dispositivo.
// v1 en la llave: si el recorrido cambia fuerte, subir a v2 para que
// todos lo vuelvan a ver una vez.
// ─────────────────────────────────────────────────────────────

const KEY = 'mechanicpro_tour_v1';

export function tourVisto(): boolean {
    try {
        return localStorage.getItem(KEY) === 'visto';
    } catch {
        // Sin localStorage (modo privado raro) → no insistir con el tour.
        return true;
    }
}

export function marcarTourVisto(): void {
    try {
        localStorage.setItem(KEY, 'visto');
    } catch {
        // Sin localStorage no hay persistencia posible; seguir sin romper.
    }
}
