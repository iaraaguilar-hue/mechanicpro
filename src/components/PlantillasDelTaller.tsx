// ─────────────────────────────────────────────────────────────
// EL TALLER PIDE SU PROPIA PLANTILLA, Y SE MANDA SOLA A META.
//
// Pedido de Iara, 5-sep-2026, textual: "que el mecánico pueda mandar 'che, quiero
// agregar esta plantilla de mensajes' y que se mande automáticamente a Meta, como
// si yo te lo estuviera pidiendo (…) desde el momento que el mecánico lo pide, ya
// se manda a Meta y esperamos a que lo aprueben".
//
// Lo que había hasta hoy en esta misma pantalla, textual: "escribinos y lo
// mandamos a aprobar". O sea: el taller tenía la idea, le escribía a Iara, e Iara
// abría el panel de Meta a las once de la noche. Esta pantalla es la que saca a la
// persona del medio — y ese texto se borró, porque un cartel que manda a escribir
// a alguien cuando ya hay un botón es peor que no tener el botón.
//
// ─────────────────────────────────────────────────────────────
// LAS TRES COSAS QUE ESTA PANTALLA TIENE QUE DEJAR CLARAS
//
// 1. QUE MANDARLA **ES** PEDIR LA APROBACIÓN. No hay un paso de "guardar" y otro
//    de "enviar a revisar": apenas se crea queda en revisión. Si no se dice, el
//    mecánico ve "pendiente" y entiende "falta que yo haga algo". Le pasó a Iara
//    misma, que preguntó "¿ya pedimos aprobación o todavía no hicimos nada?".
//
// 2. QUE ESPERAR ES NORMAL Y NO ES UN ERROR. Meta suele tardar menos de un día.
//    Mientras tanto la plantilla no se puede usar ni editar.
//
// 3. QUE EL TEXTO TIENE REGLAS RARAS QUE NO SON NUESTRAS. Un campo no puede ir al
//    principio ni al final, ni dos pegados. La validación corre mientras escribe y
//    explica el porqué, en vez de dejar que Meta rechace un día después: cada
//    rechazo es una revisión perdida y un mecánico que no entiende qué hizo mal.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TallerData } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
    Loader2, Plus, Save, X, FileText, Clock, CheckCircle2, XCircle, PauseCircle,
    RefreshCw, Trash2, Pencil,
} from 'lucide-react';
import {
    CAMPOS, CAMPOS_VALIDOS, LARGO_MAXIMO, validarCuerpo, vistaPreviaDeCuerpo,
    camposDelCuerpo, type Campo,
} from '@/lib/plantillasTaller';

export type PlantillaDelTaller = {
    id: string;
    titulo: string;
    nombre_meta: string;
    cuerpo: string;
    variables: string[];
    evento: 'service_finalizado' | 'bici_entregada' | 'cualquiera' | 'manual';
    cuando_texto: string | null;
    lleva_pdf: boolean;
    categoria: 'UTILITY' | 'MARKETING';
    estado: 'pendiente' | 'aprobada' | 'rechazada' | 'pausada' | 'deshabilitada' | 'error';
    motivo: string | null;
    enviada_at: string;
};

const CUANDO: Record<PlantillaDelTaller['evento'], string> = {
    service_finalizado: 'Sale sola cuando termina el service',
    bici_entregada: 'Sale sola cuando se entrega la bici',
    cualquiera: 'Sale sola en los dos momentos',
    // No hay disparador para esto todavía. Se dice así y no "sin configurar":
    // la plantilla funciona, lo que falta es que salga sola.
    manual: 'La mandás vos cuando quieras',
};

/**
 * Cómo se muestra cada estado.
 *
 * `pendiente` dice "Meta la está revisando" y no "pendiente" a secas: la palabra
 * sola se lee como "pendiente de que YO haga algo", que es exactamente lo
 * contrario de lo que pasa.
 */
const ESTADOS: Record<PlantillaDelTaller['estado'], {
    texto: string; clase: string; Icono: typeof Clock; ayuda: string;
}> = {
    pendiente: {
        texto: 'Meta la está revisando',
        clase: 'bg-amber-50 text-amber-800 border-amber-200',
        Icono: Clock,
        ayuda: 'Ya se la mandamos. Suele contestar en menos de un día. Mientras tanto no se puede usar ni editar.',
    },
    aprobada: {
        texto: 'Lista para usar',
        clase: 'bg-green-50 text-green-800 border-green-200',
        Icono: CheckCircle2,
        ayuda: 'Ya podés elegirla arriba, en cualquiera de tus avisos automáticos.',
    },
    rechazada: {
        texto: 'Meta la rechazó',
        clase: 'bg-red-50 text-red-800 border-red-200',
        Icono: XCircle,
        ayuda: 'Corregí el texto y volvé a mandarla. No perdés nada: se corrige la misma plantilla.',
    },
    pausada: {
        texto: 'Meta la pausó',
        clase: 'bg-slate-100 text-slate-700 border-slate-200',
        Icono: PauseCircle,
        ayuda: 'Meta la frenó porque varios clientes la bloquearon o la reportaron. Se despausa sola, o se reescribe.',
    },
    deshabilitada: {
        texto: 'Meta la dio de baja',
        clase: 'bg-slate-100 text-slate-700 border-slate-200',
        Icono: PauseCircle,
        ayuda: 'Esta plantilla ya no se puede mandar. Creá una nueva con otro texto.',
    },
    error: {
        texto: 'No llegó a Meta',
        clase: 'bg-red-50 text-red-800 border-red-200',
        Icono: XCircle,
        ayuda: 'No es que la rechazaran: no llegamos a mandarla. Revisá el motivo y probá de nuevo.',
    },
};

type Borrador = {
    id?: string;
    titulo: string;
    cuerpo: string;
    /** Cuándo la quiere usar, EN SUS PALABRAS. Es lo que el mecánico escribe. */
    cuandoTexto: string;
    /** A qué momento de los que existen se parece. Lo dice la IA, lo confirma él. */
    evento: PlantillaDelTaller['evento'];
    /** Lo que va a `pedidos_del_taller` cuando no se parece a ninguno. */
    resumen?: string | null;
    lleva_pdf: boolean;
    categoria: 'UTILITY' | 'MARKETING';
    estadoPrevio?: PlantillaDelTaller['estado'];
};

const EN_BLANCO: Borrador = {
    titulo: '', cuerpo: '', cuandoTexto: '', evento: 'manual',
    lleva_pdf: false, categoria: 'UTILITY',
};

export function PlantillasDelTaller({ taller, plantillas, recargar, avisar, waListo }: {
    taller: TallerData;
    plantillas: PlantillaDelTaller[];
    recargar: () => Promise<void> | void;
    avisar: (tipo: 'ok' | 'error', msg: string) => void;
    waListo: boolean;
}) {
    const [borrador, setBorrador] = useState<Borrador | null>(null);
    const [mandando, setMandando] = useState(false);
    const [refrescando, setRefrescando] = useState(false);

    /** Le pregunta a Meta en qué quedó cada una. Ver la nota del botón, más abajo. */
    const refrescar = async () => {
        setRefrescando(true);
        const { error } = await supabase.functions.invoke('plantillas-taller', {
            body: { accion: 'refrescar' },
        });
        setRefrescando(false);
        if (error) return avisar('error', 'No pudimos consultarle a Meta ahora. Probá en un rato.');
        await recargar();
    };

    const mandar = async () => {
        if (!borrador) return;
        if (borrador.titulo.trim().length < 3) return avisar('error', 'Ponele un nombre para reconocerla en tu lista.');
        const problema = validarCuerpo(borrador.cuerpo);
        if (problema) return avisar('error', problema);

        setMandando(true);
        const { data, error } = await supabase.functions.invoke('plantillas-taller', {
            body: {
                accion: borrador.id ? 'corregir' : 'crear',
                id: borrador.id,
                titulo: borrador.titulo.trim(),
                cuerpo: borrador.cuerpo.trim(),
                cuando_texto: borrador.cuandoTexto.trim(),
                evento: borrador.evento,
                // Lo que la IA entendió que le faltaría al sistema. Solo viaja
                // cuando no hay disparador: es lo que se lee después en la bandeja.
                resumen: borrador.evento === 'manual' ? (borrador.resumen ?? null) : null,
                lleva_pdf: borrador.lleva_pdf,
                categoria: borrador.categoria,
            },
        });
        setMandando(false);

        // El detalle del error viene en el cuerpo de la respuesta, no en el mensaje
        // de `error` (que dice "Edge Function returned a non-2xx status code" y no
        // le sirve a nadie). Hay que leerlo del context.
        if (error || (data && data.error)) {
            const detalle = data?.detalle
                ?? (await (error as any)?.context?.json?.().catch(() => null))?.detalle
                ?? 'No pudimos mandarla. Probá de nuevo.';
            return avisar('error', detalle);
        }

        setBorrador(null);
        await recargar();
        avisar('ok', 'Se la mandamos a Meta. Te avisamos acá cuando contesten, suele ser en menos de un día.');
    };

    const archivar = async (p: PlantillaDelTaller) => {
        const { data, error } = await supabase.functions.invoke('plantillas-taller', {
            body: { accion: 'archivar', id: p.id },
        });
        if (error || data?.error) {
            const detalle = data?.detalle
                ?? (await (error as any)?.context?.json?.().catch(() => null))?.detalle
                ?? 'No se pudo sacar de la lista.';
            return avisar('error', detalle);
        }
        await recargar();
        avisar('ok', 'La sacamos de tu lista.');
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-base">Tus plantillas</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                            Si te falta un aviso que no está en la lista de arriba, escribilo acá y se lo
                            mandamos a Meta al toque. Cuando lo aprueben te aparece para usar.
                        </p>
                    </div>
                    {/* Se le pregunta a Meta a mano además de esperar su aviso.
                        Meta avisa solo cuando resuelve, pero un aviso que no llega se ve
                        igual que "todavía no contestaron": este botón es la forma de
                        saber que la respuesta es de ahora. */}
                    <Button variant="ghost" size="sm" onClick={refrescar} disabled={refrescando || !waListo}>
                        {refrescando
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RefreshCw className="h-4 w-4" />}
                        <span className="ml-1 hidden sm:inline">Actualizar</span>
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {plantillas.length === 0 && !borrador && (
                    <p className="text-sm text-muted-foreground italic">
                        Todavía no pediste ninguna.
                    </p>
                )}

                {plantillas.map((p) => {
                    const e = ESTADOS[p.estado];
                    const enRevision = p.estado === 'pendiente';
                    return (
                        <div key={p.id} className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm">{p.titulo}</span>
                                        <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${e.clase}`}>
                                            <e.Icono className="h-3 w-3" /> {e.texto}
                                        </span>
                                        {p.lleva_pdf && (
                                            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                                <FileText className="h-3 w-3" /> con el PDF
                                            </span>
                                        )}
                                        {/* MARKETING cuesta ~2,4× más por conversación en Argentina
                                            y el cliente puede haber optado por no recibirlo. Que se
                                            vea: la decisión final la toma Meta, no nosotros. */}
                                        {p.categoria === 'MARKETING' && (
                                            <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">
                                                Meta la cobra como publicidad
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {CUANDO[p.evento]}
                                        {/* Lo que escribió con sus palabras, si no coincide con
                                            la etiqueta. Es lo que le permite reconocer SU plantilla
                                            seis meses después, cuando "cuando se entrega la bici"
                                            ya no le dice nada. */}
                                        {p.cuando_texto && (
                                            <span className="italic"> · «{p.cuando_texto}»</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                                        {vistaPreviaDeCuerpo(p.cuerpo, {
                                            taller: taller.nombre,
                                            firma: taller.firma_nombre || undefined,
                                        })}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button
                                        variant="ghost" size="sm" disabled={enRevision}
                                        title={enRevision ? 'Meta la está revisando: no deja editarla hasta que conteste' : 'Editar'}
                                        onClick={() => setBorrador({
                                            id: p.id, titulo: p.titulo, cuerpo: p.cuerpo, evento: p.evento,
                                            cuandoTexto: p.cuando_texto ?? '',
                                            lleva_pdf: p.lleva_pdf, categoria: p.categoria, estadoPrevio: p.estado,
                                        })}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => archivar(p)} aria-label="Sacar de la lista">
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground">{e.ayuda}</p>
                            {p.motivo && (
                                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                                    <strong>Lo que dijo Meta:</strong> {p.motivo}
                                </p>
                            )}
                        </div>
                    );
                })}

                {borrador ? (
                    <EditorDePlantilla
                        borrador={borrador}
                        taller={taller}
                        mandando={mandando}
                        onCambio={setBorrador}
                        onMandar={mandar}
                        onCancelar={() => setBorrador(null)}
                    />
                ) : (
                    <Button
                        variant="outline" size="sm" disabled={!waListo}
                        title={waListo ? undefined : 'Conectá tu WhatsApp primero: la plantilla se crea en tu propia cuenta'}
                        onClick={() => setBorrador({ ...EN_BLANCO })}
                    >
                        <Plus className="h-4 w-4 mr-1" /> Pedir una plantilla nueva
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}

function EditorDePlantilla({ borrador, taller, mandando, onCambio, onMandar, onCancelar }: {
    borrador: Borrador; taller: TallerData; mandando: boolean;
    onCambio: (b: Borrador) => void; onMandar: () => void; onCancelar: () => void;
}) {
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const problema = borrador.cuerpo.trim() ? validarCuerpo(borrador.cuerpo) : null;

    // ── Lo que la IA leyó del «cuándo».
    const [lectura, setLectura] = useState<{ evento: Borrador['evento'] | null; pregunta?: string | null; resumen?: string | null } | null>(null);
    const [interpretando, setInterpretando] = useState(false);
    const [confirmado, setConfirmado] = useState(!!borrador.id);
    const [aMano, setAMano] = useState(false);
    // Contra qué texto se interpretó la última vez. Sin esto, cada vez que el
    // mecánico toca el campo y sale sin cambiar nada se paga otra llamada.
    const yaLeido = useRef<string>(borrador.cuandoTexto);

    const interpretar = async () => {
        const texto = borrador.cuandoTexto.trim();
        if (texto.length < 8 || texto === yaLeido.current) return;
        yaLeido.current = texto;
        setInterpretando(true);
        setConfirmado(false);
        const { data, error } = await supabase.functions.invoke('plantillas-taller', {
            body: { accion: 'interpretar', cuando_texto: texto },
        });
        setInterpretando(false);
        // Si la IA no contesta no se rompe nada: se ofrece elegir a mano. Trabar la
        // creación de una plantilla porque un modelo no respondió sería cambiar un
        // desplegable molesto por una pantalla que no deja avanzar.
        if (error || !data?.ok) { setAMano(true); return; }
        setLectura({ evento: data.evento ?? null, pregunta: data.pregunta, resumen: data.resumen });
        if (!data.evento) onCambio({ ...borrador, evento: 'manual', resumen: data.resumen ?? texto });
    };

    // La salida de emergencia de la lista de botones (Iara: "una forma de decir:
    // che, hay algo que no está acá").
    const [pidiendo, setPidiendo] = useState(false);
    const [pedido, setPedido] = useState('');
    const [pedidoHecho, setPedidoHecho] = useState(false);

    const mandarPedido = async () => {
        const texto = pedido.trim();
        if (texto.length < 3) return;
        await supabase.functions.invoke('plantillas-taller', {
            body: { accion: 'pedir', tipo: 'campo', texto, plantilla_id: borrador.id ?? null },
        });
        setPedidoHecho(true);
        setPidiendo(false);
        setPedido('');
    };

    const previa = vistaPreviaDeCuerpo(borrador.cuerpo, {
        taller: taller.nombre,
        firma: taller.firma_nombre || undefined,
    });

    // Solo los avisos de los campos que metió, sin repetir. Mostrarlos todos
    // siempre sería una pared de advertencias que nadie lee.
    const avisosDeCampos = [...new Set(
        camposDelCuerpo(borrador.cuerpo)
            .map((c) => CAMPOS[c as Campo]?.siFalta)
            .filter(Boolean) as string[],
    )];

    /**
     * Mete el campo DONDE ESTÁ EL CURSOR, no al final.
     *
     * Que se pegue al final obliga a cortar y pegar a mano, y es justo donde se
     * rompe la regla de Meta de "no puede terminar con un campo".
     */
    // 🔴 El cursor se reposiciona en un `useEffect` y NO en un `requestAnimationFrame`.
    // Con el RAF hay una ventana de un frame entre que React pinta el texto nuevo y
    // que se mueve el cursor: si el mecánico empieza a tipear justo ahí, esas teclas
    // se escriben en la posición vieja y se pierden al reordenarse el estado. Se vio
    // en el QA con Playwright, que tipea al instante. Un dedo humano tarda más, pero
    // "casi nunca pasa" no es "no pasa", y el síntoma sería una letra que desaparece
    // sin explicación — de las peores de reportar y de reproducir.
    const cursorPendiente = useRef<number | null>(null);

    useEffect(() => {
        if (cursorPendiente.current == null) return;
        const pos = cursorPendiente.current;
        cursorPendiente.current = null;
        const area = areaRef.current;
        if (!area) return;
        area.focus();
        area.setSelectionRange(pos, pos);
    }, [borrador.cuerpo]);

    const insertar = (campo: Campo) => {
        const area = areaRef.current;
        const texto = borrador.cuerpo;
        const desde = area?.selectionStart ?? texto.length;
        const hasta = area?.selectionEnd ?? texto.length;
        const token = `{{${campo}}}`;
        cursorPendiente.current = desde + token.length;
        onCambio({ ...borrador, cuerpo: texto.slice(0, desde) + token + texto.slice(hasta) });
    };

    return (
        <div className="p-4 rounded-lg border-2 border-slate-300 bg-slate-50 space-y-4">
            <div className="space-y-2">
                <Label>¿Cómo la llamás?</Label>
                <Input
                    value={borrador.titulo}
                    onChange={(e) => onCambio({ ...borrador, titulo: e.target.value })}
                    placeholder="Aviso de que falta un repuesto"
                />
                <p className="text-xs text-muted-foreground">Es para tu lista. El cliente no lo ve.</p>
            </div>

            {/* ── EL «CUÁNDO», ESCRITO CON PALABRAS.
                Acá había un desplegable con tres opciones. Iara, 5-sep-2026:
                *"yo lo haría como que el mecánico escriba lo que él quiera y que ya
                después vos lo interpretes (…) porque si se les ocurre una acción que
                no hay, es como que no tiene sentido; o poner todas las acciones
                posibles, pero va a ser demasiada información"*.

                La lista cerrada no fallaba por corta: fallaba porque a lo que no
                estaba en ella le decía que no existe. Escrito con palabras, lo que
                todavía no podemos disparar QUEDA ANOTADO, que es lo único que nos
                dice qué construir después. */}
            <div className="space-y-2">
                <Label>¿Cuándo querés que salga?</Label>
                <textarea
                    className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={borrador.cuandoTexto}
                    onChange={(e) => onCambio({ ...borrador, cuandoTexto: e.target.value })}
                    onBlur={interpretar}
                    placeholder="Contalo como se lo dirías a alguien. Por ejemplo: cuando termino la bici y queda lista para que la vengan a buscar."
                />

                {interpretando && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" /> Fijándonos si lo podemos hacer solo…
                    </p>
                )}

                {/* La IA lo reconoció: se PREGUNTA, no se asume. Mandar el mensaje en
                    el momento equivocado es peor que preguntar de más. */}
                {!interpretando && lectura?.evento && !confirmado && (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
                        <p className="text-sm text-sky-900">
                            {lectura.pregunta || `Lo mandamos ${CUANDO[lectura.evento].toLowerCase()}. Es eso?`}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                type="button" size="sm"
                                onClick={() => { onCambio({ ...borrador, evento: lectura.evento!, resumen: null }); setConfirmado(true); }}
                            >
                                Sí, es eso
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setAMano(true)}>
                                No, dejame elegir
                            </Button>
                        </div>
                    </div>
                )}

                {/* No mapea a nada. Se dice completo y sin vueltas: qué NO se puede,
                    qué SÍ se puede igual, y que el pedido queda anotado. Un cartel de
                    "no se puede" a secas es donde el mecánico deja de escribir. */}
                {!interpretando && lectura && !lectura.evento && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                        {lectura.pregunta && <p className="text-sm text-amber-900">{lectura.pregunta}</p>}
                        <p className="text-sm text-amber-900">
                            <strong>Eso todavía no lo sabemos disparar solo.</strong> Te creamos igual la
                            plantilla y la mandás vos cuando quieras, y nos queda anotado que la querés
                            automática.
                        </p>
                        <button
                            type="button"
                            className="text-xs text-amber-900 underline underline-offset-2"
                            onClick={() => setAMano(true)}
                        >
                            O elegí a mano uno de los momentos que ya andan
                        </button>
                    </div>
                )}

                {confirmado && borrador.evento !== 'manual' && (
                    <p className="text-xs text-green-800 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {CUANDO[borrador.evento]}.
                    </p>
                )}

                {/* La salida a mano existe siempre: si la IA no está o se equivoca, el
                    taller no puede quedar trabado sin poder elegir. */}
                {aMano && (
                    <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={borrador.evento}
                        onChange={(e) => { onCambio({ ...borrador, evento: e.target.value as Borrador['evento'] }); setConfirmado(true); }}
                    >
                        <option value="manual">La mando yo cuando quiera</option>
                        <option value="service_finalizado">Sola, cuando termina el service</option>
                        <option value="bici_entregada">Sola, cuando se entrega la bici</option>
                        <option value="cualquiera">Sola, en los dos momentos</option>
                    </select>
                )}
                {!aMano && !lectura && !interpretando && (
                    <button
                        type="button"
                        className="text-xs text-muted-foreground underline underline-offset-2"
                        onClick={() => setAMano(true)}
                    >
                        Prefiero elegirlo de una lista
                    </button>
                )}
            </div>

            <div className="space-y-2">
                <Label>El mensaje</Label>
                <textarea
                    ref={areaRef}
                    className="w-full min-h-[110px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={borrador.cuerpo}
                    onChange={(e) => onCambio({ ...borrador, cuerpo: e.target.value })}
                    placeholder="Hola {{cliente}}, soy {{firma}} de {{taller}}. Estamos esperando un repuesto para tu {{bici}} y por eso va a demorar unos días. Te aviso apenas llegue."
                />
                <div className="flex flex-wrap gap-1.5">
                    {CAMPOS_VALIDOS.map((c) => (
                        <Button
                            key={c} type="button" variant="outline" size="sm"
                            className="h-7 text-xs"
                            title={CAMPOS[c].ayuda}
                            onClick={() => insertar(c)}
                        >
                            <Plus className="h-3 w-3 mr-1" /> {CAMPOS[c].etiqueta}
                        </Button>
                    ))}
                    {/* La salida de emergencia. Iara, 5-sep-2026: *"una forma de decir:
                        che, hay algo que no está acá"*. Sin esto, el mecánico que
                        necesita un dato que no ofrecemos se queda mirando la pantalla y
                        nosotros no nos enteramos nunca — y ese es el pedido más valioso
                        que existe: un cliente diciendo qué le falta, justo cuando le
                        hace falta. */}
                    <Button
                        type="button" variant="ghost" size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => setPidiendo((v) => !v)}
                    >
                        Falta el que necesito
                    </Button>
                </div>

                {pidiendo && (
                    <div className="rounded-lg border border-slate-300 bg-white p-3 space-y-2">
                        <Label className="text-xs">¿Qué dato te falta?</Label>
                        <Input
                            value={pedido}
                            onChange={(e) => setPedido(e.target.value)}
                            placeholder="La fecha en que la puede venir a buscar"
                        />
                        <div className="flex gap-2">
                            <Button type="button" size="sm" onClick={mandarPedido} disabled={pedido.trim().length < 3}>
                                Mandarlo
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setPidiendo(false)}>
                                Cancelar
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            No lo podemos agregar en el momento, pero nos llega y lo miramos.
                        </p>
                    </div>
                )}
                {pedidoHecho && (
                    <p className="text-xs text-green-800 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Nos llegó. Gracias, sirve más de lo que parece.
                    </p>
                )}

                <p className="text-xs text-muted-foreground">
                    Los botones meten datos que se completan solos con cada service. Todo lo demás lo
                    escribís vos y sale siempre igual. {borrador.cuerpo.trim().length}/{LARGO_MAXIMO}
                </p>

                {/* 🔴 Lo que pasa si el dato no está cargado, dicho ANTES y solo de los
                    campos que se usaron. Medido contra las 352 órdenes reales de
                    Probikes: «lo que se hizo» está vacío en el 89% de las órdenes, así
                    que ofrecerlo callado es regalar un aviso que falla 9 de cada 10
                    veces y que nadie sabe por qué no salió. */}
                {avisosDeCampos.length > 0 && (
                    <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
                        {avisosDeCampos.map((a) => <p key={a}>{a}</p>)}
                    </div>
                )}
                {problema && (
                    <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{problema}</p>
                )}
            </div>

            {/* ¿UTILITY o MARKETING? Se pregunta en criollo y no con el nombre de Meta.
                Importa por dos motivos que sí le tocan el bolsillo al taller: la
                publicidad se cobra ~2,4× más por conversación, y el cliente que optó
                por no recibirla no la recibe. Pedir el tipo correcto de entrada evita
                el rechazo por "categoría incorrecta". */}
            <div className="space-y-2">
                <Label>¿Qué hace este mensaje?</Label>
                <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={borrador.categoria}
                    onChange={(e) => onCambio({ ...borrador, categoria: e.target.value as 'UTILITY' | 'MARKETING' })}
                >
                    <option value="UTILITY">Le cuenta algo del service que ya le estamos haciendo</option>
                    <option value="MARKETING">Le ofrece algo que todavía no pidió</option>
                </select>
                <p className="text-xs text-muted-foreground">
                    {borrador.categoria === 'UTILITY'
                        ? 'Es lo más barato y lo que Meta aprueba más rápido. Si el mensaje ofrece algo, elegí la otra opción: si no, te la puede rechazar por eso.'
                        : 'Meta lo cobra como publicidad (bastante más caro por conversación) y no le llega a quien pidió no recibirla.'}
                </p>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch
                    checked={borrador.lleva_pdf}
                    onCheckedChange={(v) => onCambio({ ...borrador, lleva_pdf: v })}
                />
                Que pueda llevar el comprobante en PDF
            </label>
            {/* 🔴 El encabezado se declara AL CREAR o no existe nunca. Una plantilla
                aprobada sin él no puede llevar el PDF y no hay forma de agregárselo
                después: hay que crear otra. Por eso se avisa acá y no en el error. */}
            <p className="text-xs text-muted-foreground -mt-2">
                Decidilo ahora: esto no se puede agregar después de que Meta la apruebe.
            </p>

            {borrador.cuerpo.trim() && !problema && (
                <div className="space-y-1.5">
                    <Label className="text-xs">Así le llega</Label>
                    <div className="rounded-lg bg-[#dcf8c6] p-3 text-sm text-slate-800 whitespace-pre-wrap">
                        {borrador.lleva_pdf && (
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-black/10 text-xs text-slate-600">
                                <FileText className="h-4 w-4" /> Comprobante de service.pdf
                            </div>
                        )}
                        {previa}
                    </div>
                </div>
            )}

            {/* Editar una APROBADA la manda de nuevo a revisión y la deja fuera de
                servicio hasta que Meta conteste (hasta 24 hs). No es un bug que se
                pueda esquivar: es el precio. Se dice ANTES de apretar, no después. */}
            {borrador.estadoPrevio === 'aprobada' && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
                    Ojo: esta plantilla ya está aprobada. Si la cambiás, Meta la vuelve a revisar y
                    <strong> mientras tanto ese aviso no se puede mandar</strong> (puede tardar hasta un día).
                </p>
            )}

            <div className="flex gap-2 items-center flex-wrap">
                <Button onClick={onMandar} disabled={mandando || !!problema} size="sm">
                    {mandando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    {borrador.id ? 'Corregir y volver a mandarla' : 'Mandarla a aprobar'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onCancelar}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                {/* La frase que evita la pregunta "¿ya la pedimos o falta mandarla?". */}
                <span className="text-xs text-muted-foreground">
                    Al apretar se la mandamos a Meta y queda en revisión. No hay otro paso.
                </span>
            </div>
        </div>
    );
}
