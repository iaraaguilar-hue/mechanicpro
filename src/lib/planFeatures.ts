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
    /** Tareas libres del service + candado de finalización. Todos los planes. */
    tareas_service: ['Sport', 'Pro', 'Expert'],
};

export type Feature = keyof typeof FEATURES;

export function tieneFeature(taller: { plan_actual?: string } | null | undefined, feature: Feature): boolean {
    return FEATURES[feature].includes(planDe(taller));
}

// ─────────────────────────────────────────────────────────────
// "Checklist de trabajos" (opt-in por taller, pedido de Cronobikes).
// Rediseño 21-jul-2026 tras feedback de Iara: NO son etapas genéricas de
// plantilla — el checklist se arma SOLO desde lo que la orden dice que hay
// que hacerle a ESA bici (service base + cada mano de obra y repuesto).
// Si la orden dice "cambio de cadena", el mecánico tilda "cambio de cadena".
// Config en talleres.config_avances: { habilitado }.
// Progreso por orden en servicios.etapas_data: { [claveTrabajo]: bool }.
// ─────────────────────────────────────────────────────────────

/** true solo si el plan lo permite Y el taller lo activó en Configuración. */
export function avancesActivos(taller?: { plan_actual?: string; config_avances?: any } | null): boolean {
    return tieneFeature(taller ?? null, 'etapas') && taller?.config_avances?.habilitado === true;
}

export interface TrabajoChecklist {
    /** Clave estable en etapas_data. Por descripción (no por id: los items se
     *  regeneran con id nuevo en cada edición de la orden). Si se edita el
     *  texto de un trabajo, su check se resetea — correcto: cambió la tarea. */
    clave: string;
    etiqueta: string;
    tipo: 'base' | 'labor' | 'part';
}

/** Los trabajos tildables de una orden = service base + items cargados. */
export function trabajosDe(servicio?: {
    tipo_servicio?: string;
    items_extra?: { descripcion: string; categoria?: string }[];
} | null): TrabajoChecklist[] {
    if (!servicio) return [];
    const trabajos: TrabajoChecklist[] = [];
    // "OTRO" no es un trabajo en sí: el laburo real está en los items.
    if (servicio.tipo_servicio && servicio.tipo_servicio.trim().toUpperCase() !== 'OTRO') {
        trabajos.push({ clave: 'base', etiqueta: servicio.tipo_servicio.trim(), tipo: 'base' });
    }
    for (const item of servicio.items_extra || []) {
        const desc = item.descripcion?.trim();
        if (!desc) continue;
        const tipo = item.categoria === 'labor' ? 'labor' : 'part';
        trabajos.push({ clave: `${tipo}:${desc.toLowerCase()}`, etiqueta: desc, tipo });
    }
    return trabajos;
}

/** Trabajos de la orden que todavía no fueron tildados. */
export function trabajosPendientes(servicio?: {
    tipo_servicio?: string;
    items_extra?: { descripcion: string; categoria?: string }[];
    etapas_data?: Record<string, boolean> | null;
} | null): TrabajoChecklist[] {
    const data = servicio?.etapas_data || {};
    return trabajosDe(servicio).filter(t => !data[t.clave]);
}

// ─────────────────────────────────────────────────────────────
// "Tareas del service" (opt-in por taller — pedido Cecilia/Cronobikes 26-jul).
// Tareas LIBRES que el mecánico anota para no olvidarse ("colocar plato 34").
// A diferencia del checklist de trabajos (derivado del catálogo, Pro/Expert),
// estas son texto libre, para TODOS los planes, y pueden BLOQUEAR la
// finalización (poka-yoke): sin todas tildadas, no se habilita el botón verde.
// Config en talleres.config_notificaciones: { tareas_habilitado, bloquear_finalizacion }.
// Data por orden en servicios.tareas_extra: [{ id, texto, hecha }].
// ─────────────────────────────────────────────────────────────

export interface TareaService {
    id: string;
    texto: string;
    hecha: boolean;
}

/** true solo si el taller activó las tareas del service en Configuración. */
export function tareasActivas(taller?: { plan_actual?: string; config_notificaciones?: any } | null): boolean {
    return tieneFeature(taller ?? null, 'tareas_service') && taller?.config_notificaciones?.tareas_habilitado === true;
}

/** true si además prendió el candado: no se puede finalizar con tareas sin tildar. */
export function bloqueoFinalizacionActivo(taller?: { plan_actual?: string; config_notificaciones?: any } | null): boolean {
    return tareasActivas(taller) && taller?.config_notificaciones?.bloquear_finalizacion === true;
}

/** Tareas libres de una orden que todavía no se tildaron. */
export function tareasLibresPendientes(servicio?: { tareas_extra?: TareaService[] | null } | null): TareaService[] {
    return (servicio?.tareas_extra || []).filter(t => !t.hecha);
}
