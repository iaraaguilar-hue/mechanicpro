import { useMemo } from "react";
import { useDataStore } from "@/store/dataStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Phone, Calendar, CheckCircle2, BellRing } from "lucide-react";

export default function RetentionEngine() {
    const recordatorios = useDataStore(s => s.recordatorios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const isHydrating = useDataStore(s => s.isHydrating);

    // Build alerts from store (replaces getAllRemindersWithDetails)
    const alerts = useMemo(() => {
        return recordatorios
            .filter(r => {
                const bike = bicicletas.find(b => b.id === r.bicicleta_id);
                const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;
                return !client?.isDeleted;
            })
            .map(r => {
                const bike = bicicletas.find(b => b.id === r.bicicleta_id);
                const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

                const due = new Date(r.fecha_vencimiento || 0);
                const today = new Date();
                const diffTime = due.getTime() - today.getTime();
                const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return {
                    id: r.id,
                    clientName: client?.nombre || "Desconocido",
                    clientPhone: client?.telefono || "",
                    bikeModel: bike?.modelo || "Desconocida",
                    component: r.componente || "Sin componente",
                    dueDate: r.fecha_vencimiento || "",
                    daysRemaining,
                };
            });
    }, [recordatorios, bicicletas, clientes]);

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
                            <Card key={alert.id} className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow bg-red-50/50">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-lg font-bold text-slate-800">{alert.clientName}</CardTitle>
                                        <Badge variant="destructive" className="uppercase text-[10px]">Vencido</Badge>
                                    </div>
                                    <p className="text-sm font-medium text-slate-600">{alert.bikeModel}</p>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="bg-white/60 p-2 rounded-md border border-red-100">
                                        <span className="text-xs text-muted-foreground uppercase font-bold block mb-1">Componente a Revisar</span>
                                        <div className="font-semibold text-red-700">{alert.component}</div>
                                        <div className="text-xs text-red-500 mt-1">Venció el {new Date(alert.dueDate).toLocaleDateString()}</div>
                                    </div>
                                    <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold" asChild>
                                        <a href={`https://wa.me/${alert.clientPhone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
                                            <Phone className="mr-2 h-4 w-4" /> Contactar por WhatsApp
                                        </a>
                                    </Button>
                                </CardContent>
                            </Card>
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
                                        <TableCell className="font-medium">{new Date(alert.dueDate).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{alert.daysRemaining} días</Badge>
                                        </TableCell>
                                        <TableCell className="font-semibold">{alert.component}</TableCell>
                                        <TableCell>{alert.clientName}</TableCell>
                                        <TableCell className="text-muted-foreground">{alert.bikeModel}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" asChild className="h-8 text-green-600 hover:text-green-700 hover:bg-green-50">
                                                <a href={`https://wa.me/${alert.clientPhone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
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
