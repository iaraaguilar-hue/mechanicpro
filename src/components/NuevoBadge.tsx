import { useEffect, useState } from 'react';
import { esNuevo, marcarNuevoVisto } from '@/lib/nuevoFeatures';

// ─────────────────────────────────────────────────────────────
// Cartelito "Nuevo" al lado de una función recién agregada.
// · Toma el color del taller (bg-primary) → combina con su marca.
// · Se apaga solo: si el dispositivo estuvo `dwellMs` mirando la
//   función, se marca como vista y no vuelve a aparecer. También se
//   apaga al usar la función (llamando marcarNuevoVisto en el callsite).
// Uso: <NuevoBadge feature="tareas-en-creacion" />
// ─────────────────────────────────────────────────────────────

export function NuevoBadge({ feature, className = '', dwellMs = 2500 }: { feature: string; className?: string; dwellMs?: number }) {
    const [visible] = useState(() => esNuevo(feature));

    // El mecánico tuvo la función a la vista un rato → la vio. La marcamos
    // como vista para que no aparezca la próxima vez (se apaga sola).
    useEffect(() => {
        if (!visible) return;
        const t = setTimeout(() => { marcarNuevoVisto(feature); }, dwellMs);
        return () => clearTimeout(t);
    }, [visible, feature, dwellMs]);

    if (!visible) return null;

    return (
        <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider text-primary-foreground bg-primary rounded-full px-1.5 py-0.5 leading-none ${className}`}>
            Nuevo
        </span>
    );
}
