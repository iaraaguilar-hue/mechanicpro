// ─────────────────────────────────────────────────────────────
// Gating por plan — ÚNICA fuente de verdad.
// Antes el gating vivía inline y disperso (App.tsx, Metrics.tsx,
// SuperAdmin.tsx, printServiceBtn.ts). Toda feature nueva se declara acá.
// ─────────────────────────────────────────────────────────────

export type Plan = 'Sport' | 'Pro' | 'Expert';

/** Normaliza plan_actual (puede venir null/undefined de la BD → Sport). */
export function planDe(taller?: { plan_actual?: string } | null): Plan {
    const p = taller?.plan_actual;
    return p === 'Pro' || p === 'Expert' ? p : 'Sport';
}

const FEATURES: Record<string, Plan[]> = {
    /** Sección Auditoría (papelera de services eliminados). */
    auditoria: ['Pro', 'Expert'],
    /** Configuración self-service del taller: branding + catálogo + preferencias. */
    config_taller: ['Pro', 'Expert'],
    /** Descripciones de catálogo con formato (RichText). */
    rich_text: ['Pro', 'Expert'],
    /** Modo "Avances por etapas" en la Mesa de Trabajo. */
    etapas: ['Pro', 'Expert'],
};

export type Feature = keyof typeof FEATURES;

export function tieneFeature(taller: { plan_actual?: string } | null | undefined, feature: Feature): boolean {
    return FEATURES[feature].includes(planDe(taller));
}

// ─────────────────────────────────────────────────────────────
// Modo "Avances por etapas" (opt-in por taller, pedido de Cronobikes).
// Config en talleres.config_avances: { habilitado, etapas[] }.
// Progreso por orden en servicios.etapas_data: { [etapa]: bool }.
// ─────────────────────────────────────────────────────────────

export interface ConfigAvances {
    habilitado: boolean;
    etapas: string[];
}

export const ETAPAS_DEFAULT = [
    'Diagnóstico',
    'Esperando repuesto',
    'En reparación',
    'Prueba y ajuste',
    'Lista para retirar',
];

/** Lee la config de avances del taller con defaults sanos. */
export function configAvancesDe(taller?: { plan_actual?: string; config_avances?: any } | null): ConfigAvances {
    const raw = taller?.config_avances;
    const etapas = Array.isArray(raw?.etapas) && raw.etapas.length > 0
        ? raw.etapas.filter((e: any) => typeof e === 'string' && e.trim())
        : ETAPAS_DEFAULT;
    return { habilitado: raw?.habilitado === true, etapas };
}

/** true solo si el plan lo permite Y el taller lo activó en Configuración. */
export function avancesActivos(taller?: { plan_actual?: string; config_avances?: any } | null): boolean {
    return tieneFeature(taller ?? null, 'etapas') && configAvancesDe(taller).habilitado;
}
