/**
 * El aviso chico para el taller que YA paga y todavía no activó el débito automático
 * (13-oct-2026). Se puede cerrar; una vez cerrado no vuelve (por taller y navegador).
 * Solo lo ve el admin: cuándo se muestra lo decide `lib/debitoAutomatico.ts`.
 * El del que está en prueba va dentro de `AvisoDePrueba`; el del corte, en `AccesoSuspendido`.
 * 🔴 Neutro, en grises, sin precios ni planes. Lo mide `qa_aviso_de_debito.cjs`.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import type { TallerData } from '@/store/authStore';
import { claveDeAvisoCerrado, lugarDelDebito } from '@/lib/debitoAutomatico';
import { BotonDebito } from '@/components/BotonDebito';

function estabaCerrado(tallerId: string): boolean {
    try { return localStorage.getItem(claveDeAvisoCerrado(tallerId)) === '1'; } catch { return false; }
}

export function AvisoDeDebito({ taller, rol }: { taller: TallerData | null; rol: string | null }) {
    const [cerrado, setCerrado] = useState(() => (taller?.id ? estabaCerrado(taller.id) : false));
    if (!taller || cerrado || lugarDelDebito(taller, rol) !== 'paga') return null;

    const cerrar = () => {
        setCerrado(true);
        try { localStorage.setItem(claveDeAvisoCerrado(taller.id), '1'); } catch { /* sin storage: se cierra hasta recargar */ }
    };

    return (
        <section
            data-aviso-debito
            aria-label="Débito automático"
            className="relative rounded-lg border border-slate-200 bg-slate-50 p-3 pr-10 sm:p-4 sm:pr-12 text-sm text-slate-700"
        >
            <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar el aviso"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            >
                <X className="h-4 w-4" />
            </button>
            <p className="font-semibold text-slate-900">Débito automático con Mercado Pago</p>
            <p className="mt-0.5">
                Conviene activarlo el día que toca pagar: el cobro sale ese día y después cada mes, el mismo día.
            </p>
            <BotonDebito className="mt-3" />
        </section>
    );
}
