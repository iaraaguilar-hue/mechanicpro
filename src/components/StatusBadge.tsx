interface StatusBadgeProps {
    status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
    // Normalize status strings from the DB
    const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';

    // Map 'in_progress' (or legacy variants) to our minimal UI style
    if (normalized === 'in_progress' || normalized === 'in progress' || normalized === 'en curso' || normalized === 'pending' || normalized === 'pendiente' || normalized === 'intake') {
        return (
            <div className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-sky-100/50 w-fit whitespace-nowrap">
                <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
                En curso
            </div>
        );
    }

    if (normalized === 'completed' || normalized === 'completado' || normalized === 'terminado' || normalized === 'ready') {
        return (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-100/50 w-fit whitespace-nowrap">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
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
