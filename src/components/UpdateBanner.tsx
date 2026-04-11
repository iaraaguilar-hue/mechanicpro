export function UpdateBanner() {
    return (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-white border border-primary/30 shadow-lg rounded-xl px-4 py-3 text-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
            <span className="text-slate-700">Hay una actualización disponible.</span>
            <button
                onClick={() => window.location.reload()}
                className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
            >
                Recargar
            </button>
        </div>
    );
}
