import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, MessageSquare, ThumbsUp, Coins, Info, Smartphone } from "lucide-react";
import { ComoFunciona } from '@/components/ComoFunciona';

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

// El segundo carril: lo que el taller escribió A MANO desde su celular.
// Va aparte y no sumado por decisión de Iara (8-sep-2026), y porque no miden lo
// mismo: el automático atribuye por bici, éste por cliente.
interface FilaManual {
    cliente_id: string;
    fecha_contacto: string;
    /** true = salió a buscarlo. false = estaba contestando (demanda entrante). */
    escribio_primero: boolean;
    servicio_retorno_id: string | null;
    monto_recuperado: number | null;
}

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
    const [manual, setManual] = useState<FilaManual[]>([]);
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
            if (error) { setError(error.message); setFilas([]); }
            else setFilas((data ?? []) as FilaRetorno[]);

            // El carril manual, misma ventana. Va en su propia consulta y no
            // bloquea a la otra: si la vista fallara, el panel de siempre se
            // sigue viendo.
            const { data: m } = await supabase
                .from("retorno_manual")
                .select("cliente_id, fecha_contacto, escribio_primero, servicio_retorno_id, monto_recuperado")
                .gte("fecha_contacto", desde)
                .order("fecha_contacto", { ascending: false });
            if (vivo) setManual((m ?? []) as FilaManual[]);
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

    // ── EL CARRIL MANUAL ────────────────────────────────────────
    // 🔴 Solo cuentan las salidas en las que el taller ESCRIBIÓ PRIMERO. Cuando
    // estaba contestando un mensaje del cliente, esa vuelta la trajo el cliente
    // solo: en Probikes la diferencia es $753.320 contra $2.659.507. Acreditarse
    // esa plata es lo que hace que el dueño del taller deje de creerle a TODA la
    // pantalla, incluidos los números que sí son verdad.
    const salidas = manual.filter(m => m.escribio_primero);
    const salidasVolvieron = salidas.filter(m => m.servicio_retorno_id);
    const manualPlata = salidasVolvieron.reduce((a, m) => a + (m.monto_recuperado || 0), 0);
    const manualClientes = new Set(salidas.map(m => m.cliente_id)).size;
    // La demanda entrante: real, del taller, y NO es retención.
    const entrante = manual.filter(m => !m.escribio_primero && m.servicio_retorno_id);
    const entrantePlata = entrante.reduce((a, m) => a + (m.monto_recuperado || 0), 0);

    const bloqueManual = salidas.length === 0 ? null : (
        <div className="pt-3 border-t border-emerald-100">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                Y los que escribiste a mano, desde tu celular
            </h4>
            <div className="flex flex-wrap gap-4">
                <Numero
                    icono={<MessageSquare className="w-3 h-3" />}
                    etiqueta="Saliste a buscar"
                    valor={String(manualClientes)}
                    detalle={`clientes · ${salidas.length} veces`}
                />
                <Numero
                    icono={<TrendingUp className="w-3 h-3" />}
                    etiqueta="Volvieron"
                    valor={String(salidasVolvieron.length)}
                    detalle={`${Math.round((salidasVolvieron.length / salidas.length) * 100)}% de las veces`}
                />
                <Numero
                    icono={<Coins className="w-3 h-3" />}
                    etiqueta="Facturaste"
                    valor={plata(manualPlata)}
                    tono="green"
                    detalle="en esas vueltas"
                />
            </div>
            {entrante.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    Aparte, {entrante.length} {entrante.length === 1 ? "vuelta" : "vueltas"} por{" "}
                    {plata(entrantePlata)} las trajo gente que te escribió primero. Es plata tuya, pero
                    no la fuiste a buscar vos: por eso no se cuenta acá.
                </p>
            )}
        </div>
    );

    // Sin recontactos todavía no hay nada que contar. Un panel de ceros no
    // motiva, desmoraliza.
    //
    // 🔴 PERO SOLO SI TAMPOCO HAY NADA A MANO. Este cartel era el bug que sentía
    // Iara: Probikes mandó 0 mensajes por el sistema y 791 desde el celular, así
    // que veía "todavía no recontactaste a nadie" con seis meses de recontactos
    // encima.
    if (filas.length === 0 && salidas.length === 0) {
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

    if (filas.length === 0) {
        return (
            <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white">
                <CardContent className="p-4 space-y-1">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                            Lo que trajeron tus mensajes · últimos 90 días
                        </h3>
                    </div>
                    <p className="text-xs text-muted-foreground pb-1">
                        Todavía no mandaste ninguno desde el sistema. Esto es lo que trajeron los que
                        escribiste a mano.
                    </p>
                    {bloqueManual}
                    <ComoFunciona titulo="Cómo se cuenta" className="border-t pt-2 mt-2">
                        <p>
                            Son los clientes que volvieron <span className="font-medium">después</span> del
                            mensaje, dentro de los 45 días. Algunos habrían vuelto igual: el número no dice
                            que volvieron <span className="font-medium">por</span> el mensaje.
                        </p>
                    </ComoFunciona>
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
                        etiqueta="Mandaste desde el sistema"
                        valor={String(recontactados)}
                        detalle="mensajes"
                    />
                    <Numero
                        icono={<MessageSquare className="w-3 h-3" />}
                        etiqueta="Respondieron tu mensaje"
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
                            <ComoFunciona titulo="Ojo con este número" className="mt-2">
                                <p>
                                    Todavía son pocos mensajes por versión: la diferencia puede ser casualidad.
                                    Con unos 20 de cada una el número empieza a decir algo.
                                </p>
                            </ComoFunciona>
                        )}
                    </div>
                )}

                {/* 🔴 El caso de Probikes, y el que más importa: arriba una fila de
                    ceros y abajo plata de verdad. El cero es cierto —no mandaron
                    ninguno desde el sistema— pero leído solo dice "esto no sirve".
                    Dicho así dice lo que realmente pasa, que es otra cosa. */}
                {volvieron === 0 && salidasVolvieron.length > 0 && (
                    <p className="text-[11px] text-muted-foreground -mt-2 flex items-start gap-1">
                        <Info className="w-3 h-3 mt-0.5 shrink-0" />
                        Los de arriba están en cero porque casi no mandás mensajes desde el sistema.
                        Los que mandás a mano sí traen gente: mandándolos desde acá, además sabés
                        quién lo leyó y quién no te contestó.
                    </p>
                )}

                {bloqueManual}

                <ComoFunciona titulo="Cómo se cuenta" className="border-t pt-2">
                    <p>
                        Son los clientes que volvieron <span className="font-medium">después</span> del contacto,
                        dentro de los 45 días. Algunos habrían vuelto igual: el número no dice que volvieron
                        <span className="font-medium"> por</span> el mensaje.
                    </p>
                </ComoFunciona>
            </CardContent>
        </Card>
    );
}
