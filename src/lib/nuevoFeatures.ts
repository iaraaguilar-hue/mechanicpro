// ─────────────────────────────────────────────────────────────
// Sistema de etiqueta "Nuevo" (pedido de Iara, 27-jul).
// Como nadie lee las notificaciones, cada función nueva se marca con
// un cartelito "Nuevo" al lado. Se APAGA SOLO: desaparece cuando el
// dispositivo ya la vio/usó (localStorage) o cuando pasó la ventana de
// días desde el lanzamiento — lo que ocurra primero. Así no queda
// "Nuevo" para siempre.
//
// El color lo pone quien lo renderiza (NuevoBadge usa el primary del
// taller) → combina con la marca de cada taller.
// ─────────────────────────────────────────────────────────────

// featureKey → fecha de lanzamiento (ISO, solo día).
export const NUEVO_FEATURES: Record<string, string> = {
    'tareas-en-creacion': '2026-07-27',
    'registro-diagnostico': '2026-07-27',
};

const VENTANA_DIAS = 21;
const VISTO_KEY = 'mp_nuevo_visto';

export const getNuevoVistos = (): string[] => {
    try { return JSON.parse(localStorage.getItem(VISTO_KEY) || '[]'); } catch { return []; }
};

export const marcarNuevoVisto = (feature: string) => {
    const vistos = getNuevoVistos();
    if (vistos.includes(feature)) return;
    try { localStorage.setItem(VISTO_KEY, JSON.stringify([...vistos, feature])); } catch { /* ignore */ }
};

/** ¿Se debe mostrar "Nuevo" para esta función en ESTE dispositivo? */
export const esNuevo = (feature: string): boolean => {
    const release = NUEVO_FEATURES[feature];
    if (!release) return false;
    if (getNuevoVistos().includes(feature)) return false;
    const dias = (Date.now() - new Date(release + 'T00:00:00').getTime()) / 86_400_000;
    return dias >= 0 && dias <= VENTANA_DIAS;
};
