interface StatusBadgeProps {
    status: string;
}

/**
 * En qué grupo cae un service, con las MISMAS tres palabras que muestra la chapita.
 *
 * POR QUÉ VIVE ACÁ Y NO EN LA PANTALLA QUE LO USA: la base guarda cuatro valores
 * para tres estados (`in_progress`, `ready`, `Completed`, `delivered`) más
 * variantes viejas en castellano, y esta normalización ya existía adentro del
 * badge. Cuando el Historial necesitó agrupar por estado, la opción fácil era
 * escribir un `if` parecido allá — y ahí es donde un día el badge dice
 * "Finalizado" y el filtro lo cuenta como otra cosa. Una sola función, un solo
 * vocabulario.
 *
 * 🔴 Las palabras son las de Iara (21-jul-2026): "Finalizado" = el mecánico
 * terminó y la bici SIGUE en el taller; "Entregado" = el cliente ya la retiró.
 */
export type GrupoDeEstado = 'en_curso' | 'finalizado' | 'entregado';

export function grupoDeEstado(status?: string | null): GrupoDeEstado {
    const n = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (n === 'delivered' || n === 'entregado') return 'entregado';
    if (n === 'ready' || n === 'completed' || n === 'completado' || n === 'terminado') return 'finalizado';
    // Todo lo demás —incluido un estado que no conocemos— se trata como trabajo
    // abierto: es el error barato. Esconder una bici que sigue en el taller es
    // peor que mostrar de más una que ya se fue.
    return 'en_curso';
}

export const ETIQUETA_DE_GRUPO: Record<GrupoDeEstado, string> = {
    en_curso: 'En curso',
    finalizado: 'Finalizado',
    entregado: 'Entregado',
};

export function StatusBadge({ status }: StatusBadgeProps) {
    // Normalize status strings from the DB
    const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';

    // Map 'in_progress' (or legacy variants) to our minimal UI style
    if (normalized === 'in_progress' || normalized === 'in progress' || normalized === 'en curso' || normalized === 'pending' || normalized === 'pendiente' || normalized === 'intake') {
        return (
            <div className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-sky-100/50 w-fit whitespace-nowrap">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
                En curso
            </div>
        );
    }

    // Dos estados distintos y con nombre propio (pedido de Iara, 21-jul):
    // "Finalizado" = el mecánico terminó ('ready' + variantes legacy); la bici sigue en el taller.
    // "Entregado" = el cliente retiró la bici (abajo). El dot pulsa solo en 'ready'
    // porque ahí hay una acción pendiente: apretar "Entregar Bici".
    if (normalized === 'ready' || normalized === 'completed' || normalized === 'completado' || normalized === 'terminado') {
        return (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-100/50 w-fit whitespace-nowrap">
                <span className={`w-1.5 h-1.5 bg-emerald-500 rounded-full${normalized === 'ready' ? ' animate-pulse' : ''}`}></span>
                Finalizado
            </div>
        );
    }

    if (normalized === 'delivered' || normalized === 'entregado') {
        return (
            <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-200/50 w-fit whitespace-nowrap">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                Entregado
            </div>
        );
    }

    // Default fallback
    return (
        <div className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-100 w-fit whitespace-nowrap">
            <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span>
            {status || 'Desconocido'}
        </div>
    );
}
