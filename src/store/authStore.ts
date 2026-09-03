import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

export interface TallerData {
    id: string;
    nombre?: string;
    logo_url?: string;
    color_primario?: string;
    color_secundario?: string;
    mensaje_informe?: string;
    politica_pago?: string;
    plan_actual?: string;
    config_avances?: { habilitado: boolean; etapas: string[] } | null;
    // Opt-in de registrar quién hizo cada service (3-sep-2026). NULL/ausente = apagado.
    config_mecanicos?: { habilitado: boolean } | null;
    config_notificaciones?: { tareas_habilitado?: boolean; bloquear_finalizacion?: boolean; momento_diagnostico?: 'final' | 'durante' | 'ambos' } | null;
    [key: string]: any;
}

interface AuthState {
    session: Session | null;
    taller_id: string | null;
    rol: string | null;
    nombre: string | null;
    taller: TallerData | null;
    isInitialized: boolean;
    setAuth: (session: Session, taller_id: string, rol: string, nombre: string, taller_data?: TallerData) => void;
    setTaller: (taller_data: TallerData) => void;
    setInitialized: (val: boolean) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    taller_id: null,
    rol: null,
    nombre: null,
    taller: null,
    isInitialized: false,
    setAuth: (session, taller_id, rol, nombre, taller_data) => set({ session, taller_id, rol, nombre, taller: taller_data || null }),
    setTaller: (taller_data) => set({ taller: taller_data }),
    setInitialized: (val) => set({ isInitialized: val }),
    logout: () => set({ session: null, taller_id: null, rol: null, nombre: null, taller: null }),
}));
