import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { formatOrdenNumber } from "@/lib/formatId";
import { printServiceReport } from "@/lib/printServiceBtn";
import { ServiceModal } from "@/components/ServiceModal";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, CheckCircle, Save, FileDown, Pencil, RefreshCcw, MessageCircle, ChevronRight, Clock, PackageCheck, ClipboardList, Undo2, ListChecks, Lock } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HealthCheckWidget, type HealthCheckData } from "@/components/HealthCheckWidget";
import { shouldFireOrdenWebhook, getEntregadoWebhookUrl } from "@/lib/ordenWebhook";
import { EtapasChecklist } from "@/components/EtapasChecklist";
import { avancesActivos, trabajosPendientes, tareasActivas, bloqueoFinalizacionActivo, tareasLibresPendientes } from "@/lib/planFeatures";

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
    const updateServicio = useDataStore(s => s.updateServicio);
    const taller_id = useAuthStore(s => s.taller_id);

    const [editingJob, setEditingJob] = useState<DashboardJob | null>(null);
    const [finalizingJob, setFinalizingJob] = useState<DashboardJob | null>(null);
    const [isRefetching, setIsRefetching] = useState(false);
    // "Recibir Bici" abre el wizard directo (identificación del cliente),
    // sin la pantalla intermedia de Recepción (Tarea E).
    const [newServiceOpen, setNewServiceOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    // Confirmación linda (estilo MP) en vez de window.confirm
    const [confirming, setConfirming] = useState<{ kind: 'deliver' | 'reopen'; job: DashboardJob } | null>(null);

    // Compute active jobs from store (replaces getDashboardJobs)
    // 'ready' NO está acá: la bici finalizada queda en el Taller Activo como
    // "Listo para entregar" hasta que se aprieta "Entregar Bici" (feedback 11 a Fondo).
    const jobs = useMemo(() => {
        const completedStatuses = ['completed', 'finalizado', 'entregado', 'old_completed', 'delivered'];
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

    // Acceso rápido desde la campana (Tarea F): /?openService=<id> abre la
    // orden puntual para completar sus tareas. Se limpia el query param al abrir.
    // Si el store todavía no hidrató (recarga directa de la URL), esperamos:
    // no borramos el param hasta poder buscar la orden.
    useEffect(() => {
        const openId = searchParams.get('openService');
        if (!openId) return;
        const job = jobs.find(j => j.service_id === openId);
        if (job) setEditingJob(job);
        else if (isHydrating) return; // aún cargando → reintenta cuando hidrate
        searchParams.delete('openService');
        setSearchParams(searchParams, { replace: true });
    }, [searchParams, jobs, isHydrating, setSearchParams]);

    const handleRefresh = async () => {
        if (!taller_id) return;
        setIsRefetching(true);
        await fetchDashboardData(taller_id);
        setIsRefetching(false);
    };

    // Paso 2 del flujo: el cliente retiró la bici → recién ahí pasa al historial
    const doDeliver = async (job: DashboardJob) => {
        try {
            await updateServicio(job.service_id, {
                estado: 'delivered',
                fecha_entregado: new Date().toISOString(),
            });

            // Webhook "bici entregada" → Probikes actualiza la fecha de la orden al día
            // real en que el cliente la retiró (a veces se cobra días después de finalizar).
            // Mismo guard que el webhook de orden: SOLO Probikes toca su automatización;
            // otros talleres son autosuficientes. Ver lib/ordenWebhook.ts.
            // numero_orden va con el MISMO formato que se mandó al finalizar (#0042) para
            // que la orden matchee en la base de Probikes.
            if (shouldFireOrdenWebhook(taller_id)) {
                const url = getEntregadoWebhookUrl();
                if (url) {
                    const payload = { numero_orden: formatOrdenNumber(job.numero_orden, job.service_id) };
                    fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        keepalive: true,
                    }).catch(e => console.error('Webhook entregado Error (Fetch):', e));
                }
            }
        } catch (e: any) {
            console.error("Error entregando:", e);
            alert(`Error al registrar la entrega: ${e.message}`);
        }
    };

    // Deshacer un "Finalizar Service" apretado por error: vuelve a En curso.
    // El webhook ERP NO se re-dispara al re-finalizar (marca webhook_erp_disparado).
    const doReopen = async (job: DashboardJob) => {
        try {
            await updateServicio(job.service_id, {
                estado: 'in_progress',
                fecha_finalizacion: null,
            });
        } catch (e: any) {
            console.error("Error reabriendo:", e);
            alert(`Error al reabrir el service: ${e.message}`);
        }
    };

    const handleDeliver = (job: DashboardJob) => setConfirming({ kind: 'deliver', job });
    const handleReopen = (job: DashboardJob) => setConfirming({ kind: 'reopen', job });

    const paraEntregar = jobs.filter(j => (j.status || '').toLowerCase() === 'ready');
    const enProceso = jobs.length - paraEntregar.length;

    if (isHydrating) return <div className="p-8 text-center text-muted-foreground">Cargando taller...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Wrench className="h-8 w-8 text-primary" />
                        Taller Activo
                    </h1>
                    <p className="text-muted-foreground mt-1">Trabajos en curso y bicis listas para entregar.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {/* Recibir Bici abre el wizard directo (identificación del cliente),
                        sin pantalla intermedia de Recepción (Tarea E). */}
                    <Button
                        className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                        onClick={() => setNewServiceOpen(true)}
                    >
                        <ClipboardList className="h-4 w-4" /> Recibir Bici
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleRefresh} title="Recargar datos">
                        <RefreshCcw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full">
                <Card className="bg-primary border-none shadow-md text-primary-foreground">
                    <CardContent className="p-6 flex flex-col gap-1">
                        <p className="text-xs font-bold text-white/90 uppercase tracking-widest">En Proceso</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-4xl font-black">{enProceso}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-secondary border-none shadow-md text-secondary-foreground">
                    <CardContent className="p-6 flex flex-col gap-1">
                        <p className="text-xs font-bold text-white/90 uppercase tracking-widest">Listas para Entregar</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-4xl font-black">{paraEntregar.length}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── MOBILE: Compact horizontal cards (hidden on md+) ── */}
            <div className="block md:hidden">
                {jobs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-12">No hay bicicletas en el taller.</p>
                ) : (
                    jobs.map((job) => (
                        <MobileJobCard
                            key={job.service_id}
                            job={job}
                            onClick={() => setEditingJob(job)}
                            onDeliver={() => handleDeliver(job)}
                            onReopen={() => handleReopen(job)}
                        />
                    ))
                )}
            </div>

            {/* ── DESKTOP: Full table (hidden on mobile) ── */}
            <div className="hidden md:block rounded-md border bg-card">
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
                                onDeliver={() => handleDeliver(job)}
                                onReopen={() => handleReopen(job)}
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

            {/* Nuevo service directo desde "Recibir Bici" (Tarea E) */}
            {newServiceOpen && (
                <ServiceModal
                    isOpen={newServiceOpen}
                    onClose={() => setNewServiceOpen(false)}
                    onSuccess={() => setNewServiceOpen(false)}
                />
            )}

            {finalizingJob && (
                <FinalizeJobDialog
                    job={finalizingJob}
                    isOpen={!!finalizingJob}
                    onClose={() => { setFinalizingJob(null); handleRefresh(); }}
                />
            )}

            {confirming && (
                <ConfirmDialog
                    open={!!confirming}
                    onClose={() => setConfirming(null)}
                    onConfirm={() => {
                        const c = confirming;
                        setConfirming(null);
                        if (c.kind === 'deliver') doDeliver(c.job); else doReopen(c.job);
                    }}
                    icon={confirming.kind === 'deliver' ? <PackageCheck className="h-7 w-7" /> : <Undo2 className="h-7 w-7" />}
                    iconClassName={confirming.kind === 'deliver' ? 'bg-secondary/15 text-secondary' : 'bg-slate-100 text-slate-600'}
                    title={confirming.kind === 'deliver' ? 'Entregar la bici' : 'Reabrir el service'}
                    description={confirming.kind === 'deliver'
                        ? <>¿<span className="font-semibold text-foreground">{confirming.job.client_name}</span> retiró su <span className="font-semibold text-foreground">{confirming.job.bike_brand} {confirming.job.bike_model}</span>? La orden pasa al historial como <span className="font-semibold text-foreground">Entregada</span>.</>
                        : <>El service de <span className="font-semibold text-foreground">{confirming.job.client_name}</span> vuelve a <span className="font-semibold text-foreground">En curso</span> para seguir trabajándolo.</>}
                    confirmLabel={confirming.kind === 'deliver' ? 'Sí, entregar' : 'Sí, reabrir'}
                    confirmClassName={confirming.kind === 'deliver'
                        ? 'bg-secondary hover:bg-secondary/90 text-secondary-foreground'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'}
                />
            )}
        </div>
    );
}

function MobileJobCard({ job, onClick, onDeliver, onReopen }: { job: DashboardJob; onClick: () => void; onDeliver: () => void; onReopen: () => void }) {
    const taller = useAuthStore(s => s.taller);
    const mostrarEtapas = avancesActivos(taller);
    const mostrarTareas = tareasActivas(taller);
    const isReady = (job.status || '').toLowerCase() === 'ready';
    return (
        <div
            onClick={onClick}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-3 active:scale-[0.98] transition-transform cursor-pointer"
        >
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1 flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-600 text-[11px] font-bold px-1.5 py-0.5 rounded-md">
                            #{job.numero_orden ? String(job.numero_orden).padStart(4, '0') : job.service_id.slice(-4)}
                        </span>
                        <h3 className="font-semibold text-slate-800 text-sm truncate">{job.client_name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Wrench size={12} className="flex-shrink-0" />
                        <span className="truncate">{job.bike_brand} {job.bike_model}</span>
                    </div>
                    {(mostrarEtapas || mostrarTareas) && <EtapasChecklist serviceId={job.service_id} />}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={job.status} />
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={10} />
                            {job.date_out ? formatSafeDate(job.date_out) : formatSafeDate(job.date_in)}
                        </span>
                    </div>
                    <ChevronRight size={18} className="text-slate-300" />
                </div>
            </div>
            {isReady && (
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={(e) => { e.stopPropagation(); onReopen(); }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-slate-600 border border-slate-300 hover:bg-slate-100 active:bg-slate-100 rounded-lg transition-colors"
                        title="¿Se finalizó por error? Vuelve a En curso"
                    >
                        <Undo2 size={15} /> Reabrir
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeliver(); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-secondary-foreground bg-secondary hover:bg-secondary/90 active:bg-secondary/90 rounded-lg transition-colors"
                    >
                        <PackageCheck size={16} /> Entregar Bici
                    </button>
                </div>
            )}
        </div>
    );
}

function JobRow({ job, onClick, onFinalize, onDeliver, onReopen }: { job: DashboardJob, onClick: () => void, onFinalize: () => void, onDeliver: () => void, onReopen: () => void }) {
    const handleFinish = (e: React.MouseEvent) => { e.stopPropagation(); onFinalize(); };
    const isReady = (job.status || '').toLowerCase() === 'ready';

    const statusBadge = <StatusBadge status={job.status} />;

    const [showToast, setShowToast] = useState<{type: 'success' | 'error', message: string} | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const taller_id = useAuthStore(s => s.taller_id);
    const taller = useAuthStore(s => s.taller);
    const servicios = useDataStore(s => s.servicios);
    const mostrarEtapas = avancesActivos(taller);
    const mostrarTareas = tareasActivas(taller);

    const notifyCustomer = async (e: React.MouseEvent) => {
        e.stopPropagation();

        let rawPhone = job.client_phone || "";
        let cleanedPhone = rawPhone.replace(/\D/g, '');

        if (cleanedPhone.length !== 10) {
            setShowToast({
                type: 'error',
                message: "Error: El número de teléfono parece incorrecto. Verifica si le falta el '11' al principio o si tiene números de más."
            });
            setTimeout(() => setShowToast(null), 5000);
            return;
        }

        setIsLoading(true);
        setShowToast(null);

        try {
            // 1. Obtener los datos completos del servicio
            const serviceData = servicios.find(s => s.id === job.service_id);
            if (!serviceData) throw new Error("No se encontró el servicio en el store local.");

            // 2. Construir objeto de servicio para generar PDF
            const fullJobForPdf = {
                id: serviceData.id,
                numero_orden: serviceData.numero_orden,
                bike_id: serviceData.bicicleta_id,
                status: serviceData.estado || '',
                service_type: serviceData.tipo_servicio,
                date_in: serviceData.fecha_ingreso,
                date_out: serviceData.fecha_entrega,
                basePrice: serviceData.precio_base,
                totalPrice: serviceData.precio_total,
                extraItems: serviceData.items_extra?.map((i: any) => ({
                    id: i.id || crypto.randomUUID(),
                    description: i.descripcion,
                    price: i.precio,
                    category: i.categoria,
                })),
                mechanic_notes: serviceData.notas_mecanico,
            };

            // 3. Generar el PDF en formato Blob sin descargarlo localmente
            const pdfBlob = await printServiceReport(
                fullJobForPdf, 
                job.client_name, 
                job.bike_model, 
                "", 
                job.client_phone || "", 
                false
            );

            if (!pdfBlob) throw new Error("No se pudo generar el PDF internamente.");

            // 4. Subir a Supabase Storage (bucket público: ordenes_trabajo)
            const fileName = `orden_${job.service_id}_${Date.now()}.pdf`;
            const { error: uploadError } = await supabase.storage
                .from('ordenes_trabajo')
                .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

            if (uploadError) {
                console.error("Supabase Upload Error:", uploadError);
                throw new Error("Error al generar y guardar el PDF en la nube. Intenta nuevamente.");
            }

            // 5. Obtener URL pública
            const { data: { publicUrl } } = supabase.storage
                .from('ordenes_trabajo')
                .getPublicUrl(fileName);

            // 6. Preparar y enviar mensaje
            const messageText = `Hola ${job.client_name}, te avisamos que tu bicicleta ${job.bike_model} ya está lista. El total del service es de $${job.total_price || 0}. Te recordamos que la mano de obra se abona únicamente en efectivo o transferencia. Los repuestos podés abonarlos en efectivo, transferencia o tarjeta. ¡Te esperamos!`;

            const payload = {
                taller_id: taller_id,
                telefono: cleanedPhone,
                mensaje: messageText,
                pdf_url: publicUrl
            };

            const response = await fetch(import.meta.env.VITE_N8N_WHATSAPP_WEBHOOK_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setShowToast({
                    type: 'success',
                    message: "¡Mensaje y orden de trabajo enviados por WhatsApp correctamente!"
                });
            } else {
                throw new Error("Error HTTP del webhook de n8n.");
            }
        } catch (error: any) {
            setShowToast({
                type: 'error',
                message: error.message || "Error de conexión con el servidor de WhatsApp. Intenta nuevamente."
            });
        } finally {
            setIsLoading(false);
            setTimeout(() => setShowToast(null), 4000);
        }
    };

    const serviceBadge = (
        <Badge variant={(job.service_type || "OTRO").toUpperCase() === "OTRO" ? "secondary" : "default"} className={`whitespace-nowrap ${(job.service_type || "OTRO").toUpperCase() !== "OTRO" ? "bg-primary hover:bg-primary/90 text-primary-foreground border-none" : "text-muted-foreground"}`}>
            {(job.service_type || "OTRO").toUpperCase()}
        </Badge>
    );

    return (
        <>
            <TableRow className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={onClick}>
                <TableCell>
                    {statusBadge}
                    {(mostrarEtapas || mostrarTareas) && <EtapasChecklist serviceId={job.service_id} />}
                </TableCell>
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
                    <div className="flex flex-wrap justify-end gap-2">
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
                        {job.status !== 'delivered' && (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-green-500 text-green-600 hover:bg-green-50 h-9 px-2 gap-2"
                                    onClick={notifyCustomer}
                                    disabled={isLoading}
                                    title="Avisar que está lista por WhatsApp"
                                >
                                    {isLoading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                                    Avisar por WhatsApp
                                </Button>
                                {/* Los DOS pasos siempre a la vista: primero Finalizar, después Entregar.
                                    Si se finalizó por error, el slot se convierte en "Reabrir". */}
                                {isReady ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-slate-300 text-slate-600 hover:bg-slate-100 h-9 gap-2"
                                        onClick={(e) => { e.stopPropagation(); onReopen(); }}
                                        title="¿Se finalizó por error? Vuelve a En curso"
                                    >
                                        <Undo2 className="h-4 w-4" /> Reabrir
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700 text-white h-9 gap-2"
                                        onClick={handleFinish}
                                        title="El mecánico terminó el trabajo"
                                    >
                                        <CheckCircle className="h-4 w-4" /> Finalizar Service
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    className="bg-secondary hover:bg-secondary/90 text-secondary-foreground h-9 gap-2 disabled:opacity-40"
                                    onClick={(e) => { e.stopPropagation(); onDeliver(); }}
                                    disabled={!isReady}
                                    title={isReady ? "El cliente retiró la bici: pasa al historial" : "Primero finalizá el service"}
                                >
                                    <PackageCheck className="h-4 w-4" /> Entregar Bici
                                </Button>
                            </>
                        )}
                    </div>
                </TableCell>
            </TableRow>
            {
                showToast && (
                    <div className={`fixed bottom-4 right-4 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5 ${showToast.type === 'error' ? 'bg-red-600' : 'bg-slate-800'}`}>
                        {showToast.type === 'error' ? <div className="text-white w-5 h-5 flex items-center justify-center font-bold text-xl">!</div> : <CheckCircle className="text-green-400 w-5 h-5" />}
                        <div className="flex flex-col">
                            <span className="font-semibold text-sm">{showToast.type === 'error' ? 'Atención' : 'Notificación enviada'}</span>
                            <span className="text-xs text-white/90">{showToast.message}</span>
                        </div>
                    </div>
                )
            }
        </>
    )
}


function FinalizeJobDialog({ job, isOpen, onClose }: { job: DashboardJob, isOpen: boolean, onClose: () => void }) {
    const servicios = useDataStore(s => s.servicios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const updateServicio = useDataStore(s => s.updateServicio);
    const upsertRecordatorios = useDataStore(s => s.upsertRecordatorios);
    const taller_id = useAuthStore(s => s.taller_id);
    const taller = useAuthStore(s => s.taller);

    const service = servicios.find(s => s.id === job.service_id) || null;
    const bike = service ? bicicletas.find(b => b.id === service.bicicleta_id) : null;
    const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

    const [notes, setNotes] = useState(service?.notas_mecanico || "");
    const [healthCheckData, setHealthCheckData] = useState<HealthCheckData[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [pendientesConfirm, setPendientesConfirm] = useState<string[] | null>(null);
    const [bloqueoPendientes, setBloqueoPendientes] = useState<string[] | null>(null);

    const handleFinalize = async () => {
        if (!service) return;

        const estadoActual = (service.estado || '').toLowerCase();
        const yaCerrado = estadoActual === 'ready' || estadoActual === 'delivered';

        if (!yaCerrado) {
            // Junta lo que quedó sin tildar: trabajos del checklist (si está activo)
            // + tareas libres del mecánico (si están activas).
            const pendDerivadas = avancesActivos(taller) ? trabajosPendientes(service).map(t => t.etiqueta) : [];
            const pendLibres = tareasActivas(taller) ? tareasLibresPendientes(service).map(t => t.texto) : [];
            const pendientes = [...pendDerivadas, ...pendLibres];

            if (pendientes.length > 0) {
                // Candado (poka-yoke): si el taller lo prendió, NO se puede finalizar.
                if (bloqueoFinalizacionActivo(taller)) {
                    setBloqueoPendientes(pendientes);
                    return;
                }
                // Sin candado: solo avisa, pero deja finalizar igual.
                setPendientesConfirm(pendientes);
                return;
            }
        }
        await doFinalize();
    };

    const doFinalize = async () => {
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

            // Mark as completed if not already
            const currentStatus = (service.estado || '').toLowerCase();
            const wasJustCompleted = currentStatus !== 'ready' && currentStatus !== 'delivered';

            if (wasJustCompleted) {
                // 1. UPDATE a Supabase para cambiar el estado
                const fechaFinalizacion = new Date().toISOString();
                await updateServicio(job.service_id, { estado: 'ready', fecha_finalizacion: fechaFinalizacion });

                // 2. Inmediatamente después del éxito del update, enviamos el Webhook
                try {
                    // Filtrar solo los ítems que son productos (excluir mano de obra y productos ML)
                    const esML = (desc: string) => /\(ml\)|\(mercado libre\)/i.test(desc);
                    const productosFisicos = (service.items_extra || []).filter(
                        (p: any) => p.categoria === 'part' && !esML(p.descripcion || '')
                    );

                    if (productosFisicos.length > 0) {
                        const totalProductos = productosFisicos.reduce((sum: number, p: any) => sum + (Number(p.precio) || 0), 0);
                        const nombresConcatenados = productosFisicos.map((p: any) => p.descripcion).join(", ");

                        const payload = {
                            numero_orden: formatOrdenNumber(service.numero_orden, service.id),
                            dni_cliente: client?.dni || "Sin DNI",
                            nombre_cliente: client?.nombre || "Cliente",
                            fecha_finalizacion: fechaFinalizacion,
                            nombre_producto: nombresConcatenados,
                            productos: productosFisicos.map((p: any) => ({
                                descripcion: p.descripcion,
                                precio: Number(p.precio) || 0
                            })),
                            total_service: totalProductos,
                        };

                        // Guard multi-taller: solo Probikes dispara la baja de stock / orden ERP
                        // desde el frontend. Otros talleres (ej: Once a Fondo) son autosuficientes
                        // y no deben tocar la automatización de Probikes. Ver lib/ordenWebhook.ts.
                        // Guard anti-doble-disparo: si el service se reabrió y se volvió a
                        // finalizar, el stock ya se descontó la primera vez.
                        if (shouldFireOrdenWebhook(taller_id) && !service.webhook_erp_disparado) {
                            fetch(import.meta.env.VITE_N8N_ORDEN_WEBHOOK_URL, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(payload),
                                keepalive: true
                            }).catch(e => console.error("Webhook Error (Fetch):", e));
                            await updateServicio(job.service_id, { webhook_erp_disparado: true });
                        } else if (service.webhook_erp_disparado) {
                            console.log("Webhook de orden NO re-disparado: ya corrió para este service (reabierto y re-finalizado).");
                        } else {
                            console.log("Webhook de orden NO disparado: taller autosuficiente (no es Probikes).");
                        }
                    } else {
                        console.log("Webhook saltado: El servicio no incluye repuestos físicos.");
                    }
                } catch (err) {
                    console.error("Error preparando el Webhook:", err);
                }
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

                    {/* Diagnóstico al finalizar: se muestra salvo que el taller haya
                        elegido registrarlo SOLO 'durante' el service (Tarea G-pref). */}
                    {!isCompleted && (taller?.config_notificaciones?.momento_diagnostico || 'final') !== 'durante' && (
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

            {/* Confirmación linda del seguro anti-olvidos (antes era window.confirm) */}
            {pendientesConfirm && (
                <ConfirmDialog
                    open={!!pendientesConfirm}
                    onClose={() => setPendientesConfirm(null)}
                    onConfirm={() => { setPendientesConfirm(null); doFinalize(); }}
                    icon={<ListChecks className="h-7 w-7" />}
                    iconClassName="bg-primary/10 text-primary"
                    title={`Quedaron ${pendientesConfirm.length} trabajo(s) sin tildar`}
                    description={
                        <div className="text-left bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                            {pendientesConfirm.map((etiqueta, i) => (
                                <div key={i} className="flex items-start gap-2 py-0.5">
                                    <span className="text-slate-400 mt-0.5">•</span>
                                    <span className="text-slate-700">{etiqueta}</span>
                                </div>
                            ))}
                        </div>
                    }
                    confirmLabel="Finalizar igual"
                    confirmClassName="bg-green-600 hover:bg-green-700 text-white"
                    cancelLabel="Volver al checklist"
                />
            )}

            {/* Candado (poka-yoke): faltan tareas → NO deja finalizar */}
            {bloqueoPendientes && (
                <ConfirmDialog
                    open={!!bloqueoPendientes}
                    onClose={() => setBloqueoPendientes(null)}
                    onConfirm={() => { setBloqueoPendientes(null); onClose(); }}
                    icon={<Lock className="h-7 w-7" />}
                    iconClassName="bg-amber-100 text-amber-600"
                    title={`Faltan ${bloqueoPendientes.length} tarea(s) por completar`}
                    description={
                        <div className="text-left bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                            <p className="text-slate-500 mb-2 text-xs">Este taller pide completar todas las tareas antes de finalizar el service:</p>
                            {bloqueoPendientes.map((etiqueta, i) => (
                                <div key={i} className="flex items-start gap-2 py-0.5">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span className="text-slate-700">{etiqueta}</span>
                                </div>
                            ))}
                        </div>
                    }
                    confirmLabel="Ir a la lista de tareas"
                    confirmClassName="bg-primary hover:bg-primary/90 text-primary-foreground"
                    cancelLabel="Volver"
                />
            )}
        </Dialog>
    )
}
