import { useState } from 'react';
import { useDataStore, type SupabaseService } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { trabajosDe, avancesActivos, tareasActivas, type TareaService } from '@/lib/planFeatures';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ListChecks, Plus, Trash2, Lock } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// "Tareas del service" — chip tildable en la Mesa de Trabajo.
// Junta DOS cosas (cada una opt-in por taller):
//  1. Trabajos DERIVADOS de la orden (service base + manos de obra + repuestos),
//     Pro/Expert. Progreso en servicios.etapas_data ({claveTrabajo: bool}).
//  2. Tareas LIBRES que el mecánico anota para no olvidarse ("colocar plato 34"),
//     todos los planes. En servicios.tareas_extra ([{id, texto, hecha}]).
// Si el taller prendió el candado, esas tareas BLOQUEAN la finalización
// (el bloqueo real vive en Workshop → FinalizeJobDialog).
// Complementa el estado general de la orden, NO lo reemplaza.
// ─────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
    base: 'Service',
    labor: 'Mano de obra',
    part: 'Repuesto',
};

const TIPO_BADGE: Record<string, string> = {
    base: 'bg-primary/10 text-primary',
    labor: 'bg-blue-50 text-blue-600',
    part: 'bg-slate-100 text-slate-500',
};

export function EtapasChecklist({ serviceId }: { serviceId: string }) {
    const servicio = useDataStore(s => s.servicios.find(sv => sv.id === serviceId));
    const updateServicio = useDataStore(s => s.updateServicio);
    const taller = useAuthStore(s => s.taller);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [nuevaTarea, setNuevaTarea] = useState('');

    if (!servicio) return null;

    const verDerivadas = avancesActivos(taller);
    const verLibres = tareasActivas(taller);

    const trabajos = verDerivadas ? trabajosDe(servicio) : [];
    const data: Record<string, boolean> = (servicio.etapas_data as any) || {};
    const tareas: TareaService[] = verLibres ? ((servicio.tareas_extra as any) || []) : [];

    // Nada tildable y no se pueden agregar libres → no mostrar el chip.
    if (trabajos.length === 0 && !verLibres) return null;

    const totalItems = trabajos.length + tareas.length;
    const hechos = trabajos.filter(t => data[t.clave]).length + tareas.filter(t => t.hecha).length;
    const completo = totalItems > 0 && hechos === totalItems;
    const bloquea = verLibres && taller?.config_notificaciones?.bloquear_finalizacion === true;

    const persist = async (patch: Partial<SupabaseService>) => {
        if (saving) return;
        try {
            setSaving(true);
            await updateServicio(servicio.id, patch);
        } catch (e: any) {
            console.error('[Tareas del service] Error guardando:', e.message);
            alert('No se pudo guardar: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleDerivado = (clave: string) => {
        // Se guardan solo las claves de los trabajos actuales (si un item se sacó
        // de la orden, su check viejo no queda huérfano).
        const nuevaData: Record<string, boolean> = {};
        for (const t of trabajos) nuevaData[t.clave] = t.clave === clave ? !data[t.clave] : !!data[t.clave];
        return persist({ etapas_data: nuevaData });
    };

    const toggleLibre = (id: string) =>
        persist({ tareas_extra: tareas.map(t => t.id === id ? { ...t, hecha: !t.hecha } : t) });

    const borrarTarea = (id: string) =>
        persist({ tareas_extra: tareas.filter(t => t.id !== id) });

    const agregarTarea = () => {
        const texto = nuevaTarea.trim();
        if (!texto) return;
        setNuevaTarea('');
        return persist({ tareas_extra: [...tareas, { id: crypto.randomUUID(), texto, hecha: false }] });
    };

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        className={`flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors ${completo
                            ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                        title="Tareas del service"
                    >
                        <ListChecks size={12} />
                        {totalItems > 0 ? `${hechos}/${totalItems}` : 'Tareas'}
                        {totalItems > 0 && (
                            <span className="w-12 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                <span
                                    className={`block h-full rounded-full transition-all ${completo ? 'bg-green-500' : 'bg-primary'}`}
                                    style={{ width: `${(hechos / totalItems) * 100}%` }}
                                />
                            </span>
                        )}
                        {bloquea && !completo && totalItems > 0 && <Lock size={11} className="text-amber-500" />}
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="start">
                    {/* Trabajos derivados del catálogo (Pro/Expert) */}
                    {trabajos.length > 0 && (
                        <>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                                Trabajos de esta orden
                            </p>
                            <div className="space-y-1 max-h-52 overflow-y-auto">
                                {trabajos.map((t) => (
                                    <label
                                        key={t.clave}
                                        className="flex items-start gap-2.5 py-1.5 px-2 rounded-md hover:bg-slate-50 cursor-pointer transition-colors"
                                    >
                                        <Checkbox
                                            checked={!!data[t.clave]}
                                            onCheckedChange={() => toggleDerivado(t.clave)}
                                            disabled={saving}
                                            className="mt-0.5"
                                        />
                                        <span className="flex-1 min-w-0">
                                            <span className={`block text-sm leading-snug ${data[t.clave] ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                {t.etiqueta}
                                            </span>
                                            <span className={`inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-px rounded-full ${TIPO_BADGE[t.tipo]}`}>
                                                {TIPO_LABEL[t.tipo]}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Tareas libres del mecánico (todos los planes) */}
                    {verLibres && (
                        <>
                            <p className={`text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ${trabajos.length > 0 ? 'mt-3 border-t pt-3' : ''}`}>
                                Recordatorios del mecánico
                            </p>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {tareas.map((t) => (
                                    <div
                                        key={t.id}
                                        className="flex items-start gap-2.5 py-1.5 px-2 rounded-md hover:bg-slate-50 transition-colors group"
                                    >
                                        <Checkbox
                                            checked={t.hecha}
                                            onCheckedChange={() => toggleLibre(t.id)}
                                            disabled={saving}
                                            className="mt-0.5"
                                        />
                                        <span className={`flex-1 min-w-0 text-sm leading-snug ${t.hecha ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                            {t.texto}
                                        </span>
                                        <button
                                            onClick={() => borrarTarea(t.id)}
                                            disabled={saving}
                                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition shrink-0"
                                            title="Borrar tarea"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                                {tareas.length === 0 && (
                                    <p className="text-xs text-slate-400 px-2 py-1">Todavía no hay tareas. Agregá una 👇</p>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-2">
                                <input
                                    value={nuevaTarea}
                                    onChange={(e) => setNuevaTarea(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarTarea(); } }}
                                    placeholder="Ej: colocar plato 34 con su cadena"
                                    className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                                    disabled={saving}
                                />
                                <button
                                    onClick={agregarTarea}
                                    disabled={saving || !nuevaTarea.trim()}
                                    className="shrink-0 p-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition"
                                    title="Agregar tarea"
                                >
                                    <Plus size={15} />
                                </button>
                            </div>
                            {bloquea && (
                                <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
                                    <Lock size={11} /> No se puede finalizar el service hasta tildar todas.
                                </p>
                            )}
                        </>
                    )}

                    {trabajos.length > 0 && !verLibres && (
                        <p className="text-[11px] text-muted-foreground mt-2 border-t pt-2">
                            ¿Falta un trabajo acá? Agregalo a la orden con "Editar" y aparece solo.
                        </p>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
}
