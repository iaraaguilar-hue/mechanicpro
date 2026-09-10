import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * El texto explicativo, plegado.
 *
 * Origen (Iara, 9-sep-2026): «hay demasiadas cosas para leer cuando vas
 * navegando (…) necesito menos lectura, que si el mecánico quiere investigar
 * pueda tocar un botón que diga "cómo funciona", pero no quiero que haya
 * lectura en el instante en el que el mecánico entra a las pestañas».
 *
 * La explicación no se borra: se corre de lugar. El que entra a trabajar ve el
 * título y el control; el que quiere entender toca acá.
 *
 * Es un <details> nativo a propósito: se abre sin JavaScript, el teclado y el
 * lector de pantalla ya saben qué es, y no arrastra estado a la pantalla.
 */
export function ComoFunciona({
    children,
    titulo = 'Cómo funciona',
    className,
}: {
    children: React.ReactNode;
    titulo?: string;
    className?: string;
}) {
    return (
        <details className={cn('group/cf mt-2', className)} data-como-funciona>
            <summary
                className="flex w-fit cursor-pointer select-none items-center gap-1 rounded
                           text-[11px] font-semibold uppercase tracking-wider text-slate-500
                           transition-colors hover:text-slate-800
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                           [&::-webkit-details-marker]:hidden"
            >
                <ChevronRight
                    size={12}
                    className="shrink-0 transition-transform group-open/cf:rotate-90"
                />
                {titulo}
            </summary>
            <div className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3 text-xs leading-relaxed text-slate-600">
                {children}
            </div>
        </details>
    );
}
