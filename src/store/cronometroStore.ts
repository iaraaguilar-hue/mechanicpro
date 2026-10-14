// El estado del cronómetro. LA FUENTE DE VERDAD ES LA BASE: acá solo se guarda lo que
// la última lectura trajo (nada en localStorage; al reabrir la app se vuelve a leer).
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
    acumuladoPorOrden, acumuladoLibreDeHoy, inicioDelDiaAR, fraseDeError,
    type TipoTrabajo, type TrabajoAndando,
} from '@/lib/cronometro';

export interface Resultado { ok: boolean; mensaje?: string }

interface CronometroState {
    /** Todos los relojes abiertos del taller (RPC `trabajos_andando`). */
    andando: TrabajoAndando[];
    /** Mis tramos CERRADOS, sumados por orden (ms). */
    acumulado: Record<string, number>;
    /** Mis tramos CERRADOS de hoy sin orden (armado, mostrador, otro), por tipo+detalle (ms). */
    libreHoy: Record<string, number>;
    cargado: boolean;
    ocupado: boolean;
    refrescar: (miId: string) => Promise<void>;
    arrancar: (miId: string, args: { servicioId?: string | null; tipo: TipoTrabajo; detalle?: string | null }) => Promise<Resultado>;
    pausar: (miId: string) => Promise<Resultado>;
    limpiar: () => void;
}

const HACE_90_DIAS = () => new Date(Date.now() - 90 * 86400e3).toISOString();

export const useCronometro = create<CronometroState>((set, get) => ({
    andando: [],
    acumulado: {},
    libreHoy: {},
    cargado: false,
    ocupado: false,

    refrescar: async (miId) => {
        const [a, m, l] = await Promise.all([
            supabase.rpc('trabajos_andando'),
            supabase.from('tiempos_trabajo')
                .select('servicio_id, inicio, fin')
                .eq('usuario_id', miId)
                .not('servicio_id', 'is', null)
                .not('fin', 'is', null)
                .gte('inicio', HACE_90_DIAS())
                .limit(3000),
            supabase.from('tiempos_trabajo')
                .select('servicio_id, tipo, detalle, inicio, fin')
                .eq('usuario_id', miId)
                .is('servicio_id', null)
                .not('fin', 'is', null)
                .gte('inicio', new Date(inicioDelDiaAR(Date.now())).toISOString())
                .limit(500),
        ]);
        // Si una lectura falla se deja lo que había: un reloj no se borra por un "Failed to fetch".
        set(s => ({
            andando: a.error ? s.andando : ((a.data as TrabajoAndando[]) || []),
            acumulado: m.error ? s.acumulado : acumuladoPorOrden((m.data as any[]) || []),
            libreHoy: l.error ? s.libreHoy : acumuladoLibreDeHoy((l.data as any[]) || [], inicioDelDiaAR(Date.now())),
            cargado: true,
        }));
    },

    arrancar: async (miId, { servicioId = null, tipo, detalle = null }) => {
        if (get().ocupado) return { ok: false, mensaje: 'Un momento, se está guardando el anterior.' };
        set({ ocupado: true });
        try {
            const { error } = await supabase.rpc('arrancar_trabajo', {
                p_servicio_id: servicioId,
                p_tipo: tipo,
                p_detalle: detalle && detalle.trim() ? detalle.trim() : null,
            });
            if (error) return { ok: false, mensaje: fraseDeError(error) };
            await get().refrescar(miId);
            return { ok: true };
        } catch (e: any) {
            return { ok: false, mensaje: fraseDeError(e) };
        } finally { set({ ocupado: false }); }
    },

    pausar: async (miId) => {
        if (get().ocupado) return { ok: false, mensaje: 'Un momento, se está guardando el anterior.' };
        set({ ocupado: true });
        try {
            const { error } = await supabase.rpc('pausar_trabajo');
            if (error) return { ok: false, mensaje: fraseDeError(error) };
            await get().refrescar(miId);
            return { ok: true };
        } catch (e: any) {
            return { ok: false, mensaje: fraseDeError(e) };
        } finally { set({ ocupado: false }); }
    },

    limpiar: () => set({ andando: [], acumulado: {}, libreHoy: {}, cargado: false }),
}));
