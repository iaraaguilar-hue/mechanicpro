import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
    session: Session | null;
    taller_id: string | null;
    rol: string | null;
    nombre: string | null;
    isInitialized: boolean;
    setAuth: (session: Session, taller_id: string, rol: string, nombre: string) => void;
    setInitialized: (val: boolean) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    session: null,
    taller_id: null,
    rol: null,
    nombre: null,
    isInitialized: false,
    setAuth: (session, taller_id, rol, nombre) => set({ session, taller_id, rol, nombre }),
    setInitialized: (val) => set({ isInitialized: val }),
    logout: () => set({ session: null, taller_id: null, rol: null, nombre: null }),
}));
