import { useState, Fragment, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { StatusBadge, grupoDeEstado, type GrupoDeEstado } from "@/components/StatusBadge";
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
import { Search, FilterX, ChevronUp, ChevronDown, FileText, Pencil, Trash2, Eye, ClipboardList, Calendar as CalendarIcon, Wrench, Package, Info, Tag, MessageCircle, Lock } from "lucide-react";
import { printServiceReport } from '@/lib/printServiceBtn';
import { ServiceModal } from '@/components/ServiceModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { es } from "date-fns/locale";
import { instanteAR, instanteARConHora, entregaMostrable } from '@/lib/fechaAR';
import { notasParaElCliente, notasDelTaller, tieneNotasInternas } from '@/lib/notasServicio';

// 🚩 Las fechas se formatean en UN SOLO lugar: `lib/fechaAR.ts`. Ahí está
// explicado por qué `fecha_ingreso`/`fecha_finalizacion`/`fecha_entregado` se
// convierten a hora de Argentina y `fecha_entrega` (la prometida) NO.
// Antes había dos copias de `formatSafeDate` (acá y en Workshop) y media docena
// de `toLocaleDateString` sueltos: la misma fecha se veía distinta según la
// pantalla, que es el "9 vs 10" que apareció en la orden 311.
export { instanteAR as formatSafeDate } from '@/lib/fechaAR';

import { format } from "date-fns";
import { cn, formatInternalServiceName } from "@/lib/utils";
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
            .filter(s => !s.eliminado_en)
            .map(service => {
                const bike = storeBicicletas.find(b => b.id === service.bicicleta_id);
                const client = bike ? storeClientes.find(c => c.id === bike.cliente_id) : null;
                const rawDateIn = service.fecha_ingreso || "2024-01-01T00:00:00";
                const rawDateOut = service.fecha_entrega;

                // fecha_ingreso es un INSTANTE (lo escribe new Date()); la
                // entrega se resuelve con la regla de entregaMostrable: la real
                // si la bici ya se retiró, la prometida si todavía no.
                const displayDateIn = instanteAR(rawDateIn);
                const entrega = entregaMostrable(service.fecha_entregado, rawDateOut);

                // dateObj is used for filtering, so it needs to be a Date object
                const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawDateIn);
                let dateObj = isDateOnly ? new Date(`${rawDateIn}T12:00:00`) : new Date(rawDateIn);
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
                    // En qué grupo cae, con las mismas palabras que la chapita.
                    grupo: grupoDeEstado(service.estado),
                    displayDateIn,
                    entrega,
                    rawDateOut,
                    rawDate: rawDateIn,
                    rawFechaFinalizacion: service.fecha_finalizacion,
                    // Para una bici ya entregada, la fecha que la ubica en el tiempo
                    // es cuándo se la llevaron, no cuándo el mecánico apretó Finalizar.
                    rawFechaEntregado: service.fecha_entregado,
                    displayFinalizacion: instanteAR(service.fecha_finalizacion),
                    displayFinalizacionHora: instanteARConHora(service.fecha_finalizacion),
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
                        notas_internas: service.notas_internas,
                        webhook_erp_ok: service.webhook_erp_ok,
                        webhook_erp_detalle: service.webhook_erp_detalle,
                        extraItems: service.items_extra?.map((i: any) => ({
                            id: i.id || crypto.randomUUID(),
                            description: i.descripcion,
                            price: i.precio,
                            category: i.categoria,
                        })),
                    },
                };
            })
            // ── EL ORDEN, ARREGLADO EL 5-SEP-2026.
            //
            // Leandro (Probikes) avisó que en el Historial "se le mezclan las bicis que
            // están en curso y las que están finalizadas". Tenía razón y la causa era el
            // criterio de orden: una sola lista ordenada por
            // `fecha_finalizacion || fecha_ingreso`, o sea DOS FECHAS CON SIGNIFICADOS
            // DISTINTOS metidas en la misma clave. Una bici que entró hoy y sigue en el
            // taller quedaba arriba de una que se terminó ayer, y la columna que
            // explicaba por qué estaba en ese lugar era distinta en cada fila.
            //
            // Medido: Probikes tiene 4 en curso repartidas entre 300 filas, y 48
            // services SIN `fecha_finalizacion` que por eso ordenaban por su fecha de
            // ingreso — así que ni siquiera las terminadas caían donde correspondía.
            //
            // Ahora son DOS BLOQUES y cada uno ordena por la fecha que le da sentido:
            // lo que está en el taller, por cuándo entró; lo que ya salió, por cuándo
            // se terminó. Nada se esconde: se dejan de intercalar.
            .sort((a, b) => {
                if (a.grupo === 'en_curso' && b.grupo !== 'en_curso') return -1;
                if (b.grupo === 'en_curso' && a.grupo !== 'en_curso') return 1;
                const cuando = (j: typeof a) => new Date(
                    j.grupo === 'en_curso'
                        ? j.rawDate
                        : (j.rawFechaEntregado || j.rawFechaFinalizacion || j.rawDate)
                ).getTime();
                return cuando(b) - cuando(a);
            });
    }, [storeServicios, storeBicicletas, storeClientes]);

    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
    const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);


    // Filters State
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("Todas");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [brandFilter, setBrandFilter] = useState("all");
    // Arranca en "todos" a propósito: el Historial es donde el taller BUSCA una
    // bici, y un filtro puesto de fábrica que esconde 4 de 300 hace que la
    // búsqueda falle sin decir por qué. Lo que se arregló es que no se intercalen,
    // no que no se vean.
    const [estadoFilter, setEstadoFilter] = useState<GrupoDeEstado | "todos">("todos");

    const toggleExpand = (id: string) => {
        setExpandedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Confirmación linda (ConfirmDialog) en vez de window.confirm
    const handleDelete = (id: string) => setDeletingServiceId(id);

    const doDelete = async (id: string) => {
        try {
            await storeDeleteServicio(id);
        } catch {
            alert("Error al eliminar servicio");
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
                const normalizedQueryForId = query.replace(/^#/, '').replace(/^0+/, '');

                const notesMatch = (job.rawJob.mechanic_notes || "").toLowerCase().includes(query);
                const itemsMatch = (job.rawJob.extraItems || []).some((item: any) =>
                    (item.description || "").toLowerCase().includes(query)
                );
                const checklistMatch = Object.entries(job.rawJob.checklist_data || {})
                    .filter(([_, value]) => value === true)
                    .some(([key, _]) => key.toLowerCase().includes(query));

                const formattedOrderId = formatOrdenNumber(job.numero_orden, job.id).toLowerCase();
                const normalizedOrderId = formattedOrderId.replace(/^#/, '').replace(/^0+/, '');
                const orderMatch = normalizedOrderId.includes(normalizedQueryForId) || String(job.id).toLowerCase().includes(normalizedQueryForId);

                const matchesSearch =
                    job.clientName.toLowerCase().includes(query) ||
                    job.bikeModel.toLowerCase().includes(query) ||
                    orderMatch ||
                    job.serviceType.toLowerCase().includes(query) ||
                    notesMatch ||
                    itemsMatch ||
                    checklistMatch;

                if (!matchesSearch) return false;
            }

            // 2. Category Filter
            if (categoryFilter !== "Todas" && job.bikeCategory !== categoryFilter) return false;

            // 3. Brand Filter
            if (brandFilter !== "all" && job.bikeBrand.trim().toLowerCase() !== brandFilter.trim().toLowerCase()) return false;

            // 3-bis. Estado (pedido de Leandro, 5-sep-2026: "se me mezclan las que
            // están en curso con las finalizadas").
            if (estadoFilter !== "todos" && job.grupo !== estadoFilter) return false;

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
    }, [allJobs, searchQuery, categoryFilter, brandFilter, dateRange, estadoFilter]);

    const clearFilters = () => {
        setSearchQuery("");
        setCategoryFilter("Todas");
        setBrandFilter("all");
        setEstadoFilter("todos");
        setDateRange(undefined);
    };



    return (
        <div className="p-8 space-y-8 max-w-[1800px] mx-auto min-h-screen bg-transparent">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div data-tour="historial">
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
                        <ClipboardList className="h-8 w-8 text-primary" />
                        Historial de Trabajos
                    </h1>
                    <p className="text-muted-foreground mt-1 text-lg">Gestión centralizada de servicios y mantenimientos.</p>
                </div>
            </div>

            {/* Filters Bar */}
            <div data-tour="historial-buscador" className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">

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

                    {/* Estado — pedido de Leandro (Probikes, 5-sep-2026): las bicis en
                        curso y las terminadas se le mezclaban. Ya no se intercalan solas,
                        y además puede quedarse con un solo grupo. Las palabras son las
                        mismas que muestra la chapita de cada fila: si el filtro dijera
                        "Terminadas" y la fila "Finalizado", parecerían dos cosas. */}
                    <div className="w-[180px]">
                        <Select value={estadoFilter} onValueChange={(v) => setEstadoFilter(v as GrupoDeEstado | "todos")}>
                            <SelectTrigger className="bg-slate-50 border-slate-200 text-slate-700">
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent className="z-50 bg-white">
                                <SelectItem value="todos">Todos los estados</SelectItem>
                                <SelectItem value="en_curso">En curso</SelectItem>
                                <SelectItem value="finalizado">Finalizado</SelectItem>
                                <SelectItem value="entregado">Entregado</SelectItem>
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
                    {(categoryFilter !== "Todas" || brandFilter !== "all" || estadoFilter !== "todos" || searchQuery) && (
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
                        placeholder="Buscar cliente, modelo, ID o trabajo (ej: horquilla)..."
                        className="pl-9 h-10 bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all font-medium w-full"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* ── MOBILE: History Cards (hidden on md+) ── */}
            <div className="block md:hidden space-y-0">
                {filteredJobs.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                        <div className="bg-slate-100 p-4 rounded-full"><Search className="h-7 w-7 text-slate-400" /></div>
                        <p className="font-medium text-slate-600">No se encontraron resultados</p>
                        <button onClick={clearFilters} className="text-sm text-primary underline">Limpiar filtros</button>
                    </div>
                ) : filteredJobs.map((job, i) => (
                    <Fragment key={job.uniqueId}>
                        {/* El mismo corte que en la tabla. El celular es DONDE el taller
                            mira esto, así que la separación tiene que estar en los dos
                            lados: arreglarla solo en la tabla sería arreglar la mitad. */}
                        {job.grupo !== 'en_curso' && i > 0 && filteredJobs[i - 1].grupo === 'en_curso' && (
                            <p className="px-1 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                Ya salieron del taller
                            </p>
                        )}
                        <MobileHistoryCard
                            job={job}
                            isExpanded={expandedIds.includes(job.id)}
                            onToggle={() => toggleExpand(job.id)}
                            onEdit={() => setEditingServiceId(job.id)}
                            onDelete={() => handleDelete(job.id)}
                            onPrint={() => printServiceReport(job.rawJob, job.clientName, job.bikeModel, job.clientDni, job.clientPhone)}
                        />
                    </Fragment>
                ))}
            </div>

            {/* ── DESKTOP: Full table card (hidden on mobile) ── */}
            <Card className="hidden md:block border-none shadow-md bg-white overflow-hidden">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50/80">
                            <TableRow className="hover:bg-transparent border-slate-100">
                                <TableHead className="py-4 pl-6 w-[140px]">Estado</TableHead>
                                <TableHead className="py-4">Ingreso</TableHead>
                                <TableHead className="py-4">Entrega</TableHead>
                                <TableHead className="py-4">Finalizado</TableHead>
                                <TableHead className="py-4">Cliente</TableHead>
                                <TableHead className="py-4">Bicicleta</TableHead>
                                <TableHead className="py-4">Tipo</TableHead>
                                <TableHead className="py-4 text-right pr-6">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredJobs.map((job, i) => {
                                const isExpanded = expandedIds.includes(job.id);
                                // El renglón que parte la lista en dos. Solo aparece cuando
                                // conviven los dos grupos: si el taller filtró, o si no hay
                                // nada en curso, un separador sería mueble.
                                const abreCerradas = job.grupo !== 'en_curso'
                                    && i > 0 && filteredJobs[i - 1].grupo === 'en_curso';

                                return (
                                    <Fragment key={job.uniqueId}>
                                        {abreCerradas && (
                                            <TableRow className="hover:bg-transparent">
                                                <TableCell colSpan={8} className="py-2 pl-6 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                    Ya salieron del taller
                                                </TableCell>
                                            </TableRow>
                                        )}
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
                                                {job.entrega ? (
                                                    <div className="flex flex-col">
                                                        <span className={job.entrega.real ? "font-semibold text-slate-700" : "font-semibold text-slate-500"}>{job.entrega.texto}</span>
                                                        {/* Una fecha sola no dice si la bici ya se retiró o si es la
                                                            prometida. El rótulo es la diferencia entre un dato y una promesa. */}
                                                        <span className="text-[10px] text-slate-400 leading-tight">{job.entrega.real ? 'entregada' : 'estimada'}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 italic text-sm">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-4 w-28">
                                                {job.rawFechaFinalizacion ? (
                                                    <span className="font-semibold text-slate-700" title={job.displayFinalizacionHora}>{job.displayFinalizacion}</span>
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
                                                <Badge variant="outline" className="text-slate-600 bg-white border-slate-200 font-bold whitespace-nowrap">
                                                    {formatInternalServiceName(job.serviceType).toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6 py-4">
                                                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                    {job.clientPhone && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-green-600 hover:bg-green-50"
                                                            title="WhatsApp"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                let cleanedPhone = job.clientPhone.replace(/\D/g, '');
                                                                if (!cleanedPhone) return;
                                                                if (!cleanedPhone.startsWith('54')) {
                                                                    cleanedPhone = '549' + cleanedPhone;
                                                                }
                                                                window.open('https://wa.me/' + cleanedPhone, '_blank');
                                                            }}
                                                        >
                                                            <MessageCircle className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/10" title="Imprimir" onClick={() => printServiceReport(job.rawJob, job.clientName, job.bikeModel, job.clientDni, job.clientPhone)}>
                                                        <FileText className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/10" title="Ver Detalles" onClick={() => toggleExpand(job.id)}>
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
                                                <TableCell colSpan={8} className="p-0">
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
                                    <TableCell colSpan={8} className="text-center py-20 text-muted-foreground">
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

            {deletingServiceId && (() => {
                const job = allJobs.find(j => j.id === deletingServiceId);
                return (
                    <ConfirmDialog
                        open={!!deletingServiceId}
                        onClose={() => setDeletingServiceId(null)}
                        onConfirm={() => { const id = deletingServiceId; setDeletingServiceId(null); doDelete(id); }}
                        icon={<Trash2 className="h-7 w-7" />}
                        iconClassName="bg-red-50 text-red-500"
                        title="Eliminar este service"
                        description={<>Se elimina el service {job ? <>de <span className="font-semibold text-foreground">{job.clientName}</span> ({formatOrdenNumber(job.numero_orden, job.id)})</> : null} del historial. <span className="font-semibold text-foreground">Esta acción no se puede deshacer.</span></>}
                        confirmLabel="Sí, eliminar"
                        confirmClassName="bg-red-600 hover:bg-red-700 text-white"
                    />
                );
            })()}
        </div>
    );
}

// ── Mobile-only History Card ──────────────────────────────────────────────────
interface MobileHistoryCardProps {
    job: any;
    isExpanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onPrint: () => void;
}

function MobileHistoryCard({ job, isExpanded, onToggle, onEdit, onDelete, onPrint }: MobileHistoryCardProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-3 active:scale-[0.99] transition-transform">
            {/* Top row: Status badge + Dates (ingreso + finalizado) */}
            <div className="flex items-center justify-between mb-2.5">
                <StatusBadge status={job.status} />
                <div className="flex flex-col items-end leading-tight">
                    <span className="text-[10px] text-slate-400 font-medium">Ing. {job.displayDateIn}</span>
                    {job.rawFechaFinalizacion && (
                        <span className="text-xs text-slate-600 font-semibold" title={job.displayFinalizacionHora}>Fin. {job.displayFinalizacion}</span>
                    )}
                </div>
            </div>

            {/* Middle row: Client name (big) */}
            <h3 className="text-slate-800 font-bold text-base leading-tight mb-2 truncate">
                {job.clientName}
            </h3>

            {/* Bottom row: Order ID (brand orange) + Bike model */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                        {formatOrdenNumber(job.numero_orden, job.id)}
                    </span>
                    <span className="text-xs text-slate-500 truncate max-w-[140px]">{job.bikeModel}</span>
                </div>
                {/* Expand toggle */}
                <button
                    onClick={onToggle}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    aria-label={isExpanded ? 'Contraer' : 'Expandir'}
                >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100">
                <button onClick={onPrint} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-600 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                    <FileText size={13} /> PDF
                </button>
                <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil size={13} /> Editar
                </button>
                <button onClick={onDelete} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={13} /> Borrar
                </button>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <ExpandedServiceDetail job={job} />
                </div>
            )}
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
        <div className="bg-white border border-primary/20 rounded-xl p-6 shadow-sm animate-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-gray-100 gap-4">
                <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />
                    Detalle del Service {formatOrdenNumber(job.numero_orden, job.id)} <span className="text-gray-400 font-normal text-sm ml-2">| {job.bikeModel}</span>
                </h2>
                <Button onClick={() => printServiceReport(job.rawJob, job.clientName, job.bikeModel, job.clientDni, job.clientPhone)} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                    <FileText className="w-4 h-4 mr-2" />
                    Imprimir Comprobante
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                {/* Left: Summary */}
                <div className="md:col-span-1 space-y-4">
                    <h3 className="text-primary flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                        <Info className="w-4 h-4" /> Resumen del Trabajo
                    </h3>
                    <div className="flex flex-col gap-1.5 text-xs bg-slate-50 rounded-lg p-3 border border-slate-100 mb-4">
                        <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500">Ingreso</span>
                            <span className="font-semibold text-slate-700">{job.displayDateIn}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                            <span className="text-slate-500">Finalizado</span>
                            <span className="font-semibold text-slate-700">{job.rawFechaFinalizacion ? job.displayFinalizacionHora : "-"}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-primary/10 p-4 rounded-lg border border-primary/20 flex flex-col justify-center">
                            <span className="text-xs text-primary font-medium block mb-1">Mano de Obra</span>
                            <div className="flex flex-row items-baseline gap-1 whitespace-nowrap">
                                <span className="text-lg font-mono font-bold text-slate-800">$</span>
                                <span className="text-xl font-mono font-bold text-slate-800">{totalLabor.toLocaleString("es-AR")}</span>
                            </div>
                        </div>
                        <div className="bg-primary/10 p-4 rounded-lg border border-primary/20 flex flex-col justify-center">
                            <span className="text-xs text-primary font-medium block mb-1">Repuestos</span>
                            <div className="flex flex-row items-baseline gap-1 whitespace-nowrap">
                                <span className="text-lg font-mono font-bold text-slate-800">$</span>
                                <span className="text-xl font-mono font-bold text-slate-800">{totalParts.toLocaleString("es-AR")}</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-primary/10 p-4 rounded-xl flex justify-between items-center shadow-sm border border-primary/20 mt-6 whitespace-nowrap flex-wrap gap-2">
                        <span className="font-bold text-sm uppercase text-primary shrink-0">Total Final</span>
                        <div className="flex flex-row items-baseline gap-1 shrink-0">
                            <span className="text-2xl font-bold text-primary">$</span>
                            <span className="text-3xl font-bold text-primary">{service.totalPrice?.toLocaleString("es-AR") || 0}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Detailed List */}
                <div className="md:col-span-2 space-y-6 md:pl-8 md:border-l border-gray-100 w-full">
                    <div>
                        <h3 className="text-primary flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                            <Wrench className="w-4 h-4" /> Mano de Obra
                        </h3>
                        <div className="space-y-2 bg-primary/5 p-4 rounded-lg border border-primary/10 w-full">
                            <div className="flex justify-between items-center text-sm p-3 bg-white rounded-md shadow-sm border border-gray-100 gap-4">
                                <span className="text-slate-700 font-medium break-words">{formatInternalServiceName(service.service_type)}</span>
                                <span className="font-mono font-bold text-slate-700 whitespace-nowrap shrink-0">$ {service.basePrice?.toLocaleString("es-AR") || 0}</span>
                            </div>
                            {laborItems.map((item: any) => (
                                <div key={item.id} className="flex justify-between items-center text-sm p-3 bg-white rounded-md shadow-sm border border-gray-100 gap-4">
                                    <span className="text-slate-700 break-words">{item.description}</span>
                                    <span className="font-mono font-bold text-slate-700 whitespace-nowrap shrink-0">$ {item.price?.toLocaleString("es-AR") || 0}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {partItems.length > 0 && (
                        <div>
                            <h3 className="text-primary flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                                <Package className="w-4 h-4" /> Repuestos
                            </h3>
                            <div className="space-y-2 bg-primary/5 p-4 rounded-lg border border-primary/10 w-full">
                                {partItems.map((item: any) => (
                                    <div key={item.id} className="flex justify-between items-center text-sm p-3 bg-white rounded-md shadow-sm border border-gray-100 gap-4">
                                        <span className="text-slate-700 break-words">{item.description}</span>
                                        <span className="font-mono font-bold text-slate-700 whitespace-nowrap shrink-0">$ {item.price?.toLocaleString("es-AR") || 0}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* La orden de venta al ERP no llegó: se dice acá, en la orden, y no
                en un console.error que nadie lee. */}
            {service.webhook_erp_ok === false && (
                <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
                    <h4 className="text-red-700 flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-1">
                        <Info className="w-4 h-4" /> La orden de venta no salió al ERP
                    </h4>
                    <p className="text-sm text-red-700">
                        El aviso a la automatización no se pudo entregar{service.webhook_erp_detalle ? ` (${service.webhook_erp_detalle})` : ''}. Puede que haya que cargar la venta a mano.
                    </p>
                </div>
            )}

            {/* Notes: las del cliente y, si las hay, las internas del taller.
                Esta pantalla la ve el taller, así que las dos van; el rótulo
                marca cuál se llevó impresa el cliente. Ver lib/notasServicio.ts. */}
            {notasParaElCliente(service) && (
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <h4 className="text-primary flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                        <Tag className="w-4 h-4" /> Notas para el cliente
                    </h4>
                    <p className="text-sm text-slate-700 italic bg-slate-50 p-4 rounded-lg border border-slate-200">
                        "{notasParaElCliente(service)}"
                    </p>
                </div>
            )}
            {tieneNotasInternas(service) && (
                <div className="mt-6">
                    <h4 className="text-slate-500 flex items-center gap-2 font-semibold uppercase tracking-widest text-sm mb-3">
                        <Lock className="w-4 h-4" /> Notas internas del taller
                    </h4>
                    <p className="text-sm text-slate-700 italic bg-amber-50 p-4 rounded-lg border border-amber-200">
                        "{notasDelTaller(service)}"
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1.5">Esto no salió en el comprobante del cliente.</p>
                </div>
            )}
        </div>
    );
}
