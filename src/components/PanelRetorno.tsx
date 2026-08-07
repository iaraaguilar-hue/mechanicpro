import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, MessageSquare, ThumbsUp, Coins, Info } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// EL PANEL DE RETORNO — qué pasó con los mensajes que mandaste.
//
// POR QUÉ ES LA PANTALLA MÁS IMPORTANTE DEL PRODUCTO: todo lo demás le
// muestra al taller TRABAJO (alertas por atender, órdenes por cerrar).
// Nada le muestra RESULTADO. Un taller que no ve el resultado no defiende
// el sistema cuando su equipo se queja — es exactamente lo que nos pasó
// con Crono: le dimos un login y un formulario en blanco, nunca un número
// con el que contestar "esto nos trajo tanta plata".
//
// 🚩 EL CLAIM ES "VOLVIERON DESPUÉS DEL CONTACTO", NO "GRACIAS AL
// CONTACTO". Parte de esos clientes volvía igual. No podemos saber
// cuántos, y no hace falta: el número real ya es lo bastante bueno. Un
// dueño de taller que huele una exageración deja de creerle a TODOS los
// números de la pantalla, incluidos los verdaderos.
// ─────────────────────────────────────────────────────────────

interface FilaRetorno {
    contacto_id: string;
    variante: string | null;
    fecha_contacto: string;
    interes: string | null;
    respondio_at: string | null;
    estado_mensaje: string | null;
    generado_por_ia: boolean | null;
    servicio_retorno_id: string | null;
    monto_recuperado: number | null;
}

const plata = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

// Nombre legible de la variante. Las etiquetas técnicas ("ia_retencion")
// no le dicen nada al que mira el panel.
function nombreVariante(v: string | null): string {
    if (!v) return "Sin identificar";
    if (v.startsWith("ia_")) return "Mensaje personalizado";
    if (v.startsWith("fijo_")) return "Mensaje de siempre";
    return v;
}

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

export default function PanelRetorno() {
    const taller_id = useAuthStore(s => s.taller_id);
    const [filas, setFilas] = useState<FilaRetorno[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!taller_id) return;
        let vivo = true;

        (async () => {
            // Los últimos 90 días: la ventana de atribución son 45, así que
            // menos que eso mostraría recontactos a los que todavía no se les
            // dio tiempo de volver — y el panel se vería peor de lo que es.
            const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from("retorno_retencion")
                .select("contacto_id, variante, fecha_contacto, interes, respondio_at, estado_mensaje, generado_por_ia, servicio_retorno_id, monto_recuperado")
                .gte("fecha_contacto", desde)
                .order("fecha_contacto", { ascending: false });

            if (!vivo) return;
            if (error) { setError(error.message); setFilas([]); return; }
            setFilas((data ?? []) as FilaRetorno[]);
        })();

        return () => { vivo = false; };
    }, [taller_id]);

    if (filas === null) {
        return (
            <Card className="border-dashed">
                <CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Calculando el retorno…
                </CardContent>
            </Card>
        );
    }

    // Sin recontactos todavía no hay nada que contar. Un panel de ceros no
    // motiva, desmoraliza.
    if (filas.length === 0) {
        return (
            <Card className="border-dashed bg-slate-50">
                <CardContent className="p-5 text-sm text-muted-foreground">
                    <span className="font-semibold text-slate-700">Todavía no recontactaste a nadie.</span>{" "}
                    Cuando le escribas al primer cliente desde acá, en esta franja vas a ver cuántos volvieron
                    y cuánto facturaste con eso.
                    {error && <div className="mt-2 text-xs text-red-600">No se pudo leer el retorno: {error}</div>}
                </CardContent>
            </Card>
        );
    }

    const recontactados = filas.length;
    const contestaron = filas.filter(f => f.respondio_at).length;
    const dijeronSi = filas.filter(f => f.interes === "si").length;
    const volvieron = filas.filter(f => f.servicio_retorno_id).length;
    const facturado = filas.reduce((acc, f) => acc + (f.monto_recuperado || 0), 0);

    // Cuál mensaje trae más plata. Se muestra solo si hay con qué comparar:
    // una sola variante no es una comparación, es un número suelto.
    const porVariante = Object.values(
        filas.reduce((acc: Record<string, { nombre: string; n: number; volvieron: number; plata: number }>, f) => {
            const clave = nombreVariante(f.variante);
            acc[clave] ??= { nombre: clave, n: 0, volvieron: 0, plata: 0 };
            acc[clave].n++;
            if (f.servicio_retorno_id) acc[clave].volvieron++;
            acc[clave].plata += f.monto_recuperado || 0;
            return acc;
        }, {})
    ).sort((a, b) => b.plata / Math.max(b.n, 1) - a.plata / Math.max(a.n, 1));

    const hayComparacion = porVariante.length >= 2;
    // Con menos de 20 mensajes por variante, una diferencia puede ser suerte.
    // Decirlo es lo que evita que el taller cambie de estrategia por ruido.
    const muestraChica = porVariante.some(v => v.n < 20);

    return (
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white">
            <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                        Lo que trajeron tus mensajes · últimos 90 días
                    </h3>
                </div>

                <div className="flex flex-wrap gap-4">
                    <Numero
                        icono={<MessageSquare className="w-3 h-3" />}
                        etiqueta="Recontactaste"
                        valor={String(recontactados)}
                        detalle="clientes"
                    />
                    <Numero
                        icono={<MessageSquare className="w-3 h-3" />}
                        etiqueta="Te contestaron"
                        valor={String(contestaron)}
                        detalle={recontactados ? `${Math.round((contestaron / recontactados) * 100)}% de los que escribiste` : undefined}
                    />
                    <Numero
                        icono={<ThumbsUp className="w-3 h-3" />}
                        etiqueta="Dijeron que sí"
                        valor={String(dijeronSi)}
                    />
                    <Numero
                        icono={<TrendingUp className="w-3 h-3" />}
                        etiqueta="Volvieron"
                        valor={String(volvieron)}
                        detalle={recontactados ? `${Math.round((volvieron / recontactados) * 100)}% de los que escribiste` : undefined}
                    />
                    <Numero
                        icono={<Coins className="w-3 h-3" />}
                        etiqueta="Facturaste"
                        valor={plata(facturado)}
                        tono="green"
                        detalle="en esas vueltas"
                    />
                </div>

                {hayComparacion && (
                    <div className="pt-1">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                            Qué mensaje trae más plata
                        </h4>
                        <div className="space-y-1.5">
                            {porVariante.map(v => (
                                <div key={v.nombre} className="flex items-center justify-between gap-3 text-sm bg-white/70 rounded-md px-3 py-2 border border-slate-100">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 shrink-0">
                                            {v.nombre}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground truncate">
                                            {v.n} mandados · {v.volvieron} volvieron
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-bold text-emerald-600">{plata(v.plata)}</div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {plata(Math.round(v.plata / Math.max(v.n, 1)))} por mensaje
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {muestraChica && (
                            <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1">
                                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                Todavía son pocos mensajes por versión: la diferencia puede ser casualidad.
                                Con unos 20 de cada una el número empieza a decir algo.
                            </p>
                        )}
                    </div>
                )}

                <p className="text-[11px] text-muted-foreground border-t pt-2">
                    Son los clientes que volvieron <span className="font-medium">después</span> del contacto,
                    dentro de los 45 días. Algunos habrían vuelto igual: el número no dice que volvieron
                    <span className="font-medium"> por</span> el mensaje.
                </p>
            </CardContent>
        </Card>
    );
}
