// ─────────────────────────────────────────────────────────────
// "Novedades vistas" POR DISPOSITIVO (no por cuenta).
// Vive en localStorage → cada navegador/dispositivo marca lo suyo.
// Así, si varios mecánicos comparten la misma cuenta del taller, el
// pop-up de novedad le aparece a CADA uno la primera vez que entra
// desde SU dispositivo (pedido de Iara, 27-jul). La campana y el
// pop-up comparten esta misma llave, así que ver el pop-up deja las
// novedades como vistas para la campana (se refleja en su contador al
// recargar; el snapshot en memoria no se actualiza en vivo).
// ─────────────────────────────────────────────────────────────

const SEEN_KEY = 'mp_novedades_vistas';

export const getNovedadesVistas = (): string[] => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
};

export const saveNovedadesVistas = (ids: string[]) => {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
};

export const marcarNovedadesVistas = (ids: string[]) => {
    const merged = Array.from(new Set([...getNovedadesVistas(), ...ids]));
    saveNovedadesVistas(merged);
    return merged;
};
