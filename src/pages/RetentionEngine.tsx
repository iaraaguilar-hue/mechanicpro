import { useMemo, useState } from "react";
import { useDataStore } from "@/store/dataStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Phone, Calendar, CheckCircle2, BellRing, Flag, Copy } from "lucide-react";
import { calculateDaysRemaining } from "@/lib/utils";

export default function RetentionEngine() {
    const recordatorios = useDataStore(s => s.recordatorios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const servicios = useDataStore(s => s.servicios);
    const carreras = useDataStore(s => s.carreras);
    const isHydrating = useDataStore(s => s.isHydrating);

    // Build alerts from store (replaces getAllRemindersWithDetails)
    const alerts = useMemo(() => {
        const baseAlerts = recordatorios
            .filter(r => {
                const bike = bicicletas.find(b => b.id === r.bicicleta_id);
                const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

                // Get all dismissed alerts for this bike across all its services
                const dismissedAlerts = bike
                    ? servicios.filter(s => s.bicicleta_id === bike.id).flatMap(s => s.alertas_ocultas || [])
                    : [];

                return !client?.isDeleted && !dismissedAlerts.includes(r.componente || '');
            })
            .map(r => {
                const bike = bicicletas.find(b => b.id === r.bicicleta_id);
                const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

                const daysRemaining = calculateDaysRemaining(r.fecha_vencimiento || "");

                // Find most recent service to attach the dismissal if needed
                const mostRecentService = servicios
                    .filter(s => s.bicicleta_id === r.bicicleta_id)
                    .sort((a, b) => new Date(b.fecha_ingreso || 0).getTime() - new Date(a.fecha_ingreso || 0).getTime())[0];

                return {
                    id: r.id,
                    servicioId: mostRecentService?.id,
                    alertIdentity: r.componente,
                    clientName: client?.nombre || "Desconocido",
                    clientPhone: client?.telefono || "",
                    bikeModel: bike?.modelo || "Desconocida",
                    component: r.componente || "Sin componente",
                    dueDate: r.fecha_vencimiento || "",
                    daysRemaining,
                    isPostCarrera: false,
                    isPreCarrera: false,
                    carreraName: "",
                };
            });

        const postCarreraAlerts = servicios
            .filter(s => s.carrera_id != null)
            .map(s => {
                const carrera = carreras.find(c => c.id === s.carrera_id);
                const bike = bicicletas.find(b => b.id === s.bicicleta_id);
                const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

                if (!carrera || !carrera.fecha_evento || !client || client.isDeleted) return null;

                const dismissedAlerts = s.alertas_ocultas || [];
                const carreraAlertIdentity = `carrera-${carrera.id}`;
                if (dismissedAlerts.includes(carreraAlertIdentity)) return null;

                if (!carrera.fecha_evento) return null;
                const daysUntilEvent = calculateDaysRemaining(carrera.fecha_evento);
                const daysSinceEvent = -daysUntilEvent;

                if (daysSinceEvent >= 1 && daysSinceEvent <= 2) {
                    return {
                        id: `carrera-urgent-${s.id}`,
                        servicioId: s.id,
                        alertIdentity: carreraAlertIdentity,
                        clientName: client.nombre,
                        clientPhone: client.telefono || "",
                        bikeModel: bike?.modelo || "Desconocida",
                        component: `¿Cómo le fue en ${carrera.nombre}?`,
                        dueDate: carrera.fecha_evento,
                        daysRemaining: -daysSinceEvent, // Negative to put it in urgent
                        isPostCarrera: true,
                        isPreCarrera: false,
                        carreraName: carrera.nombre,
                    };
                }

                // PRE-CARRERA (Event is in the future)
                // daysSinceEvent < 0 means it hasn't happened yet
                if (daysSinceEvent < 0) {
                    return {
                        id: `pre-carrera-${s.id}`,
                        servicioId: s.id,
                        alertIdentity: carreraAlertIdentity,
                        clientName: client.nombre,
                        clientPhone: client.telefono || "",
                        bikeModel: bike?.modelo || "Desconocida",
                        component: `🏁 Carrera: ${carrera.nombre}`,
                        dueDate: carrera.fecha_evento,
                        daysRemaining: -daysSinceEvent, // Positive days remaining until event
                        isPostCarrera: false,
                        isPreCarrera: true,
                        carreraName: carrera.nombre,
                    };
                }

                return null;
            })
            .filter(Boolean) as any[];

        return [...baseAlerts, ...postCarreraAlerts];
    }, [recordatorios, bicicletas, clientes, servicios, carreras]);

    if (isHydrating) return <div className="p-8 text-center text-muted-foreground">Cargando motor de retención...</div>;

    const urgentAlerts = alerts.filter(a => a.daysRemaining <= 0);
    const upcomingAlerts = alerts.filter(a => a.daysRemaining > 0).sort((a, b) => a.daysRemaining - b.daysRemaining);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                    <BellRing className="w-8 h-8 text-sky-500" />
                    Motor de Retención
                </h1>
                <p className="text-muted-foreground mt-1">Gestiona los vencimientos de componentes y genera re-compras.</p>
            </div>

            {alerts.length === 0 && (
                <Card className="border-dashed border-2 py-12 flex flex-col items-center justify-center text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-xl font-semibold">Todo al día</h3>
                    <p className="text-muted-foreground">No hay vencimientos de componentes registrados.</p>
                </Card>
            )}

            {urgentAlerts.length > 0 && (
                <div className="space-y-4">
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
                    <div className="rounded-md border bg-card">
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
                                        <TableCell>{alert.clientName}</TableCell>
                                        <TableCell className="text-muted-foreground">{alert.bikeModel}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" asChild className="h-8 text-green-600 hover:text-green-700 hover:bg-green-50">
                                                <a
                                                    href={`https://wa.me/${alert.clientPhone.replace(/[^0-9]/g, '')}?text=${alert.isPreCarrera
                                                            ? encodeURIComponent(`¡Hola ${alert.clientName}! Vi que se acerca el ${alert.carreraName}, ¿querés que le demos una revisada a la ${alert.bikeModel} antes de viajar?`)
                                                            : ""
                                                        }`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    <Phone className="h-4 w-4" />
                                                </a>
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
function AlertCard({ alert }: { alert: any }) {
    const [isCopied, setIsCopied] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);
    const dismissAlert = useDataStore(s => s.dismissAlert);

    // Dynamic message template based on alert type
    const messageText = alert.isPostCarrera
        ? `¡Hola ${alert.clientName}! ¿Cómo te fue en el ${alert.carreraName}? Contanos cómo se portó la bici.`
        : `¡Hola ${alert.clientName}! Te escribo del taller para recordarte que toca revisar: ${alert.component} en tu ${alert.bikeModel}. ¿Querés que coordinemos un turno?`;

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
            alert("Error al ocultar alerta: " + e.message);
            setIsDismissing(false);
        }
    };

    if (isDismissing) return null; // Optimistic hide at component level to ensure unmount

    return (
        <Card className={`border-l-4 shadow-sm hover:shadow-md transition-shadow ${alert.isPostCarrera ? 'border-l-violet-500 bg-violet-50/50' : 'border-l-red-500 bg-red-50/50'}`}>
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-bold text-slate-800">{alert.clientName}</CardTitle>
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
                <div className="flex flex-col gap-2">
                    <Button className={`w-full font-semibold ${alert.isPostCarrera ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`} asChild>
                        <a
                            href={`https://wa.me/${alert.clientPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(messageText)}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <Phone className="mr-2 h-4 w-4" /> Contactar por WhatsApp
                        </a>
                    </Button>
                    <Button
                        variant="outline"
                        className={`w-full font-semibold transition-colors ${isCopied ? 'border-green-500 text-green-600 bg-green-50' : 'border-slate-300 text-slate-700'}`}
                        onClick={handleCopy}
                    >
                        {isCopied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        {isCopied ? "¡Copiado!" : "Copiar Mensaje"}
                    </Button>
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
