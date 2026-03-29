import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

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
    created_at?: string;
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
    fecha_finalizacion?: string;
    eliminado_en?: string | null;
    checklist_data?: Record<string, boolean>;
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
    isHydrating: boolean;
    hydrateError: string | null;
    lastHydratedAt: number | null;

    // Hidratación
    fetchDashboardData: (tallerId: string) => Promise<void>;
    invalidate: () => void;

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

    // ── CRUD: Recordatorios ──
    createRecordatorio: (data: Omit<SupabaseReminder, 'id'>) => Promise<SupabaseReminder>;
    upsertRecordatorios: (items: Omit<SupabaseReminder, 'id'>[]) => Promise<void>;

    // ── CRUD: Carreras ──
    createCarrera: (data: Omit<SupabaseCarrera, 'id'>) => Promise<SupabaseCarrera>;
}

export const useDataStore = create<DataState>((set, get) => ({
    // ── Initial state ──
    clientes: [],
    bicicletas: [],
    servicios: [],
    recordatorios: [],
    carreras: [],
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
        } catch (error: any) {
            console.error('[DataStore] ❌ Error en hidratación:', error.message);
            set({ isHydrating: false, hydrateError: error.message });
        }
    },

    invalidate: () => set({
        clientes: [], bicicletas: [], servicios: [], recordatorios: [], carreras: [],
        isHydrating: false, hydrateError: null, lastHydratedAt: null,
    }),

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
        const { error } = await supabase.from('clientes').update(data).eq('id', id);
        if (error) throw new Error(`Error actualizando cliente: ${error.message}`);
        set({
            clientes: get().clientes.map(c => c.id === id ? { ...c, ...data } : c),
        });
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
        const { error } = await supabase.from('bicicletas').update(data).eq('id', id);
        if (error) throw new Error(`Error actualizando bicicleta: ${error.message}`);
        set({
            bicicletas: get().bicicletas.map(b => b.id === id ? { ...b, ...data } : b),
        });
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

        // Step 1: Update the service (only real columns)
        const { error } = await supabase.from('servicios').update(serviceData).eq('id', id);
        if (error) throw new Error(`Error actualizando servicio: ${error.message}`);

        // Step 2: If items were provided, replace them (delete old + insert new)
        if (items_extra !== undefined) {
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
