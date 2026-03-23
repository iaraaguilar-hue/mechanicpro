import { useState, useEffect, useMemo } from "react";
import { useDataStore, type SupabaseClient, type SupabaseBike } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { formatOrdenNumber } from "@/lib/formatId";
import { SuccessModal } from "@/components/SuccessModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Search, User, Bike as BikeIcon, Plus, CheckCircle, Wrench, Pencil, Trash2, ArrowLeft, Flag, Calendar, ChevronDown } from "lucide-react";
import { AddClientDialog } from "@/components/AddClientDialog";
import { AddBikeDialog } from "@/components/AddBikeDialog";
import { EditBikeDialog } from "@/components/EditBikeDialog";

// Service types (const object pattern for erasableSyntaxOnly compatibility)
// export const ServiceType = {
//     SPORT: "Sport",
//     EXPERT: "Expert",
//     OTHER: "Otro"
// } as const;
// export type ServiceType = string;

interface ServiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    preSelectedClientId?: string;
    preSelectedBikeId?: string;
    initialClientData?: SupabaseClient | null;
    initialBikeData?: SupabaseBike | null;
    preSelectedServiceId?: string;
    onSuccess?: () => void;
}

export function ServiceModal({
    isOpen,
    onClose,
    preSelectedClientId,
    preSelectedBikeId,
    initialClientData,
    initialBikeData,
    preSelectedServiceId,
    onSuccess
}: ServiceModalProps) {
    const [step, setStep] = useState<"SEARCH_CLIENT" | "SELECT_BIKE" | "DEFINE_SERVICE">("SEARCH_CLIENT");
    const [selectedClient, setSelectedClient] = useState<SupabaseClient | null>(initialClientData || null);
    const [selectedBike, setSelectedBike] = useState<SupabaseBike | null>(initialBikeData || null);

    useEffect(() => {
        if (isOpen) {
            if (preSelectedServiceId) {
                setStep("DEFINE_SERVICE");
            } else if ((preSelectedClientId && preSelectedBikeId) || (initialClientData && initialBikeData)) {
                if (initialClientData) setSelectedClient(initialClientData);
                if (initialBikeData) setSelectedBike(initialBikeData);
                setStep("DEFINE_SERVICE");
            } else if (preSelectedClientId || initialClientData) {
                if (initialClientData) setSelectedClient(initialClientData);
                setStep("SELECT_BIKE");
            } else {
                setStep("SEARCH_CLIENT");
                setSelectedClient(null);
                setSelectedBike(null);
            }
        }
    }, [isOpen, initialClientData, initialBikeData, preSelectedClientId, preSelectedBikeId, preSelectedServiceId]);

    const handleClose = (open: boolean) => {
        if (!open) onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            {step === "DEFINE_SERVICE" && (selectedBike || preSelectedServiceId) ? (
                <ServiceDefinitionStep
                    bike={selectedBike || null}
                    serviceId={preSelectedServiceId}
                    clientName={selectedClient?.nombre || initialClientData?.nombre || ""}
                    onReset={() => {
                        setSelectedClient(null);
                        setSelectedBike(null);
                        setStep("SEARCH_CLIENT");
                    }}
                    onSuccess={() => {
                        if (onSuccess) onSuccess();
                        onClose();
                    }}
                    onBack={() => setStep("SELECT_BIKE")}
                />
            ) : (
                <DialogContent className="max-w-3xl min-h-[500px] flex flex-col">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            {step === "SELECT_BIKE" && (
                                <button
                                    onClick={() => setStep("SEARCH_CLIENT")}
                                    className="p-1 text-slate-400 hover:text-slate-800 transition-colors"
                                    aria-label="Volver al paso anterior"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                            )}
                            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                                {step === "SEARCH_CLIENT" && <><User /> Identificar Cliente</>}
                                {step === "SELECT_BIKE" && <><BikeIcon /> Seleccionar Bicicleta</>}
                            </DialogTitle>
                        </div>
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
                    </div>
                </DialogContent>
            )}
        </Dialog>
    );
}

// ─────────────────────────────────────────────────────────────
// Client Search — reads from store
// ─────────────────────────────────────────────────────────────
function ClientSearchStep({ onClientSelect }: { onClientSelect: (c: SupabaseClient) => void }) {
    const [query, setQuery] = useState("");
    const clientes = useDataStore(s => s.clientes);

    const filtered = useMemo(() => {
        if (!query) return clientes.filter(c => !c.isDeleted).slice(0, 20);
        const q = query.toLowerCase();
        return clientes
            .filter(c => !c.isDeleted && (
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

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filtered.map((client, index) => (
                    <Card key={client.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => onClientSelect(client)}>
                        <CardContent className="p-4 flex justify-between items-center">
                            <div>
                                <h4 className="font-bold text-lg">
                                    <span className="text-primary mr-1">#{index + 1}</span>
                                    {client.nombre}
                                </h4>
                                <p className="text-muted-foreground">{client.telefono}</p>
                            </div>
                            <Badge>{client.tipo_ciclista || "Standard"}</Badge>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="pt-4 border-t mt-4">
                <AddClientDialog
                    onClientCreated={(client) => onClientSelect(client)}
                    variant="outline"
                />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Bike Selection — reads from store
// ─────────────────────────────────────────────────────────────
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
                                    <p className="text-sm text-muted-foreground">{bike.transmision || "Standard"}</p>
                                </div>
                                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100">Seleccionar</Button>
                            </CardContent>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-foreground z-10"
                                onClick={(e) => { e.stopPropagation(); setEditingBike(bike); }}
                            >
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
                onBikeCreated={(bike) => {
                    setShowAddBike(false);
                    onBikeSelect(bike);
                }}
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
    );
}

// ─────────────────────────────────────────────────────────────
// Service Definition — create/update via store
// ─────────────────────────────────────────────────────────────
function ServiceDefinitionStep({ bike, serviceId, clientName, onReset, onSuccess, onBack }: {
    bike: SupabaseBike | null,
    serviceId?: string,
    clientName: string,
    onReset?: () => void,
    onSuccess: () => void,
    onBack: () => void
}) {
    const [catalogoServicios, setCatalogoServicios] = useState<any[]>([]);
    const [serviceType, setServiceType] = useState<string>("");
    const [notes, setNotes] = useState("");
    const [basePrice, setBasePrice] = useState(40000);
    const [extraItems, setExtraItems] = useState<{ id: string, description: string, price: number, category?: 'part' | 'labor' }[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [fechaEntrega, setFechaEntrega] = useState("");
    const [selectedCarreraId, setSelectedCarreraId] = useState<string | null>(null);

    const servicios = useDataStore(s => s.servicios);
    const createServicio = useDataStore(s => s.createServicio);
    const updateServicio = useDataStore(s => s.updateServicio);
    const taller_id = useAuthStore(s => s.taller_id);

    // Fetch config and existing services
    useEffect(() => {
        const fetchCatalogo = async () => {
            if (!taller_id) return;
            const { data } = await supabase.from('catalogo_servicios').select('*').eq('taller_id', taller_id);
            if (data) {
                setCatalogoServicios(data);
            }
        };
        fetchCatalogo();
    }, [taller_id]);

    useEffect(() => {
        if (serviceId) {
            const existing = servicios.find(s => s.id === serviceId);
            if (existing) {
                setServiceType(existing.tipo_servicio || "");
                setNotes(existing.notas_mecanico || "");
                setBasePrice(existing.precio_base || 0);
                setExtraItems(
                    existing.items_extra?.map((i: any) => ({
                        id: i.id || crypto.randomUUID(),
                        description: i.descripcion || i.description || "",
                        price: i.precio || i.price || 0,
                        category: i.categoria || i.category || 'part',
                    })) || []
                );

                if (existing.fecha_entrega && typeof existing.fecha_entrega === "string") {
                    // Truncate timestamp to YYYY-MM-DD if needed
                    setFechaEntrega(existing.fecha_entrega.split('T')[0]);
                } else {
                    setFechaEntrega("");
                }

                setSelectedCarreraId(existing.carrera_id || null);
                // Set default if creating
                if (catalogoServicios.length > 0) {
                    setServiceType(catalogoServicios[0].nombre);
                    setBasePrice(catalogoServicios[0].precio);
                }
            }
        }
    }, [serviceId, servicios, catalogoServicios]);

    const totalPrice = basePrice + extraItems.reduce((acc, item) => acc + item.price, 0);

    const handleTypeChange = (type: string, price: number) => {
        setServiceType(type);
        setBasePrice(price);
    };

    const addItem = () => {
        setExtraItems([...extraItems, { id: Date.now().toString(), description: "", price: 0, category: 'part' }]);
    };

    const updateItem = (id: string, field: string, value: any) => {
        setExtraItems(items => items.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const deleteItem = (id: string) => {
        setExtraItems(items => items.filter(i => i.id !== id));
    };

    const handleSubmit = async () => {
        if (!taller_id) return alert("Error: sin taller_id");
        setIsSaving(true);
        try {
            // Build Supabase-shaped items_extra
            const supabaseItems = extraItems.map(i => ({
                id: i.id,
                descripcion: i.description,
                precio: i.price,
                categoria: i.category || 'part',
            }));

            if (serviceId) {
                // UPDATE
                await updateServicio(serviceId, {
                    tipo_servicio: serviceType,
                    notas_mecanico: notes,
                    precio_base: basePrice,
                    items_extra: supabaseItems,
                    precio_total: totalPrice,
                    fecha_entrega: fechaEntrega || null,
                    carrera_id: selectedCarreraId || null,
                });
                setSuccessMessage(`Servicio actualizado correctamente.`);
            } else {
                // CREATE
                const created = await createServicio({
                    taller_id,
                    bicicleta_id: bike?.id || "",
                    tipo_servicio: serviceType,
                    estado: "in_progress",
                    fecha_ingreso: new Date().toISOString(),
                    notas_mecanico: notes,
                    precio_base: basePrice,
                    items_extra: supabaseItems,
                    precio_total: totalPrice,
                    fecha_entrega: fechaEntrega || null,
                    carrera_id: selectedCarreraId || null,
                });
                setSuccessMessage(`Servicio ${formatOrdenNumber(created.numero_orden, created.id)} creado con éxito.`);
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (successMessage) {
        return (
            <div className="w-full h-full flex items-center justify-center p-4">
                <SuccessModal
                    message={successMessage}
                    onClose={() => {
                        setSuccessMessage(null);
                        setNotes("");
                        setBasePrice(0);
                        setExtraItems([]);
                        setServiceType("");
                        setFechaEntrega("");
                        setSelectedCarreraId(null);
                        if (onReset) onReset();
                        onSuccess();
                    }}
                />
            </div>
        );
    }

    return (
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b z-10 bg-background">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        {!serviceId && (
                            <button
                                onClick={onBack}
                                className="p-1 text-slate-400 hover:text-slate-800 transition-colors"
                                aria-label="Volver al paso anterior"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        )}
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                            <Wrench className="w-6 h-6 text-primary" />
                            Detalles del Service
                        </DialogTitle>
                    </div>
                </DialogHeader>
                <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-100 flex justify-between items-center text-orange-900">
                    <div>
                        <p className="text-sm font-semibold">{clientName}</p>
                        <p className="font-bold">{bike?.marca} {bike?.modelo}</p>
                    </div>
                    {!serviceId && <Button variant="ghost" size="sm" onClick={onBack} className="hover:bg-orange-100 text-orange-700">Cambiar Bici</Button>}
                </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                    <Label className="text-lg font-semibold mb-3 block">Tipo de Service</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {catalogoServicios.length > 0 ? (
                            catalogoServicios.map(cat => (
                                <ServiceOption
                                    key={cat.id}
                                    selected={serviceType === cat.nombre}
                                    onClick={() => handleTypeChange(cat.nombre, cat.precio)}
                                    title={cat.nombre}
                                    desc={`$ ${cat.precio?.toLocaleString('es-AR')}`}
                                />
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground italic col-span-3">No hay servicios configurados en el catálogo.</p>
                        )}
                    </div>
                </div>

                {/* Pricing */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-muted/30 rounded-lg">
                        <Label>Precio Base ($)</Label>
                        <Input
                            type="text"
                            placeholder="0"
                            value={basePrice === 0 ? '' : basePrice.toLocaleString('es-AR')}
                            onChange={(e) => {
                                const rawValue = e.target.value.replace(/\./g, '');
                                if (!/^\d*$/.test(rawValue)) return;
                                setBasePrice(Number(rawValue));
                            }}
                            className="w-32 text-right font-bold text-lg font-mono"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <Label>Items Adicionales / Repuestos</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addItem}>+ Agregar</Button>
                        </div>

                        {extraItems.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic text-center py-2">Sin items extra</p>
                        ) : (
                            <div className="space-y-2">
                                {extraItems.map((item) => (
                                    <div key={item.id} className="flex gap-2 items-center">
                                        <div className="flex bg-muted rounded-md p-1 gap-1">
                                            <Button type="button" variant={item.category === 'part' ? 'default' : 'ghost'} size="icon"
                                                className={`h-8 w-8 ${item.category === 'part' ? 'bg-blue-600 hover:bg-blue-700' : 'text-muted-foreground'}`}
                                                onClick={() => updateItem(item.id, 'category', 'part')} title="Repuesto">
                                                <div className="scale-75">📦</div>
                                            </Button>
                                            <Button type="button" variant={item.category === 'labor' ? 'default' : 'ghost'} size="icon"
                                                className={`h-8 w-8 ${item.category === 'labor' ? 'bg-amber-600 hover:bg-amber-700' : 'text-muted-foreground'}`}
                                                onClick={() => updateItem(item.id, 'category', 'labor')} title="Mano de Obra">
                                                <div className="scale-75">🛠️</div>
                                            </Button>
                                        </div>
                                        <Input placeholder="Descripción" value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} />
                                        <Input
                                            type="text"
                                            placeholder="$ 0"
                                            value={item.price === 0 ? '' : item.price.toLocaleString('es-AR')}
                                            onChange={(e) => {
                                                const rawValue = e.target.value.replace(/\./g, '');
                                                if (!/^\d*$/.test(rawValue)) return;
                                                updateItem(item.id, 'price', Number(rawValue));
                                            }}
                                            className="w-24 text-right font-mono pl-6"
                                        />
                                        <Button type="button" variant="ghost" size="icon" onClick={() => deleteItem(item.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Total & Notes */}
                <div className="flex justify-between items-center pt-4 border-t border-dashed">
                    <span className="text-xl font-bold">Total Estimado</span>
                    <span className="text-3xl font-black text-primary">$ {totalPrice.toLocaleString("es-AR")}</span>
                </div>

                <div className="space-y-4">
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
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Notas de ingreso..."
                            className="text-lg"
                        />
                    </div>

                    <CarreraSelector
                        selectedId={selectedCarreraId}
                        onSelect={setSelectedCarreraId}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-muted/10 z-10">
                <Button size="lg" className="w-full text-lg h-12 disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleSubmit} disabled={isSaving}>
                    {isSaving ? "Guardando..." : (serviceId ? "GUARDAR CAMBIOS" : "CONFIRMAR INGRESO")}
                </Button>
            </div>
        </DialogContent>
    );
}

function ServiceOption({ selected, onClick, title, desc }: { selected: boolean, onClick: () => void, title: string, desc: string }) {
    return (
        <div
            onClick={onClick}
            className={`cursor-pointer border-2 rounded-xl p-4 text-center transition-all ${selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
        >
            <div className={`font-black text-xl mb-1 ${selected ? "text-primary" : "text-foreground"}`}>{title}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{desc}</div>
            {selected && <div className="mt-2 flex justify-center text-primary"><CheckCircle size={16} fill="currentColor" className="text-white" /></div>}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Carrera Selector Component
// ─────────────────────────────────────────────────────────────
function CarreraSelector({ selectedId, onSelect }: { selectedId: string | null, onSelect: (id: string | null) => void }) {
    const carreras = useDataStore(s => s.carreras);
    const createCarrera = useDataStore(s => s.createCarrera);
    const taller_id = useAuthStore(s => s.taller_id);

    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [newDate, setNewDate] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const selectedCarrera = carreras.find(c => c.id === selectedId);

    const filteredCarreras = useMemo(() => {
        if (!search) return carreras.slice(0, 5);
        return carreras.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase())).slice(0, 5);
    }, [search, carreras]);

    const exactMatch = carreras.some(c => c.nombre.toLowerCase() === search.toLowerCase());

    const handleSelect = (id: string) => {
        if (selectedId === id) onSelect(null);
        else onSelect(id);
        setIsOpen(false);
        setSearch("");
    };

    const handleCreate = async () => {
        if (!taller_id || !search) return;
        setIsSaving(true);
        try {
            const created = await createCarrera({
                nombre: search,
                fecha_evento: newDate || null
            });
            onSelect(created.id);
            setIsOpen(false);
            setSearch("");
            setIsCreating(false);
            setNewDate("");
        } catch (e: any) {
            alert(`Error creando carrera: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-2 relative border-t border-dashed pt-4 mt-4">
            <Label className="flex items-center gap-2 text-indigo-700 font-semibold mb-2">
                <Flag className="w-4 h-4" />
                🏁 ¿Se prepara para una carrera o evento? (Opcional)
            </Label>

            {/* Trigger Button */}
            <div
                className="flex items-center justify-between border rounded-md p-3 cursor-pointer hover:bg-slate-50 transition-colors bg-white"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex flex-col">
                    {selectedCarrera ? (
                        <>
                            <span className="font-semibold">{selectedCarrera.nombre}</span>
                            {selectedCarrera.fecha_evento && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                    <Calendar className="w-3 h-3" />
                                    {selectedCarrera.fecha_evento.split('-').reverse().join('/')}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="text-muted-foreground italic">Seleccionar o crear evento...</span>
                    )}
                </div>
                {selectedCarrera && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); onSelect(null); }}
                        className="h-6 w-6 p-0 text-red-500 rounded-full hover:bg-red-100"
                    >
                        &times;
                    </Button>
                )}
                {!selectedCarrera && <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>

            {/* Dropdown Content */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border shadow-xl rounded-md z-50 overflow-hidden">
                    <div className="p-2 border-b">
                        <Input
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setIsCreating(false); }}
                            placeholder="Buscar evento (ej. Pinto, Río Tinto)..."
                            className="h-10 border-indigo-200 focus-visible:ring-indigo-500"
                            autoFocus
                        />
                    </div>

                    {!isCreating ? (
                        <div className="max-h-60 overflow-y-auto">
                            {filteredCarreras.length > 0 ? (
                                <div className="p-1">
                                    {filteredCarreras.map(c => (
                                        <div
                                            key={c.id}
                                            onClick={() => handleSelect(c.id)}
                                            className={`p-2 rounded-md cursor-pointer flex items-center justify-between ${selectedId === c.id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-100'}`}
                                        >
                                            <span className="font-medium">{c.nombre}</span>
                                            {selectedId === c.id && <CheckCircle className="w-4 h-4" />}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                search && (
                                    <div className="p-4 text-center text-muted-foreground text-sm">
                                        No se encontraron carreras similares.
                                    </div>
                                )
                            )}

                            {search && !exactMatch && (
                                <div className="p-2 border-t bg-slate-50">
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                        onClick={() => setIsCreating(true)}
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Añadir nueva carrera: <span className="font-bold ml-1">{search}</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-4 bg-indigo-50/50 space-y-4">
                            <p className="text-sm font-medium text-indigo-900">
                                Creando nueva carrera: <span className="font-bold">{search}</span>
                            </p>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha del Evento (Opcional)</Label>
                                <Input
                                    type="date"
                                    value={newDate}
                                    onChange={e => setNewDate(e.target.value)}
                                    className="bg-white"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsCreating(false)}
                                    className="flex-1"
                                    disabled={isSaving}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleCreate}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                                    disabled={isSaving}
                                >
                                    {isSaving ? "Guardando..." : "Crear y Seleccionar"}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
