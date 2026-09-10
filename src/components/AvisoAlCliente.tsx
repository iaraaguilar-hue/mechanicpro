import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { tieneFeature } from '@/lib/planFeatures';
import { useDataStore, type ContactoOrden } from '@/store/dataStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { primerNombre, nombreBiciAmigable } from '@/lib/nombreAmigable';
import { instanteARConHora } from '@/lib/fechaAR';
import { soloNumeros } from '@/lib/telefonoAR';
import {
    HALLAZGOS, AVANCES, RESULTADO_DE_LLAMADA,
    comoLeVaALlegar, limpiarDetalle, estadoDeEspera, type ClaseDeAviso,
} from '@/lib/avisoDeLaOrden';
import {
    MessageSquare, Phone, Send, Loader2, Check, AlertTriangle, Clock, User, Wrench,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// «AVISARLE AL CLIENTE» — el panel que vive DENTRO de la orden.
//
// POR QUÉ (Ariel Leira, contado por Iara el 8-sep-2026, textual):
//   *"muchas veces lo llaman y no pueden avanzar con el service"*
//   *"muchas veces vienen a buscar la bici y le dicen todo lo que le falta"*
//   *"gente que viene a dejar la bici y no le contesta los mensajes, o no queda
//    registro de lo que se dijo"*
//
// Tres cosas, en este orden y no en otro:
//   1. MANDAR el aviso sin salir de la orden. Copiar un texto, abrir WhatsApp y
//      buscar el contacto son tres pasos con la bici abierta y las manos
//      sucias: por eso hoy no se manda nada y se llama.
//   2. QUE LA ORDEN QUEDE ESPERANDO. Una bici parada por el cliente hoy se ve
//      igual que una en curso, así que nadie sabe que está parada.
//   3. EL REGISTRO. Lo que se dijo, cuándo y quién. Es lo que hace que el que
//      agarra la bici a la tarde sepa lo que se habló a la mañana.
//
// Y la escalera del final: el teléfono no es el primer recurso, es el segundo.
// Se llama cuando pasó el plazo que fijó el taller, y la llamada se anota.
// ─────────────────────────────────────────────────────────────

interface Props {
    serviceId: string;
}

/** Un renglón de la línea de tiempo, venga de donde venga. */
interface Renglon {
    id: string;
    cuando: string;
    quien: 'taller' | 'cliente';
    texto: string;
    /** Qué fue: un WhatsApp, una llamada, el mostrador. */
    etiqueta: string;
    /** Lo que contestó Meta (entregado / leído / falló), si lo sabemos. */
    estado?: string | null;
}

const ESTADO_LEGIBLE: Record<string, string> = {
    enviando: 'mandando',
    sent: 'enviado',
    delivered: 'entregado',
    read: 'leído',
    failed: 'no salió',
};

export default function AvisoAlCliente({ serviceId }: Props) {
    const taller = useAuthStore(s => s.taller);
    const taller_id = useAuthStore(s => s.taller_id);
    const usuario_id = useAuthStore(s => s.session?.user?.id);
    const usuario_nombre = useAuthStore(s => s.nombre);

    const servicio = useDataStore(s => s.servicios.find(sv => sv.id === serviceId));
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const updateServicio = useDataStore(s => s.updateServicio);
    const enviar = useDataStore(s => s.enviarWhatsAppPlantilla);
    const registrarContacto = useDataStore(s => s.registrarContactoOrden);
    const leerContactos = useDataStore(s => s.contactosDeLaOrden);

    const [clase, setClase] = useState<ClaseDeAviso>('consulta');
    const [detalle, setDetalle] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
    const [contactos, setContactos] = useState<ContactoOrden[]>([]);
    const [mensajes, setMensajes] = useState<Renglon[]>([]);
    const [anotandoLlamada, setAnotandoLlamada] = useState(false);
    const [resultadoLlamada, setResultadoLlamada] = useState<ContactoOrden['resultado']>('atendio');
    const [textoLlamada, setTextoLlamada] = useState('');
    const [guardandoLlamada, setGuardandoLlamada] = useState(false);

    const bici = bicicletas.find(b => b.id === servicio?.bicicleta_id);
    const cliente = clientes.find(c => c.id === (bici as any)?.cliente_id);
    const telefono = soloNumeros((cliente as any)?.telefono);

    // Lo que sale hacia el CLIENTE va con el nombre corto; la ficha y el remito
    // van con el nombre completo. Ver lib/nombreAmigable.ts.
    const nombreCliente = primerNombre((cliente as any)?.nombre, 'Hola');
    const nombreBici = nombreBiciAmigable((bici as any)?.marca, (bici as any)?.modelo, 'bici');
    // 🔴 EL ORDEN DE LA FIRMA ES EL MISMO QUE EL DEL RESTO DEL SISTEMA
    // (ver MensajesAutomaticos: `regla.firma || taller.firma_nombre || nombre`).
    // Primero manda la firma que el taller configuró —que es el nombre con el que
    // sus clientes lo conocen, "Leandro"— y recién después el del usuario
    // logueado. Al revés, un taller donde la sesión es del dueño o de "Admin"
    // firmaría sus mensajes "Soy Admin, de Probikes": medido en el Taller Demo,
    // el usuario se llama DEMO ADMIN y el mensaje salía "Soy Demo".
    // El mecánico de la orden (`mecanico_id`) no sirve acá: se elige al
    // FINALIZAR, y este mensaje sale con la bici todavía abierta.
    const firma = (taller as any)?.firma_nombre || primerNombre(usuario_nombre, '') || taller?.nombre || 'el taller';
    const nombreTaller = taller?.nombre || 'el taller';

    const espera = estadoDeEspera(servicio, Number((taller as any)?.horas_para_llamar ?? 3));
    // El envío por la API es del Pro para arriba (reparto de Iara, 9-sep-2026).
    // En Sport la función existe igual: se abre WhatsApp con el mensaje escrito
    // y el contacto queda anotado en la orden — lo que cambia es el canal, no la
    // función. Ver planFeatures: `whatsapp_propio`.
    const modoAuto = (taller as any)?.wa_activo === true && tieneFeature(taller, 'whatsapp_propio');

    const sugerencias = clase === 'consulta' ? HALLAZGOS : AVANCES;

    const preview = useMemo(() => comoLeVaALlegar(clase, {
        cliente: nombreCliente, firma, taller: nombreTaller, bici: nombreBici,
        detalle: limpiarDetalle(detalle) || '…',
    }), [clase, nombreCliente, firma, nombreTaller, nombreBici, detalle]);

    // ── La línea de tiempo: se arma uniendo las cuatro tablas.
    //
    // No hay una tabla de "contactos" que las junte a propósito: lo que sale por
    // WhatsApp ya vive en mensajes_whatsapp, lo que contesta el cliente en
    // mensajes_entrantes, lo que el taller escribe desde su celular en
    // mensajes_coexistencia, y lo que no es WhatsApp en contactos_orden.
    // Escribir el mismo mensaje en dos tablas es garantizar que un día digan
    // cosas distintas.
    const cargar = useCallback(async () => {
        const filas: Renglon[] = [];

        const { data: salientes } = await supabase
            .from('mensajes_whatsapp')
            .select('id, texto, plantilla, estado, created_at')
            .eq('servicio_id', serviceId)
            .order('created_at', { ascending: false })
            .limit(30);
        for (const m of salientes ?? []) {
            filas.push({
                id: `out_${m.id}`, cuando: m.created_at, quien: 'taller',
                texto: m.texto || `(${m.plantilla})`,
                etiqueta: 'WhatsApp', estado: ESTADO_LEGIBLE[m.estado] ?? m.estado,
            });
        }

        // Lo que contestó el cliente NO tiene servicio_id (el webhook solo sabe de
        // qué teléfono vino), así que se busca por número y desde que entró la
        // bici: antes de eso la conversación es de otra orden.
        if (telefono && servicio?.fecha_ingreso) {
            const { data: entrantes } = await supabase
                .from('mensajes_entrantes')
                .select('id, texto, recibido_at')
                .eq('telefono', telefono)
                .gte('recibido_at', servicio.fecha_ingreso)
                .order('recibido_at', { ascending: false })
                .limit(30);
            for (const m of entrantes ?? []) {
                filas.push({
                    id: `in_${m.id}`, cuando: m.recibido_at, quien: 'cliente',
                    texto: m.texto || '(mandó algo que no es texto)', etiqueta: 'WhatsApp',
                });
            }

            // Y lo que se escribió a mano desde el celular del taller (Coexistencia):
            // sin esto la conversación se ve por la mitad, que es el agujero que
            // Leira describió como "no queda registro de lo que se dijo".
            const { data: aMano } = await supabase
                .from('mensajes_coexistencia')
                .select('id, texto, direccion, ocurrido_at')
                .eq('telefono', telefono)
                .gte('ocurrido_at', servicio.fecha_ingreso)
                .order('ocurrido_at', { ascending: false })
                .limit(30);
            for (const m of aMano ?? []) {
                filas.push({
                    id: `co_${m.id}`, cuando: m.ocurrido_at, quien: m.direccion === 'entrante' ? 'cliente' : 'taller',
                    texto: m.texto || '(no es texto)', etiqueta: 'WhatsApp del celular',
                });
            }
        }

        const propios = await leerContactos(serviceId);
        setContactos(propios);
        for (const c of propios) {
            const etiqueta = c.canal === 'llamada'
                ? `Llamada${c.resultado ? ` · ${RESULTADO_DE_LLAMADA[c.resultado] ?? c.resultado}` : ''}`
                : c.canal === 'presencial' ? 'En el mostrador'
                : c.canal === 'whatsapp_manual' ? 'WhatsApp (a mano)'
                : 'Nota';
            filas.push({
                id: `c_${c.id}`, cuando: c.ocurrido_at, quien: 'taller',
                texto: c.texto || '', etiqueta: c.usuario_nombre ? `${etiqueta} · ${c.usuario_nombre}` : etiqueta,
            });
        }

        filas.sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando));
        setMensajes(filas);
    }, [serviceId, telefono, servicio?.fecha_ingreso, leerContactos]);

    useEffect(() => { void cargar(); }, [cargar]);

    // ── Mandar el aviso ─────────────────────────────────────────
    const mandar = async () => {
        const texto = limpiarDetalle(detalle);
        if (texto.length < 4) {
            return setAviso({ tipo: 'error', texto: 'Escribí qué le querés decir, aunque sea corto.' });
        }
        if (!telefono) {
            return setAviso({ tipo: 'error', texto: 'Este cliente no tiene teléfono cargado. Cargáselo en su ficha y volvé.' });
        }
        setEnviando(true);
        setAviso(null);

        const plantilla = clase === 'consulta' ? 'consulta_durante_service' : 'avance_del_service';
        const mensajeCompleto = comoLeVaALlegar(clase, {
            cliente: nombreCliente, firma, taller: nombreTaller, bici: nombreBici, detalle: texto,
        });

        let salioPorApi = false;
        if (modoAuto) {
            // Primero como texto libre: si el cliente escribió en las últimas 24hs
            // la ventana está abierta y el mensaje sale como una conversación de
            // verdad. La Edge Function chequea la ventana del lado del servidor y
            // contesta 'ventana_cerrada' ANTES de registrar nada, así que el
            // intento fallido no deja basura.
            let r = await enviar({
                proposito: clase, tipo: 'texto', texto: mensajeCompleto, destino: telefono,
                cliente_id: (cliente as any)?.id ?? null,
                bicicleta_id: servicio?.bicicleta_id ?? null,
                servicio_id: serviceId,
            });
            if (!r.ok && r.error === 'ventana_cerrada') {
                r = await enviar({
                    proposito: clase, tipo: 'plantilla', plantilla, destino: telefono,
                    parametros: [nombreCliente, firma, nombreTaller, nombreBici, texto],
                    cliente_id: (cliente as any)?.id ?? null,
                    bicicleta_id: servicio?.bicicleta_id ?? null,
                    servicio_id: serviceId,
                });
            }
            salioPorApi = r.ok;
            if (!r.ok) {
                console.warn('El aviso no salió por la API:', r.error, r.detalle);
                // 🔴 «La plantilla no existe» = no está en la cuenta de ESTE taller.
                // Las dos de la orden son nuevas (8-sep-2026) y `whatsapp-conectar`
                // solo crea el catálogo el día que el taller se conecta: el que se
                // conectó antes no las tiene. `refrescar` crea las que falten, así
                // que se dispara sola y sin esperarla — la plantilla recién creada
                // queda PENDING hasta que Meta la apruebe, o sea que este envío no
                // se salva igual. Lo que se salva es el de mañana, sin que nadie
                // tenga que acordarse de abrir Configuración.
                if (/no exist|132001/i.test(String(r.detalle ?? ''))) {
                    void supabase.functions.invoke('plantillas-taller', { body: { accion: 'refrescar' } });
                }
            }
        }

        // 🚩 Si la API no está o falló, se abre wa.me igual. Que el taller no
        // tenga el número conectado no puede dejarlo sin poder avisarle a su
        // cliente — y hoy el único taller conectado es Probikes.
        if (!salioPorApi) {
            window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensajeCompleto)}`, '_blank');
            if (taller_id && usuario_id) {
                await registrarContacto({
                    taller_id, usuario_id, usuario_nombre,
                    servicio_id: serviceId, cliente_id: (cliente as any)?.id ?? null,
                    canal: 'whatsapp_manual', texto: mensajeCompleto,
                });
            }
        }

        // Solo la CONSULTA deja la orden esperando: el avance no pregunta nada,
        // y marcar como "esperando" algo que no espera respuesta haría que el
        // aviso de "llamalo" salte cuando no hay nada que destrabar.
        if (clase === 'consulta') {
            await updateServicio(serviceId, {
                esperando_desde: new Date().toISOString(),
                esperando_que: texto,
                respondio_at: null,
            });
        }

        setDetalle('');
        setEnviando(false);
        setAviso({
            tipo: 'ok',
            texto: salioPorApi
                ? (clase === 'consulta' ? 'Mandado. La orden queda esperando la respuesta.' : 'Mandado.')
                : 'Se abrió WhatsApp con el mensaje escrito. Quedó anotado en la orden.',
        });
        void cargar();
    };

    // ── Anotar la llamada ───────────────────────────────────────
    const guardarLlamada = async () => {
        if (!taller_id || !usuario_id) return;
        setGuardandoLlamada(true);
        const ok = await registrarContacto({
            taller_id, usuario_id, usuario_nombre,
            servicio_id: serviceId, cliente_id: (cliente as any)?.id ?? null,
            canal: 'llamada', resultado: resultadoLlamada, texto: textoLlamada,
        });
        // Si atendió, la orden deja de esperar: la respuesta llegó, aunque haya
        // llegado por teléfono. Si no atendió, sigue esperando y el reloj también
        // — que es justo lo que hace falta para poder decir "van tres intentos".
        if (ok && resultadoLlamada === 'atendio') {
            await updateServicio(serviceId, { respondio_at: new Date().toISOString() });
        }
        setGuardandoLlamada(false);
        setAnotandoLlamada(false);
        setTextoLlamada('');
        if (!ok) setAviso({ tipo: 'error', texto: 'No se pudo guardar la llamada. Probá de nuevo.' });
        void cargar();
    };

    const marcarRespondido = async () => {
        await updateServicio(serviceId, { respondio_at: new Date().toISOString() });
        setAviso({ tipo: 'ok', texto: 'Listo, la orden ya no espera respuesta.' });
    };

    if (!servicio) return null;

    return (
        <div data-tour="aviso-al-cliente" className="space-y-3">
            <Label className="text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Avisarle al cliente
            </Label>

            {/* ── La orden está esperando: lo primero que se tiene que ver ── */}
            {espera.esperando && (
                <div className={`rounded-lg border p-3 ${espera.hayQueLlamar
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-start gap-2">
                        {espera.hayQueLlamar
                            ? <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            : <Clock className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${espera.hayQueLlamar ? 'text-amber-900' : 'text-slate-700'}`}>
                                {espera.hayQueLlamar
                                    ? `No contesta hace ${espera.horas} h. Si necesitás avanzar, llamalo.`
                                    : `Esperando respuesta (${espera.etiqueta}).`}
                            </p>
                            {espera.que && (
                                <p className="text-xs text-slate-600 mt-1">Se le preguntó: “{espera.que}”</p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                                {telefono && (
                                    <Button size="sm" variant={espera.hayQueLlamar ? 'default' : 'outline'} asChild>
                                        <a href={`tel:+${telefono}`}><Phone className="h-3.5 w-3.5 mr-1.5" /> Llamar</a>
                                    </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => setAnotandoLlamada(v => !v)}>
                                    Anotar la llamada
                                </Button>
                                <Button size="sm" variant="ghost" onClick={marcarRespondido}>
                                    <Check className="h-3.5 w-3.5 mr-1.5" /> Ya me contestó
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Anotar una llamada (también sirve sin estar esperando nada) ── */}
            {anotandoLlamada && (
                <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-white">
                    <p className="text-sm font-semibold text-slate-700">Qué pasó en la llamada</p>
                    <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(RESULTADO_DE_LLAMADA) as ContactoOrden['resultado'][]).map(r => (
                            <button
                                key={r as string}
                                type="button"
                                onClick={() => setResultadoLlamada(r)}
                                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${resultadoLlamada === r
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                            >
                                {RESULTADO_DE_LLAMADA[r as string]}
                            </button>
                        ))}
                    </div>
                    <Textarea
                        rows={2}
                        value={textoLlamada}
                        onChange={e => setTextoLlamada(e.target.value)}
                        placeholder="Qué se habló. Ej: me dijo que sí a las pastillas, no al cassette."
                        className="text-base"
                    />
                    <div className="flex gap-2">
                        <Button size="sm" onClick={guardarLlamada} disabled={guardandoLlamada}>
                            {guardandoLlamada ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                            Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAnotandoLlamada(false)}>Cancelar</Button>
                    </div>
                </div>
            )}

            {/* ── Escribir el aviso ── */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-3 bg-white">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setClase('consulta')}
                        className={`flex-1 text-sm font-semibold py-2 rounded-lg border transition-colors ${clase === 'consulta'
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                        Preguntarle algo
                    </button>
                    <button
                        type="button"
                        onClick={() => setClase('avance')}
                        className={`flex-1 text-sm font-semibold py-2 rounded-lg border transition-colors ${clase === 'avance'
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                        Contarle cómo va
                    </button>
                </div>
                <p className="text-xs text-muted-foreground">
                    {clase === 'consulta'
                        ? 'Encontraste algo y necesitás un sí para seguir. La orden queda esperando la respuesta.'
                        : 'Le contás en qué anda la bici. No espera respuesta y no frena nada.'}
                </p>

                <div className="flex flex-wrap gap-1.5">
                    {sugerencias.map(f => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => setDetalle(f)}
                            className="text-xs text-left px-2.5 py-1.5 rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            {f}
                        </button>
                    ))}
                </div>

                <Textarea
                    rows={2}
                    value={detalle}
                    onChange={e => setDetalle(e.target.value)}
                    placeholder={clase === 'consulta'
                        ? 'Qué encontraste. Ej: las pastillas están gastadas, hay que cambiarlas.'
                        : 'En qué anda. Ej: ya le hice la transmisión, me falta el freno.'}
                    className="text-base"
                />

                {/* Lo que va a leer el cliente, palabra por palabra. Que el
                    mecánico lo vea antes de mandarlo es lo único que evita
                    mandar algo que no se diría hablando. */}
                <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Le va a llegar así</p>
                    <p className="text-sm text-slate-700 leading-snug">{preview}</p>
                </div>

                {aviso && (
                    <p className={`text-sm ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{aviso.texto}</p>
                )}

                <Button onClick={mandar} disabled={enviando} className="w-full">
                    {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    {enviando ? 'Mandando...' : 'Mandar por WhatsApp'}
                </Button>
                {!modoAuto && (
                    <p className="text-xs text-muted-foreground">
                        Se abre WhatsApp con el mensaje escrito y queda anotado acá.{' '}
                        {tieneFeature(taller, 'whatsapp_propio')
                            ? 'Si conectás el número del taller en Configuración, sale solo y sabés si lo leyó.'
                            : 'Con el plan Pro podés conectar el número de tu taller: el mensaje sale solo y sabés si lo leyó.'}
                    </p>
                )}
            </div>

            {/* ── El registro ── */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    Lo que se habló por esta orden {mensajes.length > 0 && `(${mensajes.length})`}
                </p>
                {mensajes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Todavía no se le escribió ni se lo llamó por esta bici.</p>
                ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {mensajes.map(m => (
                            <div key={m.id} className={`rounded-lg border p-2.5 ${m.quien === 'cliente'
                                ? 'border-slate-200 bg-white'
                                : 'border-primary/20 bg-primary/5'}`}>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-0.5">
                                    {m.quien === 'cliente'
                                        ? <User className="h-3 w-3" />
                                        : <Wrench className="h-3 w-3" />}
                                    <span className="font-semibold">{m.quien === 'cliente' ? nombreCliente : 'El taller'}</span>
                                    <span>·</span>
                                    <span>{m.etiqueta}</span>
                                    {m.estado && <><span>·</span><span>{m.estado}</span></>}
                                    <span className="ml-auto">{instanteARConHora(m.cuando)}</span>
                                </div>
                                {m.texto && <p className="text-sm text-slate-700 leading-snug">{m.texto}</p>}
                            </div>
                        ))}
                    </div>
                )}
                {contactos.length === 0 && !anotandoLlamada && !espera.esperando && (
                    <Button size="sm" variant="ghost" className="mt-1.5 px-0 text-muted-foreground"
                        onClick={() => setAnotandoLlamada(true)}>
                        <Phone className="h-3.5 w-3.5 mr-1.5" /> Anotar una llamada o algo que se habló
                    </Button>
                )}
            </div>
        </div>
    );
}
