import { useState } from 'react';
import { useDataStore, type SupabaseService } from '@/store/dataStore';
import { trabajosDe } from '@/lib/planFeatures';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ListChecks } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// "Checklist de trabajos" (opt-in por taller — pedido Cronobikes).
// El checklist NO es una plantilla genérica: se arma solo desde lo que la
// orden dice que hay que hacerle a ESA bici (service base + cada mano de
// obra y repuesto cargado). Se agrega un trabajo a la orden → aparece acá.
// Chip con progreso; al tocarlo se abre la lista tildable.
// Complementa el estado general de la orden, NO lo reemplaza.
// Progreso en servicios.etapas_data ({claveTrabajo: bool}).
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
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    if (!servicio) return null;

    const trabajos = trabajosDe(servicio);
    if (trabajos.length === 0) return null;

    const data: Record<string, boolean> = (servicio.etapas_data as any) || {};
    const hechos = trabajos.filter(t => data[t.clave]).length;
    const completo = hechos === trabajos.length;

    const toggle = async (clave: string) => {
        if (saving) return;
        // Se guardan solo las claves de los trabajos actuales de la orden
        // (si un item se sacó de la orden, su check viejo no queda huérfano).
        const nuevaData: Record<string, boolean> = {};
        for (const t of trabajos) nuevaData[t.clave] = t.clave === clave ? !data[t.clave] : !!data[t.clave];
        try {
            setSaving(true);
            await updateServicio(servicio.id, { etapas_data: nuevaData } as Partial<SupabaseService>);
        } catch (e: any) {
            console.error('[EtapasChecklist] Error guardando el check:', e.message);
            alert('No se pudo guardar el check: ' + e.message);
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
                        title="Trabajos del service"
                    >
                        <ListChecks size={12} />
                        {hechos}/{trabajos.length}
                        <span className="w-12 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <span
                                className={`block h-full rounded-full transition-all ${completo ? 'bg-green-500' : 'bg-primary'}`}
                                style={{ width: `${(hechos / trabajos.length) * 100}%` }}
                            />
                        </span>
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="start">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        Trabajos de esta orden
                    </p>
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                        {trabajos.map((t) => (
                            <label
                                key={t.clave}
                                className="flex items-start gap-2.5 py-1.5 px-2 rounded-md hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                                <Checkbox
                                    checked={!!data[t.clave]}
                                    onCheckedChange={() => toggle(t.clave)}
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
                    <p className="text-[11px] text-muted-foreground mt-2 border-t pt-2">
                        ¿Falta un trabajo acá? Agregalo a la orden con "Editar" y aparece solo.
                    </p>
                </PopoverContent>
            </Popover>
        </div>
    );
}
