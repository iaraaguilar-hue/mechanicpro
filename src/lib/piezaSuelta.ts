// ─────────────────────────────────────────────────────────────
// LA PIEZA SUELTA (14-sep-2026).
//
// Pedido de Ariel Leira (Leira Bikes): cuando el cliente trae solo una rueda, una
// tija o un amortiguador, que quede anotado así, "aunque se sepa que ese cliente
// tiene una bici". La orden sigue colgando de su bici (es de donde es la pieza) y
// `servicios.pieza` dice qué entró al taller. NULL = la bici entera.
// ─────────────────────────────────────────────────────────────

export const PIEZAS_COMUNES: { valor: string; etiqueta: string }[] = [
    { valor: 'rueda', etiqueta: 'Solo la rueda' },
    { valor: 'tija', etiqueta: 'Solo la tija' },
    { valor: 'amortiguador', etiqueta: 'Solo el amortiguador' },
    { valor: 'horquilla', etiqueta: 'Solo la horquilla' },
];

const MASCULINAS = new Set(['amortiguador', 'manubrio', 'asiento', 'shock', 'cuadro', 'plato', 'piñón', 'pinon', 'cassette', 'pedal', 'motor', 'buje']);

/** "la rueda", "el amortiguador". Lo que el taller escribió a mano va tal cual. */
export function piezaEnFrase(pieza?: string | null): string {
    const p = (pieza ?? '').trim();
    if (!p) return '';
    const primera = p.split(/\s+/)[0].toLowerCase();
    if (PIEZAS_COMUNES.some(x => x.valor === p) || /[a]$/.test(primera)) {
        return `${MASCULINAS.has(primera) ? 'el' : 'la'} ${p}`;
    }
    return MASCULINAS.has(primera) ? `el ${p}` : p;
}

/**
 * Cómo se nombra lo que está en el taller cuando se le escribe al cliente:
 * "rueda de la Epic 8" en vez de "Epic 8". Va después de "tu": "Estoy con tu
 * rueda de la Epic 8", "Ya está lista tu rueda de la Epic 8".
 *
 * 🚩 Espejo de `valoresDelService` en `supabase/functions/_shared/motor_wa.ts`.
 * Si se toca uno, el otro.
 */
export function biciConPieza(bici: string, pieza?: string | null, tieneBici = true): string {
    const p = (pieza ?? '').trim();
    if (!p) return bici;
    return tieneBici ? `${p} de la ${bici}` : p;
}
