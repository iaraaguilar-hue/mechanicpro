import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDataStore, type SupabaseClient, type SupabaseBike } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { formatOrdenNumber } from "@/lib/formatId";
import { SuccessModal } from "@/components/SuccessModal";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Search, User, Bike as BikeIcon, Plus, CheckCircle, Wrench, Pencil, ArrowLeft } from "lucide-react";
import { AddClientDialog } from "@/components/AddClientDialog";
import { AddBikeDialog } from "@/components/AddBikeDialog";
import { EditBikeDialog } from "@/components/EditBikeDialog";


interface IntakeWizardProps {
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    initialClient?: SupabaseClient | null;
    initialBike?: SupabaseBike | null;
    hideTrigger?: boolean;
}

export function IntakeWizard({
    isOpen: controlledOpen,
    onOpenChange: setControlledOpen,
    initialClient,
    initialBike,
    hideTrigger = false
}: IntakeWizardProps = {}) {
    const [internalOpen, setInternalOpen] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

    const [step, setStep] = useState<"SEARCH_CLIENT" | "SELECT_BIKE" | "DEFINE_SERVICE">("SEARCH_CLIENT");
    const [selectedClient, setSelectedClient] = useState<SupabaseClient | null>(null);
    const [selectedBike, setSelectedBike] = useState<SupabaseBike | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const navigate = useNavigate();

    const handleCloseModal = () => {
        setSuccessMessage(null);
        setSelectedClient(null);
        setSelectedBike(null);
        setStep("SEARCH_CLIENT");
        navigate("/workshop");
    };

    useEffect(() => {
        if (open) {
            if (initialBike && initialClient) {
                setSelectedClient(initialClient);
                setSelectedBike(initialBike);
                setStep("DEFINE_SERVICE");
            } else if (initialClient) {
                setSelectedClient(initialClient);
                setStep("SELECT_BIKE");
            }
        }
    }, [open, initialBike, initialClient]);

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            setTimeout(() => {
                setStep("SEARCH_CLIENT");
                setSelectedClient(null);
                setSelectedBike(null);
            }, 300);
        }
    }

    if (successMessage) {
        return (
            <div className="w-full h-full flex items-center justify-center p-4">
                <SuccessModal
                    message={successMessage}
                    onClose={handleCloseModal}
                />
            </div>
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {!hideTrigger && (
                <DialogTrigger asChild>
                    <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 h-14 shadow-lg shadow-primary/20">
                        <Wrench className="mr-2 h-5 w-5" /> NUEVO SERVICE
                    </Button>
                </DialogTrigger>
            )}
            <DialogContent className="max-w-3xl min-h-[500px] flex flex-col">
                {step !== "SEARCH_CLIENT" && (
                    <button
                        onClick={() => setStep(step === "SELECT_BIKE" ? "SEARCH_CLIENT" : "SELECT_BIKE")}
                        className="absolute left-4 top-4 p-2 text-slate-400 hover:text-slate-600 transition-colors z-10"
                        aria-label="Volver al paso anterior"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                )}
                <DialogHeader>
                    <DialogTitle className={`text-2xl font-bold flex items-center gap-2 ${step !== "SEARCH_CLIENT" ? "ml-8" : ""}`}>
                        {step === "SEARCH_CLIENT" && <><User /> Identificar Cliente</>}
                        {step === "SELECT_BIKE" && <><BikeIcon /> Seleccionar Bicicleta</>}
                        {step === "DEFINE_SERVICE" && <><Wrench /> Detalles del Service</>}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 py-4">
                    {step === "SEARCH_CLIENT" && (
                        <ClientSearchStep
                            onClientSelect={(client) => {
                                setSelectedClient(client);
                                setStep("SELECT_BIKE");
                            }}
                        />
                    )}

                    {step === "SELECT_BIKE" && selectedClient && (
                        <BikeSelectionStep
                            client={selectedClient}
                            onBikeSelect={(bike) => {
                                setSelectedBike(bike);
                                setStep("DEFINE_SERVICE");
                            }}
                            onBack={() => setStep("SEARCH_CLIENT")}
                        />
                    )}

                    {step === "DEFINE_SERVICE" && selectedBike && (
                        <ServiceDefinitionStep
                            bike={selectedBike}
                            clientName={selectedClient?.nombre || initialClient?.nombre || ""}
                            onSuccess={(msg) => {
                                setSuccessMessage(msg);
                                setOpen(false); // Triggers background reset of state
                            }}
                            onBack={() => setStep("SELECT_BIKE")}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

// --- SUB COMPONENTS ---

function ClientSearchStep({ onClientSelect }: { onClientSelect: (c: SupabaseClient) => void }) {
    const [query, setQuery] = useState("");
    const clientes = useDataStore(s => s.clientes);

    const filtered = useMemo(() => {
        if (!query) return clientes.filter(c => !c.eliminado_en).slice(0, 20);
        const q = query.toLowerCase();
        return clientes
            .filter(c => !c.eliminado_en && (
                c.nombre.toLowerCase().includes(q) ||
                (c.telefono || "").includes(q) ||
                (c.dni || "").includes(q)
            ))
            .slice(0, 20);
    }, [clientes, query]);

    return (
        <div className="space-y-6">
            <div className="relative">
                <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder="Buscar por Nombre o Teléfono..."
                    className="pl-10 text-lg h-12"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoFocus
                />
            </div>

            <div className="space-y-2">
                {filtered.map(client => (
                    <Card key={client.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => onClientSelect(client)}>
                        <CardContent className="p-4 flex justify-between items-center">
                            <div>
                                <h4 className="font-bold text-lg">{client.nombre}</h4>
                                <p className="text-muted-foreground">{client.telefono}</p>
                            </div>
                            <Badge>{client.tipo_ciclista || "Standard"}</Badge>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="pt-4 border-t mt-4">
                <AddClientDialog
                    onClientCreated={(client) => {
                        window.location.href = `/clients/${client.id}`;
                    }}
                    variant="outline"
                />
            </div>
        </div>
    )
}

function BikeSelectionStep({ client, onBikeSelect, onBack }: { client: SupabaseClient, onBikeSelect: (b: SupabaseBike) => void, onBack: () => void }) {
    const bicicletas = useDataStore(s => s.bicicletas);
    const bikes = useMemo(() => bicicletas.filter(b => b.cliente_id === client.id), [bicicletas, client.id]);

    const [showAddBike, setShowAddBike] = useState(false);
    const [editingBike, setEditingBike] = useState<SupabaseBike | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-accent/20 p-3 rounded-lg border border-primary/20">
                <div>
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="font-bold text-lg">{client.nombre}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={onBack}>Cambiar</Button>
            </div>

            <h3 className="text-lg font-semibold">Garage del Cliente</h3>

            <div className="min-h-[200px]">
                <div className="grid gap-3">
                    {bikes.map(bike => (
                        <Card key={bike.id} className="cursor-pointer hover:border-primary group transition-all relative">
                            <CardContent className="p-4 flex items-center gap-4" onClick={() => onBikeSelect(bike)}>
                                <div className="h-10 w-10 bg-secondary/20 rounded-full flex items-center justify-center text-secondary-foreground">
                                    <BikeIcon size={20} />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold">{bike.marca} {bike.modelo}</h4>
                                    <p className="text-sm text-muted-foreground">{bike.transmision}</p>
                                </div>
                                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100">Seleccionar</Button>
                            </CardContent>
                            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-foreground z-10"
                                onClick={(e) => { e.stopPropagation(); setEditingBike(bike); }}>
                                <Pencil size={14} />
                            </Button>
                        </Card>
                    ))}
                </div>

                <div className="mt-4 pt-4 border-t">
                    <Button variant="outline" className="w-full" onClick={() => setShowAddBike(true)}>
                        <Plus className="mr-2 h-4 w-4" /> Agregar Nueva Bicicleta al Garage
                    </Button>
                </div>
            </div>

            <AddBikeDialog
                clientId={client.id}
                clientName={client.nombre}
                isOpen={showAddBike}
                onClose={() => setShowAddBike(false)}
                onBikeCreated={(bike) => { setShowAddBike(false); onBikeSelect(bike); }}
            />

            {editingBike && (
                <EditBikeDialog
                    bike={editingBike}
                    isOpen={true}
                    onClose={() => setEditingBike(null)}
                    onBikeUpdated={() => setEditingBike(null)}
                />
            )}
        </div>
    )
}

function ServiceDefinitionStep({ bike, clientName, onSuccess, onBack }: { bike: SupabaseBike, clientName: string, onSuccess: (msg: string) => void, onBack: () => void }) {
    const [catalogoServicios, setCatalogoServicios] = useState<any[]>([]);
    const [serviceType, setServiceType] = useState<string>("");
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [fechaEntrega, setFechaEntrega] = useState("");

    const createServicio = useDataStore(s => s.createServicio);
    const taller_id = useAuthStore(s => s.taller_id);

    useEffect(() => {
        const fetchCatalogo = async () => {
            if (!taller_id) return;
            const { data } = await supabase.from('catalogo_servicios').select('*').eq('taller_id', taller_id);
            if (data) {
                const dataConOtro = [...data, { id: 'otro_universal', nombre: 'OTRO', precio: 0 }];
                setCatalogoServicios(dataConOtro);
                if (dataConOtro.length > 0) {
                    setServiceType(dataConOtro[0].nombre);
                }
            }
        };
        fetchCatalogo();
    }, [taller_id]);

    const handleTypeChange = (type: string) => {
        setServiceType(type);
    };

    const handleSubmit = async () => {
        if (!taller_id) return alert("Error: sin taller_id");
        setIsSaving(true);
        try {
            const created = await createServicio({
                taller_id,
                bicicleta_id: bike.id,
                tipo_servicio: serviceType,
                estado: "in_progress",
                notas_mecanico: notes,
                fecha_ingreso: new Date().toISOString(),
                fecha_entrega: fechaEntrega || null,
            });
            const msg = `Servicio ${formatOrdenNumber(created.numero_orden, created.id)} registrado correctamente.`;
            setNotes("");
            setFechaEntrega("");
            if (catalogoServicios.length > 0) setServiceType(catalogoServicios[0].nombre);
            onSuccess(msg);
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="space-y-6">
                <div className="flex justify-between items-center bg-accent/20 p-3 rounded-lg border border-primary/20">
                    <div>
                        <p className="text-sm text-muted-foreground">{clientName}</p>
                        <p className="font-bold">{bike.marca} {bike.modelo}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onBack}>Cambiar Bici</Button>
                </div>

                <div className="grid gap-6">
                    <div className="space-y-3">
                        <Label className="text-lg">Tipo de Service</Label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {catalogoServicios.length > 0 ? (
                                catalogoServicios.map(cat => (
                                    <ServiceOption
                                        key={cat.id}
                                        selected={serviceType === cat.nombre}
                                        onClick={() => handleTypeChange(cat.nombre)}
                                        title={cat.nombre}
                                        desc={`$ ${cat.precio?.toLocaleString('es-AR')}`}
                                    />
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground italic col-span-3">No hay servicios configurados en el catálogo.</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Fecha Estimada de Entrega (Opcional)</Label>
                        <Input
                            type="date"
                            className="w-full text-lg"
                            value={fechaEntrega}
                            onChange={(e) => setFechaEntrega(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Observaciones / Detalle del Trabajo</Label>
                        <Textarea
                            placeholder="Notas de ingreso..."
                            className="min-h-[120px] text-lg"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter className="mt-8">
                    <Button size="lg" className="w-full text-lg h-12 disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? "Guardando..." : "CONFIRMAR INGRESO"}
                    </Button>
                </DialogFooter>
            </div>
        </>
    )
}

function ServiceOption({ selected, onClick, title, desc }: { selected: boolean, onClick: () => void, title: string, desc: string }) {
    return (
        <div
            onClick={onClick}
            className={`cursor-pointer border-2 rounded-xl p-4 text-center transition-all flex flex-col items-center justify-center ${selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
        >
            <div className={`font-black text-xl mb-1 ${selected ? "text-primary" : "text-foreground"}`}>{(title || "OTRO").toUpperCase()}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{desc}</div>
            {selected && <div className="mt-2 text-primary"><CheckCircle size={16} fill="currentColor" className="text-white" /></div>}
        </div>
    )
}
