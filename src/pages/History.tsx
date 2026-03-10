import { useState, Fragment, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { StatusBadge } from "@/components/StatusBadge";
import { useDataStore } from '@/store/dataStore';
import { Card, CardContent } from '@/components/ui/card';
import { formatOrdenNumber } from '@/lib/formatId';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Search, FilterX, ChevronUp, FileText, Pencil, Trash2, Calendar, Eye, ClipboardList, Calendar as CalendarIcon, Wrench, Package, Info, Tag } from "lucide-react";
import { printServiceReport } from '@/lib/printServiceBtn';
import { ServiceModal } from '@/components/ServiceModal';
import { es } from "date-fns/locale";

// Utility function to safely format dates and avoid crashes with null/undefined values
const safeFormatDate = (dateString?: string | null) => {
    if (!dateString) return '-';
    try {
        // Blindaje contra errores de .split() on null/undefined u objetos
        if (typeof dateString !== 'string') return '-';
        const parts = dateString.split('T');
        if (!parts || parts.length === 0) return '-';

        const d = new Date(dateString);
        if (isNaN(d.getTime())) return '-';

        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch (e) {
        return '-';
    }
};
import { format } from "date-fns";
import { cn } from "@/lib/utils";
type DateRange = {
    from: Date;
    to?: Date;
};
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { getBikeCategory } from '@/utils/bikeRecognition';


const datePickerRescueStyles = `
  /* RESET Y BASE */
  .react-datepicker-wrapper, 
  .react-datepicker__input-container {
    display: block;
    width: 100%;
  }

  .react-datepicker {
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 0.95rem;
    background-color: #ffffff;
    color: #1f2937;
    border: 1px solid #f3f4f6; /* Borde muy sutil */
    border-radius: 1rem; /* Bordes bien redondeados */
    display: inline-block;
    position: relative;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); /* Sombra suave y profunda */
    padding: 1rem; /* ESPACIO INTERNO GENERAL */
  }

  /* CABECERA (Mes y Año) */
  .react-datepicker__header {
    text-align: center;
    background-color: transparent; /* Fondo blanco limpio */
    border-bottom: none; /* Sin líneas divisorias feas */
    padding-top: 0.5rem;
    padding-bottom: 1rem;
  }

  .react-datepicker__current-month {
    font-weight: 700;
    color: #111827;
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
    text-transform: capitalize;
  }

  /* NOMBRES DE DÍAS (Lu Ma Mi) */
  .react-datepicker__day-names {
    display: flex !important;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  
  .react-datepicker__day-name {
    color: #9ca3af; /* Gris suave */
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.75rem;
    display: inline-block;
    width: 2.5rem;
    text-align: center;
  }

  /* GRILLA DE DÍAS */
  .react-datepicker__month {
    margin: 0;
  }

  .react-datepicker__week {
    display: flex !important;
    justify-content: space-between;
    margin-bottom: 0.25rem; /* Espacio entre semanas */
  }

  /* DÍAS INDIVIDUALES (Círculos) */
  .react-datepicker__day {
    display: inline-block;
    width: 2.5rem;  /* Más grandes */
    height: 2.5rem;
    line-height: 2.5rem;
    text-align: center;
    margin: 0;
    border-radius: 50%; /* Círculo perfecto */
    cursor: pointer;
    color: #374151;
    transition: all 0.2s ease; /* Animación suave */
  }

  /* HOVER Y SELECCIÓN */
  .react-datepicker__day:hover {
    background-color: #f0f9ff; /* Celeste muy pálido */
    color: #0284c7;
    font-weight: bold;
  }

  .react-datepicker__day--selected,
  .react-datepicker__day--keyboard-selected {
    background-color: #0ea5e9 !important; /* AZUL DE LA MARCA (Sky-500) */
    color: white !important;
    font-weight: bold;
    box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.4); /* Sombra brillante azul */
  }
  
  .react-datepicker__day--outside-month {
    color: #e5e7eb;
    pointer-events: none;
  }
  
  /* FLECHAS DE NAVEGACIÓN */
  .react-datepicker__navigation {
    top: 1.2rem;
  }
`;

export default function History() {
    const { taller_id } = useAuthStore();
    const storeClientes = useDataStore(s => s.clientes);
    const storeBicicletas = useDataStore(s => s.bicicletas);
    const storeServicios = useDataStore(s => s.servicios);
    const storeDeleteServicio = useDataStore(s => s.deleteServicio);
    const fetchDashboardData = useDataStore(s => s.fetchDashboardData);


    // Build joined jobs from store data (replaces readDataFromStorage)
    const allJobs = useMemo(() => {
        return storeServicios
            .filter(s => !s.deleted_at)
            .map(service => {
                const bike = storeBicicletas.find(b => b.id === service.bicicleta_id);
                const client = bike ? storeClientes.find(c => c.id === bike.cliente_id) : null;
                const rawDateIn = service.fecha_ingreso || "2024-01-01T00:00:00";
                const rawDateOut = service.fecha_entrega;

                const displayDateIn = safeFormatDate(rawDateIn);
                const displayDateOut = safeFormatDate(rawDateOut);

                // dateObj is used for filtering, so it needs to be a Date object
                let dateObj = new Date(rawDateIn);
                if (isNaN(dateObj.getTime())) {
                    dateObj = new Date("2024-01-01T00:00:00"); // Fallback for invalid dates
                }

                const bikeBrand = (bike?.marca || "").trim();
                const bikeModelFull = bike ? `${bike.marca} ${bike.modelo}` : "Bicicleta Desconocida";

                return {
                    uniqueId: service.id,
                    id: service.id,
                    numero_orden: service.numero_orden,
                    status: service.estado || "Unknown",
                    displayDateIn,
                    displayDateOut,
                    rawDateOut,
                    rawDate: rawDateIn,
                    dateObj,
                    clientName: client?.nombre || "Cliente Desconocido",
                    clientDni: client?.dni || "",
                    clientPhone: client?.telefono || "",
                    bikeBrand,
                    bikeModel: bikeModelFull,
                    serviceType: service.tipo_servicio || "General",
                    bikeCategory: getBikeCategory(bike?.modelo, service.tipo_servicio),
                    rawJob: {
                        ...service,
                        // Map to legacy shape for printServiceReport compatibility
                        service_type: service.tipo_servicio,
                        basePrice: service.precio_base,
                        totalPrice: service.precio_total,
                        mechanic_notes: service.notas_mecanico,
                        extraItems: service.items_extra?.map((i: any) => ({
                            id: i.id || crypto.randomUUID(),
                            description: i.descripcion,
                            price: i.precio,
                            category: i.categoria,
                        })),
                    },
                };
            })
            .sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
    }, [storeServicios, storeBicicletas, storeClientes]);

    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);


    // Filters State
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("Todas");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [brandFilter, setBrandFilter] = useState("all");

    const toggleExpand = (id: string) => {
        setExpandedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleDelete = async (id: string) => {
        if (confirm("¿Estás seguro de eliminar este servicio? Esta acción no se puede deshacer.")) {
            try {
                await storeDeleteServicio(id);
            } catch {
                alert("Error al eliminar servicio");
            }
        }
    };



    // Derived Lists
    const availableBrands = useMemo(() => {
        const brands = new Set<string>();
        allJobs.forEach(job => {
            if (job.bikeBrand) {
                // Normalize to Title Case
                const normalized = job.bikeBrand.trim().toLowerCase().split(' ')
                    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                brands.add(normalized);
            }
        });
        return Array.from(brands).sort();
    }, [allJobs]);

    // Filter Logic
    const filteredJobs = useMemo(() => {
        return allJobs.filter(job => {
            // 1. Search Query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesSearch =
                    job.clientName.toLowerCase().includes(query) ||
                    job.bikeModel.toLowerCase().includes(query) ||
                    String(job.id).includes(query) ||
                    job.serviceType.toLowerCase().includes(query);
                if (!matchesSearch) return false;
            }

            // 2. Category Filter
            if (categoryFilter !== "Todas" && job.bikeCategory !== categoryFilter) return false;

            // 3. Brand Filter
            if (brandFilter !== "all" && job.bikeBrand.trim().toLowerCase() !== brandFilter.trim().toLowerCase()) return false;

            // 4. Date Range Filter
            if (dateRange?.from) {
                const jobDate = new Date(job.dateObj);
                jobDate.setHours(0, 0, 0, 0);

                const fromDate = new Date(dateRange.from);
                fromDate.setHours(0, 0, 0, 0);

                if (jobDate < fromDate) return false;

                if (dateRange.to) {
                    const toDate = new Date(dateRange.to);
                    toDate.setHours(23, 59, 59, 999);
                    if (jobDate > toDate) return false;
                }
            }

            return true;
        });
    }, [allJobs, searchQuery, categoryFilter, brandFilter, dateRange]);

    const clearFilters = () => {
        setSearchQuery("");
        setCategoryFilter("Todas");
        setBrandFilter("all");
        setDateRange(undefined);
    };



    return (
        <div className="p-8 space-y-8 max-w-[1800px] mx-auto min-h-screen bg-transparent">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
                        <ClipboardList className="h-8 w-8 text-sky-500" />
                        Historial de Trabajos
                    </h1>
                    <p className="text-muted-foreground mt-1 text-lg">Gestión centralizada de servicios y mantenimientos.</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">

                <div className="flex flex-col lg:flex-row gap-4 w-full xl:w-auto items-start lg:items-center">
                    {/* Date Picker */}
                    <div className="grid gap-2 relative">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn(
                                        "w-[240px] justify-start text-left font-normal bg-slate-50 border-slate-200 hover:bg-slate-100",
                                        !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "dd/MM/yy")} -{" "}
                                                {format(dateRange.to, "dd/MM/yy")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "dd/MM/yy")
                                        )
                                    ) : (
                                        <span>Filtrar por fecha...</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-auto p-0 z-50 bg-transparent border-none shadow-none"
                                align="start"
                                sideOffset={8}
                            >
                                <style>{datePickerRescueStyles}</style>
                                <div className="bg-white rounded-lg shadow-xl border border-gray-200">
                                    <DatePicker
                                        selected={dateRange?.from}
                                        onChange={(dates) => {
                                            const [start, end] = dates as [Date | null, Date | null];
                                            setDateRange(start ? { from: start, to: end || undefined } : undefined);
                                        }}
                                        startDate={dateRange?.from}
                                        endDate={dateRange?.to}
                                        selectsRange
                                        inline
                                        locale={es}
                                        monthsShown={1}
                                    />
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Category Filter (Dropdown) */}
                    <div className="w-[180px]">
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-700">
                                <SelectValue placeholder="Tipo de Bici" />
                            </SelectTrigger>
                            <SelectContent className="z-50 bg-white">
                                <SelectItem value="Todas">Todos los Tipos</SelectItem>
                                {["Ruta", "MTB", "Triatlón", "Gravel", "Otro"].map(cat => (
                                    <SelectItem key={cat} value={cat === "Triatlón" ? "Triatlon" : cat}>{cat}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Brand Filter */}
                    <div className="w-[180px]">
                        <Select value={brandFilter} onValueChange={setBrandFilter}>
                            <SelectTrigger className="bg-slate-50 border-slate-200">
                                <SelectValue placeholder="Marca de Bici" />
                            </SelectTrigger>
                            <SelectContent className="z-50 bg-white">
                                <SelectItem value="all">Todas las Marcas</SelectItem>
                                {availableBrands.map(brand => (
                                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Clear Filters */}
                    {(categoryFilter !== "Todas" || brandFilter !== "all" || searchQuery) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearFilters}
                            className="text-muted-foreground hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                            title="Limpiar filtros"
                        >
                            <FilterX className="h-5 w-5" />
                        </Button>
                    )}
                </div>

                {/* Search - Expanded */}
                <div className="relative flex-1 w-full lg:w-auto min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        type="search"
                        placeholder="Buscar cliente, modelo o ID..."
                        className="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#f25a30]/20 transition-all font-medium w-full"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Main Content Card */}
            <Card className="border-none shadow-md bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50/80">
                            <TableRow className="hover:bg-transparent border-slate-100">
                                <TableHead className="py-4 pl-6 w-[140px]">Estado</TableHead>
                                <TableHead className="py-4">Ingreso</TableHead>
                                <TableHead className="py-4">Entrega</TableHead>
                                <TableHead className="py-4">Cliente</TableHead>
                                <TableHead className="py-4">Bicicleta</TableHead>
                                <TableHead className="py-4">Tipo</TableHead>
                                <TableHead className="py-4 text-right pr-6">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredJobs.map((job) => {
                                const isExpanded = expandedIds.includes(job.id);

                                return (
                                    <Fragment key={job.uniqueId}>
                                        <TableRow className={cn(
                                            "hover:bg-slate-50/50 transition-colors cursor-pointer border-slate-100",
                                            isExpanded && "bg-slate-50/80 border-b-0"
                                        )}
                                            onClick={() => toggleExpand(job.id)}
                                        >
                                            <TableCell className="pl-6 py-4">
                                                <StatusBadge status={job.status} />
                                            </TableCell>
                                            <TableCell className="py-4 w-28">
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-bold text-slate-700">{job.displayDateIn}</span>
                                                    <span className="text-[10px] text-primary font-bold mt-1" title={job.id}>{formatOrdenNumber(job.numero_orden, job.id)}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 w-28">
                                                {job.rawDateOut ? (
                                                    <span className="font-semibold text-slate-600">{job.displayDateOut}</span>
                                                ) : (
                                                    <span className="text-slate-400 italic text-sm">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="font-medium text-slate-900">{job.clientName}</div>
                                                <div className="text-xs text-slate-500">{job.clientDni}</div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="font-semibold text-slate-700 capitalize">{job.bikeBrand}</div>
                                                <div className="text-sm text-slate-500">{job.bikeModel.replace(job.bikeBrand, "").trim()}</div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <Badge variant="outline" className="text-slate-600 bg-white border-slate-200 font-normal">
                                                    {job.serviceType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6 py-4">
                                                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-[#f25a30] hover:bg-orange-50" title="Imprimir" onClick={() => printServiceReport(job.rawJob, job.clientName, job.bikeModel, job.clientDni, job.clientPhone)}>
                                                        <FileText className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Ver Detalles" onClick={() => toggleExpand(job.id)}>
                                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Editar" onClick={() => setEditingServiceId(job.id)}>
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50" title="Eliminar" onClick={() => handleDelete(job.id)}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>

                                        {/* EXPANDABLE DETAIL ROW */}
                                        {isExpanded && (
                                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-t-0">
                                                <TableCell colSpan={6} className="p-0">
                                                    <div className="px-6 pb-6 pt-2">
                                                        <ExpandedServiceDetail job={job} />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                );
                            })}

                            {filteredJobs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="bg-slate-100 p-4 rounded-full">
                                                <Search className="h-8 w-8 text-slate-400" />
                                            </div>
                                            <div className="text-center">
                                                <p className="font-medium text-slate-900">No se encontraron resultados</p>
                                                <p className="text-sm text-slate-500 mt-1">Intenta ajustar los filtros de búsqueda.</p>
                                            </div>
                                            <Button variant="outline" onClick={clearFilters} className="mt-2">
                                                Limpiar todos los filtros
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Modal */}
            {
                editingServiceId && (
                    <ServiceModal
                        isOpen={!!editingServiceId}
                        onClose={() => setEditingServiceId(null)}
                        preSelectedServiceId={editingServiceId}
                        onSuccess={() => {
                            setEditingServiceId(null);
                            if (taller_id) fetchDashboardData(taller_id);
                        }}
                    />
                )
            }
        </div>
    );
}

// Sub-component for the expanded view
function ExpandedServiceDetail({ job }: { job: any }) {
    const service = job.rawJob;
    const partItems = service.extraItems?.filter((i: any) => i.category === 'part') || [];
    const laborItems = service.extraItems?.filter((i: any) => i.category === 'labor' || !i.category) || [];
    const totalParts = partItems.reduce((acc: number, i: any) => acc + i.price, 0);
    const totalLabor = (service.basePrice || 0) + laborItems.reduce((acc: number, i: any) => acc + i.price, 0);

    return (
        <div className="bg-white border border-orange-100 rounded-xl p-6 shadow-sm animate-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-gray-100 gap-4">
                <h2 className="text-xl font-bold text-orange-600 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />
                    Detalle del Service {formatOrdenNumber(job.numero_orden, job.id)} <span className="text-gray-400 font-normal text-sm ml-2">| {job.bikeModel}</span>
                </h2>
                <Button onClick={() => printServiceReport(job.rawJob, job.clientName, job.bikeModel, job.clientDni, job.clientPhone)} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                    <FileText className="w-4 h-4 mr-2" />
                    Imprimir Comprobante
                </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Left: Summary */}
                <div className="flex-1 space-y-4">
                    <h3 className="text-sky-500 flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                        <Info className="w-4 h-4" /> Resumen del Trabajo
                    </h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-sky-50 p-4 rounded-lg border border-sky-100">
                            <span className="text-xs text-sky-600 font-medium block mb-1">Mano de Obra</span>
                            <span className="text-xl font-mono font-bold text-slate-800">$ {totalLabor.toLocaleString("es-AR")}</span>
                        </div>
                        <div className="bg-sky-50 p-4 rounded-lg border border-sky-100">
                            <span className="text-xs text-sky-600 font-medium block mb-1">Repuestos</span>
                            <span className="text-xl font-mono font-bold text-slate-800">$ {totalParts.toLocaleString("es-AR")}</span>
                        </div>
                    </div>
                    <div className="bg-orange-50 p-5 rounded-xl flex justify-between items-center shadow-sm border border-orange-200 mt-6">
                        <span className="font-bold text-sm uppercase text-orange-800">Total Final</span>
                        <span className="text-3xl font-bold text-orange-600">$ {service.totalPrice?.toLocaleString("es-AR") || 0}</span>
                    </div>
                </div>

                {/* Right: Detailed List */}
                <div className="flex-[2] space-y-6 md:pl-8 md:border-l border-gray-100">
                    <div>
                        <h3 className="text-sky-500 flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                            <Wrench className="w-4 h-4" /> Mano de Obra
                        </h3>
                        <div className="space-y-2 bg-sky-50/50 p-4 rounded-lg border border-sky-100/50">
                            <div className="flex justify-between items-center text-sm p-3 bg-white rounded-md shadow-sm border border-gray-100">
                                <span className="text-slate-700 font-medium">Service Base ({service.service_type})</span>
                                <span className="font-mono font-bold text-slate-700">$ {service.basePrice?.toLocaleString("es-AR") || 0}</span>
                            </div>
                            {laborItems.map((item: any) => (
                                <div key={item.id} className="flex justify-between items-center text-sm p-3 bg-white rounded-md shadow-sm border border-gray-100">
                                    <span className="text-slate-700">{item.description}</span>
                                    <span className="font-mono font-bold text-slate-700">$ {item.price?.toLocaleString("es-AR") || 0}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {partItems.length > 0 && (
                        <div>
                            <h3 className="text-sky-500 flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                                <Package className="w-4 h-4" /> Repuestos
                            </h3>
                            <div className="space-y-2 bg-sky-50/50 p-4 rounded-lg border border-sky-100/50">
                                {partItems.map((item: any) => (
                                    <div key={item.id} className="flex justify-between items-center text-sm p-3 bg-white rounded-md shadow-sm border border-gray-100">
                                        <span className="text-slate-700">{item.description}</span>
                                        <span className="font-mono font-bold text-slate-700">$ {item.price?.toLocaleString("es-AR") || 0}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Notes */}
            {service.mechanic_notes && (
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <h4 className="text-sky-500 flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                        <Tag className="w-4 h-4" /> Notas del Mecánico
                    </h4>
                    <p className="text-sm text-slate-700 italic bg-slate-50 p-4 rounded-lg border border-slate-200">
                        "{service.mechanic_notes}"
                    </p>
                </div>
            )}
        </div>
    );
}
