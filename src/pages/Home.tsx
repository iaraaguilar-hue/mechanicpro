import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useDataStore, type SupabaseBike } from "@/store/dataStore";
import { RapidIntakeWizard } from "@/components/RapidIntakeWizard";

import { Input } from "@/components/ui/input";

import { Search, PlusCircle, Trash2, Clock, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";

export default function Home() {
    const [searchTerm, setSearchTerm] = useState("");
    const clientes = useDataStore(s => s.clientes);
    const bicicletas = useDataStore(s => s.bicicletas);
    const servicios = useDataStore(s => s.servicios);
    const recordatorios = useDataStore(s => s.recordatorios);
    const isHydrating = useDataStore(s => s.isHydrating);
    const deleteCliente = useDataStore(s => s.deleteCliente);
    const fetchDashboardData = useDataStore(s => s.fetchDashboardData);
    const taller_id = useAuthStore(s => s.taller_id);
    const taller = useAuthStore(s => s.taller);

    // Build fleet view from store data (replaces getFleetStatus)
    const clientList = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();

        // Filter active clients and enforce fallback sort
        const activeClients = clientes
            .filter(c => !c.eliminado_en)
            .sort((a, b) => (a.numero_cliente || Infinity) - (b.numero_cliente || Infinity));

        // Group bikes per client
        const grouped = activeClients.map(client => {
            const clientBikes = bicicletas.filter(b => b.cliente_id === client.id);

            const bikesWithDetails: (SupabaseBike & {
                service_count: number;
                next_due_date: string | null;
                next_due_component: string | null;
                transmission_display: string;
            })[] = clientBikes.map(bike => {
                const bikeServices = servicios.filter(s => s.bicicleta_id === bike.id);
                const bikeReminders = recordatorios
                    .filter(r => r.bicicleta_id === bike.id)
                    .sort((a, b) => new Date(a.fecha_vencimiento || 0).getTime() - new Date(b.fecha_vencimiento || 0).getTime());

                return {
                    ...bike,
                    service_count: bikeServices.length,
                    next_due_date: bikeReminders[0]?.fecha_vencimiento || null,
                    next_due_component: bikeReminders[0]?.componente || null,
                    transmission_display: bike.transmision || "Standard",
                };
            });

            return {
                clientId: client.id,
                clientName: client.nombre,
                numero_cliente: client.numero_cliente,
                tier: client.tipo_ciclista || "Standard",
                bikes: bikesWithDetails,
            };
        });

        // Search filter
        if (!lowerSearch) return grouped;
        return grouped.filter(c =>
            c.clientName.toLowerCase().includes(lowerSearch) ||
            c.bikes.some(b => b.modelo.toLowerCase().includes(lowerSearch))
        );
    }, [clientes, bicicletas, servicios, recordatorios, searchTerm]);

    const handleDeleteClient = async (clientId: string, clientName: string) => {
        if (!window.confirm(`¿Eliminar a ${clientName}?`)) return;
        try {
            await deleteCliente(clientId);
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        }
    };

    const handleRefresh = () => {
        if (taller_id) fetchDashboardData(taller_id);
    };

    return (
        <div className="space-y-8 max-w-7xl mx-auto py-8 px-6 animate-in fade-in duration-500">


            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 pb-2">
                <div className="flex items-center gap-3">
                    {taller?.logo_url ? (
                        <img
                            src={taller.logo_url}
                            alt={taller.nombre ? `Logo de ${taller.nombre}` : "Logo del Taller"}
                            className="h-16 w-auto object-contain"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-16 px-4 bg-slate-100 border border-slate-200 rounded-md">
                            <span className="text-xl font-bold text-slate-800">
                                {taller?.nombre || "Mi Taller"}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4 flex-1 justify-end w-full md:w-auto">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por cliente o modelo..."
                            className="pl-10 h-11 bg-white border-slate-200 focus-visible:ring-primary"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <h2 className="text-xl font-medium text-slate-600">Base de Datos de Flota y Clientes</h2>
                <RapidIntakeWizard
                    onComplete={() => handleRefresh()}
                    trigger={
                        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6">
                            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Cliente
                        </Button>
                    }
                />
            </div>

            {/* Grid */}
            {isHydrating ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-lg" />
                    ))}
                </div>
            ) : clientList.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                    <p className="text-lg">No se encontraron resultados</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {clientList.map((client, index) => (
                        <div key={client.clientId} className="relative group">
                            <Link
                                to={`/clients/${client.clientId}`}
                                className="block bg-white rounded-lg border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 p-3 h-[25vh] flex flex-col overflow-hidden"
                            >
                                {/* Client Header */}
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                            {client.numero_cliente || index + 1}
                                        </span>
                                        <h3 className="text-base font-bold text-slate-900">{client.clientName}</h3>
                                    </div>
                                    <div className="z-10 relative" onClick={(e) => e.preventDefault()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                handleDeleteClient(client.clientId, client.clientName);
                                            }}
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>
                                </div>

                                {/* Bikes List */}
                                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                                    {client.bikes.length > 0 ? (
                                        client.bikes.map((bike) => (
                                            <div key={bike.id} className="border-t border-slate-50 pt-2 first:border-0 first:pt-0">
                                                <div className="flex justify-between items-start mb-0.5">
                                                    <div>
                                                        <p className="font-semibold text-slate-700 text-sm">{bike.modelo}</p>
                                                        <p className="text-xs text-slate-400">{bike.transmission_display}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 mt-1">
                                                    {bike.next_due_date ? (
                                                        <div className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1">
                                                            <Clock size={10} />
                                                            {bike.next_due_component}: {new Date(bike.next_due_date).toLocaleDateString()}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-slate-50 text-slate-500 border border-slate-100 px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1">
                                                            <CheckCircle size={10} />
                                                            Ok
                                                        </div>
                                                    )}

                                                    <div className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-medium">
                                                        {bike.service_count} S.
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 italic text-sm">Sin bicicletas registradas</p>
                                    )}
                                </div>
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
