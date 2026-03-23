import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// --- UTILIDADES PARA PARSEAR ÍTEMS EXTERNOS (ML) ---
export const cleanItemName = (name: string) => name ? name.replace(/\s*\(ML\)\s*/gi, '') : '';
export const isExternalItem = (name: string) => name ? /\s*\(ML\)\s*/i.test(name) : false;

export function hexToHslSpaceSeparated(hex: string): string {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export const calculateDaysRemaining = (targetDateString: string): number => {
    if (!targetDateString) return 0;

    // 1. Extraer la fecha cruda YYYY-MM-DD ignorando timestamps de Supabase
    const rawDate = targetDateString.split('T')[0];
    const [year, month, day] = rawDate.split('-');

    if (!year || !month || !day) return 0;

    // 2. Crear fecha objetivo a las 00:00:00 hora local
    const targetDate = new Date(Number(year), Number(month) - 1, Number(day));

    // 3. Crear fecha de HOY a las 00:00:00 hora local
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 4. Calcular diferencia pura en días
    const diffTime = targetDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
