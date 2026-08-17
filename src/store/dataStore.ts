import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { claveProducto, type ProductoTaller } from '@/lib/buscadorProductos';

export type { ProductoTaller };

// ─────────────────────────────────────────────────────────────
// Supabase shape types (columnas de la BD de producción)
// ─────────────────────────────────────────────────────────────
export interface SupabaseClient {
    id: string;
    taller_id: string;
    nombre: string;
    numero_cliente?: number;
    dni?: string;
    telefono?: string;
    email?: string;
    tipo_ciclista?: string;
    eliminado_en?: string | null;
    /** Fecha de alta del cliente. La columna se llama así en la base: no hay created_at. */
    fecha_registro?: string;
    /** El taller las anota a mano en la ficha del cliente. */
    nombre_proxima_carrera?: string | null;
    fecha_proxima_carrera?: string | null;
}

export interface SupabaseBike {
    id: string;
    taller_id: string;
    cliente_id: string;
    marca: string;
    modelo: string;
    transmision?: string;
    categoria?: string;
    notas?: string;
}

// Lo que se guarda cuando sale un mensaje del Motor de Retención.
// Tabla `contactos_retencion` (migración 20260805143000).
export interface ContactoRetencionInput {
    taller_id: string;
    cliente_id?: string | null;
    bicicleta_id?: string | null;
    servicio_origen_id?: string | null;
    componente?: string | null;
    /** 'whatsapp_manual' = lo apretó una persona · 'whatsapp_auto' = lo mandó el sistema. */
    canal?: string;
    /** Solo cuando salió por la API oficial. En null si fue por el link wa.me. */
    mensaje_whatsapp_id?: string | null;
    /** Qué ángulo de mensaje se usó. Es lo que hace medible "cuál trae más plata". */
    variante?: string | null;
    /** El texto que se le mandó, para poder leerlo desde el panel. */
    texto_enviado?: string | null;
}

/** Lo que se le pide a la IA para que escriba el mensaje. */
export interface RedaccionInput {
    cliente_id: string;
    motivo: 'retencion' | 'pre_carrera' | 'post_carrera' | 'respuesta';
    componente?: string;
    carrera?: string;
    ultimo_mensaje_cliente?: string;
}

export interface RedaccionResultado {
    ok: boolean;
    /** El cuerpo del mensaje, ya saneado para viajar como parámetro de Meta. */
    linea?: string;
    /** Con qué nombre firma el taller. */
    firma?: string;
    variante?: string;
    /** El dato del expediente en el que se apoyó. Para auditar que no inventó. */
    dato_usado?: string | null;
    error?: string;
}

/** Una sugerencia del segundo par de ojos (idea 7), como viene de la base. */
export interface SugerenciaPresupuesto {
    id: string;
    servicio_id: string;
    texto: string;
    /** El dato del historial en que se apoyó. Es la evidencia de que no inventó. */
    dato_usado: string | null;
    descripcion_item: string | null;
    categoria_item: 'part' | 'labor';
    precio_sugerido: number | null;
    estado: 'sugerida' | 'aceptada' | 'no_aplica';
}

export interface SugerenciasResultado {
    ok: boolean;
    sugerencias: SugerenciaPresupuesto[];
    error?: string;
}

export interface EnvioWhatsAppInput {
    proposito: 'retencion' | 'comprobante' | 'evento';
    /**
     * 'texto' = mensaje libre, SOLO válido dentro de las 24hs desde que el
     * cliente escribió. Fuera de esa ventana Meta únicamente acepta
     * plantillas, y la Edge Function lo verifica del lado del servidor.
     */
    tipo?: 'plantilla' | 'texto';
    /** El mensaje libre, cuando tipo === 'texto'. */
    texto?: string;
    /** Nombre de la plantilla aprobada en Meta. La Edge Function tiene su propia allowlist. */
    plantilla?: string;
    destino: string;
    parametros?: string[];
    cliente_id?: string | null;
    bicicleta_id?: string | null;
    servicio_id?: string | null;
    variante?: string | null;
    generado_por_ia?: boolean;
}

export interface EnvioWhatsAppResultado {
    ok: boolean;
    /** id de la fila en mensajes_whatsapp, para enganchar el contacto de retención. */
    mensaje_id?: string;
    /** Código corto para decidir qué hacer. 'whatsapp_no_conectado' = este taller todavía no lo activó. */
    error?: string;
    detalle?: string;
}

export interface SupabaseService {
    id: string;
    taller_id: string;
    bicicleta_id: string;
    numero_orden?: number;
    fecha_ingreso?: string;
    estado?: string;
    tipo_servicio?: string;
    precio_total?: number;
    precio_base?: number;
    notas_mecanico?: string;
    fecha_entrega?: string | null;
    fecha_finalizacion?: string | null;
    fecha_entregado?: string | null;
    webhook_erp_disparado?: boolean;
    eliminado_en?: string | null;
    checklist_data?: Record<string, boolean>;
    etapas_data?: Record<string, boolean> | null;
    tareas_extra?: { id: string; texto: string; hecha: boolean }[] | null;
    carrera_id?: string | null;
    alertas_ocultas?: string[];
    items_extra?: { id: string; descripcion: string; precio: number; categoria?: string }[];
    descripcion_catalogo?: string | null;
}

export interface SupabaseCarrera {
    id: string;
    nombre: string;
    fecha_evento?: string | null;
}

export interface SupabaseReminder {
    id: string;
    taller_id: string;
    bicicleta_id: string;
    componente?: string;
    fecha_asignacion?: string;
    fecha_vencimiento?: string;
    estado?: string;
}

// ─────────────────────────────────────────────────────────────
// Store State & Actions
// ─────────────────────────────────────────────────────────────
interface DataState {
    clientes: SupabaseClient[];
    bicicletas: SupabaseBike[];
    servicios: SupabaseService[];
    recordatorios: SupabaseReminder[];
    carreras: SupabaseCarrera[];
    /** Catálogo de productos del taller — lo que alimenta el buscador de repuestos. */
    productos: ProductoTaller[];
    productosCargados: boolean;
    isHydrating: boolean;
    hydrateError: string | null;
    lastHydratedAt: number | null;

    // Hidratación
    fetchDashboardData: (tallerId: string) => Promise<void>;
    invalidate: () => void;

    // ── Catálogo de productos (buscador de repuestos) ──
    fetchProductos: (tallerId: string, opciones?: { forzar?: boolean }) => Promise<void>;
    registrarProductosUsados: (items: { descripcion: string; precio?: number; categoria?: string }[]) => Promise<void>;
    ocultarProducto: (id: string) => Promise<void>;

    // ── CRUD: Clientes ──
    createCliente: (data: Omit<SupabaseClient, 'id'>) => Promise<SupabaseClient>;
    updateCliente: (id: string, data: Partial<SupabaseClient>) => Promise<void>;
    deleteCliente: (id: string) => Promise<void>;

    // ── CRUD: Bicicletas ──
    createBicicleta: (data: Omit<SupabaseBike, 'id'>) => Promise<SupabaseBike>;
    updateBicicleta: (id: string, data: Partial<SupabaseBike>) => Promise<void>;
    deleteBicicleta: (id: string) => Promise<void>;

    // ── CRUD: Servicios ──
    createServicio: (data: Omit<SupabaseService, 'id'>) => Promise<SupabaseService>;
    updateServicio: (id: string, data: Partial<SupabaseService>) => Promise<void>;
    deleteServicio: (id: string) => Promise<void>;
    dismissAlert: (servicioId: string, alertId: string) => Promise<void>;
    registrarContactoRetencion: (data: ContactoRetencionInput) => Promise<void>;
    enviarWhatsAppPlantilla: (input: EnvioWhatsAppInput) => Promise<EnvioWhatsAppResultado>;
    redactarMensajePersonal: (input: RedaccionInput) => Promise<RedaccionResultado>;
    sugerirPresupuesto: (servicioId: string) => Promise<SugerenciasResultado>;
    responderSugerencia: (id: string, estado: 'aceptada' | 'no_aplica') => Promise<boolean>;

    // ── CRUD: Recordatorios ──
    createRecordatorio: (data: Omit<SupabaseReminder, 'id'>) => Promise<SupabaseReminder>;
    upsertRecordatorios: (items: Omit<SupabaseReminder, 'id'>[]) => Promise<void>;

    // ── CRUD: Carreras ──
    createCarrera: (data: Omit<SupabaseCarrera, 'id'>) => Promise<SupabaseCarrera>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT TRAIL: Helper silencioso — un fallo aquí NUNCA bloquea el flujo principal
// ─────────────────────────────────────────────────────────────────────────────
async function logActividad(payload: {
    taller_id: string;
    usuario_id: string;
    usuario_nombre: string;
    entidad_tipo: 'CLIENTE' | 'BICICLETA';
    entidad_id: string;
    antes: object;
    despues: object;
}) {
    try {
        await supabase.from('registro_actividad').insert({
            taller_id: payload.taller_id,
            usuario_id: payload.usuario_id,
            usuario_nombre: payload.usuario_nombre,
            accion: 'EDITADO',
            entidad_tipo: payload.entidad_tipo,
            entidad_id: payload.entidad_id,
            detalles: { antes: payload.antes, despues: payload.despues },
        });
    } catch (auditErr) {
        console.warn('[DataStore] ⚠️ Audit log falló (no crítico):', auditErr);
    }
}

export const useDataStore = create<DataState>((set, get) => ({
    // ── Initial state ──
    clientes: [],
    bicicletas: [],
    servicios: [],
    recordatorios: [],
    carreras: [],
    productos: [],
    productosCargados: false,
    isHydrating: false,
    hydrateError: null,
    lastHydratedAt: null,

    // ─────────────────────────────────────────────────────────
    // MOTOR DE HIDRATACIÓN
    // ─────────────────────────────────────────────────────────
    fetchDashboardData: async (tallerId: string) => {
        if (!tallerId) {
            console.warn('[DataStore] fetchDashboardData llamado sin tallerId — abortando.');
            return;
        }
        if (get().isHydrating) return;

        set({ isHydrating: true, hydrateError: null });
        console.log(`[DataStore] 🔄 Hidratando datos para taller: ${tallerId}`);

        try {
            // Fetch carreras independently with graceful degradation
            let resCar: any = { data: [], error: null };
            try {
                resCar = await supabase.from('carreras').select('*');
            } catch (err) {
                resCar.error = err;
            }
            if (resCar.error) {
                console.error('[DataStore] ⚠️ Error al obtener carreras:', resCar.error);
            }

            const [resC, resB, resS, resR, resCat] = await Promise.all([
                supabase.from('clientes').select('*').eq('taller_id', tallerId).is('eliminado_en', null).order('numero_cliente', { ascending: true }),
                supabase.from('bicicletas').select('*').eq('taller_id', tallerId),
                supabase.from('servicios').select('*, servicio_items(*)').eq('taller_id', tallerId).is('eliminado_en', null),
                supabase.from('recordatorios').select('*').eq('taller_id', tallerId),
                supabase.from('catalogo_servicios').select('*').eq('taller_id', tallerId),
            ]);

            console.log('[DataStore] Respuesta Clientes:', resC.data?.length, resC.error);
            console.log('[DataStore] Respuesta Bicicletas:', resB.data?.length, resB.error);
            console.log('[DataStore] Respuesta Servicios:', resS.data?.length, resS.error);
            console.log('[DataStore] Respuesta Recordatorios:', resR.data?.length, resR.error);
            console.log('[DataStore] Respuesta Carreras (Global):', resCar.data?.length, resCar.error);

            const errors = [resC, resB, resS, resR, resCat].filter(r => r.error).map(r => r.error!.message);
            if (errors.length > 0) throw new Error(`Errores Supabase: ${errors.join(' | ')}`);

            const catalogo = resCat.data || [];

            // Map servicio_items (from Supabase JOIN) → items_extra (UI-expected field)
            // Inject descripcion_catalogo from local cross-reference
            const serviciosMapeados: SupabaseService[] = (resS.data || []).map((s: any) => {
                const catMatch = catalogo.find((c: any) => c.nombre === s.tipo_servicio);
                return {
                    ...s,
                    items_extra: s.servicio_items || [],
                    descripcion_catalogo: catMatch ? catMatch.descripcion : null,
                };
            });

            set({
                clientes: (resC.data as SupabaseClient[]) ?? [],
                bicicletas: (resB.data as SupabaseBike[]) ?? [],
                servicios: serviciosMapeados,
                recordatorios: (resR.data as SupabaseReminder[]) ?? [],
                carreras: (resCar.data as SupabaseCarrera[]) ?? [],
                isHydrating: false,
                lastHydratedAt: Date.now(),
            });

            console.log(`[DataStore] ✅ Hidratación completa: ${resC.data?.length} clientes, ${resB.data?.length} bicicletas, ${serviciosMapeados.length} servicios, ${resR.data?.length} recordatorios, ${resCar.data?.length} carreras`);

            // El catálogo del buscador va aparte y SIN await: puede pesar miles
            // de filas y no tiene por qué demorar la pantalla. Mientras no esté,
            // el campo de repuestos funciona como texto libre, igual que antes.
            void get().fetchProductos(tallerId, { forzar: true });
        } catch (error: any) {
            console.error('[DataStore] ❌ Error en hidratación:', error.message);
            set({ isHydrating: false, hydrateError: error.message });
        }
    },

    invalidate: () => set({
        clientes: [], bicicletas: [], servicios: [], recordatorios: [], carreras: [],
        productos: [], productosCargados: false,
        isHydrating: false, hydrateError: null, lastHydratedAt: null,
    }),

    // ═════════════════════════════════════════════════════════
    // CATÁLOGO DE PRODUCTOS — el buscador de repuestos
    //
    // Se baja ENTERO una vez y la búsqueda corre en memoria (ver
    // `buscadorProductos.ts`): con 5.400 productos son ~4 ms por tecla, o sea
    // que la lista se mueve mientras se escribe. Consultar al servidor por cada
    // letra tardaría 10× más y no andaría con el wifi de un taller.
    //
    // Va DESPUÉS de la hidratación principal y sin bloquearla: si tarda o falla,
    // la app entra igual y el mecánico escribe a mano como siempre.
    // ═════════════════════════════════════════════════════════
    fetchProductos: async (tallerId: string, opciones = {}) => {
        if (!tallerId) return;
        if (get().productosCargados && !opciones.forzar) return;

        // Supabase corta en 1.000 filas por pedido, así que un catálogo grande
        // viene por páginas. Techo de seguridad: si un taller llegara a tener un
        // catálogo enorme, se traen los más usados y el resto queda afuera
        // (ordenado por uso, o sea que lo que queda afuera es lo que nunca usa).
        const TOPE = 30_000;
        const PAGINA = 1_000;

        // `activo` = el taller lo ocultó a mano (se deshace en Configuración).
        // `sugerible` = es un repuesto de taller. En un catálogo importado del
        // ERP la mayoría NO lo es: bicicletas completas, ropa, cascos, calzado
        // (en Probikes, 3.428 de 5.632). Ver `mp_clasificar_familias.cjs`.
        const pagina = (desde: number) => supabase
            .from('productos_taller')
            .select('id,nombre,clave,sku,precio,categoria,veces_usado,ultima_vez', { count: 'exact' })
            .eq('taller_id', tallerId)
            .eq('activo', true)
            .eq('sugerible', true)
            .order('veces_usado', { ascending: false })
            .order('nombre', { ascending: true })
            .range(desde, desde + PAGINA - 1);

        try {
            // La primera página trae además el total, así que ya sabemos cuántas
            // faltan y se piden TODAS JUNTAS. En fila, las 6 páginas de Probikes
            // tardaban 3,5 s en frío: 3,5 s con el buscador vacío justo cuando el
            // mecánico está cargando la orden.
            const { data: primera, error, count } = await pagina(0);
            if (error) throw error;

            let acumulado = (primera as ProductoTaller[]) ?? [];
            const total = Math.min(count ?? acumulado.length, TOPE);

            if (total > PAGINA) {
                const desdes: number[] = [];
                for (let d = PAGINA; d < total; d += PAGINA) desdes.push(d);
                const restantes = await Promise.all(desdes.map(d => pagina(d)));
                for (const r of restantes) {
                    if (r.error) throw r.error;
                    acumulado = acumulado.concat((r.data as ProductoTaller[]) ?? []);
                }
            }

            set({ productos: acumulado, productosCargados: true });
            console.log(`[DataStore] 🔎 Buscador de repuestos listo: ${acumulado.length} productos`);
        } catch (error: any) {
            // No es crítico: sin catálogo el campo sigue siendo de texto libre.
            console.warn('[DataStore] ⚠️ No se pudo cargar el catálogo de productos:', error?.message);
            set({ productosCargados: true });
        }
    },

    /**
     * Le avisa al buscador qué acaba de cargar el taller. Es lo que hace que
     * aprenda solo: sube `veces_usado`, guarda el último precio y da de alta lo
     * que todavía no estaba. En un taller SIN ERP esto ES el catálogo.
     *
     * Nunca rompe el guardado de la orden: si falla, se loguea y sigue.
     */
    registrarProductosUsados: async (items) => {
        const payload = (items || [])
            .map(i => ({
                nombre: (i.descripcion || '').trim(),
                precio: i.precio ?? null,
                categoria: i.categoria === 'labor' ? 'labor' : 'part',
            }))
            .filter(i => claveProducto(i.nombre));
        if (!payload.length) return;

        try {
            const { error } = await supabase.rpc('registrar_productos_usados', { p_items: payload });
            if (error) throw error;

            // Reflejarlo en memoria para que el ranking se acomode ya, sin
            // esperar a la próxima carga de la app.
            const productos = get().productos.slice();
            const ahora = new Date().toISOString();
            for (const it of payload) {
                const clave = claveProducto(it.nombre);
                const i = productos.findIndex(p => p.clave === clave);
                if (i >= 0) {
                    productos[i] = {
                        ...productos[i],
                        veces_usado: (productos[i].veces_usado || 0) + 1,
                        ultima_vez: ahora,
                        precio: it.precio || productos[i].precio,
                    };
                } else {
                    productos.push({
                        // Id provisorio: la fila real ya existe en la base y llega
                        // con su uuid en la próxima carga. Acá solo hace falta que
                        // sea único para las listas de React.
                        id: `nuevo:${clave}`,
                        nombre: it.nombre,
                        clave,
                        sku: null,
                        precio: it.precio,
                        categoria: it.categoria,
                        origen: 'aprendido',
                        veces_usado: 1,
                        ultima_vez: ahora,
                    });
                }
            }
            set({ productos });
        } catch (error: any) {
            console.warn('[DataStore] ⚠️ No se pudo registrar el uso de productos:', error?.message);
        }
    },

    /**
     * Saca un producto de las sugerencias sin borrarlo (las órdenes viejas lo
     * siguen nombrando). Es la salida para la basura que quedó en el historial
     * — un "asdas $123" cargado de prueba no puede vivir para siempre arriba de
     * la lista.
     */
    ocultarProducto: async (id: string) => {
        const antes = get().productos;
        set({ productos: antes.filter(p => p.id !== id) });
        const { error } = await supabase.from('productos_taller').update({ activo: false }).eq('id', id);
        if (error) {
            console.error('[DataStore] ❌ No se pudo ocultar el producto:', error.message);
            set({ productos: antes });  // volver atrás: la lista tiene que decir la verdad
            throw new Error('No se pudo ocultar el producto.');
        }
    },

    // ═════════════════════════════════════════════════════════
    // CRUD: CLIENTES
    // ═════════════════════════════════════════════════════════
    createCliente: async (data) => {
        const { data: row, error } = await supabase
            .from('clientes').insert(data).select().single();
        if (error) throw new Error(`Error creando cliente: ${error.message}`);
        set({ clientes: [...get().clientes, row as SupabaseClient] });
        return row as SupabaseClient;
    },

    updateCliente: async (id, data) => {
        // Snapshot ANTES del update para el audit trail
        const registroAntes = get().clientes.find(c => c.id === id);

        const { data: row, error } = await supabase
            .from('clientes')
            .update({
                nombre: data.nombre,
                dni: data.dni,
                telefono: data.telefono,
                tipo_ciclista: data.tipo_ciclista,
            })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) {
            console.error('[DataStore] ❌ Error actualizando cliente en Supabase:', error);
            throw new Error(`Error actualizando cliente: ${error.message}`);
        }
        if (!row) {
            console.error('[DataStore] ❌ updateCliente: 0 filas afectadas. Verifica RLS o el ID:', id);
            throw new Error('No se pudo actualizar el cliente. Verifica permisos RLS o el ID del registro.');
        }
        // Update local state only after DB confirmation using the returned row
        set({
            clientes: get().clientes.map(c => c.id === id ? (row as SupabaseClient) : c),
        });
        // Audit trail — silencioso, no bloquea el flujo
        const { data: { user } } = await supabase.auth.getUser();
        if (user && registroAntes) {
            logActividad({
                taller_id: registroAntes.taller_id,
                usuario_id: user.id,
                usuario_nombre: user.user_metadata?.nombre || user.email || 'Desconocido',
                entidad_tipo: 'CLIENTE',
                entidad_id: id,
                antes: { nombre: registroAntes.nombre, dni: registroAntes.dni, telefono: registroAntes.telefono, tipo_ciclista: registroAntes.tipo_ciclista },
                despues: { nombre: row.nombre, dni: row.dni, telefono: row.telefono, tipo_ciclista: row.tipo_ciclista },
            });
        }
    },

    deleteCliente: async (id) => {
        const eliminado_en = new Date().toISOString();
        const { error } = await supabase.from('clientes').update({ eliminado_en }).eq('id', id);
        if (error) throw new Error(`Error eliminando cliente: ${error.message}`);
        set({ clientes: get().clientes.filter(c => c.id !== id) });
    },

    // ═════════════════════════════════════════════════════════
    // CRUD: BICICLETAS
    // ═════════════════════════════════════════════════════════
    createBicicleta: async (data) => {
        const { data: row, error } = await supabase
            .from('bicicletas').insert(data).select().single();
        if (error) throw new Error(`Error creando bicicleta: ${error.message}`);
        set({ bicicletas: [...get().bicicletas, row as SupabaseBike] });
        return row as SupabaseBike;
    },

    updateBicicleta: async (id, data) => {
        // Snapshot ANTES del update para el audit trail
        const registroAntes = get().bicicletas.find(b => b.id === id);

        const { data: row, error } = await supabase
            .from('bicicletas')
            .update(data)
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error) {
            console.error('[DataStore] ❌ Error actualizando bicicleta en Supabase:', error);
            throw new Error(`Error actualizando bicicleta: ${error.message}`);
        }
        if (!row) {
            console.error('[DataStore] ❌ updateBicicleta: 0 filas afectadas. Verifica RLS o el ID:', id);
            throw new Error('No se pudo actualizar la bicicleta. Verifica permisos RLS o el ID del registro.');
        }
        set({
            bicicletas: get().bicicletas.map(b => b.id === id ? (row as SupabaseBike) : b),
        });
        // Audit trail — silencioso, no bloquea el flujo
        const { data: { user } } = await supabase.auth.getUser();
        if (user && registroAntes) {
            logActividad({
                taller_id: registroAntes.taller_id,
                usuario_id: user.id,
                usuario_nombre: user.user_metadata?.nombre || user.email || 'Desconocido',
                entidad_tipo: 'BICICLETA',
                entidad_id: id,
                antes: { marca: registroAntes.marca, modelo: registroAntes.modelo, transmision: registroAntes.transmision, categoria: registroAntes.categoria },
                despues: { marca: (row as SupabaseBike).marca, modelo: (row as SupabaseBike).modelo, transmision: (row as SupabaseBike).transmision, categoria: (row as SupabaseBike).categoria },
            });
        }
    },

    deleteBicicleta: async (id) => {
        const { error } = await supabase.from('bicicletas').delete().eq('id', id);
        if (error) throw new Error(`Error eliminando bicicleta: ${error.message}`);
        set({ bicicletas: get().bicicletas.filter(b => b.id !== id) });
    },

    // ═════════════════════════════════════════════════════════
    // CRUD: SERVICIOS
    // ═════════════════════════════════════════════════════════
    createServicio: async (data) => {
        // Step 0: Separate items from service payload
        const { items_extra, ...serviceData } = data as any;
        // Also strip servicio_items (JOIN artifact) if present
        delete (serviceData as any).servicio_items;

        // Step 1: Insert the service
        const { data: row, error } = await supabase
            .from('servicios').insert(serviceData).select().single();
        if (error) throw new Error(`Error creando servicio: ${error.message}`);

        const createdService = row as SupabaseService;

        // Step 2: Insert related items (if any)
        const itemsArray = items_extra || [];
        if (itemsArray.length > 0) {
            const itemsToInsert = itemsArray.map((item: any) => ({
                servicio_id: createdService.id,
                taller_id: createdService.taller_id,
                descripcion: item.descripcion,
                precio: item.precio,
                categoria: item.categoria || 'labor',
            }));
            const { error: itemsError } = await supabase.from('servicio_items').insert(itemsToInsert);
            if (itemsError) console.error('Error insertando items:', itemsError.message);

            // El buscador aprende de esta orden (no bloquea el alta si falla).
            await get().registrarProductosUsados(itemsToInsert);
        }

        // Update Zustand state with items attached
        createdService.items_extra = itemsArray;
        set({ servicios: [...get().servicios, createdService] });
        return createdService;
    },

    updateServicio: async (id, data) => {
        // Step 0: Separate items from service payload
        const { items_extra, ...serviceData } = data as any;
        // Also strip servicio_items (JOIN artifact) if present
        delete (serviceData as any).servicio_items;

        // Step 1: Update the service — maybeSingle() to avoid crash on 0 rows (RLS or stale ID)
        // Si SOLO vienen items (ej: el segundo par de ojos agrega un ítem), no
        // hay nada que actualizar en `servicios` y un UPDATE vacío es un 400
        // de PostgREST: se saltea y se va directo a los items.
        if (Object.keys(serviceData).length > 0) {
            const { data: row, error } = await supabase
                .from('servicios')
                .update(serviceData)
                .eq('id', id)
                .select()
                .maybeSingle();
            if (error) {
                console.error('[DataStore] ❌ Error actualizando servicio en Supabase:', error);
                throw new Error(`Error actualizando servicio: ${error.message}`);
            }
            if (!row) {
                console.error('[DataStore] ❌ updateServicio: 0 filas afectadas. Verifica RLS o el ID:', id);
                throw new Error('No se pudo actualizar el servicio. Verifica permisos RLS o el ID del registro.');
            }
        }

        // Step 2: If items were provided, replace them (delete old + insert new)
        if (items_extra !== undefined) {
            // Qué items tenía ANTES, para no contarle al buscador dos veces el
            // mismo producto: editar una orden tres veces borra y reinserta sus
            // items tres veces, pero el taller usó ese repuesto UNA sola vez.
            // Solo se registran los que no estaban.
            const antes = new Set(
                (get().servicios.find(s => s.id === id)?.items_extra || [])
                    .map((i: any) => claveProducto(i.descripcion || ''))
                    .filter(Boolean)
            );

            // Delete existing items for this service
            await supabase.from('servicio_items').delete().eq('servicio_id', id);

            // Insert new items
            const itemsArray = items_extra || [];
            if (itemsArray.length > 0) {
                const existingService = get().servicios.find(s => s.id === id);
                const tallerId = existingService?.taller_id || serviceData.taller_id;
                const itemsToInsert = itemsArray.map((item: any) => ({
                    servicio_id: id,
                    taller_id: tallerId,
                    descripcion: item.descripcion,
                    precio: item.precio,
                    categoria: item.categoria || 'labor',
                }));
                const { error: itemsError } = await supabase.from('servicio_items').insert(itemsToInsert);
                if (itemsError) console.error('Error insertando items:', itemsError.message);

                const nuevos = itemsToInsert.filter((i: any) => !antes.has(claveProducto(i.descripcion || '')));
                if (nuevos.length) await get().registrarProductosUsados(nuevos);
            }
        }

        // Update Zustand state
        set({
            servicios: get().servicios.map(s => s.id === id
                ? { ...s, ...serviceData, ...(items_extra !== undefined ? { items_extra } : {}) }
                : s
            ),
        });
    },

    deleteServicio: async (id) => {
        // Soft delete
        const eliminado_en = new Date().toISOString();
        const { error } = await supabase.from('servicios').update({ eliminado_en }).eq('id', id);
        if (error) throw new Error(`Error eliminando servicio: ${error.message}`);
        set({ servicios: get().servicios.filter(s => s.id !== id) });
    },

    dismissAlert: async (servicioId, alertId) => {
        const servicio = get().servicios.find(s => s.id === servicioId);
        if (!servicio) return;

        const currentAlerts = servicio.alertas_ocultas || [];
        if (currentAlerts.includes(alertId)) return; // Already dismissed

        const newAlerts = [...currentAlerts, alertId];

        // Optimistic UI update
        set({
            servicios: get().servicios.map(s => s.id === servicioId ? { ...s, alertas_ocultas: newAlerts } : s)
        });

        // Supabase update
        const { error } = await supabase.from('servicios').update({ alertas_ocultas: newAlerts }).eq('id', servicioId);
        if (error) {
            console.error('Error dismissing alert:', error.message);
            // Rollback optimistic update
            set({
                servicios: get().servicios.map(s => s.id === servicioId ? { ...s, alertas_ocultas: currentAlerts } : s)
            });
            throw new Error(`Error ocultando alerta: ${error.message}`);
        }
    },

    // ─────────────────────────────────────────────────────────────
    // Deja constancia de que salió un mensaje de recontacto.
    //
    // POR QUÉ: hasta hoy el Motor armaba el link de wa.me y ahí terminaba.
    // Sin este registro el taller no sabe a quién ya llamó (la lista se
    // vuelve ruido) y no hay forma de medir cuántos de los recontactados
    // vuelven, que es la métrica de la única ventaja del producto.
    //
    // NUNCA TIRA ERROR NI BLOQUEA. Si el insert falla, el mensaje al cliente
    // se manda igual: perder una fila de estadística no puede costarle una
    // venta al taller. Ojo con la semántica: esto registra que se MANDÓ, no
    // que el cliente lo haya recibido.
    // ─────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────
    // Manda un mensaje por la API oficial de WhatsApp.
    //
    // POR QUÉ PASA POR UNA EDGE FUNCTION Y NO DE ACÁ: el token de Meta
    // permite mandar en nombre de todos los talleres. En el navegador
    // cualquiera lo copia del inspector. Vive como secreto del servidor.
    //
    // NUNCA TIRA ERROR: devuelve { ok:false, error } para que el llamador
    // pueda caer de vuelta al link de wa.me. Que la API falle no puede
    // dejar al taller sin poder contactar a su cliente.
    // ─────────────────────────────────────────────────────────────
    enviarWhatsAppPlantilla: async (input) => {
        try {
            const { data, error } = await supabase.functions.invoke('whatsapp-enviar', { body: input });
            if (error) {
                // El cuerpo del error trae el motivo real (ej: whatsapp_no_conectado).
                let detalle = error.message;
                let codigo = 'fallo_envio';
                try {
                    const j = await (error as any)?.context?.json?.();
                    if (j?.error) { codigo = j.error; detalle = j.detalle || j.error; }
                } catch { /* el cuerpo no era JSON */ }
                console.error('WhatsApp no se pudo enviar:', codigo, detalle);
                return { ok: false, error: codigo, detalle };
            }
            if (!data?.ok) return { ok: false, error: data?.error || 'fallo_envio', detalle: data?.detalle };
            return { ok: true, mensaje_id: data.mensaje_id };
        } catch (e: any) {
            console.error('WhatsApp no se pudo enviar:', e?.message || e);
            return { ok: false, error: 'fallo_envio', detalle: e?.message };
        }
    },

    // ─────────────────────────────────────────────────────────
    // La IA escribe el mensaje mirando el historial del cliente.
    //
    // NUNCA tira error hacia arriba: si la IA no está disponible, está
    // apagada, o escribe algo que no pasa el control, devuelve ok:false y
    // el que llama manda el texto fijo de siempre. Que falle la redacción
    // no puede dejar al taller sin poder contactar a su cliente.
    // ─────────────────────────────────────────────────────────
    redactarMensajePersonal: async (input) => {
        try {
            const { data, error } = await supabase.functions.invoke('mensaje-ia', { body: input });
            if (error) {
                let codigo = 'fallo_redaccion';
                try {
                    const j = await (error as any)?.context?.json?.();
                    if (j?.error) codigo = j.error;
                } catch { /* el cuerpo no era JSON */ }
                // 'ia_apagada' es la respuesta normal de un taller que no la
                // activó, no un problema: no ensucia la consola.
                if (codigo !== 'ia_apagada') console.warn('Mensaje personalizado no disponible:', codigo);
                return { ok: false, error: codigo };
            }
            if (!data?.ok || !data?.linea) return { ok: false, error: data?.error || 'fallo_redaccion' };
            return {
                ok: true,
                linea: data.linea,
                firma: data.firma,
                variante: data.variante,
                dato_usado: data.dato_usado ?? null,
            };
        } catch (e: any) {
            console.warn('Mensaje personalizado no disponible:', e?.message || e);
            return { ok: false, error: 'fallo_redaccion' };
        }
    },

    // ─────────────────────────────────────────────────────────
    // El segundo par de ojos sobre el presupuesto (idea 7).
    //
    // La Edge Function genera Y registra las sugerencias en el mismo
    // movimiento (idempotente por orden: reabrir el modal no regenera ni
    // vuelve a gastar). NUNCA tira error hacia arriba: si la IA no está,
    // el modal de finalizar sigue exactamente igual que siempre — una
    // sugerencia que demora el botón verde es una feature que se apaga.
    // ─────────────────────────────────────────────────────────
    sugerirPresupuesto: async (servicioId) => {
        try {
            const { data, error } = await supabase.functions.invoke('sugerir-presupuesto', {
                body: { servicio_id: servicioId },
            });
            if (error) {
                let codigo = 'fallo_sugerencias';
                try {
                    const j = await (error as any)?.context?.json?.();
                    if (j?.error) codigo = j.error;
                } catch { /* el cuerpo no era JSON */ }
                // Apagada o plan sin IA son respuestas normales, no problemas.
                if (codigo !== 'ia_apagada' && codigo !== 'plan_sin_ia') {
                    console.warn('Segundo par de ojos no disponible:', codigo);
                }
                return { ok: false, sugerencias: [], error: codigo };
            }
            if (!data?.ok) return { ok: false, sugerencias: [], error: data?.error || 'fallo_sugerencias' };
            return { ok: true, sugerencias: data.sugerencias ?? [] };
        } catch (e: any) {
            console.warn('Segundo par de ojos no disponible:', e?.message || e);
            return { ok: false, sugerencias: [], error: 'fallo_sugerencias' };
        }
    },

    // Responder una sugerencia (aceptada / no_aplica). El trigger de la base
    // congela todo lo demás: de una sugerencia solo se cambia la respuesta,
    // una sola vez. Devuelve false si no se pudo (y no rompe nada).
    responderSugerencia: async (id, estado) => {
        const { error } = await supabase
            .from('sugerencias_presupuesto')
            .update({ estado })
            .eq('id', id);
        if (error) {
            console.warn('No se pudo responder la sugerencia:', error.message);
            return false;
        }
        return true;
    },

    registrarContactoRetencion: async (data) => {
        if (!data?.taller_id) return;
        try {
            const { error } = await supabase.from('contactos_retencion').insert({
                taller_id: data.taller_id,
                cliente_id: data.cliente_id || null,
                bicicleta_id: data.bicicleta_id || null,
                servicio_origen_id: data.servicio_origen_id || null,
                componente: data.componente || null,
                canal: data.canal || 'whatsapp_manual',
                mensaje_whatsapp_id: data.mensaje_whatsapp_id || null,
                variante: data.variante || null,
                texto_enviado: data.texto_enviado || null,
                fecha_contacto: new Date().toISOString(),
            });
            if (error) console.error('No se pudo registrar el contacto de retención:', error.message);
        } catch (e: any) {
            console.error('No se pudo registrar el contacto de retención:', e?.message || e);
        }
    },

    // ═════════════════════════════════════════════════════════
    // CRUD: RECORDATORIOS
    // ═════════════════════════════════════════════════════════
    createRecordatorio: async (data) => {
        const { data: row, error } = await supabase
            .from('recordatorios').insert(data).select().single();
        if (error) throw new Error(`Error creando recordatorio: ${error.message}`);
        set({ recordatorios: [...get().recordatorios, row as SupabaseReminder] });
        return row as SupabaseReminder;
    },

    upsertRecordatorios: async (items) => {
        for (const item of items) {
            // Check if exists by bicicleta_id + componente
            const existing = get().recordatorios.find(
                r => r.bicicleta_id === item.bicicleta_id &&
                    r.componente?.toLowerCase() === item.componente?.toLowerCase()
            );
            if (existing) {
                // Update
                const { error } = await supabase.from('recordatorios').update(item).eq('id', existing.id);
                if (error) console.error('Error upserting recordatorio:', error.message);
                set({
                    recordatorios: get().recordatorios.map(r =>
                        r.id === existing.id ? { ...r, ...item } : r
                    ),
                });
            } else {
                // Insert
                const { data: row, error } = await supabase
                    .from('recordatorios').insert(item).select().single();
                if (error) console.error('Error inserting recordatorio:', error.message);
                if (row) set({ recordatorios: [...get().recordatorios, row as SupabaseReminder] });
            }
        }
    },

    // ═════════════════════════════════════════════════════════
    // CRUD: CARRERAS
    // ═════════════════════════════════════════════════════════
    createCarrera: async (data) => {
        const { data: row, error } = await supabase
            .from('carreras').insert(data).select().single();
        if (error) throw new Error(`Error creando carrera: ${error.message}`);
        set({ carreras: [...get().carreras, row as SupabaseCarrera] });
        return row as SupabaseCarrera;
    },
}));
