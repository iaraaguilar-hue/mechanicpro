import { useEffect, useRef, useState } from "react";
import { useDataStore, type SugerenciaPresupuesto } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { tieneFeature } from "@/lib/planFeatures";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Loader2, Plus, CheckCircle2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// EL SEGUNDO PAR DE OJOS — la IA mira el historial de esta bici antes de
// que la orden se cierre, y avisa lo que se está escapando.
//
// Tres reglas que no se negocian:
// 1. SUGIERE, NUNCA AGREGA SOLA. El botón "Agregar" lo aprieta el
//    mecánico, y el precio queda editable antes de agregar.
// 2. NUNCA BLOQUEA EL CIERRE. Carga en paralelo mientras el mecánico
//    completa el modal; si la IA tarda o falla, acá no aparece nada y
//    finalizar sigue funcionando igual que siempre.
// 3. CADA SUGERENCIA MUESTRA SU DATO. "La cadena es de hace 14 meses" se
//    puede verificar contra el historial; una sugerencia sin dato no
//    llega a esta pantalla (la filtra el servidor).
//
// Cada respuesta queda registrada (aceptada / no aplica): es la mitad de
// la medición "la IA sugirió N veces, le hiciste caso M, sumaron $X" que
// se ve en Métricas.
// ─────────────────────────────────────────────────────────────

export default function SegundoParDeOjos({ servicioId }: { servicioId: string }) {
    const taller = useAuthStore(s => s.taller);
    const servicios = useDataStore(s => s.servicios);
    const sugerirPresupuesto = useDataStore(s => s.sugerirPresupuesto);
    const responderSugerencia = useDataStore(s => s.responderSugerencia);
    const updateServicio = useDataStore(s => s.updateServicio);

    const [cargando, setCargando] = useState(false);
    const [sugerencias, setSugerencias] = useState<SugerenciaPresupuesto[]>([]);
    // El precio editable de cada sugerencia antes de agregar.
    const [precios, setPrecios] = useState<Record<string, string>>({});
    const [ocupada, setOcupada] = useState<string | null>(null);
    const pedida = useRef(false);

    const habilitado = tieneFeature(taller, 'segundo_ojos') && (taller as any)?.ia_presupuesto_activa === true;

    useEffect(() => {
        if (!habilitado || pedida.current) return;
        pedida.current = true;
        setCargando(true);
        sugerirPresupuesto(servicioId).then(r => {
            const pendientes = r.sugerencias.filter(s => s.estado === 'sugerida');
            setSugerencias(pendientes);
            setPrecios(Object.fromEntries(
                pendientes.map(s => [s.id, s.precio_sugerido != null ? String(s.precio_sugerido) : ''])
            ));
            setCargando(false);
        });
    }, [habilitado, servicioId, sugerirPresupuesto]);

    if (!habilitado) return null;
    if (!cargando && sugerencias.length === 0) return null;

    const agregar = async (s: SugerenciaPresupuesto) => {
        const servicio = servicios.find(x => x.id === servicioId);
        if (!servicio || !s.descripcion_item) return;
        setOcupada(s.id);
        try {
            const precio = Number(precios[s.id]) || 0;
            const items = [
                ...((servicio as any).items_extra ?? []),
                { descripcion: s.descripcion_item, precio, categoria: s.categoria_item },
            ];
            await updateServicio(servicioId, {
                items_extra: items,
                // Misma cuenta que ServiceModal (base + ítems): si no se
                // actualiza, el TOTAL del modal y el PDF quedan viejos.
                precio_total: (Number((servicio as any).precio_base) || 0)
                    + items.reduce((acc: number, i: any) => acc + (Number(i.precio) || 0), 0),
            } as any);
            // El registro de la respuesta es estadística: si falla, el ítem ya
            // quedó en la orden y eso es lo que le importa al taller.
            await responderSugerencia(s.id, 'aceptada');
            setSugerencias(prev => prev.map(x => x.id === s.id ? { ...x, estado: 'aceptada' } : x));
        } catch (e: any) {
            console.error('No se pudo agregar el ítem sugerido:', e?.message || e);
        } finally {
            setOcupada(null);
        }
    };

    const noAplica = async (s: SugerenciaPresupuesto) => {
        setOcupada(s.id);
        await responderSugerencia(s.id, 'no_aplica');
        setSugerencias(prev => prev.filter(x => x.id !== s.id));
        setOcupada(null);
    };

    return (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
            <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-800">Segundo par de ojos</h4>
                {cargando && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" /> mirando el historial de esta bici…
                    </span>
                )}
            </div>

            {sugerencias.map(s => (
                <div key={s.id} className="bg-white rounded-md border border-indigo-100 p-3 space-y-2">
                    <p className="text-sm text-slate-800">{s.texto}</p>
                    {s.dato_usado && (
                        <p className="text-[11px] text-muted-foreground">
                            Del historial: {s.dato_usado}
                        </p>
                    )}
                    {s.estado === 'aceptada' ? (
                        <p className="text-xs font-medium text-green-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Agregado a la orden: {s.descripcion_item}
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-600 truncate max-w-[180px]" title={s.descripcion_item ?? ''}>
                                {s.descripcion_item}
                            </span>
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">$</span>
                                <Input
                                    type="number"
                                    className="h-8 w-28 text-sm"
                                    value={precios[s.id] ?? ''}
                                    placeholder="precio"
                                    onChange={e => setPrecios(p => ({ ...p, [s.id]: e.target.value }))}
                                    disabled={ocupada === s.id}
                                />
                            </div>
                            <Button
                                size="sm"
                                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                                disabled={ocupada === s.id}
                                onClick={() => agregar(s)}
                            >
                                {ocupada === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                                Agregar a la orden
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-slate-500"
                                disabled={ocupada === s.id}
                                onClick={() => noAplica(s)}
                            >
                                No aplica
                            </Button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
