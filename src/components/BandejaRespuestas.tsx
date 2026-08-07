import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Loader2, Send, Check, Sparkles, User } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// LA BANDEJA — lo que tus clientes te contestaron.
//
// POR QUÉ: el recontacto no termina cuando el mensaje sale, termina
// cuando alguien contesta y le responden. Un cliente que escribe "cuánto
// me sale?" y no recibe respuesta en el día es una venta perdida con
// aviso previo.
//
// Y hay un reloj: desde que el cliente escribe, Meta abre una ventana de
// 24hs en la que se puede mandar texto libre. Después de esa ventana solo
// se puede volver a las plantillas. Por eso la bandeja muestra cuánto
// queda: no es un dato de color, es el margen para cerrar.
//
// 🚩 El borrador lo escribe la IA, el mensaje lo manda una persona. Se
// puede editar antes de enviar y no sale nada sin que alguien lo lea:
// el que produce no es el que aprueba.
// ─────────────────────────────────────────────────────────────

interface Entrante {
    id: string;
    cliente_id: string | null;
    telefono: string;
    texto: string | null;
    recibido_at: string;
    interes: string | null;
    atendido: boolean;
}

const HORAS_VENTANA = 24;

function horasDesde(iso: string): number {
    return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

export default function BandejaRespuestas() {
    const taller_id = useAuthStore(s => s.taller_id);
    const taller = useAuthStore(s => s.taller);
    const clientes = useDataStore(s => s.clientes);
    const redactar = useDataStore(s => s.redactarMensajePersonal);
    const enviar = useDataStore(s => s.enviarWhatsAppPlantilla);

    const [mensajes, setMensajes] = useState<Entrante[] | null>(null);
    const [abierto, setAbierto] = useState<string | null>(null);
    const [borrador, setBorrador] = useState("");
    const [redactando, setRedactando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);

    const cargar = async () => {
        // Últimos 7 días: más atrás ya no es una conversación abierta, es
        // historia — y la ventana de Meta hace rato que se cerró.
        const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
            .from("mensajes_entrantes")
            .select("id, cliente_id, telefono, texto, recibido_at, interes, atendido")
            .eq("atendido", false)
            .gte("recibido_at", desde)
            .order("recibido_at", { ascending: false })
            .limit(20);
        setMensajes((data ?? []) as Entrante[]);
    };

    useEffect(() => {
        if (!taller_id) return;
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taller_id]);

    if (!mensajes || mensajes.length === 0) return null;

    const nombreDe = (m: Entrante) =>
        clientes.find(c => c.id === m.cliente_id)?.nombre ?? m.telefono;

    const proponer = async (m: Entrante) => {
        setAbierto(m.id);
        setAviso(null);
        setBorrador("");
        if (!m.cliente_id) {
            // Sin cliente identificado no hay historial que usar: se responde
            // a mano, que es más honesto que inventarle un contexto.
            setBorrador("");
            return;
        }
        setRedactando(true);
        const r = await redactar({
            cliente_id: m.cliente_id,
            motivo: "respuesta",
            ultimo_mensaje_cliente: m.texto ?? undefined,
        });
        setRedactando(false);
        if (r.ok && r.linea) {
            setBorrador(r.linea);
        } else {
            setAviso(
                r.error === "ia_apagada"
                    ? "Los mensajes personalizados están apagados. Podés escribirle a mano."
                    : "No se pudo escribir el borrador. Escribilo a mano y mandalo igual."
            );
        }
    };

    const marcarAtendido = async (id: string) => {
        await supabase.from("mensajes_entrantes").update({ atendido: true }).eq("id", id);
        setMensajes(prev => (prev ?? []).filter(m => m.id !== id));
        setAbierto(null);
    };

    const responder = async (m: Entrante) => {
        const texto = borrador.trim();
        if (!texto) return;
        setEnviando(true);
        setAviso(null);

        const dentroDeVentana = horasDesde(m.recibido_at) < HORAS_VENTANA;

        if (dentroDeVentana) {
            const r = await enviar({
                proposito: "retencion",
                tipo: "texto",
                texto,
                destino: m.telefono,
                cliente_id: m.cliente_id,
                generado_por_ia: true,
                variante: "ia_respuesta",
            });
            setEnviando(false);
            if (r.ok) { await marcarAtendido(m.id); return; }
            // La ventana se cerró entre que se abrió la pantalla y se apretó
            // el botón, o falló el envío: se cae a WhatsApp a mano con el
            // texto listo. Nunca se deja al taller sin poder contestar.
            setAviso(
                r.error === "ventana_cerrada"
                    ? "Pasaron las 24hs y WhatsApp ya no deja responder directo. Te lo abro en tu WhatsApp."
                    : "No se pudo enviar automáticamente. Te lo abro en tu WhatsApp."
            );
        } else {
            setEnviando(false);
        }

        window.open(
            `https://wa.me/${m.telefono.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(texto)}`,
            "_blank"
        );
        await marcarAtendido(m.id);
    };

    return (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50/70 to-white">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                        Te contestaron {mensajes.length} cliente{mensajes.length === 1 ? "" : "s"}
                    </h3>
                </div>

                <div className="space-y-2">
                    {mensajes.map(m => {
                        const horas = horasDesde(m.recibido_at);
                        const quedan = Math.max(0, Math.floor(HORAS_VENTANA - horas));
                        return (
                            <div key={m.id} className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {m.cliente_id ? (
                                                <Link to={`/clients/${m.cliente_id}`} className="font-semibold text-slate-900 hover:text-primary hover:underline underline-offset-2">
                                                    {nombreDe(m)}
                                                </Link>
                                            ) : (
                                                <span className="font-semibold text-slate-900 flex items-center gap-1">
                                                    <User className="w-3.5 h-3.5 text-slate-400" /> {m.telefono}
                                                </span>
                                            )}
                                            {m.interes === "si" && (
                                                <Badge className="bg-emerald-600 text-white text-[10px] uppercase">Dijo que sí</Badge>
                                            )}
                                            {m.interes === "no" && (
                                                <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[10px] uppercase">No le interesa</Badge>
                                            )}
                                            {m.interes === "quizas" && (
                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] uppercase">Sin definir</Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-700 mt-1">“{m.texto || "(sin texto)"}”</p>
                                    </div>
                                    <span className={`text-[11px] whitespace-nowrap ${quedan <= 4 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                                        {quedan > 0 ? `quedan ${quedan} h` : "ventana cerrada"}
                                    </span>
                                </div>

                                {abierto === m.id ? (
                                    <div className="space-y-2">
                                        {redactando ? (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Escribiendo con el historial de {nombreDe(m)}…
                                            </div>
                                        ) : (
                                            <>
                                                <Textarea
                                                    value={borrador}
                                                    onChange={(e) => setBorrador(e.target.value)}
                                                    placeholder="Escribile…"
                                                    className="min-h-[80px] text-sm"
                                                />
                                                {aviso && <p className="text-xs text-amber-700">{aviso}</p>}
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={() => responder(m)} disabled={enviando || !borrador.trim()}>
                                                        {enviando
                                                            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Mandando…</>
                                                            : <><Send className="w-4 h-4 mr-1.5" /> Mandar</>}
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setAbierto(null)} disabled={enviando}>
                                                        Cancelar
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => proponer(m)}>
                                            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                                            {taller?.ia_mensajes_activa ? "Escribir respuesta" : "Responder"}
                                        </Button>
                                        <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => marcarAtendido(m.id)}>
                                            <Check className="w-3.5 h-3.5 mr-1.5" /> Ya lo atendí
                                        </Button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
