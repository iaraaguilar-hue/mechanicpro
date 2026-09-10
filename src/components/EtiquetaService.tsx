import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatInternalServiceName } from '@/lib/utils';

/**
 * El nombre del service, sin romper la fila cuando es largo.
 *
 * Origen (Ariel Leira, 10-sep-2026): cargó «SERVICE COMPLETO CON SUSPENSIÓN
 * DOBLE SUSPENCION» y la etiqueta salía en UNA sola línea con
 * `whitespace-nowrap`: estiraba la columna, desalineaba la fila y tapaba los
 * botones de la derecha. Iara: «queda demasiado mal y todo desalineado (…)
 * que ocupe dos o tres renglones y se vea mejor».
 *
 * En vez de acortar el nombre (el taller lo escribió así por algo), la
 * etiqueta envuelve hasta 3 renglones y recién ahí recorta, con el nombre
 * completo en el `title` para el que pase el mouse.
 *
 * Vive acá y no suelto en cada pantalla porque el `whitespace-nowrap` estaba
 * repetido en tres lugares distintos: arreglar uno solo dejaba la clase viva.
 */
export function EtiquetaService({
    nombre,
    variant,
    className,
    crudo = false,
}: {
    nombre?: string | null;
    variant?: 'default' | 'secondary' | 'outline' | 'destructive';
    className?: string;
    /** true = el texto ya viene formateado y no hay que pasarlo por formatInternalServiceName */
    crudo?: boolean;
}) {
    const texto = (crudo ? (nombre || 'OTRO') : formatInternalServiceName(nombre || 'OTRO')).toUpperCase();
    return (
        <Badge
            variant={variant}
            title={texto}
            className={cn(
                // 🔴 El recorte a 3 renglones (`line-clamp-3`) necesita
                // `display:-webkit-box`, y eso PELEA con el `inline-flex` que
                // trae Badge: puesto en el mismo elemento, el clamp no se
                // aplica y el texto seguía cayendo a 4 renglones. Por eso el
                // clamp va en un span adentro.
                'inline-block max-w-[17rem] text-left align-middle',
                'whitespace-normal break-words leading-tight py-1 rounded-2xl',
                className,
            )}
        >
            <span className="line-clamp-3">{texto}</span>
        </Badge>
    );
}
