// ─────────────────────────────────────────────────────────────
// LA FILA DE AJUSTE — el molde único de Configuración (16-sep-2026).
//
// De dónde sale (Iara, mirando Preferencias de Leira):
//   «en el número de orden (…) a la derecha no hay ninguna opción para hacer. Y
//   me da mucho toque que no ocupen los mismos espacios todas las opciones. O
//   sea, está demasiado desordenado. Es como que lo pusiste así nomás.»
//   «el segundo par de ojos está bien pero tiene mucho espacio en blanco
//   comparado con lo que tiene a la derecha.»
//
// EL DEFECTO, dicho en una línea: cada ajuste era una tarjeta suelta en una
// grilla de dos columnas. Una tarjeta de un interruptor y otra de once
// componentes caían en la misma fila, la grilla las estira a la misma altura y
// la corta queda medio vacía; y cuando el grupo tiene un número impar, la última
// se queda sola con la mitad de la pantalla en blanco al lado.
//
// LA CUÑA: un ajuste NO es una tarjeta. Un ajuste es una FILA dentro del panel
// de su grupo — título e ícono a la izquierda, el control en un riel a la
// derecha, y la explicación plegada abajo. Todas las filas miden lo mismo por
// construcción: no hay alturas que emparejar ni huecos que llenar. Es como lo
// resuelven las pantallas de ajustes que se ven bien (Vercel, Stripe, Linear):
// la vara está afuera del rubro.
//
// Los ajustes que de verdad necesitan el ancho (los componentes del
// diagnóstico, los avisos, la postventa) NO son filas: son su propio panel, con
// su contenido en columnas. Un ajuste está en una de las dos formas, nunca a
// medio camino.
//
// 🔴 `id` es el `data-ajuste` que busca el buscador de Configuración y recorre
// `qa_buscador_ajustes.cjs`. Va en la fila, que es lo que se resalta.
// ─────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** El panel de un grupo: las filas van adentro, separadas por una línea. */
export function PanelAjustes({ children, className }: { children: ReactNode; className?: string }) {
    return <Card data-panel-ajustes className={cn('divide-y', className)}>{children}</Card>;
}

export function FilaAjuste({
    id, icono: Icono, titulo, resumen, control, aviso, children, className,
}: {
    /** El `data-ajuste` del buscador. */
    id: string;
    icono: LucideIcon;
    titulo: ReactNode;
    /** Una línea, la que evita tener que abrir «Cómo funciona» para saber qué es. */
    resumen?: ReactNode;
    /** Lo que se toca: el interruptor, los botones, el select. Va al riel derecho. */
    control?: ReactNode;
    /** Un cartel que tiene que verse sin abrir nada (el plan que no lo incluye). */
    aviso?: ReactNode;
    /** Lo que cuelga del ajuste: sub-interruptores, «Cómo funciona», ejemplos. */
    children?: ReactNode;
    className?: string;
}) {
    return (
        <div
            data-ajuste={id}
            className={cn('scroll-mt-24 rounded-lg px-4 py-4 sm:px-5', className)}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Icono className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">{titulo}</span>
                    </p>
                    {resumen && (
                        <p className="ml-6 mt-0.5 max-w-prose text-[11px] leading-snug text-muted-foreground">
                            {resumen}
                        </p>
                    )}
                </div>
                {/* El riel: todos los controles del panel terminan en la misma
                    vertical, midan lo que midan. Sin esto, un interruptor y una
                    fila de cinco botones arrancan cada uno donde quieren. */}
                {control && (
                    <div data-riel className="flex min-w-[6rem] shrink-0 items-center justify-end gap-2">
                        {control}
                    </div>
                )}
            </div>
            {aviso && <div className="ml-6 mt-2.5">{aviso}</div>}
            {children && <div className="ml-6 mt-2.5 space-y-2.5">{children}</div>}
        </div>
    );
}

/** Un sub-interruptor que depende del ajuste de arriba (el candado, por ejemplo). */
export function SubAjuste({
    titulo, resumen, control, apagado, className,
}: {
    titulo: ReactNode;
    resumen?: ReactNode;
    control: ReactNode;
    /** Sin el de arriba prendido, este no hace nada: se ve, pero apagado. */
    apagado?: boolean;
    className?: string;
}) {
    return (
        <div className={cn(
            'flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-3 py-2.5 transition-opacity',
            apagado && 'opacity-50',
            className,
        )}>
            <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{titulo}</p>
                {resumen && <p className="text-[11px] leading-snug text-muted-foreground">{resumen}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">{control}</div>
        </div>
    );
}

/** El título de un grupo de ajustes. */
export function GrupoAjustes({ titulo, children }: { titulo: string; children: ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{titulo}</h2>
            {children}
        </section>
    );
}
