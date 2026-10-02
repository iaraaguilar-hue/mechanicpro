import { useState } from 'react';
import { useDataStore, type SupabaseService } from '@/store/dataStore';
import { trabajosDe, tareasLibresPendientes, trabajosPendientes, type TareaService } from '@/lib/planFeatures';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, ListChecks } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// LO QUE FALTA TILDAR, ADENTRO DE LA VENTANA DE FINALIZAR (2-oct-2026).
//
// 🔴 POR QUÉ EXISTE: Leandro (Probikes) avisó que al finalizar "se le abren muchas
// ventanas" y no puede terminar. Medido en sus órdenes: Probikes tiene prendido el
// candado de tareas, desde el 26-sep las 11 finalizaciones tuvieron que tener todo
// tildado, y las 5 órdenes abiertas tenían algo sin tildar. O sea: CADA vez que
// finalizaba le saltaba "Faltan N tareas" encima de la ventana de finalizar, y el
// botón de esa ventana ("Ir a la lista de tareas") cerraba todo sin llevarlo a
// ninguna lista. Tenía que buscar la orden, abrir el chip de tareas, tildar, cerrar
// y volver a empezar: cuatro ventanas para cerrar una bici.
//
// LA REGLA: lo que falta se tilda donde se descubre que falta. Va arriba de todo en
// la ventana de finalizar, con las mismas tildes que el chip de la mesa de trabajo
// (`EtapasChecklist`: misma columna, mismas claves), y el candado sigue siendo
// candado: con algo sin tildar el botón verde no cierra, y lo dice al lado.
// ─────────────────────────────────────────────────────────────

export function TildarAntesDeCerrar({ servicio, verDerivadas, verLibres, bloquea }: {
    servicio: SupabaseService;
    verDerivadas: boolean;
    verLibres: boolean;
    bloquea: boolean;
}) {
    const updateServicio = useDataStore(s => s.updateServicio);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trabajos = verDerivadas ? trabajosDe(servicio) : [];
    const data: Record<string, boolean> = (servicio.etapas_data as any) || {};
    const tareas: TareaService[] = verLibres ? ((servicio.tareas_extra as any) || []) : [];
    const faltan = (verDerivadas ? trabajosPendientes(servicio).length : 0)
        + (verLibres ? tareasLibresPendientes(servicio).length : 0);
    const total = trabajos.length + tareas.length;
    if (total === 0) return null;

    const guardar = async (patch: Partial<SupabaseService>) => {
        if (guardando) return;
        setGuardando(true);
        setError(null);
        try { await updateServicio(servicio.id, patch); }
        catch (e: any) { setError('No se pudo guardar la tilde. Probá de nuevo.'); console.error('[tildar al cerrar]', e?.message); }
        finally { setGuardando(false); }
    };

    // Igual que el chip: se guardan solo las claves de los trabajos actuales.
    const tildarTrabajo = (clave: string) => {
        const nueva: Record<string, boolean> = {};
        for (const t of trabajos) nueva[t.clave] = t.clave === clave ? !data[t.clave] : !!data[t.clave];
        return guardar({ etapas_data: nueva });
    };
    const tildarTarea = (id: string) =>
        guardar({ tareas_extra: tareas.map(t => t.id === id ? { ...t, hecha: !t.hecha } : t) });

    // Todo tildado: una línea y nada más, para no agregarle lectura a la ventana.
    if (faltan === 0) {
        return (
            <p data-tildar-al-cerrar="completo" className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Trabajos tildados ({total} de {total})
            </p>
        );
    }

    const fila = (clave: string, texto: string, hecho: boolean, onToggle: () => void) => (
        <label key={clave} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-white cursor-pointer">
            <Checkbox checked={hecho} onCheckedChange={onToggle} disabled={guardando} />
            <span className={`text-sm ${hecho ? 'text-slate-500' : 'text-slate-800'}`}>{texto}</span>
        </label>
    );

    return (
        <div data-tildar-al-cerrar="pendiente" className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ListChecks className="h-4 w-4 text-amber-600" />
                {bloquea ? `Tildá lo que hiciste para poder cerrar (${faltan} sin tildar)` : `Quedan ${faltan} sin tildar`}
            </p>
            <div className="mt-1.5 grid gap-0.5">
                {trabajos.map(t => fila(t.clave, t.etiqueta, !!data[t.clave], () => tildarTrabajo(t.clave)))}
                {tareas.map(t => fila(t.id, t.texto, t.hecha, () => tildarTarea(t.id)))}
            </div>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
    );
}
