import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useDataStore, type SupabaseService } from '@/store/dataStore';
import { configAvancesDe } from '@/lib/planFeatures';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ListChecks } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Modo "Avances por etapas" (opt-in por taller — pedido Cronobikes).
// Chip con progreso; al tocarlo se abre el checklist de etapas.
// Complementa el estado general de la orden, NO lo reemplaza:
// finalizar sigue siendo el botón verde de siempre.
// El progreso vive en servicios.etapas_data ({etapa: bool}); el orden
// y los nombres los define la plantilla del taller en /configuracion.
// ─────────────────────────────────────────────────────────────

export function EtapasChecklist({ serviceId }: { serviceId: string }) {
    const taller = useAuthStore(s => s.taller);
    const servicio = useDataStore(s => s.servicios.find(sv => sv.id === serviceId));
    const updateServicio = useDataStore(s => s.updateServicio);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    if (!servicio) return null;

    const { etapas } = configAvancesDe(taller);
    const data: Record<string, boolean> = (servicio.etapas_data as any) || {};
    const hechas = etapas.filter(e => data[e]).length;
    const completo = hechas === etapas.length;

    const toggle = async (etapa: string) => {
        if (saving) return;
        const nuevaData = { ...data, [etapa]: !data[etapa] };
        try {
            setSaving(true);
            await updateServicio(servicio.id, { etapas_data: nuevaData } as Partial<SupabaseService>);
        } catch (e: any) {
            console.error('[EtapasChecklist] Error guardando avance:', e.message);
            alert('No se pudo guardar el avance: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        className={`flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors ${completo
                            ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                        title="Avances del service"
                    >
                        <ListChecks size={12} />
                        {hechas}/{etapas.length}
                        <span className="w-12 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <span
                                className={`block h-full rounded-full transition-all ${completo ? 'bg-green-500' : 'bg-primary'}`}
                                style={{ width: `${etapas.length > 0 ? (hechas / etapas.length) * 100 : 0}%` }}
                            />
                        </span>
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="start">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Avances del service</p>
                    <div className="space-y-1">
                        {etapas.map((etapa) => (
                            <label
                                key={etapa}
                                className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                                <Checkbox
                                    checked={!!data[etapa]}
                                    onCheckedChange={() => toggle(etapa)}
                                    disabled={saving}
                                />
                                <span className={`text-sm ${data[etapa] ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                    {etapa}
                                </span>
                            </label>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
