// ─────────────────────────────────────────────────────────────
// Los mensajes que salen solos: la pantalla donde el taller decide cuáles.
//
// POR QUÉ ES UNA LISTA DE REGLAS Y NO DOS INTERRUPTORES:
// el pedido de Iara incluye, textual, "que el mecánico pueda agregar alguna por
// su cuenta que a nosotros no se nos ocurra". Dos checkboxes cubren los dos
// casos que previmos; una lista deja que el taller arme el suyo. El caso que lo
// obligó es real: en Probikes, al entregar la bici, Luis quiere que el
// comprobante le llegue al WhatsApp de la TIENDA (no al cliente) para gestionar
// el cobro. Mismo evento, otro destinatario.
//
// LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO, Y POR ESO MUESTRA LA VISTA PREVIA:
// fuera de la ventana de 24hs WhatsApp solo deja mandar textos que Meta aprobó.
// Así que el taller no escribe el mensaje entero: escribe SU PARTE (quién firma
// y una línea propia) dentro de un texto fijo. Si eso no se ve, el taller cree
// que puede escribir cualquier cosa y descubre el límite el día que no le
// funciona.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { TallerData } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, Save, MessageSquare, AlertCircle, FileText, X } from 'lucide-react';
import { PlantillasDelTaller, type PlantillaDelTaller } from '@/components/PlantillasDelTaller';
import { vistaPreviaDeCuerpo } from '@/lib/plantillasTaller';

// ── El catálogo, espejo de supabase/functions/_shared/plantillas.ts.
// Vive duplicado a propósito y con esta nota: el frontend no puede importar de
// una Edge Function. Si allá se agrega una plantilla, acá también.
const PLANTILLAS: Record<string, { cuerpo: string; conPdf: boolean; titulo: string }> = {
    bici_lista_pdf: {
        titulo: 'Ya está lista, con el comprobante',
        cuerpo: 'Hola {{1}}! Soy {{2}}, de {{3}}. Ya está lista tu {{4}}. Te paso el comprobante con el detalle del trabajo. {{5}} Cuando quieras la pasás a buscar.',
        conPdf: true,
    },
    comprobante_entrega_pdf: {
        titulo: 'Gracias + comprobante',
        cuerpo: 'Hola {{1}}! Soy {{2}}, de {{3}}. Te dejo el comprobante del service de tu {{4}}, con el detalle del trabajo. {{5}} Gracias por confiar en nosotros!',
        conPdf: true,
    },
    aviso_tienda_entrega: {
        titulo: 'Aviso interno (al número del negocio)',
        cuerpo: 'Bici entregada: {{1}} de {{2}}. Va el comprobante del service para la gestión del cobro.',
        conPdf: true,
    },
};

const EVENTOS: Record<string, { titulo: string; cuando: string; plantillas: string[] }> = {
    service_finalizado: {
        titulo: 'Cuando termina el service',
        cuando: 'En el momento en que el mecánico aprieta «Finalizar».',
        plantillas: ['bici_lista_pdf'],
    },
    bici_entregada: {
        titulo: 'Cuando se entrega la bici',
        cuando: 'En el momento en que se aprieta «Entregar», cuando el cliente la retira.',
        plantillas: ['comprobante_entrega_pdf', 'aviso_tienda_entrega'],
    },
};

const NOTA_POR_DEFECTO = 'Cualquier duda me escribís por acá.';

type Regla = {
    id: string;
    nombre: string;
    evento: string;
    destino: 'cliente' | 'numero_fijo';
    numero_fijo: string | null;
    plantilla: string;
    adjunta_pdf: boolean;
    nota: string | null;
    firma: string | null;
    activa: boolean;
};

/**
 * El mensaje tal cual lo va a leer la persona. Es lo que evita las sorpresas.
 *
 * Resuelve los dos orígenes: las plantillas del sistema (texto fijo, parámetros
 * en un orden que conocemos) y las que pidió el propio taller, que guardan los
 * campos por nombre ({{cliente}}, {{bici}}) porque es lo que el taller escribió.
 */
function vistaPrevia(
    regla: Partial<Regla>,
    taller: TallerData,
    propias: PlantillaDelTaller[] = [],
): string {
    const firma = (regla.firma ?? '').trim() || (taller.firma_nombre ?? '').trim() || (taller.nombre ?? '');
    const nota = (regla.nota ?? '').trim() || NOTA_POR_DEFECTO;

    const propia = propias.find((x) => x.nombre_meta === regla.plantilla);
    if (propia) {
        return vistaPreviaDeCuerpo(propia.cuerpo, {
            taller: taller.nombre, firma, nota,
        });
    }

    const p = PLANTILLAS[regla.plantilla ?? ''];
    if (!p) return '';
    const valores = regla.plantilla === 'aviso_tienda_entrega'
        ? ['Tarmac SL7', 'Martín Gómez']
        : ['Martín', firma, taller.nombre ?? '', 'Tarmac SL7', nota];
    return valores.reduce((t, v, i) => t.replaceAll(`{{${i + 1}}}`, v), p.cuerpo);
}

/**
 * Qué se puede elegir en "¿Qué se manda?" para este momento: las del sistema más
 * las que el taller pidió y Meta ya aprobó.
 *
 * Solo las aprobadas: una pendiente existe en Meta pero el envío rebotaría con
 * "(#132001) Template name does not exist in the translation", que dice "no
 * existe" y significa "todavía no la aprobaron". Ofrecerla sería armar un aviso
 * que falla el día que se dispara.
 */
function opcionesDePlantilla(evento: string, propias: PlantillaDelTaller[]) {
    const delSistema = (EVENTOS[evento]?.plantillas ?? [])
        .map((n) => ({ valor: n, titulo: PLANTILLAS[n]?.titulo ?? n, conPdf: PLANTILLAS[n]?.conPdf ?? false }));
    const delTaller = propias
        .filter((p) => p.estado === 'aprobada' && (p.evento === evento || p.evento === 'cualquiera'))
        .map((p) => ({ valor: p.nombre_meta, titulo: `${p.titulo} (tuya)`, conPdf: p.lleva_pdf }));
    return [...delSistema, ...delTaller];
}

export function MensajesAutomaticos({ taller, avisar }: {
    taller: TallerData;
    avisar: (tipo: 'ok' | 'error', msg: string) => void;
}) {
    const [reglas, setReglas] = useState<Regla[]>([]);
    const [propias, setPropias] = useState<PlantillaDelTaller[]>([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState<string | null>(null);
    const [nueva, setNueva] = useState<Partial<Regla> | null>(null);

    const cargarPropias = useCallback(async () => {
        const { data } = await supabase
            .from('plantillas_taller')
            .select('*')
            .order('creada_at', { ascending: true });
        setPropias((data as PlantillaDelTaller[]) ?? []);
    }, []);

    const cargar = useCallback(async () => {
        setCargando(true);
        const { data, error } = await supabase
            .from('automatizaciones_wa')
            .select('*')
            .order('creada_at', { ascending: true });
        if (error) avisar('error', 'No pudimos traer tus mensajes automáticos.');
        setReglas((data as Regla[]) ?? []);
        await cargarPropias();
        setCargando(false);
    }, [avisar, cargarPropias]);

    useEffect(() => { void cargar(); }, [cargar]);

    // ── Al abrir la pantalla se le pregunta a Meta en qué quedaron las plantillas.
    //
    // 🔴 POR QUÉ SE PREGUNTA Y NO SE ESPERA EL AVISO: Meta manda un webhook cuando
    // resuelve, y lo procesamos — pero un webhook que se cae, o cuyo campo no quedó
    // suscripto, se ve EXACTAMENTE igual que "todavía no contestaron". Nos pasó el
    // 3-sep con la carga del historial: el registro lo anotó como "carga bien" y
    // faltaba la mitad. Preguntar al abrir es lo que hace que el estado que ve el
    // mecánico sea de ahora y no de la última vez que algo funcionó.
    //
    // Va después de pintar y no bloquea: si Meta no contesta, se ve el último estado
    // conocido en vez de una pantalla colgada.
    useEffect(() => {
        let vivo = true;
        void (async () => {
            const { error } = await supabase.functions.invoke('plantillas-taller', {
                body: { accion: 'refrescar' },
            });
            if (vivo && !error) void cargarPropias();
        })();
        return () => { vivo = false; };
    }, [cargarPropias]);

    const guardar = async (regla: Partial<Regla>) => {
        if (!regla.nombre?.trim()) return avisar('error', 'Ponele un nombre para reconocerlo en la lista.');
        if (regla.destino === 'numero_fijo' && (regla.numero_fijo ?? '').replace(/\D/g, '').length < 8) {
            return avisar('error', 'Falta el número al que se manda este aviso.');
        }
        setGuardando(regla.id ?? 'nueva');
        const fila = {
            taller_id: taller.id,
            nombre: regla.nombre.trim(),
            evento: regla.evento,
            destino: regla.destino ?? 'cliente',
            numero_fijo: regla.destino === 'numero_fijo' ? regla.numero_fijo : null,
            plantilla: regla.plantilla,
            adjunta_pdf: regla.adjunta_pdf ?? true,
            nota: (regla.nota ?? '').trim() || null,
            firma: (regla.firma ?? '').trim() || null,
            activa: regla.activa ?? true,
            actualizada_at: new Date().toISOString(),
        };
        const { error } = regla.id
            ? await supabase.from('automatizaciones_wa').update(fila).eq('id', regla.id)
            : await supabase.from('automatizaciones_wa').insert(fila);
        setGuardando(null);
        if (error) return avisar('error', 'No se pudo guardar: ' + error.message);
        avisar('ok', 'Listo, quedó guardado.');
        setNueva(null);
        void cargar();
    };

    const borrar = async (id: string) => {
        const { error } = await supabase.from('automatizaciones_wa').delete().eq('id', id);
        if (error) return avisar('error', 'No se pudo borrar.');
        void cargar();
    };

    const alternar = async (regla: Regla, activa: boolean) => {
        setReglas((rs) => rs.map((r) => (r.id === regla.id ? { ...r, activa } : r)));
        const { error } = await supabase.from('automatizaciones_wa').update({ activa }).eq('id', regla.id);
        if (error) { avisar('error', 'No se pudo cambiar.'); void cargar(); }
    };

    const waListo = taller.wa_activo === true;

    return (
        <div className="space-y-6">
            {/* Sin WhatsApp conectado esto se puede configurar igual, pero no
                sale nada. Decirlo acá evita que alguien lo arme entero y se
                pregunte por qué el cliente nunca recibe. */}
            {!waListo && (
                <div className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                        Podés dejar todo configurado, pero <strong>no se va a mandar nada</strong> hasta
                        que conectes tu WhatsApp en la pestaña de al lado.
                    </span>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" /> Mensajes que salen solos
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        Cuando terminás o entregás un service, Mechanic Pro le puede escribir al cliente
                        desde tu WhatsApp, con el comprobante en PDF adjunto. Vos elegís qué se manda,
                        a quién y quién lo firma.
                    </p>
                    <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                        <p>
                            <strong>Una aclaración para que no te sorprenda:</strong> WhatsApp solo deja mandar
                            avisos con textos que Meta aprueba antes. Por eso el mensaje tiene una parte fija
                            y vos completás la tuya.
                        </p>
                        <p className="flex gap-2">
                            <span className="text-green-700 font-semibold flex-shrink-0">Al instante:</span>
                            <span>
                                cambiar <strong>quién firma</strong>, <strong>tu línea</strong> (cómo se paga, el
                                horario), a quién le llega, si adjunta el PDF, y prender o apagar cualquier aviso.
                                Eso no pasa por Meta: lo cambiás y ya sale así.
                            </span>
                        </p>
                        {/* 🔴 Acá decía "escribinos y lo mandamos a aprobar". Se borró el
                            5-sep-2026: ahora el taller lo manda solo desde «Tus plantillas»,
                            acá abajo. Un cartel que manda a escribirle a alguien cuando ya hay
                            un botón es peor que no tener el botón. */}
                        <p className="flex gap-2">
                            <span className="text-amber-700 font-semibold flex-shrink-0">Hasta 24 hs:</span>
                            <span>
                                cambiar el <strong>texto fijo</strong> o pedir un mensaje que no esté en la lista.
                                Eso lo tiene que aprobar Meta: escribilo abajo en <strong>Tus plantillas</strong> y
                                se lo mandamos en el momento. Suele contestar en menos de un día, y mientras
                                revisan ese aviso puntual no se puede mandar.
                            </span>
                        </p>
                        <p className="text-muted-foreground">
                            Y si el cliente te escribió hace menos de 24 horas, ahí le contestás lo que quieras
                            desde el celular, como siempre. Eso no necesita aprobación de nadie.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {cargando ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
                Object.entries(EVENTOS).map(([evento, cfg]) => {
                    const delEvento = reglas.filter((r) => r.evento === evento);
                    return (
                        <Card key={evento}>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">{cfg.titulo}</CardTitle>
                                <p className="text-xs text-muted-foreground">{cfg.cuando}</p>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {delEvento.length === 0 && (
                                    <p className="text-sm text-muted-foreground italic">
                                        Todavía no mandás nada en este momento.
                                    </p>
                                )}

                                {delEvento.map((regla) => (
                                    <FilaRegla
                                        key={regla.id}
                                        regla={regla}
                                        taller={taller}
                                        propias={propias}
                                        guardando={guardando === regla.id}
                                        onGuardar={guardar}
                                        onBorrar={() => borrar(regla.id)}
                                        onAlternar={(a) => alternar(regla, a)}
                                    />
                                ))}

                                {nueva?.evento === evento ? (
                                    <Editor
                                        regla={nueva}
                                        taller={taller}
                                        propias={propias}
                                        guardando={guardando === 'nueva'}
                                        onCambio={setNueva}
                                        onGuardar={() => guardar(nueva)}
                                        onCancelar={() => setNueva(null)}
                                    />
                                ) : (
                                    <Button
                                        variant="outline" size="sm"
                                        onClick={() => setNueva({
                                            nombre: '', evento, destino: 'cliente',
                                            plantilla: cfg.plantillas[0], adjunta_pdf: true, activa: true,
                                        })}
                                    >
                                        <Plus className="h-4 w-4 mr-1" /> Agregar un mensaje acá
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    );
                })
            )}

            {/* Va DEBAJO de los avisos y no arriba a propósito: primero se ve para qué
                sirven las plantillas (los avisos que ya se mandan), y recién después la
                opción de pedir una nueva. Al revés, la primera pantalla de un taller
                sería un formulario en blanco. */}
            {!cargando && (
                <PlantillasDelTaller
                    taller={taller}
                    plantillas={propias}
                    recargar={cargarPropias}
                    avisar={avisar}
                    waListo={waListo}
                />
            )}
        </div>
    );
}

function FilaRegla({ regla, taller, propias, guardando, onGuardar, onBorrar, onAlternar }: {
    regla: Regla; taller: TallerData; propias: PlantillaDelTaller[]; guardando: boolean;
    onGuardar: (r: Partial<Regla>) => void; onBorrar: () => void; onAlternar: (a: boolean) => void;
}) {
    const [editando, setEditando] = useState(false);
    const [borrador, setBorrador] = useState<Partial<Regla>>(regla);

    if (editando) {
        return (
            <Editor
                regla={borrador} taller={taller} propias={propias} guardando={guardando}
                onCambio={setBorrador}
                onGuardar={() => { onGuardar(borrador); setEditando(false); }}
                onCancelar={() => { setBorrador(regla); setEditando(false); }}
            />
        );
    }

    return (
        <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-white">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{regla.nombre}</span>
                    {regla.adjunta_pdf && (
                        <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            <FileText className="h-3 w-3" /> con el PDF
                        </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                        {regla.destino === 'cliente' ? 'al cliente' : `a ${regla.numero_fijo}`}
                    </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {vistaPrevia(regla, taller, propias)}
                </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                <Switch checked={regla.activa} onCheckedChange={onAlternar} />
                <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={onBorrar} aria-label="Borrar">
                    <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
            </div>
        </div>
    );
}

function Editor({ regla, taller, propias, guardando, onCambio, onGuardar, onCancelar }: {
    regla: Partial<Regla>; taller: TallerData; propias: PlantillaDelTaller[]; guardando: boolean;
    onCambio: (r: Partial<Regla>) => void; onGuardar: () => void; onCancelar: () => void;
}) {
    const previa = vistaPrevia(regla, taller, propias);
    const opciones = opcionesDePlantilla(regla.evento ?? '', propias);
    const elegida = opciones.find((o) => o.valor === regla.plantilla);
    const propia = propias.find((x) => x.nombre_meta === regla.plantilla);

    /**
     * Si el mensaje elegido usa este campo.
     *
     * En las del sistema depende del destinatario (el aviso interno a la tienda no
     * lleva firma ni nota). En las que escribió el taller depende de si puso el
     * campo o no: pedirle "quién firma" para un mensaje donde no aparece la firma es
     * hacerle completar un dato que no va a ninguna parte.
     */
    const usaCampo = (c: 'firma' | 'nota') =>
        propia ? (propia.variables ?? []).includes(c) : regla.destino === 'cliente';

    return (
        <div className="p-4 rounded-lg border-2 border-slate-300 bg-slate-50 space-y-4">
            <div className="space-y-2">
                <Label>¿Cómo lo llamamos?</Label>
                <Input
                    value={regla.nombre ?? ''}
                    onChange={(e) => onCambio({ ...regla, nombre: e.target.value })}
                    placeholder="Aviso de bici lista"
                />
                <p className="text-xs text-muted-foreground">Es solo para que lo reconozcas acá. El cliente no lo ve.</p>
            </div>

            <div className="space-y-2">
                <Label>¿Qué se manda?</Label>
                <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={regla.plantilla ?? ''}
                    onChange={(e) => {
                        const nueva = opciones.find((o) => o.valor === e.target.value);
                        // Si el mensaje nuevo no puede llevar el comprobante, se apaga el
                        // switch en el mismo movimiento: dejarlo prendido guardaría una
                        // regla que pide un PDF que la plantilla no tiene lugar para
                        // recibir, y eso falla recién el día que se dispara.
                        onCambio({
                            ...regla,
                            plantilla: e.target.value,
                            adjunta_pdf: nueva?.conPdf ? (regla.adjunta_pdf ?? true) : false,
                        });
                    }}
                >
                    {opciones.map((o) => (
                        <option key={o.valor} value={o.valor}>{o.titulo}</option>
                    ))}
                    {/* La que está guardada pero ya no está en la lista (la sacaste, o
                        Meta la dio de baja). Se muestra igual: si desapareciera del
                        select, el aviso se guardaría con otra plantilla sin avisar. */}
                    {regla.plantilla && !elegida && (
                        <option value={regla.plantilla}>{regla.plantilla} (ya no está disponible)</option>
                    )}
                </select>
                {regla.plantilla && !elegida && (
                    <p className="text-xs text-red-700">
                        Este mensaje ya no está disponible: elegí otro o este aviso no va a salir.
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <Label>¿A quién le llega?</Label>
                <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={regla.destino ?? 'cliente'}
                    onChange={(e) => onCambio({ ...regla, destino: e.target.value as Regla['destino'] })}
                >
                    <option value="cliente">Al cliente, el dueño de la bici</option>
                    <option value="numero_fijo">A un número tuyo (el mostrador, administración)</option>
                </select>
                {regla.destino === 'numero_fijo' && (
                    <>
                        <Input
                            value={regla.numero_fijo ?? ''}
                            onChange={(e) => onCambio({ ...regla, numero_fijo: e.target.value })}
                            placeholder="11 3125-1561"
                        />
                        <p className="text-xs text-muted-foreground">
                            Sirve para que el comprobante le llegue solo a la tienda y puedan cobrar sin
                            pedirlo. Tiene que ser un WhatsApp distinto del que conectaste.
                        </p>
                    </>
                )}
            </div>

            {usaCampo('firma') && (
                    <div className="space-y-2">
                        <Label>¿Quién lo firma?</Label>
                        <Input
                            value={regla.firma ?? ''}
                            onChange={(e) => onCambio({ ...regla, firma: e.target.value })}
                            placeholder={taller.firma_nombre || 'Leandro'}
                        />
                        <p className="text-xs text-muted-foreground">
                            El nombre de pila del que atiende. Es lo que hace que el cliente conteste en vez
                            de leerlo como un mensaje del sistema. Si lo dejás vacío, se usa el de
                            Configuración{taller.firma_nombre ? ` (${taller.firma_nombre})` : ''}.
                        </p>
                    </div>
            )}

            {usaCampo('nota') && (
                    <div className="space-y-2">
                        <Label>Tu línea, la que quieras agregar</Label>
                        <textarea
                            className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={regla.nota ?? ''}
                            onChange={(e) => onCambio({ ...regla, nota: e.target.value })}
                            placeholder="La mano de obra se abona en efectivo o transferencia."
                        />
                        <p className="text-xs text-muted-foreground">
                            Acá va lo que quieras decir siempre: cómo se paga, el horario, lo que sea. Si lo
                            dejás vacío se pone «{NOTA_POR_DEFECTO}».
                        </p>
                    </div>
            )}

            <label className={`flex items-center gap-2 text-sm ${elegida?.conPdf ? 'cursor-pointer' : 'opacity-60'}`}>
                <Switch
                    checked={(regla.adjunta_pdf ?? true) && !!elegida?.conPdf}
                    disabled={!elegida?.conPdf}
                    onCheckedChange={(v) => onCambio({ ...regla, adjunta_pdf: v })}
                />
                Adjuntar el comprobante en PDF
            </label>
            {/* 🔴 El encabezado de documento se declara al CREAR la plantilla o no
                existe nunca: una aprobada sin él no puede llevar el PDF y no hay forma
                de agregárselo. Por eso el switch se apaga solo y se explica, en vez de
                dejar prender algo que después rebota con un error de Meta. */}
            {!elegida?.conPdf && (
                <p className="text-xs text-muted-foreground -mt-2">
                    Este mensaje no se creó con el comprobante adjunto, así que no lo puede llevar.
                    Si lo necesitás, pedí una plantilla nueva marcando esa opción.
                </p>
            )}

            {previa && (
                <div className="space-y-1.5">
                    <Label className="text-xs">Así le llega</Label>
                    <div className="rounded-lg bg-[#dcf8c6] p-3 text-sm text-slate-800 whitespace-pre-wrap">
                        {regla.adjunta_pdf && (
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-black/10 text-xs text-slate-600">
                                <FileText className="h-4 w-4" /> Comprobante de service.pdf
                            </div>
                        )}
                        {previa}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        El nombre, la bici y el taller se completan solos con los datos de cada service.
                    </p>
                </div>
            )}

            <div className="flex gap-2">
                <Button onClick={onGuardar} disabled={guardando} size="sm">
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    Guardar
                </Button>
                <Button variant="ghost" size="sm" onClick={onCancelar}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
            </div>
        </div>
    );
}
