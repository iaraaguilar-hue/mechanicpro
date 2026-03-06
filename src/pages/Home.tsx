import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getFleetStatus, deleteClient, type FleetItem } from "@/lib/api";
import { RapidIntakeWizard } from "@/components/RapidIntakeWizard";
import MigradorDatos from "@/components/MigradorDatos"; // [NEW]
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, PlusCircle, Trash2, Clock, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function Home() {
    const [searchTerm, setSearchTerm] = useState("");

    const { data: fleet, isLoading, refetch } = useQuery({
        queryKey: ["fleet"],
        queryFn: getFleetStatus,
    });

    const filteredItems = fleet?.filter(item =>
        item.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.bike_model.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    // Grouping
    const groupedClients: Record<number, {
        clientName: string,
        displayId: string,
        tier: string,
        bikes: FleetItem[]
    }> = {};

    filteredItems.forEach(item => {
        if (!groupedClients[item.client_id!]) {
            groupedClients[item.client_id!] = {
                clientName: item.client_name,
                displayId: item.client_display_id || "?",
                tier: item.client_tier || "Standard",
                bikes: []
            };
        }
        if (item.bike_id > 0) {
            groupedClients[item.client_id!].bikes.push(item);
        }
    });

    const clientList = Object.entries(groupedClients).map(([id, data]) => ({
        clientId: Number(id),
        ...data
    }));

    return (
        <div className="space-y-8 max-w-7xl mx-auto py-8 px-6 animate-in fade-in duration-500">
            {/* TEMPORARY MIGRATION TOOL */}
            <div className="mb-8 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <MigradorDatos />
            </div>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 pb-2">
                <div className="flex items-center gap-3">
                    <img src="/img/logo_full.png" alt="ProBikes" className="h-16 w-auto" />
                </div>

                <div className="flex items-center gap-4 flex-1 justify-end w-full md:w-auto">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por cliente o modelo..."
                            className="pl-10 h-11 bg-white border-slate-200 focus-visible:ring-orange-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <h2 className="text-xl font-medium text-slate-600">Base de Datos de Flota y Clientes</h2>
                <RapidIntakeWizard
                    onComplete={() => refetch()}
                    trigger={
                        <Button className="bg-orange-600 hover:bg-orange-700 text-white font-medium px-6">
                            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Cliente
                        </Button>
                    }
                />
            </div>

            {/* Grid */}
            {isLoading ? (
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {clientList.map((client) => (
                        <div key={client.clientId} className="relative group">
                            {/* Card Container - Clickable Link */}
                            <Link
                                to={`/clients/${client.clientId}`}
                                className="block bg-white rounded-lg border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 p-3 h-full"
                            >
                                {/* Client Header */}
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">{client.clientName}</h3>
                                        <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-none px-1.5 py-0 rounded text-[10px]">
                                            #{client.displayId}
                                        </Badge>
                                    </div>
                                    <div className="z-10 relative" onClick={(e) => e.preventDefault()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                if (window.confirm(`¿Eliminar a ${client.clientName}?`)) {
                                                    deleteClient(client.clientId).then(() => refetch());
                                                }
                                            }}
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </div>
                                </div>

                                {/* Bikes List */}
                                <div className="space-y-2">
                                    {client.bikes.length > 0 ? (
                                        client.bikes.map((bike) => (
                                            <div key={bike.bike_id} className="border-t border-slate-50 pt-2 first:border-0 first:pt-0">
                                                <div className="flex justify-between items-start mb-0.5">
                                                    <div>
                                                        <p className="font-semibold text-slate-700 text-sm">{bike.bike_model}</p>
                                                        <p className="text-xs text-slate-400">{bike.transmission || "Standard"}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 mt-1">
                                                    {/* Next Due Alert */}
                                                    {bike.next_due_date ? (
                                                        <div className="bg-orange-50 text-orange-700 border border-orange-100 px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1">
                                                            <Clock size={10} />
                                                            {bike.next_due_component}: {new Date(bike.next_due_date).toLocaleDateString()}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-slate-50 text-slate-500 border border-slate-100 px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1">
                                                            <CheckCircle size={10} />
                                                            Ok
                                                        </div>
                                                    )}

                                                    {/* Service Count */}
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



