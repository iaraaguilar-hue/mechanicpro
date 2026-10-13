/**
 * El botón "Activar el débito automático" (13-oct-2026): abre el plan de Mercado Pago en
 * una pestaña nueva. Lo usan el aviso de prueba, el cartel del acceso cortado y el aviso
 * del que ya paga; cuándo se muestra lo decide `lib/debitoAutomatico.ts`.
 * 🔴 Va NEUTRO, sin el color del taller (el color es del botón principal de cada pantalla)
 * y sin precios ni planes: el monto lo muestra Mercado Pago.
 */
import { ExternalLink } from 'lucide-react';
import { LINK_DEBITO } from '@/lib/debitoAutomatico';

export function BotonDebito({ className = '' }: { className?: string }) {
    return (
        <a
            data-boton-debito
            href={LINK_DEBITO}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 hover:text-slate-900 ${className}`}
        >
            Activar el débito automático <ExternalLink className="h-4 w-4 shrink-0" />
        </a>
    );
}
