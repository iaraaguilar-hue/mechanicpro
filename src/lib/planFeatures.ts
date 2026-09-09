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
    /** Configuración self-service del taller: branding + catálogo + preferencias.
     *  Va en TODOS los planes desde el 17-ago-2026. Es la condición de que el
     *  Sport exista: a USD 29, si cada alta cuesta una sesión de configuración
     *  a mano, el taller es trabajo gratis (ver el análisis del Asesor
     *  Financiero). Lo que separa los planes es la IA, y configurarse el propio
     *  taller no es IA. */
    config_taller: ['Sport', 'Pro', 'Expert'],
    /** Descripciones de catálogo con formato (RichText). */
    rich_text: ['Pro', 'Expert'],
    /** Modo "Avances por etapas" en la Mesa de Trabajo. */
    etapas: ['Pro', 'Expert'],
    /** Tareas libres del service + candado de finalización. Todos los planes. */
    tareas_service: ['Sport', 'Pro', 'Expert'],
    /** El segundo par de ojos sobre el presupuesto (idea 7). La IA es lo que
     *  separa a Pro/Expert del Sport (decisión de pricing 17-ago-2026):
     *  el Motor completo va en Sport, el impulso por IA no. */
    segundo_ojos: ['Pro', 'Expert'],
    /** El mensaje del Motor escrito por la IA leyendo el historial del cliente.
     *  El Motor entero (alertas, lista, envío con el texto fijo) va en TODOS los
     *  planes; lo que separa al Pro es que la IA ESCRIBA el mensaje. Gate espejo
     *  server-side en la Edge Function `mensaje-ia` — el de acá solo evita el
     *  viaje al servidor. */
    mensaje_ia: ['Pro', 'Expert'],
    /** El cruce de bicis paradas contra la base de clientes (idea 15). Es IA:
     *  Pro/Expert, gate espejo server-side en la Edge Function `cruce-stock`.
     *  Además tiene gate de ROL (la lista trae clientes con su gasto): el
     *  mecánico solo la ve si el admin prendió talleres.bicis_paradas_ve_mecanico
     *  (decisión de Iara 19-ago-2026) — candado duro en RLS
     *  (puede_ver_bicis_paradas), no solo acá. */
    bicis_paradas: ['Pro', 'Expert'],
    /** Preguntale a tu taller (idea 3): el chat que contesta con los datos del
     *  taller. Es IA: Pro/Expert, gate espejo server-side en `preguntar-taller`.
     *  Lo usan TODOS los roles, pero la PLATA va atada al rol: al mecánico las
     *  herramientas de facturación no le existen (decidido en la Edge Function,
     *  no en la UI). */
    preguntale: ['Pro', 'Expert'],
    /** El Motor con cabeza (ideas 5+6): la fecha del aviso sale del ritmo
     *  real de ESE ciclista (no del plazo fijo) y la lista "Se está yendo"
     *  detecta por comportamiento. Es estadística sobre los datos del taller
     *  (costo marginal 0), pero se vende como el diferencial Pro: "el Sport
     *  te dice a quién llamar; el Pro te dice a quién llamar con cabeza". */
    motor_predictivo: ['Pro', 'Expert'],

    // ═══ Lo de septiembre-2026, repartido por Iara el 9-sep ═══
    // Hasta hoy NADA de esto estaba gateado: un Sport de USD 29 se llevaba el
    // WhatsApp conectado, los avisos automáticos y las campañas. La decisión
    // sigue la regla de la escalera —lo que nos cuesta soporte y plata va
    // arriba— y de paso da el argumento del salto: «en el Sport lo mandás vos,
    // en el Pro sale solo y sabés si lo leyeron».
    //
    // 🟢 Verificado antes de aplicarlo: NO le saca nada a nadie. El único Sport
    // (ProCycling) y el único Pro (Crono) no tienen el WhatsApp conectado; los
    // dos que sí lo tienen son Expert.

    /** Conectar el número propio del taller por Coexistencia. Es la feature más
     *  cara de sostener que tenemos: el alta se hace con el taller delante, hay
     *  24hs en las que WhatsApp Web no vuelve, y cada conversación con Meta
     *  cuesta. Todo lo que cuelga de acá va al mismo escalón. */
    whatsapp_propio: ['Pro', 'Expert'],
    /** Los avisos que salen solos (al terminar, al entregar, a los N días) y las
     *  plantillas que el taller pide para él. Sin número conectado no existen,
     *  así que van con `whatsapp_propio`. */
    mensajes_automaticos: ['Pro', 'Expert'],
    /** Campañas: escribirle a un grupo entero con una sola aprobación. */
    campanas: ['Pro', 'Expert'],
    /** El panel de la plata que volvió y la bandeja de respuestas: lo que mide
     *  el resultado. Es el número que le prueba al taller que el sistema sirve,
     *  y es lo que se vende en el escalón de arriba. */
    panel_retorno: ['Pro', 'Expert'],
    /**
     * 🔴 EL AVISO AL CLIENTE DESDE LA ORDEN VA EN TODOS LOS PLANES, A PROPÓSITO.
     * Es el dolor con el que Ariel Leira nos vino a buscar —la bici parada
     * esperando un sí y la conversación que no queda escrita— y dejarlo afuera
     * del plan de entrada sería vender un taller a medias.
     * Lo que cambia por plan NO es la función, es el CANAL: en Sport se abre
     * WhatsApp con el mensaje escrito y queda anotado igual; en Pro sale solo
     * por el número del taller y vuelven los estados (entregado, leído). Eso lo
     * decide `whatsapp_propio`, no este gate.
     */
    aviso_al_cliente: ['Sport', 'Pro', 'Expert'],
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
    // 🔴 DOS ÍTEMS QUE SE LLAMAN IGUAL COMPARTÍAN UNA SOLA TILDE (9-sep-2026).
    // La clave era `${tipo}:${descripcion}`, así que una orden con dos renglones
    // «Cadena» generaba dos veces `part:cadena`: tildar uno tildaba los dos, el
    // contador decía 2 de 2 con un trabajo sin hacer, y si el taller tiene el
    // candado de finalización prendido lo dejaba cerrar antes de tiempo. React
    // además tiraba «two children with the same key» en la consola, que es como
    // apareció: en el QA del recorrido, sobre una orden real del Taller Demo.
    //
    // El desempate va SOLO a partir de la segunda aparición (`#2`, `#3`) y no en
    // todas: si le pusiera el índice a todas, cambiarían TODAS las claves y las
    // órdenes en curso perderían las tildes que ya tenían. Así, el caso normal
    // conserva su clave de siempre y solo se toca el que estaba roto.
    const vistas = new Map<string, number>();
    for (const item of servicio.items_extra || []) {
        const desc = item.descripcion?.trim();
        if (!desc) continue;
        const tipo = item.categoria === 'labor' ? 'labor' : 'part';
        const base = `${tipo}:${desc.toLowerCase()}`;
        const n = (vistas.get(base) ?? 0) + 1;
        vistas.set(base, n);
        trabajos.push({ clave: n === 1 ? base : `${base}#${n}`, etiqueta: desc, tipo });
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
