import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getNovedadesVistas, marcarNovedadesVistas } from '@/lib/novedadesSeen';
import { tourVisto } from '@/lib/tourSeen';
import { useTourStore } from '@/components/OnboardingTour';
import { Megaphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─────────────────────────────────────────────────────────────
// Pop-up de novedades al abrir la app (pedido de Iara, 27-jul).
// A veces el mecánico no entra a la campana → le mostramos las
// novedades sin leer en un cartel al abrir. "Visto" se guarda POR
// DISPOSITIVO (localStorage, misma llave que la campana) → misma
// cuenta compartida entre varios mecánicos ⇒ a cada uno le aparece
// una vez desde SU dispositivo. Cerrar el pop-up marca las novedades
// como vistas (la campana lo refleja al recargar).
// ─────────────────────────────────────────────────────────────

interface Novedad { id: string; titulo: string; cuerpo: string; fecha: string; activa: boolean; }

export function NovedadesPopup() {
    const [pendientes, setPendientes] = useState<Novedad[]>([]);
    const [cerrado, setCerrado] = useState(false);

    useEffect(() => {
        let alive = true;
        supabase.from('novedades').select('*').eq('activa', true).order('fecha', { ascending: false })
            .then(({ data, error }) => {
                if (!alive || error || !data) return;
                const vistas = getNovedadesVistas();
                const sinVer = (data as Novedad[]).filter(n => !vistas.includes(n.id));
                if (sinVer.length > 0) setPendientes(sinVer);
            });
        return () => { alive = false; };
    }, []);

    // No pisarse con el recorrido de bienvenida: si al abrir la app el tour
    // estaba pendiente (o está corriendo), las novedades esperan a la PRÓXIMA
    // apertura — dos carteles seguidos agobian. Se evalúa al montar para que
    // el popup no salte apenas la persona termina el recorrido.
    const [tourYaVistoAlAbrir] = useState(() => tourVisto());
    const tourActivo = useTourStore((s) => s.activo);
    if (tourActivo || !tourYaVistoAlAbrir) return null;

    if (cerrado || pendientes.length === 0) return null;

    const cerrar = () => {
        marcarNovedadesVistas(pendientes.map(n => n.id));
        setCerrado(true);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Encabezado */}
                <div className="flex items-center gap-3 px-6 py-4 bg-primary text-primary-foreground">
                    <Megaphone size={22} className="shrink-0" />
                    <div className="flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-widest opacity-90">Novedad</p>
                        <p className="text-lg font-bold leading-tight">¿Qué hay de nuevo?</p>
                    </div>
                    <button onClick={cerrar} className="p-1 rounded-lg hover:bg-white/20 transition-colors" aria-label="Cerrar">
                        <X size={20} />
                    </button>
                </div>

                {/* Cuerpo (una o varias novedades sin leer) */}
                <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-5">
                    {pendientes.map(n => (
                        <div key={n.id}>
                            <h3 className="text-base font-bold text-slate-800 mb-1">{n.titulo}</h3>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{n.cuerpo}</p>
                            <p className="text-[11px] text-slate-400 mt-2">{new Date(n.fecha).toLocaleDateString('es-AR')}</p>
                        </div>
                    ))}
                </div>

                {/* Pie */}
                <div className="px-6 pb-5 pt-1">
                    <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" onClick={cerrar}>
                        Entendido
                    </Button>
                </div>
            </div>
        </div>
    );
}
