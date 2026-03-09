import { useState, useRef, Fragment, useMemo } from 'react';
import { exportBackupToZip } from '@/lib/exportBackup';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent } from '@/components/ui/card';
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
import { FileText, Eye, Download, Upload, ChevronUp, Pencil, Trash2, ClipboardList, Search, Calendar as CalendarIcon, FilterX, Wrench, Package, Info, Tag } from 'lucide-react';
import { printServiceReport } from '@/lib/printServiceBtn';
import { deleteService } from '@/lib/api';
import { ServiceModal } from '@/components/ServiceModal';
import { es } from "date-fns/locale";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
type DateRange = {
    from: Date;
    to?: Date;
};
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { getBikeCategory } from '@/utils/bikeRecognition';

// Interface definitions...
interface Client { id: number; name: string; dni?: string; phone: string; }
interface Bike { id: number; client_id: number; brand: string; model: string; }
interface Service {
    id: number;
    bike_id: number;
    status: string;
    created_at?: string;
    date_in?: string;
    date_out?: string;
    service_type: string;
    [key: string]: any;
}

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

    const readDataFromStorage = () => {
        try {
            const rawDB = localStorage.getItem('mechanicPro_db');
            if (rawDB) {
                const db = JSON.parse(rawDB);
                const services: Service[] = Array.isArray(db.services) ? db.services : [];
                const bikes: Bike[] = Array.isArray(db.bikes) ? db.bikes : [];
                const clients: Client[] = Array.isArray(db.clients) ? db.clients : [];

                const joinedJobs = services.filter((s: any) => !s.deleted_at).map(service => {
                    const bike = bikes.find(b => b.id === service.bike_id);
                    const client = clients.find(c => c.id === bike?.client_id);
                    // Use date_out if available (Completed), otherwise date_in or created_at
                    const rawDate = service.date_out || service.date_in || service.created_at || "2024-01-01T00:00:00";
                    let displayDate = "Sin fecha";
                    let dateObj = new Date();
                    try {
                        const d = new Date(rawDate);
                        dateObj = d;
                        displayDate = d.toLocaleDateString('es-AR', {
                            day: '2-digit', month: '2-digit', year: '2-digit'
                        });
                        if (displayDate === "Invalid Date") displayDate = String(rawDate);
                    } catch { displayDate = String(rawDate); }

                    return {
                        uniqueId: service.id,
                        id: service.id,
                        status: service.status || "Unknown",
                        displayDate: displayDate,
                        rawDate: rawDate,
                        dateObj: dateObj,
                        clientName: client?.name || "Cliente Desconocido",
                        clientDni: client?.dni || "",
                        clientPhone: client?.phone || "",
                        bikeBrand: (bike?.brand || "").trim(),
                        bikeModel: bike ? `${bike.brand} ${bike.model}` : "Bicicleta Desconocida",
                        serviceType: service.service_type || "General",
                        bikeCategory: getBikeCategory(bike?.model, service.service_type),
                        rawJob: service
                    };
                });

                joinedJobs.sort((a, b) => new Date(a.rawDate || 0).getTime() - new Date(b.rawDate || 0).getTime()).reverse();
                return joinedJobs;
            }
        } catch (e) {
            console.error("Load Error", e);
        }
        return [];
    };

    const [allJobs, setAllJobs] = useState<any[]>(() => readDataFromStorage());
    const [expandedIds, setExpandedIds] = useState<number[]>([]);
    const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filters State
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("Todas");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [brandFilter, setBrandFilter] = useState("all");

    const toggleExpand = (id: number) => {
        setExpandedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleDelete = async (id: number) => {
        if (confirm("¿Estás seguro de eliminar este servicio? Esta acción no se puede deshacer.")) {
            try {
                await deleteService(id);
                setAllJobs(readDataFromStorage()); // Refresh list
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

    // ... (Export/Import functions) ...
    const exportBackup = async () => {
        const rawData = localStorage.getItem('mechanicPro_db');
        if (!rawData) return alert('No hay datos para exportar.');
        try {
            const result = await exportBackupToZip(taller_id);
            const cascadeMsg = result.skippedTotal > 0
                ? `\n\n⚠️ ${result.skippedTotal} filas descartadas en cascada (clientes eliminados y sus dependencias).`
                : '';
            alert(
                `✅ Backup exportado exitosamente.\n\n` +
                `📊 Resumen:\n` +
                `• ${result.clients} Clientes\n` +
                `• ${result.bikes} Bicicletas\n` +
                `• ${result.services} Servicios\n` +
                `• ${result.items} Items\n` +
                `• ${result.reminders} Recordatorios` +
                cascadeMsg
            );
        } catch (error: any) {
            console.error('❌ ZIP Generation error:', error);
            alert(`ERROR DE MIGRACIÓN:\n\n${error.message}`);
        }
    };

    const triggerImport = () => {
        if (confirm("⚠️ ¿RESTAURAR BASE DE DATOS?\nSe reemplazarán todos los datos actuales.")) {
            fileInputRef.current?.click();
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = event.target?.result as string;
                const parsed = JSON.parse(json);
                if (parsed.clients && Array.isArray(parsed.clients) && parsed.services) {
                    localStorage.setItem('mechanicPro_db', json);
                    alert("✅ Base de datos restaurada. Recargando...");
                    window.location.reload();
                } else {
                    alert("❌ Archivo inválido. No tiene el formato 'mechanicPro_db'.");
                }
            } catch { alert("Error leyendo archivo."); }
        };
        reader.readAsText(file);
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
                <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    <Button variant="outline" size="sm" onClick={triggerImport} className="h-9">
                        <Upload className="w-4 h-4 mr-2" /> Importar
                    </Button>
                    <Button onClick={exportBackup} variant="outline" size="sm" className="bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 h-9">
                        <Download className="w-4 h-4 mr-2" /> Exportar Backup
                    </Button>
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
                                <TableHead className="py-4">Fecha</TableHead>
                                <TableHead className="py-4">Cliente</TableHead>
                                <TableHead className="py-4">Bicicleta</TableHead>
                                <TableHead className="py-4">Tipo</TableHead>
                                <TableHead className="py-4 text-right pr-6">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredJobs.map((job) => {
                                const isExpanded = expandedIds.includes(job.id);
                                const isCompleted = (job.status || '').toLowerCase().includes('complet') || (job.status || '').toLowerCase().includes('entregado');

                                return (
                                    <Fragment key={job.uniqueId}>
                                        <TableRow className={cn(
                                            "hover:bg-slate-50/50 transition-colors cursor-pointer border-slate-100",
                                            isExpanded && "bg-slate-50/80 border-b-0"
                                        )}
                                            onClick={() => toggleExpand(job.id)}
                                        >
                                            <TableCell className="pl-6 py-4">
                                                <Badge className={cn(
                                                    "rounded-md px-2.5 py-1 text-xs font-semibold shadow-none uppercase border-0",
                                                    isCompleted
                                                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                                        : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                                )}>
                                                    {job.status === "Completed" ? "LISTO" : job.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700">{job.displayDate}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono">#{job.id}</span>
                                                </div>
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
                            setAllJobs(readDataFromStorage());
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
                    Detalle del Service #{job.id} <span className="text-gray-400 font-normal text-sm ml-2">| {job.bikeModel}</span>
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
