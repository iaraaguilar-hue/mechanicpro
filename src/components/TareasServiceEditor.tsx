import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { avancesActivos, tareasActivas, trabajosDe, type TareaService, type TrabajoChecklist } from '@/lib/planFeatures';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NuevoBadge } from '@/components/NuevoBadge';
import { marcarNuevoVisto } from '@/lib/nuevoFeatures';
import { ListChecks, Plus, Trash2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// "A realizar" DENTRO de la creación/edición del service (Tarea G).
// Una sola lista: los trabajos que salen solos del service (Pro/Expert,
// preview de solo lectura) + las tareas libres que el mecánico agrega a
// mano ahí mismo (todos los planes), sin pantalla extra. Las libres se
// guardan con el service (servicios.tareas_extra). El tildado y el
// candado siguen viviendo en la Mesa de Trabajo (EtapasChecklist).
//
// Controlado: el padre (ServiceModal) es dueño del array `tareas`.
// Estilo alineado a la estética actual de la app (mismos Label/Input/
// Button, bloques bg-muted/30), sin cambios bruscos.
// ─────────────────────────────────────────────────────────────

export function TareasServiceEditor({
    tipoServicio,
    itemsExtra,
    tareas,
    onChange,
}: {
    tipoServicio: string;
    itemsExtra: { description: string; category?: 'part' | 'labor' }[];
    tareas: TareaService[];
    onChange: (t: TareaService[]) => void;
}) {
    const taller = useAuthStore(s => s.taller);
    const [nueva, setNueva] = useState('');

    const verLibres = tareasActivas(taller);
    const verDerivadas = avancesActivos(taller);

    // Preview de los trabajos que se van a poder tildar (derivados del catálogo).
    const derivados: TrabajoChecklist[] = verDerivadas
        ? trabajosDe({ tipo_servicio: tipoServicio, items_extra: itemsExtra.map(i => ({ descripcion: i.description, categoria: i.category })) })
        : [];

    // Taller sin ninguna de las dos activadas → no mostramos la sección.
    if (!verLibres && derivados.length === 0) return null;

    const agregar = () => {
        const texto = nueva.trim();
        if (!texto) return;
        setNueva('');
        marcarNuevoVisto('tareas-en-creacion'); // la usó → se apaga el "Nuevo"
        onChange([...tareas, { id: crypto.randomUUID(), texto, hecha: false }]);
    };

    const borrar = (id: string) => onChange(tareas.filter(t => t.id !== id));

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Label className="text-lg font-semibold flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-primary" /> A realizar
                </Label>
                <NuevoBadge feature="tareas-en-creacion" />
            </div>

            <div className="rounded-lg border bg-muted/30 divide-y">
                {/* Derivados del service (Pro/Expert) — preview de solo lectura */}
                {derivados.map((t) => (
                    <div key={t.clave} className="flex items-center gap-2 px-3 py-2">
                        <span className="w-4 h-4 rounded border border-muted-foreground/40 shrink-0" />
                        <span className="flex-1 text-sm text-slate-700">{t.etiqueta}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-background border rounded-full px-2 py-0.5">
                            Del service
                        </span>
                    </div>
                ))}

                {/* Tareas libres del mecánico (todos los planes) */}
                {verLibres && tareas.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-3 py-2 group">
                        <span className="w-4 h-4 rounded border border-muted-foreground/40 shrink-0" />
                        <span className="flex-1 text-sm text-slate-700">{t.texto}</span>
                        <span className="text-[10px] font-semibold text-primary uppercase tracking-wide bg-primary/10 rounded-full px-2 py-0.5">
                            Agregada
                        </span>
                        <button
                            type="button"
                            onClick={() => borrar(t.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition shrink-0"
                            title="Quitar tarea"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}

                {/* Alta de tarea libre en el mismo paso */}
                {verLibres && (
                    <div className="flex items-center gap-2 p-2">
                        <Input
                            value={nueva}
                            onChange={(e) => setNueva(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
                            placeholder="Agregar una tarea… (ej: colocar plato 34 que trajo el cliente)"
                            className="flex-1 bg-background"
                        />
                        <Button type="button" size="icon" onClick={agregar} disabled={!nueva.trim()} title="Agregar tarea">
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                )}
            </div>

            {verLibres && (
                <p className="text-xs text-muted-foreground">
                    Las tareas quedan en la orden para ir tildándolas desde la Mesa de Trabajo.
                </p>
            )}
        </div>
    );
}
