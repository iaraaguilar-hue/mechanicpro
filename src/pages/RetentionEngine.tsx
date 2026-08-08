import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Phone, Calendar, CheckCircle2, BellRing, Flag, Copy, User, Loader2 } from "lucide-react";
import { buildRetentionAlerts, type RetentionAlert } from "@/lib/retentionAlerts";
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

// El mensaje de siempre: el que sale cuando la IA está apagada o falló.
// Vive en un solo lugar porque las dos vistas (tarjeta y tabla) tienen que
// mandar exactamente lo mismo — antes la tabla abría wa.me con el texto
// vacío para los avisos que no eran de carrera.
function mensajeFijo(alert: RetentionAlert): string {
    if (alert.isPostCarrera) {
        return `¡Hola ${alert.clientName}! ¿Cómo te fue en el ${alert.carreraName}? Contanos cómo se portó la bici.`;
    }
    if (alert.isPreCarrera) {
        return `¡Hola ${alert.clientName}! Vi que se acerca el ${alert.carreraName}, ¿querés que le demos una revisada a la ${alert.bikeModel} antes de viajar?`;
    }
    return `¡Hola ${alert.clientName}! Te escribo del taller para recordarte que toca revisar: ${alert.component} en tu ${alert.bikeModel}. ¿Querés que coordinemos un turno?`;
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
        // recibir "está apagada".
        if (taller?.ia_mensajes_activa !== true) return null;
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
        const primerNombre = (alert.clientName || '').trim().split(/\s+/)[0] || alert.clientName;

        // El mensaje completo para el camino manual (wa.me). Es el MISMO
        // texto que arma la plantilla aprobada de Meta: el cliente tiene
        // que recibir lo mismo salga por donde salga.
        const mensajePersonal = personal
            ? `¡Hola ${primerNombre}! ¿Cómo va? Te escribo yo, ${personal.firma} de ${taller?.nombre || 'tu taller'}, por tu bici. ${personal.linea} Si querés lo vemos, escribime por acá.`
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
            ? [primerNombre, `${personal.firma} de ${taller?.nombre || 'tu taller'}`, personal.linea!]
            : alert.isPostCarrera
                ? [alert.clientName, alert.carreraName]
                : alert.isPreCarrera
                    ? [alert.clientName, alert.carreraName, alert.bikeModel]
                    // El nombre del taller va en el mensaje: cuando lo manda un
                    // sistema y no una persona, no decir de quién es se lee como spam.
                    : [alert.clientName, taller?.nombre || 'tu taller', alert.component, alert.bikeModel];

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
    const [enviando, setEnviando] = useState<string | null>(null);

    // Fuente única compartida con la campana (NotificationBell) → mismo
    // listado y mismo alertas_ocultas en los dos lados.
    const alerts = useMemo(
        () => buildRetentionAlerts({ recordatorios, bicicletas, clientes, servicios, carreras }),
        [recordatorios, bicicletas, clientes, servicios, carreras]
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
                                        <TableCell className="font-semibold">{alert.component}</TableCell>
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
                                                    await contactar(alert, mensajeFijo(alert));
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
function AlertCard({ alert }: { alert: RetentionAlert }) {
    const [isCopied, setIsCopied] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);
    const dismissAlert = useDataStore(s => s.dismissAlert);
    const { modoAuto, contactar } = useContactarWhatsApp();
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState(false);

    // El texto de siempre. Es lo que se copia con el botón y lo que sale si
    // la IA está apagada; cuando está prendida, el mensaje real lo escribe
    // la Edge Function con el historial del cliente.
    const messageText = mensajeFijo(alert);

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
                        {enviando
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
                            : enviado
                                ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Mensaje enviado</>
                                : <><Phone className="mr-2 h-4 w-4" /> {modoAuto ? 'Enviar recordatorio' : 'Contactar por WhatsApp'}</>}
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
