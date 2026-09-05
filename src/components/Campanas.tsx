// ─────────────────────────────────────────────────────────────
// LA PANTALLA DONDE UNA PERSONA MIRA LA CAMPAÑA Y LA MANDA.
//
// El chat arma el borrador; acá se aprueba. No es un paso de más: es EL paso.
//
// Un modelo que interpreta de más un "mandale a todos los que hace rato no
// vienen" no comete un error de estilo. Dispara mensajes que no se pueden
// despublicar, le cuestan plata al taller, y le bajan la calificación de calidad
// al número de WhatsApp —que es la que decide cuántos va a poder mandar de ahí en
// adelante—. El daño sobrevive al error.
//
// 🔴 POR ESO LA PANTALLA MUESTRA EL TEXTO EXACTO DE CADA UNO, y no un resumen.
// "Se le manda a 23 clientes la plantilla seguimiento_service" no se puede
// aprobar: nadie sabe qué dice. El texto de los primeros, con el nombre y la bici
// de cada uno adentro, sí — y es donde se ve el error antes de que salga.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Send, X, Megaphone, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from 'lucide-react';

type Campana = {
    id: string; nombre: string; plantilla: string; criterio: string | null;
    estado: 'borrador' | 'enviando' | 'enviada' | 'cancelada';
    creada_at: string; enviada_at: string | null;
};
type Destinatario = {
    id: string; cliente_id: string | null; telefono: string | null;
    parametros: string[]; estado: string; detalle: string | null;
    clientes?: { nombre: string } | null;
};

const ESTADOS: Record<Campana['estado'], { texto: string; clase: string }> = {
    borrador: { texto: 'Sin mandar', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
    enviando: { texto: 'Saliendo…', clase: 'bg-sky-50 text-sky-800 border-sky-200' },
    enviada: { texto: 'Mandada', clase: 'bg-green-50 text-green-800 border-green-200' },
    cancelada: { texto: 'Descartada', clase: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export function Campanas() {
    // El aviso vive adentro de la tarjeta y no en un toast global: esta pantalla
    // no tiene uno, y agregarle la plomería a Retención para dos mensajes sería
    // tocar un archivo de 700 líneas por nada.
    const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
    const avisar = (tipo: 'ok' | 'error', texto: string) => {
        setMensaje({ tipo, texto });
        setTimeout(() => setMensaje(null), 6000);
    };
    const [campanas, setCampanas] = useState<Campana[]>([]);
    const [cargando, setCargando] = useState(true);
    const [abierta, setAbierta] = useState<string | null>(null);
    const [gente, setGente] = useState<Record<string, Destinatario[]>>({});
    const [mandando, setMandando] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        const { data } = await supabase.from('campanas')
            .select('*').order('creada_at', { ascending: false }).limit(30);
        setCampanas((data as Campana[]) ?? []);
        setCargando(false);
    }, []);
    useEffect(() => { void cargar(); }, [cargar]);

    const abrir = async (c: Campana) => {
        if (abierta === c.id) { setAbierta(null); return; }
        setAbierta(c.id);
        if (gente[c.id]) return;
        const { data } = await supabase.from('campana_destinatarios')
            .select('*, clientes(nombre)').eq('campana_id', c.id).limit(200);
        setGente((g) => ({ ...g, [c.id]: (data as Destinatario[]) ?? [] }));
    };

    const mandar = async (c: Campana) => {
        setMandando(c.id);
        const { data, error } = await supabase.functions.invoke('campana', { body: { accion: 'enviar', id: c.id } });
        setMandando(null);
        if (error || data?.error) {
            const detalle = data?.detalle
                ?? (await (error as any)?.context?.json?.().catch(() => null))?.detalle
                ?? 'No se pudo mandar.';
            return avisar('error', detalle);
        }
        avisar('ok', `Salieron ${data.enviados}${data.fallidos ? `, y ${data.fallidos} fallaron` : ''}.`);
        setGente((g) => { const n = { ...g }; delete n[c.id]; return n; });
        void cargar();
    };

    const descartar = async (c: Campana) => {
        const { error } = await supabase.functions.invoke('campana', { body: { accion: 'cancelar', id: c.id } });
        if (error) return avisar('error', 'No se pudo descartar.');
        void cargar();
    };

    // Sin campañas no se dibuja nada: la mayoría de los talleres no va a usar esto
    // todos los días, y una tarjeta vacía permanente enseña a saltear esa parte.
    if (cargando || campanas.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Megaphone className="h-5 w-5" /> Campañas
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Las que armaste vos o le pediste al asistente. <strong>Nada sale hasta que lo
                    aprobás acá.</strong>
                </p>
            </CardHeader>

            <CardContent className="space-y-3">
                {mensaje && (
                    <p className={`text-sm rounded p-2 border ${mensaje.tipo === 'ok'
                        ? 'bg-green-50 text-green-800 border-green-200'
                        : 'bg-red-50 text-red-800 border-red-200'}`}>
                        {mensaje.texto}
                    </p>
                )}
                {campanas.map((c) => {
                    const e = ESTADOS[c.estado];
                    const lista = gente[c.id] ?? [];
                    const enviados = lista.filter((d) => d.estado === 'enviado').length;
                    const fallados = lista.filter((d) => d.estado === 'fallo').length;
                    return (
                        <div key={c.id} className="rounded-lg border border-slate-200 bg-white">
                            <button
                                type="button"
                                className="w-full flex items-start justify-between gap-3 p-3 text-left"
                                onClick={() => abrir(c)}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm">{c.nombre}</span>
                                        <span className={`text-[11px] px-1.5 py-0.5 rounded border ${e.clase}`}>{e.texto}</span>
                                    </div>
                                    {/* El criterio, en las palabras con que se armó. Es lo único
                                        que permite entender tres semanas después por qué esas
                                        personas y no otras. */}
                                    {c.criterio && <p className="text-xs text-muted-foreground mt-1">{c.criterio}</p>}
                                </div>
                                {abierta === c.id ? <ChevronUp className="h-4 w-4 mt-1" /> : <ChevronDown className="h-4 w-4 mt-1" />}
                            </button>

                            {abierta === c.id && (
                                <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
                                    {!gente[c.id] ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <p className="text-xs text-muted-foreground">
                                                {lista.length} {lista.length === 1 ? 'persona' : 'personas'}
                                                {c.estado === 'enviada' && ` · ${enviados} salieron${fallados ? `, ${fallados} fallaron` : ''}`}
                                            </p>

                                            {/* 🔴 El texto EXACTO de cada uno. Un resumen no se puede
                                                aprobar: nadie sabe qué dice. Acá es donde se ve el
                                                error antes de que salga. */}
                                            <div className="space-y-1.5 max-h-80 overflow-y-auto">
                                                {lista.map((d) => (
                                                    <div key={d.id} className="text-xs border border-slate-100 rounded p-2">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-medium">{d.clientes?.nombre ?? 'cliente'}</span>
                                                            <span className="text-muted-foreground">{d.telefono}</span>
                                                            {d.estado === 'enviado' && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                                                            {d.estado === 'fallo' && (
                                                                <span className="text-red-700 flex items-center gap-1">
                                                                    <AlertTriangle className="h-3 w-3" /> {d.detalle}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="rounded bg-[#dcf8c6] p-2 mt-1.5 text-slate-800">
                                                            <TextoDelMensaje plantilla={c.plantilla} parametros={d.parametros} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {c.estado === 'borrador' && (
                                                <div className="flex gap-2 items-center flex-wrap pt-1">
                                                    <Button size="sm" onClick={() => mandar(c)} disabled={mandando === c.id}>
                                                        {mandando === c.id
                                                            ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                                            : <Send className="h-4 w-4 mr-1" />}
                                                        Mandar a {lista.length}
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => descartar(c)}>
                                                        <X className="h-4 w-4 mr-1" /> Descartar
                                                    </Button>
                                                    <span className="text-xs text-muted-foreground">
                                                        Una vez que salen no se pueden dar de baja.
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}

/**
 * El mensaje armado con los parámetros de ESTE destinatario.
 *
 * El cuerpo se trae de `plantillas_taller` cuando es propia del taller, y si no
 * es una del sistema. Se resuelve por parámetro y no se guarda el texto armado en
 * la base a propósito: el texto tiene que salir del mismo lugar del que sale el
 * envío, o la pantalla podría estar mostrando algo distinto de lo que se manda.
 */
function TextoDelMensaje({ plantilla, parametros }: { plantilla: string; parametros: string[] }) {
    const [cuerpo, setCuerpo] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        void (async () => {
            const { data } = await supabase.from('plantillas_taller')
                .select('cuerpo').eq('nombre_meta', plantilla).maybeSingle();
            if (!vivo) return;
            // Una propia guarda los campos por nombre ({{cliente}}); se pasan a la
            // forma numerada para poder reemplazar por posición, igual que Meta.
            let c = data?.cuerpo ?? PLANTILLAS_DEL_SISTEMA[plantilla] ?? '';
            let i = 0;
            c = c.replace(/\{\{\s*[a-zA-Z_]+\s*\}\}/g, () => `{{${++i}}}`);
            setCuerpo(c);
        })();
        return () => { vivo = false; };
    }, [plantilla]);

    if (cuerpo === null) return <span className="text-muted-foreground">…</span>;
    if (!cuerpo) return <span className="text-muted-foreground">(no encontramos el texto de esta plantilla)</span>;
    return <>{parametros.reduce((t, v, i) => t.replaceAll(`{{${i + 1}}}`, v), cuerpo)}</>;
}

/**
 * 🚩 Espejo del catálogo de `supabase/functions/_shared/plantillas.ts`.
 * Solo los cuerpos, y solo para MOSTRAR: el envío usa el de Meta. Si allá se
 * agrega una, acá también — igual que en MensajesAutomaticos.tsx.
 */
const PLANTILLAS_DEL_SISTEMA: Record<string, string> = {
    recordatorio_mantenimiento: 'Hola {{1}}! Te escribo de {{2}} para recordarte que toca revisar {{3}} en tu {{4}}. Querés que coordinemos un turno?',
    comprobante_service: 'Hola {{1}}! Terminamos el service de tu {{2}} en {{3}}. Te dejamos el comprobante con el detalle de todo lo que hicimos. Gracias por confiar en nosotros!',
    seguimiento_evento: 'Hola {{1}}! Cómo te fue en {{2}}? Contanos cómo se portó la bici.',
    pre_carrera: 'Hola {{1}}! Vi que se acerca {{2}}, querés que le demos una revisada a tu {{3}} antes de viajar?',
    recontacto_personal: 'Hola {{1}}! Cómo va? Te escribo yo, {{2}}, por tu bici. {{3}} Si querés lo vemos, escribime por acá.',
    bici_lista_pdf: 'Hola {{1}}! Soy {{2}}, de {{3}}. Ya está lista tu {{4}}. Te paso el comprobante con el detalle del trabajo. {{5}} Cuando quieras la pasás a buscar.',
    comprobante_entrega_pdf: 'Hola {{1}}! Soy {{2}}, de {{3}}. Te dejo el comprobante del service de tu {{4}}, con el detalle del trabajo. {{5}} Gracias por confiar en nosotros!',
    aviso_tienda_entrega: 'Bici entregada: {{1}} de {{2}}. Va el comprobante del service para la gestión del cobro.',
    seguimiento_service: 'Hola {{1}}! Soy {{2}}, de {{3}}. Te escribo por el service que le hicimos a tu {{4}} y quería saber cómo la venís sintiendo, contame si notaste algo raro.',
};
