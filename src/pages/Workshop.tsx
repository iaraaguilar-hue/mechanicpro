import { useState, useMemo } from "react";
import { useDataStore, type SupabaseService } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { formatOrdenNumber } from "@/lib/formatId";
import { printServiceReport } from "@/lib/printServiceBtn";
import { ServiceModal } from "@/components/ServiceModal";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, CheckCircle, Save, FileDown, Pencil, RefreshCcw, MessageCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HealthCheckWidget, type HealthCheckData } from "@/components/HealthCheckWidget";
import { isExternalItem } from "@/lib/utils";

export const formatSafeDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '-';
    // Extraer solo la parte de la fecha, ignorando timestamps si los hay
    const justDate = dateString.split('T')[0];
    // Cortar el string YYYY-MM-DD
    const [year, month, day] = justDate.split('-');

    // Fallback if split fails
    if (!year || !month || !day) return '-';

    // Devolver literal sin pasar por new Date()
    return `${day}/${month}/${year.slice(-2)}`; // Formato DD/MM/YY
};

// ─────────────────────────────────────────────────────────────
// Dashboard Job shape (computed from store data)
// ─────────────────────────────────────────────────────────────
interface DashboardJob {
    service_id: string;
    numero_orden?: number;
    status: string;
    service_type: string;
    date_in: string;
    bike_brand: string;
    bike_model: string;
    client_name: string;
    client_phone?: string;
    date_out?: string;
    total_price?: number;
    bicicleta_id: string;
}

export default function Workshop() {
    const servicios = useDataStore(s => s.servicios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const isHydrating = useDataStore(s => s.isHydrating);
    const fetchDashboardData = useDataStore(s => s.fetchDashboardData);
    const taller_id = useAuthStore(s => s.taller_id);

    const [editingJob, setEditingJob] = useState<DashboardJob | null>(null);
    const [finalizingJob, setFinalizingJob] = useState<DashboardJob | null>(null);
    const [isRefetching, setIsRefetching] = useState(false);

    // Compute active jobs from store (replaces getDashboardJobs)
    const jobs = useMemo(() => {
        const completedStatuses = ['completed', 'finalizado', 'entregado', 'old_completed', 'ready', 'delivered'];
        const mapped = servicios
            .filter(s => !completedStatuses.includes((s.estado || '').toLowerCase()) && !s.eliminado_en)
            .map(s => {
                const bike = bicicletas.find(b => b.id === s.bicicleta_id);
                const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;
                return {
                    service_id: s.id,
                    numero_orden: s.numero_orden,
                    status: s.estado || 'Intake',
                    service_type: s.tipo_servicio || 'General',
                    date_in: s.fecha_ingreso || new Date().toISOString(),
                    bike_brand: bike?.marca || "Desconocida",
                    bike_model: bike?.modelo || "Desconocida",
                    client_name: client?.nombre || "Desconocido",
                    client_phone: client?.telefono || "",
                    date_out: s.fecha_entrega ?? undefined,
                    total_price: s.precio_total,
                    bicicleta_id: s.bicicleta_id,
                };
            });

        return mapped.sort((a: any, b: any) => {
            if (!a.date_out) return 1;
            if (!b.date_out) return -1;
            return new Date(a.date_out).getTime() - new Date(b.date_out).getTime();
        });
    }, [servicios, bicicletas, clientes]);

    const handleRefresh = async () => {
        if (!taller_id) return;
        setIsRefetching(true);
        await fetchDashboardData(taller_id);
        setIsRefetching(false);
    };

    if (isHydrating) return <div className="p-8 text-center text-muted-foreground">Cargando taller...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Wrench className="h-8 w-8 text-primary" />
                        Taller Activo
                    </h1>
                    <p className="text-muted-foreground mt-1">Gestión de trabajos en curso.</p>
                </div>
                <Button variant="outline" size="icon" onClick={handleRefresh} title="Recargar datos" className="shrink-0">
                    <RefreshCcw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
                </Button>
            </div>

            <div className="w-full">
                <Card className="bg-primary border-none shadow-md text-primary-foreground w-full">
                    <CardContent className="p-6 flex flex-col gap-1">
                        <p className="text-xs font-bold text-white/90 uppercase tracking-widest">En Proceso</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-4xl font-black">{jobs.length}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="w-[100px]">Estado</TableHead>
                            <TableHead>Ingreso</TableHead>
                            <TableHead>Entrega</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Bicicleta</TableHead>
                            <TableHead>Service</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {jobs.map((job) => (
                            <JobRow
                                key={job.service_id}
                                job={job}
                                onClick={() => setEditingJob(job)}
                                onFinalize={() => setFinalizingJob(job)}
                            />
                        ))}
                        {jobs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                    No hay bicicletas en el taller.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {editingJob && (
                <ServiceModal
                    isOpen={!!editingJob}
                    onClose={() => setEditingJob(null)}
                    preSelectedServiceId={editingJob.service_id}
                    onSuccess={() => { }}
                />
            )}

            {finalizingJob && (
                <FinalizeJobDialog
                    job={finalizingJob}
                    isOpen={!!finalizingJob}
                    onClose={() => { setFinalizingJob(null); handleRefresh(); }}
                />
            )}
        </div>
    );
}

function JobRow({ job, onClick, onFinalize }: { job: DashboardJob, onClick: () => void, onFinalize: () => void }) {
    const handleFinish = (e: React.MouseEvent) => { e.stopPropagation(); onFinalize(); };

    const statusBadge = <StatusBadge status={job.status} />;

    const serviceBadge = (
        <Badge variant={(job.service_type || "OTRO").toUpperCase() === "OTRO" ? "secondary" : "default"} className={`whitespace-nowrap ${(job.service_type || "OTRO").toUpperCase() !== "OTRO" ? "bg-primary hover:bg-primary/90 text-primary-foreground border-none" : "text-muted-foreground"}`}>
            {(job.service_type || "OTRO").toUpperCase()}
        </Badge>
    );

    return (
        <TableRow className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={onClick}>
            <TableCell>{statusBadge}</TableCell>
            <TableCell className="font-medium text-muted-foreground w-28">
                <div className="flex flex-col gap-1">
                    <span className="text-slate-900 font-semibold">{formatSafeDate(job.date_in)}</span>
                    <span className="text-[10px] text-primary font-bold mt-1" title={job.service_id}>{formatOrdenNumber(job.numero_orden, job.service_id)}</span>
                </div>
            </TableCell>
            <TableCell className="font-medium p-0 m-0 align-top pt-4">
                {job.date_out ? (
                    <span className="text-slate-600 font-semibold text-sm whitespace-nowrap">{formatSafeDate(job.date_out)}</span>
                ) : (
                    <span className="text-slate-400 italic text-sm">-</span>
                )}
            </TableCell>
            <TableCell>
                <div className="flex flex-col">
                    <span className="font-bold text-base">{job.client_name}</span>
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                        Total: <span className="text-green-600 font-bold ml-1">$ {(job.total_price || 0).toLocaleString("es-AR")}</span>
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <div className="flex flex-col">
                    <span className="font-semibold">{job.bike_model}</span>
                    <span className="text-xs text-muted-foreground">{job.bike_brand}</span>
                </div>
            </TableCell>
            <TableCell>{serviceBadge}</TableCell>
            <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                    {job.client_phone && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 border-green-200 h-9 px-2"
                            onClick={(e) => {
                                e.stopPropagation();
                                let cleanedPhone = job.client_phone!.replace(/\D/g, '');
                                if (!cleanedPhone) return;
                                if (!cleanedPhone.startsWith('54')) {
                                    // Anteponer 549 para celulares de Argentina si no tiene el código de país
                                    cleanedPhone = '549' + cleanedPhone;
                                }
                                window.open('https://wa.me/' + cleanedPhone, '_blank');
                            }}
                            title="Contactar por WhatsApp"
                        >
                            <MessageCircle className="h-5 w-5" />
                        </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-9" onClick={(e) => { e.stopPropagation(); onClick(); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                    </Button>
                    {job.status !== 'ready' && job.status !== 'delivered' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-9 w-9 p-0" onClick={handleFinish} title="Finalizar Trabajo">
                            <CheckCircle className="h-5 w-5" />
                        </Button>
                    )}
                </div>
            </TableCell>
        </TableRow>
    )
}


function FinalizeJobDialog({ job, isOpen, onClose }: { job: DashboardJob, isOpen: boolean, onClose: () => void }) {
    const servicios = useDataStore(s => s.servicios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const updateServicio = useDataStore(s => s.updateServicio);
    const upsertRecordatorios = useDataStore(s => s.upsertRecordatorios);
    const taller_id = useAuthStore(s => s.taller_id);

    const service = servicios.find(s => s.id === job.service_id) || null;
    const bike = service ? bicicletas.find(b => b.id === service.bicicleta_id) : null;
    const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

    const [notes, setNotes] = useState(service?.notas_mecanico || "");
    const [healthCheckData, setHealthCheckData] = useState<HealthCheckData[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const handleFinalize = async () => {
        if (!service) return;
        setIsSaving(true);
        try {
            // Update service notes
            await updateServicio(job.service_id, {
                notas_mecanico: notes,
                checklist_data: {},
            });

            // Create reminders from health check
            if (healthCheckData.length > 0 && taller_id) {
                const reminderItems = healthCheckData.map(item => ({
                    taller_id,
                    bicicleta_id: service.bicicleta_id,
                    componente: item.component,
                    fecha_vencimiento: item.dueDate,
                    fecha_asignacion: new Date().toISOString(),
                    estado: 'Pendiente',
                }));
                await upsertRecordatorios(reminderItems);
            }

            // Webhook logic
            const soldProducts = service.items_extra?.filter((i: any) => i.categoria === 'part') || [];
            const itemsParaFacturar = soldProducts.filter((p: any) => !isExternalItem(p.descripcion));

            if (soldProducts.length > 0 && client) {
                try {
                    const payload = {
                        dni_cliente: client.dni || "Sin DNI",
                        nombre_cliente: client.nombre || "Cliente",
                        fecha_finalizacion: new Date().toISOString(),
                        nombre_producto: itemsParaFacturar.map((p: any) => p.descripcion).join(", "),
                        productos: itemsParaFacturar.map((p: any) => ({ descripcion: p.descripcion, precio: Number(p.precio) || 0 })),
                        total_service: Number(service.precio_total) || 0,
                        numero_orden: service.numero_orden || service.id
                    };
                    fetch("https://nonlepidopterous-memphis-palaeological.ngrok-free.dev/webhook/generar-orden", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                        keepalive: true
                    }).catch(e => console.error("Webhook Error:", e));
                } catch (err) {
                    console.error("Error en Webhook:", err);
                }
            }

            // Mark as completed if not already
            const currentStatus = (service.estado || '').toLowerCase();
            if (currentStatus !== 'ready' && currentStatus !== 'delivered') {
                await updateServicio(job.service_id, { estado: 'ready', fecha_finalizacion: new Date().toISOString() });
            }

            onClose();
        } catch (e: any) {
            console.error("Error finalizando:", e);
            alert(`Error: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadPDF = () => {
        if (!service || !bike || !client) return;
        try {
            printServiceReport(
                {
                    id: service.id as any,
                    bike_id: service.bicicleta_id as any,
                    status: service.estado || '',
                    service_type: service.tipo_servicio as any,
                    date_in: service.fecha_ingreso,
                    date_out: service.fecha_entrega,
                    basePrice: service.precio_base,
                    totalPrice: service.precio_total,
                    extraItems: service.items_extra?.map((i: any) => ({
                        id: i.id || crypto.randomUUID(),
                        description: i.descripcion,
                        price: i.precio,
                        category: i.categoria,
                    })),
                    mechanic_notes: service.notas_mecanico,
                },
                client.nombre,
                bike.modelo,
                client.dni || '',
                client.telefono || ''
            );
        } catch (e) {
            console.error(e);
            alert("Error al generar reporte");
        }
    };

    if (!service) return null;

    const currentStatus = (service.estado || '').toLowerCase();
    const isCompleted = currentStatus === "ready" || currentStatus === "delivered";

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl text-primary">Finalizar Service: {job.client_name}</DialogTitle>
                    <p className="text-muted-foreground">{job.bike_brand} {job.bike_model} - {job.service_type}</p>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Detalle de Costos (Resumen)</Label>
                            <div className="bg-slate-50 rounded-lg p-4 border flex flex-col gap-2 h-32 overflow-y-auto">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Service Base ({service.tipo_servicio})</span>
                                    <span className="font-mono font-bold">$ {service.precio_base?.toLocaleString("es-AR") || 0}</span>
                                </div>
                                {service.items_extra?.map((item: any, idx: number) => (
                                    <div key={item.id || idx} className="flex justify-between items-center text-sm">
                                        <span className="text-slate-600 truncate max-w-[180px]">{item.descripcion}</span>
                                        <span className="font-mono">$ {item.precio?.toLocaleString("es-AR") || 0}</span>
                                    </div>
                                ))}
                                <div className="border-t border-slate-200 mt-auto pt-2 flex justify-between items-center">
                                    <span className="font-bold text-slate-800">TOTAL A COBRAR</span>
                                    <span className="text-xl font-black text-primary">$ {service.precio_total?.toLocaleString("es-AR") || 0}</span>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Observaciones Finales</Label>
                            <Textarea id="notes" className="h-32" placeholder="Notas para el cliente..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                        </div>
                    </div>

                    {!isCompleted && (
                        <div className="pt-2">
                            <HealthCheckWidget onChange={setHealthCheckData} />
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    {isCompleted ? (
                        <>
                            <Button variant="secondary" onClick={handleDownloadPDF}>
                                <FileDown className="mr-2 h-4 w-4" /> PDF
                            </Button>
                            <Button onClick={handleFinalize} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                                <Save className="mr-2 h-4 w-4" /> Guardar Cambios
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleFinalize} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
                            <CheckCircle className="mr-2 h-4 w-4" /> Finalizar Service (Confirmar)
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
