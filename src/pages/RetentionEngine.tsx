import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Phone, Calendar, CheckCircle2, BellRing, Flag, Copy, User, Loader2, MessageCircle } from "lucide-react";
import { buildRetentionAlerts, type RetentionAlert } from "@/lib/retentionAlerts";
import { construirAvisosSuaves, CONFIG_SUAVES_DEFAULT, type AvisoSuave, type ResultadoSuaves } from "@/lib/avisosSuaves";
import { clientesEnFuga, type ClienteEnFuga } from "@/lib/motorConCabeza";
import { carreraEnFrase, nombreBiciAmigable, nombresBicisAmigables, primerNombre } from "@/lib/nombreAmigable";
import { tieneFeature } from "@/lib/planFeatures";
import PanelRetorno from "@/components/PanelRetorno";
import BandejaRespuestas from "@/components/BandejaRespuestas";

// Acceso rápido al perfil del cliente desde la alerta: si tenemos la bici,
// abrimos esa bici (el perfil muestra igual al cliente con TODAS sus bicis en
// pestañas, su historial y la salud de componentes); si no, el perfil pelado.
function perfilHref(alert: RetentionAlert): string | null {
    if (alert.bikeId) return `/bikes/${alert.bikeId}`;
    if (alert.clientId) return `/clients/${alert.clientId}`;
    return null;
}

// Cómo se llama la bici de esta alerta CUANDO LE ESCRIBIMOS AL CLIENTE.
// En la tabla y en la tarjeta sigue el nombre completo (ahí lo lee el
// mecánico y le sirve el detalle); en el mensaje va el nombre corto, que
// es el que usa el dueño. Se resuelve contra todas las bicis del cliente
// porque si tiene dos Rockhopper, acortar lo dejaría sin saber cuál es.
function useNombreBici() {
    const bicicletas = useDataStore(s => s.bicicletas);
    return useCallback((alert: RetentionAlert): string => {
        const bici = bicicletas.find(b => b.id === alert.bikeId);
        if (!bici) return nombreBiciAmigable(null, alert.bikeModel);
        const delCliente = bicicletas.filter(b => b.cliente_id === bici.cliente_id);
        return nombresBicisAmigables(delCliente).get(bici.id)
            ?? nombreBiciAmigable(bici.marca, bici.modelo);
    }, [bicicletas]);
}

// El mensaje de siempre: el que sale cuando la IA está apagada o falló.
// Vive en un solo lugar porque las dos vistas (tarjeta y tabla) tienen que
// mandar exactamente lo mismo — antes la tabla abría wa.me con el texto
// vacío para los avisos que no eran de carrera.
function mensajeFijo(alert: RetentionAlert, bici: string): string {
    const hola = `¡Hola ${primerNombre(alert.clientName)}!`;
    if (alert.isPostCarrera) {
        return `${hola} ¿Cómo te fue en ${carreraEnFrase(alert.carreraName)}? Contanos cómo se portó la bici.`;
    }
    if (alert.isPreCarrera) {
        return `${hola} Vi que se acerca ${carreraEnFrase(alert.carreraName)}, ¿querés que le demos una revisada a la ${bici} antes de viajar?`;
    }
    return `${hola} Te escribo del taller para recordarte que toca revisar: ${alert.component} en tu ${bici}. ¿Querés que coordinemos un turno?`;
}

// ─────────────────────────────────────────────────────────────
// Contactar al cliente y dejar constancia de que salió el mensaje.
//
// Sin este registro el taller no sabe a quién ya llamó (la lista se vuelve
// ruido) y no hay forma de medir cuántos de los recontactados vuelven, que
// es la métrica de la única ventaja del producto.
//
// Se registra SOLO al contactar, no al copiar el mensaje: copiar no es
// mandar. Preferimos contar de menos antes que inflar el número.
//
// Cuando el taller tiene su WhatsApp conectado (`wa_activo`), el mensaje sale
// solo por la API oficial y llegan los estados reales (entregado, leído).
// Mientras no lo tenga, sigue el camino de siempre: abrir wa.me.
//
// 🚩 Si el envío por API falla, SE ABRE wa.me igual. Que se caiga la API no
// puede dejar al taller sin poder contactar a su cliente.
function useContactarWhatsApp() {
    const registrar = useDataStore(s => s.registrarContactoRetencion);
    const enviar = useDataStore(s => s.enviarWhatsAppPlantilla);
    const redactar = useDataStore(s => s.redactarMensajePersonal);
    const nombreBici = useNombreBici();
    const taller_id = useAuthStore(s => s.taller_id);
    const taller = useAuthStore(s => s.taller);
    const modoAuto = taller?.wa_activo === true;

    const registrarManual = (
        alert: RetentionAlert,
        mensaje_whatsapp_id?: string,
        extra?: { variante?: string | null; texto_enviado?: string | null },
    ) => {
        if (!taller_id) return;
        // Sin await a propósito: no frenamos la apertura de WhatsApp por
        // una fila de estadística (y la función nunca tira error).
        registrar({
            taller_id,
            cliente_id: alert.clientId,
            bicicleta_id: alert.bikeId,
            servicio_origen_id: alert.servicioId,
            componente: alert.component,
            canal: mensaje_whatsapp_id ? 'whatsapp_auto' : 'whatsapp_manual',
            mensaje_whatsapp_id: mensaje_whatsapp_id ?? null,
            variante: extra?.variante ?? null,
            texto_enviado: extra?.texto_enviado ?? null,
        });
    };

    const abrirWaMe = (alert: RetentionAlert, texto: string) => {
        const tel = (alert.clientPhone || '').replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
    };

    // ─────────────────────────────────────────────────────────
    // El mensaje personalizado, escrito con el historial del cliente.
    //
    // Devuelve null si la IA está apagada o falló, y entonces todo sigue
    // como antes con el texto fijo. Es a propósito: la personalización es
    // una mejora del mensaje, no un requisito para poder mandarlo.
    // ─────────────────────────────────────────────────────────
    const redactarPersonal = async (alert: RetentionAlert) => {
        if (!alert.clientId) return null;
        // Si el taller no la activó, ni se llama: es un viaje de ida y vuelta
        // al servidor que el mecánico espera con el dedo en el botón, para
        // recibir "está apagada". Mismo motivo para el plan: la IA es de
        // Pro/Expert y el gate real vive en la Edge Function.
        if (taller?.ia_mensajes_activa !== true) return null;
        if (!tieneFeature(taller, 'mensaje_ia')) return null;
        const r = await redactar({
            cliente_id: alert.clientId,
            motivo: alert.isPostCarrera ? 'post_carrera' : alert.isPreCarrera ? 'pre_carrera' : 'retencion',
            componente: alert.component,
            carrera: alert.carreraName || undefined,
        });
        return r.ok && r.linea ? r : null;
    };

    // Devuelve 'enviado' | 'manual'. El llamador decide qué mostrar.
    const contactar = async (alert: RetentionAlert, texto: string): Promise<'enviado' | 'manual'> => {
        const personal = await redactarPersonal(alert);
        const nombre = primerNombre(alert.clientName);
        // Los parámetros son lo único que el cliente lee: van con los nombres
        // como se dicen, no como están cargados en el sistema.
        const bici = nombreBici(alert);
        const carrera = carreraEnFrase(alert.carreraName);

        // El mensaje completo para el camino manual (wa.me). Es el MISMO
        // texto que arma la plantilla aprobada de Meta: el cliente tiene
        // que recibir lo mismo salga por donde salga.
        const mensajePersonal = personal
            ? `¡Hola ${nombre}! ¿Cómo va? Te escribo yo, ${personal.firma} de ${taller?.nombre || 'tu taller'}, por tu bici. ${personal.linea} Si querés lo vemos, escribime por acá.`
            : null;

        if (!modoAuto) {
            // Sin la API de Meta el texto es libre: acá la personalización
            // entra entera, sin plantilla que la limite. El taller no tiene
            // que esperar a Meta para que sus mensajes dejen de sonar a robot.
            const cuerpo = mensajePersonal ?? texto;
            registrarManual(alert, undefined, {
                variante: personal?.variante ?? 'fijo_wame',
                texto_enviado: cuerpo,
            });
            abrirWaMe(alert, cuerpo);
            return 'manual';
        }

        // Con la API oficial, fuera de la ventana de 24hs Meta SOLO acepta
        // plantillas aprobadas. La personalizada tiene el andamiaje fijo y
        // dentro la línea que escribió la IA: es la única forma legal de
        // mandar algo distinto a cada cliente.
        const plantilla = personal ? 'recontacto_personal'
            : alert.isPostCarrera ? 'seguimiento_evento'
                : alert.isPreCarrera ? 'pre_carrera'
                    : 'recordatorio_mantenimiento';

        const parametros = personal
            ? [nombre, `${personal.firma} de ${taller?.nombre || 'tu taller'}`, personal.linea!]
            : alert.isPostCarrera
                ? [nombre, carrera]
                : alert.isPreCarrera
                    ? [nombre, carrera, bici]
                    // El nombre del taller va en el mensaje: cuando lo manda un
                    // sistema y no una persona, no decir de quién es se lee como spam.
                    : [nombre, taller?.nombre || 'tu taller', alert.component, bici];

        const r = await enviar({
            proposito: alert.isPostCarrera ? 'evento' : 'retencion',
            plantilla,
            destino: alert.clientPhone,
            parametros,
            cliente_id: alert.clientId ?? null,
            bicicleta_id: alert.bikeId ?? null,
            servicio_id: alert.servicioId ?? null,
            variante: personal?.variante ?? `fijo_${plantilla}`,
            generado_por_ia: !!personal,
        });

        if (r.ok) {
            registrarManual(alert, r.mensaje_id, {
                variante: personal?.variante ?? `fijo_${plantilla}`,
                texto_enviado: personal ? personal.linea : null,
            });
            return 'enviado';
        }

        // 🚩 Si el envío por API falla, se abre wa.me igual: que se caiga la
        // API no puede dejar al taller sin poder contactar a su cliente.
        registrarManual(alert, undefined, {
            variante: personal?.variante ?? 'fijo_wame',
            texto_enviado: mensajePersonal ?? texto,
        });
        abrirWaMe(alert, mensajePersonal ?? texto);
        return 'manual';
    };

    return { modoAuto, contactar };
}

export default function RetentionEngine() {
    const recordatorios = useDataStore(s => s.recordatorios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const servicios = useDataStore(s => s.servicios);
    const carreras = useDataStore(s => s.carreras);
    const isHydrating = useDataStore(s => s.isHydrating);
    const { modoAuto, contactar } = useContactarWhatsApp();
    const nombreBici = useNombreBici();
    const [enviando, setEnviando] = useState<string | null>(null);

    const taller = useAuthStore(s => s.taller);
    // Idea 5 (Pro/Expert): la fecha del aviso sale del ritmo real de ESE
    // ciclista cuando su historial da base; si no, el plazo fijo de siempre.
    const predictivo = tieneFeature(taller, 'motor_predictivo');

    // Fuente única compartida con la campana (NotificationBell) → mismo
    // listado y mismo alertas_ocultas en los dos lados.
    const alerts = useMemo(
        () => buildRetentionAlerts({ recordatorios, bicicletas, clientes, servicios, carreras, predictivo }),
        [recordatorios, bicicletas, clientes, servicios, carreras, predictivo]
    );

    // Los avisos suaves (Alejo, 3-sep-2026): el primer service de una bici que
    // nunca vino, y el que vino una o dos veces y no volvió. Complementa a
    // `fuga`, que solo ve a los que ya tienen ritmo (3+ visitas) — y en un
    // taller nuevo eso es NADIE.
    const configSuaves = { ...CONFIG_SUAVES_DEFAULT, ...(taller?.config_notificaciones?.avisos_suaves || {}) };
    const avisosSuaves = useMemo(
        () => construirAvisosSuaves({ clientes, bicicletas, servicios, config: configSuaves }),
        [clientes, bicicletas, servicios, configSuaves.habilitado, configSuaves.primerServiceDias, configSuaves.noVolvioDias, configSuaves.limite]
    );

    // Idea 6 (Pro/Expert): el que se está yendo, por comportamiento.
    const fuga = useMemo(
        () => predictivo ? clientesEnFuga({ clientes, bicicletas, servicios }) : null,
        [predictivo, clientes, bicicletas, servicios]
    );

    if (isHydrating) return <div className="p-8 text-center text-muted-foreground">Cargando motor de retención...</div>;

    const urgentAlerts = alerts.filter(a => a.daysRemaining <= 0);
    const upcomingAlerts = alerts.filter(a => a.daysRemaining > 0).sort((a, b) => a.daysRemaining - b.daysRemaining);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div data-tour="retencion">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                    <BellRing className="w-8 h-8 text-primary" />
                    Motor de Retención
                </h1>
                <p className="text-muted-foreground mt-1">Gestiona los vencimientos de componentes y genera re-compras.</p>
            </div>

            {/* El resultado va arriba del trabajo: si el taller entra y lo
                primero que ve es una lista de pendientes, el sistema le pide.
                Si ve lo que le trajo, el sistema le da. */}
            <PanelRetorno />

            {/* Lo que contestaron va antes que lo que falta mandar: hay una
                ventana de 24hs para responder y después se cierra. */}
            <BandejaRespuestas />

            {/* Idea 6: pocos nombres con razón de estar, no doscientos. */}
            {fuga && fuga.enRiesgo.length > 0 && <SeccionFuga fuga={fuga} />}

            {/* Los suaves van DESPUÉS de lo urgente y en su propia sección: un
                aviso opcional que tapa un vencimiento deja de ser opcional. */}
            {configSuaves.habilitado && (avisosSuaves.avisos.length > 0 || avisosSuaves.enCamino.cuantas > 0) && (
                <SeccionAvisosSuaves resultado={avisosSuaves} />
            )}

            {alerts.length === 0 && (
                <Card className="border-dashed border-2 py-12 flex flex-col items-center justify-center text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-xl font-semibold">Todo al día</h3>
                    <p className="text-muted-foreground">No hay vencimientos de componentes registrados.</p>
                </Card>
            )}

            {urgentAlerts.length > 0 && (
                <div data-tour="retencion-urgentes" className="space-y-4">
                    <div className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-6 w-6 animate-pulse" />
                        <h2 className="text-xl font-bold">Atención Inmediata (Vencidos o Vencen Hoy)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {urgentAlerts.map((alert) => (
                            <AlertCard key={alert.id} alert={alert} />
                        ))}
                    </div>
                </div>
            )}

            {upcomingAlerts.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-700">
                        <Calendar className="h-6 w-6" />
                        <h2 className="text-xl font-bold">Próximos Vencimientos</h2>
                    </div>
                    <div data-tour="retencion-proximos" className="rounded-md border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Vencimiento</TableHead>
                                    <TableHead>Días Restantes</TableHead>
                                    <TableHead>Componente</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Bicicleta</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {upcomingAlerts.map((alert) => (
                                    <TableRow key={alert.id}>
                                        <TableCell className="font-medium">
                                            {alert.isPreCarrera
                                                ? alert.dueDate.split('-').reverse().join('/')
                                                : new Date(alert.dueDate).toLocaleDateString()
                                            }
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`border ${alert.isPreCarrera ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                {alert.daysRemaining} días
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-semibold">
                                            {alert.component}
                                            {/* Idea 5: si la fecha salió del ritmo real de ESE
                                                ciclista, se dice con qué base. */}
                                            {alert.prediccion && (
                                                <div className="text-[11px] font-normal text-slate-500">
                                                    le dura ~{alert.prediccion.cadaDias} días según su historial
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {perfilHref(alert) ? (
                                                <Link
                                                    to={perfilHref(alert)!}
                                                    className="text-slate-900 hover:text-primary hover:underline underline-offset-2"
                                                    title="Ver perfil del cliente"
                                                >
                                                    {alert.clientName}
                                                </Link>
                                            ) : alert.clientName}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{alert.bikeModel}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            {perfilHref(alert) && (
                                                <Button variant="ghost" size="sm" asChild className="h-8 text-slate-500 hover:text-primary hover:bg-primary/10">
                                                    <Link to={perfilHref(alert)!} title="Ver perfil del cliente">
                                                        <User className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost" size="sm"
                                                className="h-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                title={modoAuto ? 'Enviar el recordatorio por WhatsApp' : 'Abrir WhatsApp con el mensaje'}
                                                disabled={enviando === alert.id}
                                                onClick={async () => {
                                                    setEnviando(alert.id);
                                                    await contactar(alert, mensajeFijo(alert, nombreBici(alert)));
                                                    setEnviando(null);
                                                }}
                                            >
                                                {enviando === alert.id
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <Phone className="h-4 w-4" />}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Componente de Tarjeta de Alerta (UrgentCard)
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Idea 6 — "Se está yendo": el cliente que venía cada X semanas y hace
// k·X que no aparece, ordenado por atraso × valor. Pocos nombres, cada
// uno con su razón de estar escrita con SUS números (nada lo redacta una
// IA: el argumento ES el dato). El contacto se registra en
// contactos_retencion → el Panel de Retorno ya le atribuye la plata.
// ─────────────────────────────────────────────────────────────
function SeccionAvisosSuaves({ resultado }: { resultado: ResultadoSuaves }) {
    const { avisos, enCamino } = resultado;
    const registrar = useDataStore(s => s.registrarContactoRetencion);
    const taller_id = useAuthStore(s => s.taller_id);
    const [contactados, setContactados] = useState<Record<string, boolean>>({});

    const contactar = (a: AvisoSuave) => {
        const hola = primerNombre(a.clienteNombre) ? `Hola ${primerNombre(a.clienteNombre)}!` : 'Hola!';
        // Dos textos distintos porque son dos conversaciones distintas: a uno le
        // avisás de algo que le sirve, al otro le preguntás qué pasó.
        const texto = a.motivo === 'primer_service'
            ? `${hola} ¿Cómo va? Te escribo por la ${a.bicicletaModelo}. Como es nueva, le corresponde el primer service de asentamiento: se acomodan los cables y los rayos después de las primeras salidas. ¿Querés que la veamos?`
            : `${hola} ¿Cómo andás? Hace un tiempo que no te vemos por el taller. ¿Cómo viene andando la bici? Cualquier cosa que necesites, acá estamos.`;
        const tel = (a.clienteTelefono || '').replace(/[^0-9]/g, '');
        if (!tel) { window.alert('Este cliente no tiene teléfono cargado.'); return; }
        if (taller_id) {
            registrar({
                taller_id, cliente_id: a.clienteId, bicicleta_id: a.bicicletaId,
                componente: a.motivo, canal: 'whatsapp_manual',
                variante: `v1_${a.motivo}`, texto_enviado: texto,
            });
        }
        setContactados(prev => ({ ...prev, [a.id]: true }));
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sky-700">
                <User className="h-6 w-6" />
                <h2 className="text-xl font-bold">Vale una llamada</h2>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
                No son vencimientos: son clientes que se están enfriando. Nadie se va a quedar sin
                bici por esto, pero una pregunta a tiempo los trae de vuelta. Ordenados por lo que
                dejaron en el taller.
            </p>
            {/* Decir que está trabajando aunque no haya nada que mostrar: si no,
                el que lo prende un lunes ve una sección vacía y lo apaga. */}
            {enCamino.cuantas > 0 && (
                <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-md p-2.5">
                    {enCamino.cuantas === 1 ? 'Hay 1 bici nueva' : `Hay ${enCamino.cuantas} bicis nuevas`} que
                    todavía no vino al taller. {enCamino.cuantas === 1 ? 'Va a aparecer acá' : 'La primera va a aparecer acá'}
                    {enCamino.enDias !== null && enCamino.enDias > 0 ? ` en ${enCamino.enDias} día${enCamino.enDias > 1 ? 's' : ''}` : ' pronto'},
                    cuando le toque el primer service.
                </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {avisos.map(a => (
                    <Card key={a.id} className="border-l-4 border-l-sky-400 bg-sky-50/40 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-bold text-slate-800">
                                <Link
                                    to={a.bicicletaId ? `/bikes/${a.bicicletaId}` : `/clients/${a.clienteId}`}
                                    className="hover:underline"
                                >
                                    {a.clienteNombre}
                                </Link>
                            </CardTitle>
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                                {a.motivo === 'primer_service' ? 'Primer service' : 'No volvió'}
                            </span>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-slate-700 leading-snug">{a.argumento}</p>
                            {/* Sin teléfono no hay WhatsApp que mandar, y ofrecerlo igual
                                para que después salte un cartel de error es peor que decirlo.
                                Pasa con los que entraron solos desde una venta del ERP:
                                Contabilium casi nunca guarda el teléfono (1 de 40). La acción
                                real ahí no es escribirle: es conseguir el número. */}
                            {a.clienteTelefono ? (
                                <Button
                                    size="sm"
                                    variant={contactados[a.id] ? 'outline' : 'default'}
                                    className="w-full"
                                    onClick={() => contactar(a)}
                                >
                                    <MessageCircle className="h-4 w-4 mr-1.5" />
                                    {contactados[a.id] ? 'Contactado' : 'Escribirle'}
                                </Button>
                            ) : (
                                <div className="text-xs text-slate-600 bg-white/70 border border-sky-200 rounded-md p-2 text-center">
                                    <strong>No tenemos su teléfono.</strong> Pedíselo cuando pase por el local
                                    y cargalo en su ficha.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function SeccionFuga({ fuga }: { fuga: { enRiesgo: ClienteEnFuga[]; conBase: number; sinBase: number } }) {
    const registrar = useDataStore(s => s.registrarContactoRetencion);
    const taller_id = useAuthStore(s => s.taller_id);
    const [contactados, setContactados] = useState<Record<string, boolean>>({});

    const contactar = (c: ClienteEnFuga) => {
        const texto = `${primerNombre(c.nombre) ? `Hola ${primerNombre(c.nombre)}!` : 'Hola!'} ¿Cómo va? Hace un tiempo que no pasás por el taller. ¿Todo bien con la bici? Cualquier cosa que necesite, acá estamos.`;
        const tel = (c.telefono || '').replace(/[^0-9]/g, '');
        if (!tel) { window.alert('Este cliente no tiene teléfono cargado.'); return; }
        if (taller_id) {
            registrar({
                taller_id,
                cliente_id: c.clienteId,
                bicicleta_id: c.bicicletaId,
                componente: 'seguimiento_fuga',
                canal: 'whatsapp_manual',
                variante: 'v1_fuga',
                texto_enviado: texto,
            });
        }
        setContactados(prev => ({ ...prev, [c.clienteId]: true }));
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-700">
                <User className="h-6 w-6" />
                <h2 className="text-xl font-bold">Se está yendo</h2>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
                Leído del ritmo real de visitas de {fuga.conBase} clientes con historial suficiente.
                {fuga.sinBase > 0 && <> {fuga.sinBase} no llegan a 3 visitas en 2 años, así que su ritmo no se puede leer (y no se adivina).</>}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fuga.enRiesgo.map(c => (
                    <Card key={c.clienteId} className="border-l-4 border-l-amber-500 bg-amber-50/40 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg font-bold text-slate-800">
                                <Link
                                    to={c.bicicletaId ? `/bikes/${c.bicicletaId}` : `/clients/${c.clienteId}`}
                                    className="hover:text-primary hover:underline underline-offset-2"
                                    title="Ver perfil del cliente"
                                >
                                    {c.nombre}
                                </Link>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-slate-700">{c.argumento}</p>
                            <Button
                                className={`w-full font-semibold text-white ${contactados[c.clienteId] ? 'bg-slate-400 hover:bg-slate-400' : 'bg-green-600 hover:bg-green-700'}`}
                                disabled={contactados[c.clienteId]}
                                onClick={() => contactar(c)}
                            >
                                <Phone className="w-4 h-4 mr-2" />
                                {contactados[c.clienteId] ? 'Contactado' : 'Contactar por WhatsApp'}
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function AlertCard({ alert }: { alert: RetentionAlert }) {
    const [isCopied, setIsCopied] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);
    const dismissAlert = useDataStore(s => s.dismissAlert);
    const { modoAuto, contactar } = useContactarWhatsApp();
    const nombreBici = useNombreBici();
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState(false);

    // El texto de siempre. Es lo que se copia con el botón y lo que sale si
    // la IA está apagada; cuando está prendida, el mensaje real lo escribe
    // la Edge Function con el historial del cliente.
    const messageText = mensajeFijo(alert, nombreBici(alert));

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(messageText);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (e) {
            console.error("Error al copiar al portapapeles", e);
        }
    };

    const handleDismiss = async () => {
        if (!alert.servicioId || !alert.alertIdentity) {
            console.warn("No se puede descartar: falta servicioId o alertIdentity");
            return;
        }
        setIsDismissing(true);
        try {
            await dismissAlert(alert.servicioId, alert.alertIdentity);
        } catch (e: any) {
            // window.alert: `alert` acá es la prop de la alerta, no el diálogo.
            window.alert("Error al ocultar alerta: " + e.message);
            setIsDismissing(false);
        }
    };

    if (isDismissing) return null; // Optimistic hide at component level to ensure unmount

    return (
        <Card className={`border-l-4 shadow-sm hover:shadow-md transition-shadow ${alert.isPostCarrera ? 'border-l-violet-500 bg-violet-50/50' : 'border-l-red-500 bg-red-50/50'}`}>
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-bold text-slate-800">
                        {perfilHref(alert) ? (
                            <Link to={perfilHref(alert)!} className="hover:text-primary hover:underline underline-offset-2" title="Ver perfil del cliente">
                                {alert.clientName}
                            </Link>
                        ) : alert.clientName}
                    </CardTitle>
                    <Badge variant={alert.isPostCarrera ? 'default' : 'destructive'} className={`uppercase text-[10px] ${alert.isPostCarrera ? 'bg-violet-600' : ''}`}>
                        {alert.isPostCarrera ? 'Post-Carrera' : 'Vencido'}
                    </Badge>
                </div>
                <p className="text-sm font-medium text-slate-600">{alert.bikeModel}</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className={`bg-white/60 p-2 rounded-md border ${alert.isPostCarrera ? 'border-violet-100' : 'border-red-100'}`}>
                    <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-1 mb-1">
                        {alert.isPostCarrera ? <Flag className="w-3 h-3 text-violet-600" /> : null}
                        {alert.isPostCarrera ? 'Seguimiento Evento' : 'Componente a Revisar'}
                    </span>
                    <div className={`font-semibold ${alert.isPostCarrera ? 'text-violet-700' : 'text-red-700'}`}>{alert.component}</div>
                    <div className={`text-xs mt-1 ${alert.isPostCarrera ? 'text-violet-500' : 'text-red-500'}`}>
                        {alert.isPostCarrera
                            ? `Fue el ${alert.dueDate.split('-').reverse().join('/')}`
                            : `Venció el ${new Date(alert.dueDate).toLocaleDateString()}`
                        }
                    </div>
                    {/* Idea 5: si la fecha salió del historial de ESE ciclista, se
                        dice con qué base. Si no hay predicción, es el plazo fijo
                        de siempre — nunca una predicción sin base. */}
                    {alert.prediccion && (
                        <div className="text-[11px] text-slate-500 mt-1">
                            A este ciclista le dura ~{alert.prediccion.cadaDias} días, según {alert.prediccion.intervalos === 1 ? 'un intervalo real' : `${alert.prediccion.intervalos} intervalos reales`} de su historial (último: {alert.prediccion.ultimoEvento.split('-').reverse().join('/')}).
                        </div>
                    )}
                </div>
                <div data-tour="retencion-contactar" className="flex flex-col gap-2">
                    <Button
                        className={`w-full font-semibold ${enviado ? 'bg-slate-400 hover:bg-slate-400 text-white' : alert.isPostCarrera ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                        disabled={enviando || enviado}
                        onClick={async () => {
                            setEnviando(true);
                            const r = await contactar(alert, messageText);
                            setEnviando(false);
                            // Solo se marca "enviado" cuando salió por la API. Si cayó
                            // a wa.me, el envío lo termina la persona en su WhatsApp y
                            // el sistema no puede afirmar que se mandó.
                            if (r === 'enviado') setEnviado(true);
                        }}
                    >
                        {/* "Escribir" va en el rótulo a propósito: las instrucciones que se le
                            entregaron a Meta en el App Review dicen textual «press "Escribir"»,
                            y esa solicitud ya no se puede editar. El resto de la frase queda
                            porque para el mecánico "Escribir" a secas no dice qué se escribe. */}
                        {enviando
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
                            : enviado
                                ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Mensaje enviado</>
                                : <><Phone className="mr-2 h-4 w-4" /> {modoAuto ? 'Escribir recordatorio' : 'Escribir por WhatsApp'}</>}
                    </Button>
                    <Button
                        variant="outline"
                        className={`w-full font-semibold transition-colors ${isCopied ? 'border-green-500 text-green-600 bg-green-50' : 'border-slate-300 text-slate-700'}`}
                        onClick={handleCopy}
                    >
                        {isCopied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        {isCopied ? "¡Copiado!" : "Copiar Mensaje"}
                    </Button>
                    {perfilHref(alert) && (
                        <Button variant="outline" className="w-full font-semibold border-slate-300 text-slate-700" asChild>
                            <Link to={perfilHref(alert)!}>
                                <User className="w-4 h-4 mr-2" /> Ver perfil del cliente
                            </Link>
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={!alert.servicioId}
                        title={!alert.servicioId ? "No hay servicio asociado para guardar descarte." : ""}
                        className="w-full text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 mt-1"
                        onClick={handleDismiss}
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2 opacity-70" />
                        Ocultar aviso
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
