import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// --- UTILIDADES PARA PARSEAR ÍTEMS EXTERNOS (ML) ---
export const cleanItemName = (name: string) => name ? name.replace(/\s*\(ML\)\s*/gi, '') : '';
export const isExternalItem = (name: string) => name ? /\s*\(ML\)\s*/i.test(name) : false;
