import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useDataStore, type SupabaseBike } from "@/store/dataStore";
import { printServiceReport } from "@/lib/printServiceBtn";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Wrench, AlertTriangle, Clock, Pencil, Save, FileDown, Plus, Trash2, User, Bike as BikeIcon, CheckCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { AddBikeDialog } from "@/components/AddBikeDialog";
import { ServiceModal } from "@/components/ServiceModal";

export default function BikeDetail() {
    const { id, clientId } = useParams<{ id: string, clientId: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Store data
    const storeClientes = useDataStore(s => s.clientes);
    const storeBicicletas = useDataStore(s => s.bicicletas);
    const storeServicios = useDataStore(s => s.servicios);
    const storeRecordatorios = useDataStore(s => s.recordatorios);
    const isHydrating = useDataStore(s => s.isHydrating);
    const updateCliente = useDataStore(s => s.updateCliente);
    const updateBicicleta = useDataStore(s => s.updateBicicleta);
    const deleteBicicleta = useDataStore(s => s.deleteBicicleta);

    // Find bike or client from store
    const bike = useMemo(() => id ? storeBicicletas.find(b => b.id === id) : null, [storeBicicletas, id]);
    const activeClientId = bike?.cliente_id || clientId || "";

    const client = useMemo(() => storeClientes.find(c => c.id === activeClientId), [storeClientes, activeClientId]);

    // All bikes for this client
    const clientBikes = useMemo(() =>
        storeBicicletas.filter(b => b.cliente_id === activeClientId),
        [storeBicicletas, activeClientId]
    );

    // Active bike tracking
    const [activeBikeId, setActiveBikeId] = useState<string>(id || "");
    const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);

    // Auto-Select Logic
    useEffect(() => {
        if (id) {
            setActiveBikeId(id);
        } else if (!id && clientBikes.length > 0) {
            setActiveBikeId(clientBikes[0].id);
        }
    }, [id, clientBikes]);

    // Auto-Trigger Service Dialog
    useEffect(() => {
        if (location.state?.autoStartService && activeBikeId) {
            setIsServiceDialogOpen(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, activeBikeId, navigate, location.pathname]);

    const activeBike = clientBikes.find(b => b.id === activeBikeId);

    // Services and reminders for active bike
    const services = useMemo(() =>
        storeServicios.filter(s => s.bicicleta_id === activeBikeId && !s.eliminado_en),
        [storeServicios, activeBikeId]
    );

    const reminders = useMemo(() =>
        storeRecordatorios.filter(r => r.bicicleta_id === activeBikeId),
        [storeRecordatorios, activeBikeId]
    );

    // Client total services (completed)
    const clientTotalServices = useMemo(() => {
        const completedStatuses = ['completed', 'finalizado', 'entregado', 'ready', 'delivered'];
        const clientBikeIds = clientBikes.map(b => b.id);
        return storeServicios.filter(s =>
            clientBikeIds.includes(s.bicicleta_id) && completedStatuses.includes((s.estado || '').toLowerCase()) && !s.eliminado_en
        ).length;
    }, [storeServicios, clientBikes]);

    // UI State
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isAddBikeOpen, setIsAddBikeOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Client Edit State
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editDni, setEditDni] = useState("");

    // Bike Edit State
    const [editBrand, setEditBrand] = useState("");
    const [editModel, setEditModel] = useState("");
    const [editTransmission, setEditTransmission] = useState("");
    const [editingBikeId, setEditingBikeId] = useState<string | null>(null);

    const handleEditClick = () => {
        if (client) {
            setEditName(client.nombre);
            setEditPhone(client.telefono || "");
            setEditEmail(client.email || "");
            setEditDni(client.dni || "");
            setEditingBikeId(null);
            setEditBrand("");
            setEditModel("");
            setEditTransmission("");
            setIsEditOpen(true);
        }
    };

    const startEditingBike = (b: SupabaseBike) => {
        setEditingBikeId(b.id);
        setEditBrand(b.marca);
        setEditModel(b.modelo);
        setEditTransmission(b.transmision || "");
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (editingBikeId) {
                // Modo bicicleta: solo actualiza la bici seleccionada
                await updateBicicleta(editingBikeId, {
                    marca: editBrand,
                    modelo: editModel,
                    transmision: editTransmission,
                });
                setEditingBikeId(null);
            } else {
                // Modo cliente: solo actualiza el cliente
                if (activeClientId) {
                    await updateCliente(activeClientId, {
                        nombre: editName,
                        telefono: editPhone,
                        email: editEmail,
                        dni: editDni,
                    });
                }
                setIsEditOpen(false);
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteBike = async (bikeIdToDelete?: string) => {
        const targetId = bikeIdToDelete || editingBikeId || bike?.id;
        if (!targetId) return;
        if (!confirm("¿Eliminar esta bicicleta?")) return;
        try {
            await deleteBicicleta(targetId);
            setEditingBikeId(null);
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        }
    };

    // Loading State
    if (isHydrating) return <div className="p-8"><Skeleton className="h-10 w-1/3 mb-4" /><Skeleton className="h-64 w-full" /></div>;

    const isClientMode = !activeBikeId && clientBikes.length === 0;
    if (!client && !isHydrating) return <div className="p-8">Cliente no encontrado.</div>;

    const completedStatuses = ['completed', 'finalizado', 'entregado', 'ready', 'delivered'];
    const totalServices = services.filter(s => completedStatuses.includes((s.estado || '').toLowerCase())).length;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
            {/* 1. Header & Breadcrumb */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Link to="/" className="hover:text-primary flex items-center gap-1">
                        <ArrowLeft className="h-4 w-4" /> Volver al Inicio
                    </Link>
                    <span>/</span>
                    <span className="font-semibold text-foreground">{client?.nombre}</span>
                </div>

                <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                                {client?.nombre}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-auto w-auto p-1.5 rounded-md text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors self-center"
                                    onClick={handleEditClick}
                                    title="Editar perfil del cliente"
                                >
                                    <Pencil className="w-5 h-5" />
                                </Button>
                            </h1>
                            <div className="flex items-center gap-3 mt-1 text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    Total Services: <span className="font-bold text-slate-900">{clientTotalServices}</span>
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button onClick={() => setIsAddBikeOpen(true)} variant="outline">
                                <Plus className="mr-2 h-4 w-4" /> Nueva Bici
                            </Button>
                        </div>
                    </div>

                    {/* Bike Tabs */}
                    {clientBikes.length > 0 && (
                        <div className="flex overflow-x-auto gap-2 pb-1 border-b">
                            {clientBikes.map(b => (
                                <button
                                    key={b.id}
                                    onClick={() => setActiveBikeId(b.id)}
                                    className={cn(
                                        "flex flex-col items-start px-4 py-2 rounded-t-lg transition-all min-w-[140px] border-b-2",
                                        activeBikeId === b.id
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-transparent hover:bg-slate-50 text-slate-500"
                                    )}
                                >
                                    <span className={cn("font-bold text-sm", activeBikeId === b.id ? "text-primary" : "text-slate-700")}>
                                        {b.modelo}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wider">{b.marca}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Active Bike Actions Bar */}
                    {activeBike && (
                        <div className="flex justify-between items-center pt-2">
                            <div className="text-sm text-slate-500">
                                Transmisión: <span className="font-medium text-slate-900">{activeBike.transmision || "N/A"}</span>
                            </div>
                            <Button size="default" className="shadow-sm bg-blue-600 hover:bg-blue-700" onClick={() => setIsServiceDialogOpen(true)}>
                                <Wrench className="mr-2 h-4 w-4" /> Iniciar Service
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {isClientMode ? (
                <div className="py-12 text-center border-2 border-dashed rounded-lg bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800">Este cliente no tiene bicicletas seleccionadas</h3>
                    <p className="text-muted-foreground mb-4">Agrega una bicicleta para ver su historial y mantenimiento.</p>
                    <Button onClick={() => setIsAddBikeOpen(true)} size="lg">
                        <Plus className="mr-2 h-4 w-4" /> Agregar Primera Bicicleta
                    </Button>
                </div>
            ) : (
                <>
                    {/* 2. Bike Health */}
                    <section className="space-y-4">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                            <Clock className="h-5 w-5 text-primary" /> Estado de Salud & Mantenimiento
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {reminders.length === 0 ? (
                                <Card className="col-span-full border-dashed bg-muted/20">
                                    <CardContent className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                                        <CheckCircle className="h-8 w-8 mb-2 opacity-50" />
                                        <p>No hay alertas de mantenimiento activas.</p>
                                    </CardContent>
                                </Card>
                            ) : (
                                reminders.map((reminder) => {
                                    const now = new Date();
                                    const dueDate = new Date(reminder.fecha_vencimiento || "2099-01-01");

                                    const timeRemaining = dueDate.getTime() - now.getTime();
                                    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
                                    const calculatedHealth = timeRemaining <= 0 ? 0 : Math.min(100, (timeRemaining / ONE_YEAR_MS) * 100);
                                    const healthPercent = Math.round(calculatedHealth);

                                    const diffTime = dueDate.getTime() - now.getTime();
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                    const isUrgent = diffDays < 10 && diffDays >= 0;
                                    const isOverdue = diffDays < 0;

                                    return (
                                        <Card key={reminder.id} className={cn(
                                            "border-l-4 transition-all hover:shadow-md",
                                            isOverdue ? "border-l-red-500 bg-red-50/10" : isUrgent ? "border-l-orange-500 bg-orange-50/10" : "border-l-green-500 bg-green-50/10"
                                        )}>
                                            <CardContent className="p-5 flex flex-col h-full justify-between gap-4">
                                                <div>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="font-semibold text-lg">{reminder.componente}</span>
                                                        <Badge variant="secondary" className={cn(
                                                            "text-xs font-mono",
                                                            healthPercent < 30 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                                                        )}>
                                                            {healthPercent}%
                                                        </Badge>
                                                    </div>
                                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2">
                                                        <div
                                                            className={cn("h-full transition-all duration-500",
                                                                isOverdue ? "bg-red-500" : isUrgent ? "bg-orange-500" : "bg-green-500"
                                                            )}
                                                            style={{ width: `${healthPercent}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between mt-auto">
                                                    <div className="text-sm">
                                                        {isOverdue ? (
                                                            <span className="text-red-600 font-bold flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Vencido hace {Math.abs(diffDays)} días</span>
                                                        ) : (
                                                            <span className={cn("font-medium", isUrgent ? "text-orange-600" : "text-green-600")}>
                                                                Quedan {diffDays} días
                                                            </span>
                                                        )}
                                                    </div>
                                                    {(isUrgent || isOverdue) && (
                                                        <Button size="sm" variant="destructive" className="h-7 text-xs">Agendar</Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })
                            )}
                        </div>
                    </section>

                    {/* 3. Service History */}
                    <section className="space-y-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <Wrench className="h-5 w-5 text-primary" /> Historial de Servicios
                            </h3>
                            <Badge variant="outline" className="text-base py-1 px-3 bg-white">
                                Total Realizados: <span className="font-bold ml-1">{totalServices}</span>
                            </Badge>
                        </div>

                        <Card className="border-0 shadow-none bg-transparent">
                            <CardContent className="p-0">
                                {services.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                                        No hay historial de servicios previos.
                                    </div>
                                ) : (
                                    <Accordion type="single" collapsible className="w-full space-y-2">
                                        {services.map((service) => {
                                            const extraItems = service.items_extra || [];
                                            const partItems = extraItems.filter((i: any) => i.categoria === 'part');
                                            const laborItems = extraItems.filter((i: any) => i.categoria === 'labor' || !i.categoria);
                                            const totalParts = partItems.reduce((acc: number, i: any) => acc + (i.precio || 0), 0);
                                            const totalLabor = (service.precio_base || 0) + laborItems.reduce((acc: number, i: any) => acc + (i.precio || 0), 0);

                                            return (
                                                <AccordionItem key={service.id} value={`item-${service.id}`} className="border rounded-lg bg-card px-4">
                                                    <AccordionTrigger className="hover:no-underline py-3">
                                                        <div className="flex items-center gap-4 w-full text-left">
                                                            <Badge variant={(service.tipo_servicio || "").toLowerCase() === "expert" ? "default" : "secondary"} className="w-20 justify-center">
                                                                {(service.tipo_servicio || "OTRO").toUpperCase()}
                                                            </Badge>
                                                            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 flex-1">
                                                                <span className="font-semibold text-slate-800">
                                                                    {new Date(service.fecha_ingreso || "").toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                                </span>
                                                                <StatusBadge status={service.estado || ''} />
                                                            </div>
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="pt-2 pb-4 border-t mt-2">
                                                        <div className="space-y-3">
                                                            <div className="space-y-3">
                                                                <div>
                                                                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase text-xs tracking-wider">Detalle de Costos</h4>
                                                                    <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-2 border">
                                                                        {partItems.length > 0 ? (
                                                                            <div className="mb-3 border-b border-slate-200 pb-2">
                                                                                <div className="font-semibold text-slate-700 mb-1 flex items-center gap-1"><span className="text-xs">📦</span> REPUESTOS</div>
                                                                                {partItems.map((item: any) => (
                                                                                    <div key={item.id} className="flex justify-between items-center text-slate-600 pl-2">
                                                                                        <span>{item.descripcion}</span>
                                                                                        <span className="font-mono">$ {item.precio?.toLocaleString("es-AR") || 0}</span>
                                                                                    </div>
                                                                                ))}
                                                                                <div className="flex justify-end mt-1">
                                                                                    <span className="text-xs font-bold text-slate-500">Subtotal: $ {totalParts.toLocaleString("es-AR")}</span>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="mb-2 italic text-slate-400 text-xs text-center">- Sin Repuestos -</div>
                                                                        )}

                                                                        <div>
                                                                            <div className="font-semibold text-slate-700 mb-1 flex items-center gap-1"><span className="text-xs">🛠️</span> MANO DE OBRA</div>
                                                                            <div className="flex justify-between items-center text-slate-600 pl-2">
                                                                                <span>Service Base ({(service.tipo_servicio || "OTRO").toUpperCase()})</span>
                                                                                <span className="font-mono">$ {service.precio_base?.toLocaleString("es-AR") || 0}</span>
                                                                            </div>
                                                                            {laborItems.map((item: any) => (
                                                                                <div key={item.id} className="flex justify-between items-center text-slate-600 pl-2">
                                                                                    <span>{item.descripcion}</span>
                                                                                    <span className="font-mono">$ {item.precio?.toLocaleString("es-AR") || 0}</span>
                                                                                </div>
                                                                            ))}
                                                                            <div className="flex justify-end mt-1 border-t border-slate-200 pt-1">
                                                                                <span className="text-xs font-bold text-slate-600 uppercase mr-2">Total Mano de Obra:</span>
                                                                                <span className="font-mono font-bold text-slate-700">$ {totalLabor.toLocaleString("es-AR")}</span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="bg-slate-100 -mx-3 -mb-3 p-3 mt-2 border-t border-slate-200 flex justify-between items-center rounded-b-lg">
                                                                            <span className="font-bold text-slate-900">TOTAL FINAL</span>
                                                                            <span className="text-lg font-black text-primary">$ {service.precio_total?.toLocaleString("es-AR") || 0}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <h4 className="text-sm font-semibold mb-1 text-muted-foreground uppercase text-xs tracking-wider">Notas del Mecánico</h4>
                                                                    <p className="text-sm text-slate-700 italic">
                                                                        "{service.notas_mecanico || "N/A"}"
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="mt-4 pt-2 border-t flex justify-end">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="gap-2 text-primary border-primary/30 hover:bg-primary/10"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (activeBike && client) {
                                                                        printServiceReport(
                                                                            {
                                                                                ...service,
                                                                                service_type: service.tipo_servicio,
                                                                                basePrice: service.precio_base,
                                                                                totalPrice: service.precio_total,
                                                                                mechanic_notes: service.notas_mecanico,
                                                                                extraItems: service.items_extra?.map((i: any) => ({
                                                                                    id: i.id,
                                                                                    description: i.descripcion,
                                                                                    price: i.precio,
                                                                                    category: i.categoria,
                                                                                })),
                                                                            },
                                                                            client.nombre,
                                                                            activeBike.modelo,
                                                                            client.dni || '',
                                                                            client.telefono || ''
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                <FileDown className="h-4 w-4" /> Descargar Comprobante
                                                            </Button>
                                                        </div>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            );
                                        })}
                                    </Accordion>
                                )}
                            </CardContent>
                        </Card>
                    </section>
                </>
            )}

            {/* Add Bike Dialog */}
            {client && (
                <AddBikeDialog
                    clientId={client.id}
                    clientName={client.nombre}
                    isOpen={isAddBikeOpen}
                    onClose={() => setIsAddBikeOpen(false)}
                    onBikeCreated={(newBike) => {
                        setIsAddBikeOpen(false);
                        navigate(`/bikes/${newBike.id}`, { state: { autoStartService: true } });
                    }}
                />
            )}

            {/* Edit Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Editar Perfil</DialogTitle>
                        <DialogDescription>
                            Modifica los datos del cliente o gestiona la bicicleta seleccionada.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="client" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="client" className="flex items-center gap-2"><User size={14} /> Cliente</TabsTrigger>
                            <TabsTrigger value="garage" className="flex items-center gap-2"><BikeIcon size={14} /> Garage</TabsTrigger>
                        </TabsList>

                        <TabsContent value="client" className="space-y-4 py-4">
                            <div className="space-y-1">
                                <Label htmlFor="name">Nombre Completo</Label>
                                <Input id="name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="dni">DNI</Label>
                                <Input id="dni" value={editDni} onChange={(e) => setEditDni(e.target.value)} placeholder="Sin puntos" />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="phone">Teléfono</Label>
                                <Input id="phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="cliente@email.com" />
                            </div>
                        </TabsContent>

                        <TabsContent value="garage" className="space-y-4 py-4">
                            {!editingBikeId && (
                                <div className="space-y-3">
                                    {clientBikes.length === 0 && <p className="text-center text-muted-foreground p-4">No hay bicicletas.</p>}
                                    {clientBikes.map(b => (
                                        <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 bg-primary/20 rounded-full flex items-center justify-center text-primary">
                                                    <BikeIcon size={16} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm text-slate-900">{b.marca} {b.modelo}</p>
                                                    <p className="text-xs text-slate-500">{b.transmision}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-primary" onClick={() => startEditingBike(b)}>
                                                    <Pencil size={14} />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600"
                                                    onClick={() => handleDeleteBike(b.id)}>
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                    <Button variant="outline" className="w-full border-dashed" onClick={() => setIsAddBikeOpen(true)}>
                                        <Plus className="mr-2 h-4 w-4" /> Agregar Nueva Bicicleta
                                    </Button>
                                </div>
                            )}

                            {editingBikeId && (
                                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-muted-foreground" onClick={() => setEditingBikeId(null)}>
                                            <ArrowLeft size={16} className="mr-1" /> Volver
                                        </Button>
                                        <span className="font-bold text-sm">Editando Bicicleta</span>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <Label htmlFor="brand">Marca</Label>
                                            <Input id="brand" value={editBrand} onChange={(e) => setEditBrand(e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="model">Modelo</Label>
                                            <Input id="model" value={editModel} onChange={(e) => setEditModel(e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="transmission">Transmisión</Label>
                                            <Input id="transmission" value={editTransmission} onChange={(e) => setEditTransmission(e.target.value)} placeholder="Ej: Shimano 105" />
                                        </div>
                                        <div className="pt-4 border-t mt-4">
                                            <Button variant="destructive" size="sm" className="w-full gap-2"
                                                onClick={() => handleDeleteBike(editingBikeId)}>
                                                <Trash2 className="h-4 w-4" /> Eliminar Bicicleta del Sistema
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            <Save className="mr-2 h-4 w-4" /> Guardar Todo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Start Service Dialog */}
            <ServiceModal
                isOpen={isServiceDialogOpen}
                onClose={() => setIsServiceDialogOpen(false)}
                initialClientData={client || null}
                initialBikeData={activeBike || null}
                preSelectedClientId={client?.id}
                preSelectedBikeId={activeBike?.id}
            />
        </div>
    );
}
