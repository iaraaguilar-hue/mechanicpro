import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, ThumbsUp, Coins } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// EL PANEL DEL SEGUNDO PAR DE OJOS — la línea que no admite discusión:
// "la IA sugirió 43 veces, le hiciste caso 18, y esas 18 sumaron $X".
//
// Es el pedido explícito de Iara sobre la idea 7: el feature se paga solo
// a la vista del dueño, sin que nadie tenga que argumentar el precio de
// la suscripción.
//
// 🚩 LA PLATA NO SALE DE UN NÚMERO GUARDADO: la vista retorno_sugerencias
// la calcula contra los servicio_items que SIGUEN en la orden. Si el
// mecánico después borró el ítem o le cambió el precio, este panel lo
// refleja. Mismo criterio de honestidad que el Panel de Retorno: un dueño
// que huele una exageración deja de creerle a todos los números.
// ─────────────────────────────────────────────────────────────

interface FilaSugerencia {
    sugerencia_id: string;
    estado: string;
    created_at: string;
    monto_sumado: number | null;
    texto: string | null;
    dato_usado: string | null;
}

const plata = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function Numero({ icono, valor, etiqueta, detalle, tono = "slate" }: {
    icono: React.ReactNode; valor: string; etiqueta: string; detalle?: string;
    tono?: "slate" | "green";
}) {
    return (
        <div className="flex-1 min-w-[130px]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {icono}{etiqueta}
            </div>
            <div className={`text-2xl font-bold mt-0.5 ${tono === "green" ? "text-emerald-600" : "text-slate-900"}`}>
                {valor}
            </div>
            {detalle && <div className="text-xs text-muted-foreground">{detalle}</div>}
        </div>
    );
}

export default function PanelSugerencias() {
    const taller_id = useAuthStore(s => s.taller_id);
    const [filas, setFilas] = useState<FilaSugerencia[] | null>(null);
    const [verHistorial, setVerHistorial] = useState(false);

    useEffect(() => {
        if (!taller_id) return;
        let vivo = true;
        (async () => {
            const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            const { data } = await supabase
                .from("retorno_sugerencias")
                .select("sugerencia_id, estado, created_at, monto_sumado, texto, dato_usado")
                .gte("created_at", desde)
                .order("created_at", { ascending: false });
            if (!vivo) return;
            setFilas((data ?? []) as FilaSugerencia[]);
        })();
        return () => { vivo = false; };
    }, [taller_id]);

    // Sin sugerencias no hay panel: nada de una franja de ceros ocupando
    // lugar en un taller que no usa la IA (o que está en Sport).
    if (!filas || filas.length === 0) return null;

    const sugeridas = filas.length;
    const aceptadas = filas.filter(f => f.estado === "aceptada").length;
    const sumado = filas.reduce((acc, f) => acc + (f.monto_sumado || 0), 0);

    return (
        <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                        El segundo par de ojos · últimos 90 días
                    </h3>
                </div>

                <div className="flex flex-wrap gap-4">
                    <Numero
                        icono={<Eye className="w-3 h-3" />}
                        etiqueta="Sugerencias al cerrar órdenes"
                        valor={String(sugeridas)}
                    />
                    <Numero
                        icono={<ThumbsUp className="w-3 h-3" />}
                        etiqueta="Le hiciste caso"
                        valor={String(aceptadas)}
                        detalle={sugeridas ? `${Math.round((aceptadas / sugeridas) * 100)}% de lo sugerido` : undefined}
                    />
                    <Numero
                        icono={<Coins className="w-3 h-3" />}
                        etiqueta="Sumaron a tus órdenes"
                        valor={plata(sumado)}
                        tono="green"
                        detalle="en ítems agregados"
                    />
                </div>

                <p className="text-[11px] text-muted-foreground border-t pt-2">
                    La plata sale de los ítems que siguen cargados en esas órdenes, a su precio real.
                    Si después sacaste un ítem o le cambiaste el precio, este número lo refleja.
                </p>

                {/* Historial pedido por Iara (19-ago): qué sugirió, cuándo y en
                    qué terminó — no solo el total. */}
                <button
                    onClick={() => setVerHistorial(v => !v)}
                    className="text-xs font-medium text-indigo-700 hover:underline"
                >
                    {verHistorial ? 'Ocultar historial' : `Ver historial (${filas.length})`}
                </button>
                {verHistorial && (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {filas.map(f => (
                            <div key={f.sugerencia_id} className="rounded-md border border-indigo-100 bg-white/70 p-2">
                                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                    <span>{new Date(f.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })}</span>
                                    <span className={
                                        f.estado === 'aceptada' ? 'text-emerald-600 font-semibold'
                                        : f.estado === 'no_aplica' ? 'text-slate-400'
                                        : 'text-amber-600'
                                    }>
                                        {f.estado === 'aceptada'
                                            ? `Le hiciste caso${f.monto_sumado ? ` · ${plata(f.monto_sumado)}` : ''}`
                                            : f.estado === 'no_aplica' ? 'No aplicaba' : 'Sin responder'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-700 mt-1">{f.texto}</p>
                                {f.dato_usado && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Se apoyó en: {f.dato_usado}</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
