import { useState, useMemo, useEffect } from "react";
import { AvisoDeVuelta } from '@/components/AvisoDeVuelta';
import { useSearchParams } from "react-router-dom";
import { useDataStore } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { formatOrdenNumber, ordenNumberForWebhook } from "@/lib/formatId";
import { printServiceReport } from "@/lib/printServiceBtn";
import { BotonTicketIngreso } from "@/components/BotonTicketIngreso";
import { TelefonoCopiable } from "@/components/TelefonoCopiable";
import { dispararMensajesAutomaticos } from "@/lib/comprobanteALaNube";
import { ServiceModal } from "@/components/ServiceModal";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Wrench, CheckCircle, Save, FileDown, Pencil, RefreshCcw, MessageCircle, ChevronRight, Clock, PackageCheck, ClipboardList, Undo2, ListChecks, Lock, CircleDollarSign, PackageSearch, Phone, Bike, Send } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { servicioRevenue } from "@/lib/servicioRevenue";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HealthCheckWidget, type HealthCheckData } from "@/components/HealthCheckWidget";
import { estadoDeEspera } from "@/lib/avisoDeLaOrden";
import { resolveOrdenWebhookUrl, resolveEntregadoWebhookUrl } from "@/lib/ordenWebhook";
import { armarPayloadOrden, cargarVinculosERP as cargarVinculosERPDelTaller, enFila, mandarOrden, registrarRespuestaERP, textoAvisoERP } from "@/lib/ordenVentaERP";
import { buscarProductos } from "@/lib/buscadorProductos";
import { instanteAR, diaCalendario, horaCorta, ZONA_AR } from "@/lib/fechaAR";
import { ETIQUETAS_NOTAS } from "@/lib/notasServicio";
import { quienFirmaPatch, limpiarNombreFirmante, OTRO_FIRMANTE } from "@/lib/quienFirma";
import { repeticionesDeLaOrden, type ServicioRepetible } from "@/lib/repeticionServices";
import {
    chequearOrdenParaERP,
    itemsQueVanAlERP,
    sugerirProductoERP,
    estaVinculadoAlERP,
    type AvisoOrdenERP,
    type VinculoProducto,
} from "@/lib/chequeoOrdenERP";
import { EtapasChecklist } from "@/components/EtapasChecklist";
import { avancesActivos, trabajosPendientes, tareasActivas, bloqueoFinalizacionActivo, tareasLibresPendientes } from "@/lib/planFeatures";
import { tourBloqueaCierreDialog } from "@/components/OnboardingTour";
import SegundoParDeOjos from "@/components/SegundoParDeOjos";
import { EtiquetaService } from '@/components/EtiquetaService';
import { FiltroDeColumna, type OpcionFiltro, type Direccion } from '@/components/FiltroDeColumna';
import { grupoDeEstado, ETIQUETA_DE_GRUPO } from '@/components/StatusBadge';
import { hoyAR } from '@/lib/mantenimiento';
import { VentaDeMostrador } from '@/components/VentaDeMostrador';
import { piezaEnFrase } from '@/lib/piezaSuelta';
import { nombrePropio, conMayuscula } from '@/lib/nombreAmigable';

// 🚩 Las fechas se formatean en UN SOLO lugar: `lib/fechaAR.ts`. Ahí está
// explicado por qué los INSTANTES (fecha_ingreso, fecha_finalizacion,
// fecha_entregado) se convierten a hora de Argentina y la fecha PROMETIDA
// (fecha_entrega, que la escribe un <input type="date">) se muestra tal cual.
export { instanteAR as formatSafeDate } from '@/lib/fechaAR';

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
    /** Hora estimada de entrega ("18:00:00"), si la pusieron. */
    hora_out?: string | null;
    total_price?: number;
    bicicleta_id: string;
    /** Si trajo solo una pieza (rueda, tija…). Leira, 14-sep-2026. */
    pieza?: string | null;
    /** false = el POST de la orden de venta al ERP no llegó. */
    webhook_erp_ok?: boolean | null;
    webhook_erp_detalle?: string | null;
}

// ─────────────────────────────────────────────────────────────
// ORDENAR Y FILTRAR LA MESA DE TRABAJO, como en Excel (14-sep-2026).
//
// Pedido de Ariel Leira (Leira Bikes): "que se pueda acomodar por fecha de
// entrega" y "filtrar la columna de entrega como en Excel". Iara: "todo lo demás
// de los filtros prefiero que sea para todos". Hasta hoy la mesa ordenaba de una
// sola forma (entrega más cercana primero) y no filtraba nada.
// ─────────────────────────────────────────────────────────────
type ColFiltro = 'estado' | 'ingreso' | 'entrega' | 'cliente' | 'service';
type ColOrden = 'entrega' | 'ingreso' | 'cliente';

const CLAVE_ORDEN = 'mp_taller_activo_orden';
const SIN_FILTROS: Record<ColFiltro, Set<string> | null> = { estado: null, ingreso: null, entrega: null, cliente: null, service: null };
const SIN_FECHA = '__sin_fecha__';

/** El día de Argentina de un instante: `fecha_ingreso` se guarda con hora. */
const diaDeInstante = (iso?: string) => iso
    ? new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_AR, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
    : SIN_FECHA;

const VALOR: Record<ColFiltro, (j: DashboardJob) => string> = {
    estado: j => grupoDeEstado(j.status),
    ingreso: j => diaDeInstante(j.date_in),
    // `fecha_entrega` es un día de calendario (la fecha prometida): se usa tal cual.
    entrega: j => j.date_out ? j.date_out.slice(0, 10) : SIN_FECHA,
    cliente: j => j.client_name,
    service: j => j.service_type || 'OTRO',
};

function diaSiguiente(dia: string): string {
    const [y, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function etiquetaDeDia(v: string, hoy: string, conRelativo: boolean): string {
    if (v === SIN_FECHA) return '(Sin fecha)';
    const base = diaCalendario(v);
    if (!conRelativo) return base;
    if (v < hoy) return `${base} · vencida`;
    if (v === hoy) return `${base} · hoy`;
    if (v === diaSiguiente(hoy)) return `${base} · mañana`;
    return base;
}

function opcionesDeFiltro(jobs: DashboardJob[], hoy: string): Record<ColFiltro, OpcionFiltro[]> {
    const contar = (col: ColFiltro, etiqueta: (v: string) => string, orden: (a: string, b: string) => number) => {
        const n = new Map<string, number>();
        for (const j of jobs) { const v = VALOR[col](j); n.set(v, (n.get(v) ?? 0) + 1); }
        return [...n.entries()].sort(([a], [b]) => orden(a, b)).map(([valor, cantidad]) => ({ valor, etiqueta: etiqueta(valor), cantidad }));
    };
    const porFecha = (a: string, b: string) => (a === SIN_FECHA ? 1 : b === SIN_FECHA ? -1 : a.localeCompare(b));
    const alfabetico = (a: string, b: string) => a.localeCompare(b, 'es');
    const ordenDeEstado = ['en_curso', 'finalizado', 'entregado'];
    return {
        estado: contar('estado', v => ETIQUETA_DE_GRUPO[v as keyof typeof ETIQUETA_DE_GRUPO] ?? v,
            (a, b) => ordenDeEstado.indexOf(a) - ordenDeEstado.indexOf(b)),
        ingreso: contar('ingreso', v => etiquetaDeDia(v, hoy, false), porFecha),
        entrega: contar('entrega', v => etiquetaDeDia(v, hoy, true), porFecha),
        cliente: contar('cliente', v => v, alfabetico),
        service: contar('service', v => v, alfabetico),
    };
}

function ordenarJobs(jobs: DashboardJob[], col: ColOrden, dir: Direccion): DashboardJob[] {
    const signo = dir === 'asc' ? 1 : -1;
    // A igual día manda la hora prometida; la que no tiene hora va al final de ese día.
    const clave = (j: DashboardJob) => col === 'entrega'
        ? (j.date_out ? `${j.date_out.slice(0, 10)} ${horaCorta(j.hora_out) || '24:00'}` : null)
        : col === 'ingreso' ? (j.date_in ?? null) : (j.client_name || null);
    return [...jobs].sort((a, b) => {
        const ka = clave(a), kb = clave(b);
        // Sin fecha va SIEMPRE al final, se ordene para donde se ordene: es la que
        // no tiene compromiso, no la más urgente ni la menos.
        if (!ka && !kb) return 0;
        if (!ka) return 1;
        if (!kb) return -1;
        const c = col === 'cliente' ? ka.localeCompare(kb, 'es') : ka < kb ? -1 : ka > kb ? 1 : 0;
        // A igual valor, la que entró primero.
        return c * signo || (a.date_in ?? '').localeCompare(b.date_in ?? '');
    });
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
    // Leira, 14-sep-2026: la venta de mostrador, que deja agendados ajuste y primer service.
    const [ventaOpen, setVentaOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    // Confirmación linda (estilo MP) en vez de window.confirm
    const [confirming, setConfirming] = useState<{ kind: 'deliver' | 'reopen'; job: DashboardJob } | null>(null);
    // URLs de webhook del libro diario (Probikes), que Iara carga a mano desde SuperAdmin.
    // Si el taller no las cargó, cae al fallback de la env / derivación (lib/ordenWebhook.ts).
    const [webhookUrls, setWebhookUrls] = useState<{ orden: string | null; entregado: string | null }>({ orden: null, entregado: null });

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
                    hora_out: s.hora_entrega ?? null,
                    total_price: s.precio_total,
                    bicicleta_id: s.bicicleta_id,
                    webhook_erp_ok: s.webhook_erp_ok ?? null,
                    webhook_erp_detalle: s.webhook_erp_detalle ?? null,
                    pieza: s.pieza ?? null,
                };
            });

        return mapped;
    }, [servicios, bicicletas, clientes]);

    // El orden se recuerda en este navegador: es una costumbre de quien mira. Los
    // filtros NO: un filtro olvidado de ayer esconde la bici que entró hoy, y en la
    // mesa de trabajo eso es una bici que nadie ve.
    const [orden, setOrden] = useState<{ col: ColOrden; dir: Direccion }>(() => {
        try {
            const g = JSON.parse(localStorage.getItem(CLAVE_ORDEN) || 'null');
            if (g && ['entrega', 'ingreso', 'cliente'].includes(g.col) && ['asc', 'desc'].includes(g.dir)) return g;
        } catch { /* sin almacenamiento: el orden de siempre */ }
        return { col: 'entrega', dir: 'asc' };
    });
    const ordenar = (col: ColOrden, dir: Direccion) => {
        setOrden({ col, dir });
        try { localStorage.setItem(CLAVE_ORDEN, JSON.stringify({ col, dir })); } catch { /* no se recuerda, no pasa nada */ }
    };
    const [filtros, setFiltros] = useState<Record<ColFiltro, Set<string> | null>>(SIN_FILTROS);
    const filtrar = (col: ColFiltro) => (sel: Set<string> | null) => setFiltros(f => ({ ...f, [col]: sel }));
    const hayFiltros = Object.values(filtros).some(Boolean);

    const hoy = hoyAR();
    const opciones = useMemo(() => opcionesDeFiltro(jobs, hoy), [jobs, hoy]);
    const visibles = useMemo(() => {
        const pasa = (job: DashboardJob) => (Object.keys(filtros) as ColFiltro[])
            .every(col => !filtros[col] || filtros[col]!.has(VALOR[col](job)));
        return ordenarJobs(jobs.filter(pasa), orden.col, orden.dir);
    }, [jobs, filtros, orden]);

    const ETIQUETAS = {
        entrega: { asc: 'La más cercana primero', desc: 'La más lejana primero' },
        ingreso: { asc: 'La que entró primero', desc: 'La que entró último' },
        cliente: { asc: 'De la A a la Z', desc: 'De la Z a la A' },
    };
    const filtro = (col: ColFiltro, titulo: string, variante: 'encabezado' | 'pastilla') => (
        <FiltroDeColumna
            titulo={titulo}
            variante={variante}
            opciones={opciones[col]}
            seleccion={filtros[col]}
            onCambiar={filtrar(col)}
            {...(col === 'entrega' || col === 'ingreso' || col === 'cliente'
                ? { orden: orden.col === col ? orden.dir : null, onOrdenar: (d: Direccion) => ordenar(col, d), etiquetasOrden: ETIQUETAS[col] }
                : {})}
        />
    );

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

    // Cargar las URLs de webhook configuradas del taller. Multi-taller (29-jul-2026):
    // cada taller dispara a SU propio n8n si tiene URL en taller_configuraciones; si no,
    // solo Probikes cae al env global (ver resolveOrdenWebhookUrl). Editable en SuperAdmin
    // → si cambia el server/túnel del taller, Iara lo actualiza sin redeploy.
    useEffect(() => {
        if (!taller_id) return;
        supabase
            .from('taller_configuraciones')
            .select('webhook_orden_url, webhook_entregado_url')
            .eq('taller_id', taller_id)
            .maybeSingle()
            .then(({ data }) => {
                setWebhookUrls({
                    orden: data?.webhook_orden_url?.trim() || null,
                    entregado: data?.webhook_entregado_url?.trim() || null,
                });
            });
    }, [taller_id]);

    const handleRefresh = async () => {
        if (!taller_id) return;
        setIsRefetching(true);
        await fetchDashboardData(taller_id);
        setIsRefetching(false);
    };

    // Paso 2 del flujo: el cliente retiró la bici → recién ahí pasa al historial
    const doDeliver = async (job: DashboardJob) => {
        try {
            const fechaEntregado = new Date().toISOString();
            await updateServicio(job.service_id, {
                estado: 'delivered',
                fecha_entregado: fechaEntregado,
            });

            // Los mensajes que el taller dejó configurados para este momento
            // (Configuración → Mensajes automáticos). Va sin `await`: si el
            // WhatsApp tarda, la bici ya se entregó y la pantalla no puede
            // quedar esperando. Si no hay ninguna regla prendida, no hace nada.
            const servicioEntregado = servicios.find(s => s.id === job.service_id);
            if (servicioEntregado) {
                void dispararMensajesAutomaticos({
                    servicioId: job.service_id,
                    evento: 'bici_entregada',
                    // El store todavía tiene el estado viejo: se le pasa la fecha
                    // real de entrega para que el comprobante no salga sin ella.
                    serviceData: { ...servicioEntregado, estado: 'delivered', fecha_entregado: fechaEntregado },
                    clientName: job.client_name,
                    bikeModel: job.bike_model,
                    clientPhone: job.client_phone || '',
                });
            }

            // Webhook "bici entregada" → el n8n del taller actualiza la fecha de la orden al
            // día real en que el cliente la retiró (a veces se cobra días después de finalizar).
            // Multi-taller: dispara a la URL propia del taller (o al fallback Probikes). Si el
            // taller no tiene webhook configurado → null → no dispara. Ver lib/ordenWebhook.ts.
            // numero_orden va con el MISMO valor que se mandó al finalizar (número pelado,
            // sin # ni ceros — spec de Mica) para que la orden matchee en la base del taller.
            const url = resolveEntregadoWebhookUrl(taller_id, webhookUrls.entregado);
            if (url) {
                const payload = { numero_orden: ordenNumberForWebhook(job.numero_orden, job.service_id) };
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true,
                }).catch(e => console.error('Webhook entregado Error (Fetch):', e));
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
                <div data-tour="taller-activo">
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Wrench className="h-8 w-8 text-primary" />
                        Taller Activo
                    </h1>
                    <p className="text-muted-foreground mt-1">Trabajos en curso y bicis listas para entregar.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {/* Recibir Bici abre el wizard directo (identificación del cliente),
                        sin pantalla intermedia de Recepción (Tarea E). */}
                    <Button variant="outline" className="gap-2" onClick={() => setVentaOpen(true)} title="Registrar una venta de mostrador">
                        <Bike className="h-4 w-4" /> Vendí una bici
                    </Button>
                    <Button
                        data-tour="recibir-bici"
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

            {/* 🔴 Las dos tarjetas iban RELLENAS con los colores del taller (15-sep-2026).
                Con el rojo puro de Leira la de "En proceso" era un bloque rojo que gritaba
                más que cualquier bici, y su secundario es BLANCO: la otra no se veía.
                Ahora las dos son blancas y el color del taller es una franja fina. */}
            <div data-tour="contadores" className="grid grid-cols-2 gap-4 w-full">
                <Card className="relative overflow-hidden border bg-card shadow-sm">
                    <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
                    <CardContent className="px-5 py-4 flex flex-col gap-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">En proceso</p>
                        <p className="text-3xl font-bold text-slate-900 tabular-nums">{enProceso}</p>
                    </CardContent>
                </Card>
                <Card className="relative overflow-hidden border bg-card shadow-sm">
                    <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
                    <CardContent className="px-5 py-4 flex flex-col gap-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Listas para entregar</p>
                        <p className="text-3xl font-bold text-slate-900 tabular-nums">{paraEntregar.length}</p>
                    </CardContent>
                </Card>
            </div>

            {hayFiltros && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                    <span>Mostrando <strong>{visibles.length}</strong> de {jobs.length}</span>
                    <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setFiltros(SIN_FILTROS)}>
                        Quitar filtros
                    </button>
                </div>
            )}

            {/* ── MOBILE: Compact horizontal cards (hidden on md+) ── */}
            <div data-tour="mesa-trabajo" className="block md:hidden">
                {jobs.length > 0 && (
                    <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-2">
                        {filtro('entrega', 'Entrega', 'pastilla')}
                        {filtro('cliente', 'Cliente', 'pastilla')}
                        {filtro('estado', 'Estado', 'pastilla')}
                        {filtro('service', 'Service', 'pastilla')}
                    </div>
                )}
                {jobs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-12">No hay bicicletas en el taller.</p>
                ) : visibles.length === 0 ? (
                    <p className="text-center text-muted-foreground py-12">Ninguna bici coincide con los filtros.</p>
                ) : (
                    visibles.map((job) => (
                        <MobileJobCard
                            key={job.service_id}
                            job={job}
                            onClick={() => setEditingJob(job)}
                            onFinalize={() => setFinalizingJob(job)}
                            onDeliver={() => handleDeliver(job)}
                            onReopen={() => handleReopen(job)}
                        />
                    ))
                )}
            </div>

            {/* ── DESKTOP: Full table (hidden on mobile) ── */}
            <div data-tour="mesa-trabajo" className="hidden md:block rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50 [&>th]:px-3">
                            <TableHead className="w-24">N° orden</TableHead>
                            <TableHead className="w-[100px]">{filtro('estado', 'Estado', 'encabezado')}</TableHead>
                            <TableHead>{filtro('ingreso', 'Ingreso', 'encabezado')}</TableHead>
                            <TableHead>{filtro('entrega', 'Entrega', 'encabezado')}</TableHead>
                            <TableHead>{filtro('cliente', 'Cliente', 'encabezado')}</TableHead>
                            <TableHead>Bicicleta</TableHead>
                            <TableHead>{filtro('service', 'Service', 'encabezado')}</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibles.map((job) => (
                            <JobRow
                                key={job.service_id}
                                job={job}
                                onClick={() => setEditingJob(job)}
                                onFinalize={() => setFinalizingJob(job)}
                                onDeliver={() => handleDeliver(job)}
                                onReopen={() => handleReopen(job)}
                            />
                        ))}
                        {visibles.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                    {jobs.length === 0 ? 'No hay bicicletas en el taller.' : 'Ninguna bici coincide con los filtros.'}
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

            <VentaDeMostrador open={ventaOpen} onClose={() => setVentaOpen(false)} />

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
                    ordenWebhookUrl={webhookUrls.orden}
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
                    iconClassName={confirming.kind === 'deliver' ? 'bg-slate-100 text-slate-900' : 'bg-slate-100 text-slate-600'}
                    title={confirming.kind === 'deliver' ? 'Entregar la bici' : 'Reabrir el service'}
                    description={confirming.kind === 'deliver'
                        ? <>¿<span className="font-semibold text-foreground">{confirming.job.client_name}</span> retiró su <span className="font-semibold text-foreground">{confirming.job.bike_brand} {confirming.job.bike_model}</span>? La orden pasa al historial como <span className="font-semibold text-foreground">Entregada</span>.</>
                        : <>El service de <span className="font-semibold text-foreground">{confirming.job.client_name}</span> vuelve a <span className="font-semibold text-foreground">En curso</span> para seguir trabajándolo.</>}
                    confirmLabel={confirming.kind === 'deliver' ? 'Sí, entregar' : 'Sí, reabrir'}
                    confirmClassName={confirming.kind === 'deliver'
                        ? 'bg-slate-900 hover:bg-slate-800 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// "ESPERANDO AL CLIENTE" — el chip de la mesa de trabajo (8-sep-2026).
//
// POR QUÉ: hasta hoy una bici frenada porque el cliente no contesta se veía
// EXACTAMENTE igual que una en la que alguien está trabajando. El dueño del
// taller miraba la mesa y no podía distinguir "va lento" de "está parada hace
// dos días esperando un sí" — que es la queja con la que arrancó todo esto.
//
// Cuando pasa el plazo que fijó el taller el chip cambia de color y dice el
// número de horas: es lo que dispara la llamada, que es el segundo recurso y no
// el primero.
// ─────────────────────────────────────────────────────────────
function ChipDeEspera({ serviceId }: { serviceId: string }) {
    const taller = useAuthStore(s => s.taller);
    const servicio = useDataStore(s => s.servicios.find(sv => sv.id === serviceId));
    const espera = estadoDeEspera(servicio, Number((taller as any)?.horas_para_llamar ?? 3));
    if (!espera.esperando) return null;
    return (
        <span
            title={espera.que ? `Se le preguntó: ${espera.que}` : undefined}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit whitespace-nowrap ${espera.hayQueLlamar
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-100 text-slate-600 border border-slate-200'}`}
        >
            {espera.hayQueLlamar
                ? <><Phone size={10} /> No contesta hace {espera.horas} h</>
                : <><Clock size={10} /> {espera.etiqueta}</>}
        </span>
    );
}

function MobileJobCard({ job, onClick, onFinalize, onDeliver, onReopen }: { job: DashboardJob; onClick: () => void; onFinalize: () => void; onDeliver: () => void; onReopen: () => void }) {
    const taller = useAuthStore(s => s.taller);
    const mostrarEtapas = avancesActivos(taller);
    const mostrarTareas = tareasActivas(taller);
    const isReady = (job.status || '').toLowerCase() === 'ready';
    // Leira, 14-sep-2026: "va a usar mucho el número de orden". Solo en el taller
    // que lo prendió (Configuración → Número de orden grande).
    const ordenGrande = taller?.config_vista?.numero_orden_grande === true;
    return (
        <div
            onClick={onClick}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-3 active:scale-[0.98] transition-transform cursor-pointer"
        >
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1 flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                        <span className={ordenGrande
                            ? "text-lg font-bold leading-none text-slate-900 tabular-nums"
                            : "bg-slate-100 text-slate-600 text-[11px] font-bold px-1.5 py-0.5 rounded-md"}>
                            #{job.numero_orden ? String(job.numero_orden).padStart(4, '0') : job.service_id.slice(-4)}
                        </span>
                        <h3 className="font-semibold text-slate-800 text-sm truncate">{nombrePropio(job.client_name)}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Wrench size={12} className="flex-shrink-0" />
                        <span className="truncate">{conMayuscula(job.bike_brand)} {conMayuscula(job.bike_model)}</span>
                    </div>
                    {job.pieza && (
                        <span className="w-fit text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Solo {piezaEnFrase(job.pieza)}
                        </span>
                    )}
                    <ChipDeEspera serviceId={job.service_id} />
                    {(mostrarEtapas || mostrarTareas) && <EtapasChecklist serviceId={job.service_id} />}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={job.status} />
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock size={10} />
                            {job.date_out
                                ? `Entrega ${diaCalendario(job.date_out)}${horaCorta(job.hora_out) ? ` ${horaCorta(job.hora_out)}` : ''}`
                                : instanteAR(job.date_in)}
                        </span>
                    </div>
                    <ChevronRight size={18} className="text-slate-300" />
                </div>
            </div>
            {/* 🔴 EN CURSO LA TARJETA NO TENÍA NINGUNA ACCIÓN (12-sep-2026). Con el
                teléfono en la mano no había forma de cerrar una orden, y con eso se
                perdían el diagnóstico (que alimenta la retención), el segundo par de
                ojos y el aviso de vuelta: los tres viven en el modal de finalizar. Es
                el mismo botón y el mismo modal que en escritorio. */}
            {!isReady && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onFinalize(); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 active:bg-green-700 rounded-lg transition-colors"
                        title="El mecánico terminó el trabajo"
                    >
                        <CheckCircle size={16} /> Finalizar Service
                    </button>
                    {/* 🔴 EL COMPROBANTE DE INGRESO FALTABA EN EL CELULAR (Alejo, 21-sep-2026:
                        "desde el celu no hace nada"). El botón se había puesto en la FILA de la
                        tabla, que en el teléfono no se dibuja: el Taller Activo son estas
                        tarjetas. Existía en el DOM, medía 0 px y no se podía tocar. Es el mismo
                        botón que en la tabla, y acá es donde más falta hace: el mecánico recibe
                        la bici con el teléfono en la mano. */}
                    <BotonTicketIngreso
                        servicioId={job.service_id}
                        variant="outline"
                        soloIcono
                        className="h-11 w-11 flex-shrink-0 border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    />
                </div>
            )}
            {isReady && (
                <div className="flex flex-wrap gap-2 mt-3">
                    <button
                        onClick={(e) => { e.stopPropagation(); onReopen(); }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-slate-600 border border-slate-300 hover:bg-slate-100 active:bg-slate-100 rounded-lg transition-colors"
                        title="¿Se finalizó por error? Vuelve a En curso"
                    >
                        <Undo2 size={15} /> Reabrir
                    </button>
                    <BotonTicketIngreso
                        servicioId={job.service_id}
                        variant="outline"
                        soloIcono
                        className="h-11 w-11 flex-shrink-0 border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeliver(); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-800 rounded-lg transition-colors"
                    >
                        <PackageCheck size={16} /> Entregar Bici
                    </button>
                </div>
            )}
        </div>
    );
}

// El aviso por WhatsApp depende de un n8n configurado por env (VITE_N8N_WHATSAPP_WEBHOOK_URL).
// Si no está, el fetch salía contra `undefined` y el botón fallaba SIEMPRE — después de haber
// subido el PDF del cliente al bucket público. Mejor no ofrecer lo que no se puede cumplir:
// sin URL configurada, el botón no se muestra. (30-jul-2026)
const WHATSAPP_CONFIGURADO = !!import.meta.env.VITE_N8N_WHATSAPP_WEBHOOK_URL;

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
                hora_out: serviceData.hora_entrega,
                // La fecha REAL de entrega (el botón Entregar). El comprobante
                // prefiere esta sobre la prometida. Ver lib/fechaAR.ts.
                date_delivered: serviceData.fecha_entregado,
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
            // La política de pago sale de la config del taller, NO hardcodeada: el texto fijo era
            // el de Probikes ("la mano de obra se abona únicamente en efectivo o transferencia") y
            // se lo mandaba a los clientes de cualquier taller. El PDF ya la tomaba de la config
            // (printServiceBtn.ts); el WhatsApp era el único que no. (30-jul-2026)
            const politicaPago = (taller as any)?.politica_pago?.trim();
            const messageText = `Hola ${job.client_name}, te avisamos que tu bicicleta ${job.bike_model} ya está lista. El total del service es de $${job.total_price || 0}.${politicaPago ? ` ${politicaPago}` : ''} ¡Te esperamos!`;

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

    // 🔴 LA MESA DE TRABAJO SE VEÍA HORRIBLE (Iara, 15-sep-2026, mirando la de
    // Leira). Todo gritaba a la vez: el número de orden en rojo gigante, el service
    // en pastillas rojas, el total en verde, tres botones apilados por fila y la
    // fecha de entrega flotando arriba. Regla desde hoy: el color del taller va en
    // UNA sola cosa por pantalla (el botón de Recibir Bici). En la fila, jerarquía
    // por tamaño y peso; el color queda para lo que es una señal (vencida, no
    // contesta, finalizar).
    const serviceBadge = (
        <EtiquetaService
            nombre={job.service_type || "OTRO"}
            crudo
            variant="outline"
            className="border-slate-200 bg-slate-50 text-slate-700 font-semibold text-[11px] tracking-wide hover:bg-slate-50"
        />
    );
    const ordenGrande = taller?.config_vista?.numero_orden_grande === true;
    const entregaDia = job.date_out ? job.date_out.slice(0, 10) : null;
    const hoy = hoyAR();
    const vencida = !!entregaDia && !isReady && entregaDia < hoy;
    const esHoy = !!entregaDia && entregaDia === hoy;

    return (
        <>
            <TableRow className="hover:bg-slate-50/70 transition-colors cursor-pointer [&>td]:px-3 [&>td]:py-3" onClick={onClick}>
                {/* El número en su propia columna: iba debajo del título "Ingreso".
                    Grande en el taller que lo pidió (Leira), pero en gris oscuro. */}
                <TableCell className="w-24">
                    <span
                        className={ordenGrande
                            ? "text-xl font-bold leading-none text-slate-900 tabular-nums"
                            : "text-sm font-semibold text-slate-700 tabular-nums"}
                        title={job.service_id}
                    >
                        {formatOrdenNumber(job.numero_orden, job.service_id)}
                    </span>
                </TableCell>
                <TableCell>
                    <div className="flex flex-col items-start gap-1">
                        {/* El estado y la barra de tareas en un mismo renglón cuando entran; si no, abajo. La
                            celda apilada de a tres o cuatro era la que estiraba la fila (15-sep-2026). */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {statusBadge}
                            {(mostrarEtapas || mostrarTareas) && <EtapasChecklist serviceId={job.service_id} />}
                        </div>
                        {/* El POST de la orden de venta no llegó al ERP. Es un dato, no una
                            suposición: lo registra doFinalize con lo que contestó el servidor.
                            Sin esto, una orden de venta que no se generó no deja rastro. */}
                        {job.webhook_erp_ok === false && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 uppercase" title={textoAvisoERP(job.webhook_erp_detalle).cuerpo}>
                                <PackageSearch className="h-3 w-3" /> {textoAvisoERP(job.webhook_erp_detalle).titulo}
                            </div>
                        )}
                        <ChipDeEspera serviceId={job.service_id} />
                    </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600 whitespace-nowrap tabular-nums">{instanteAR(job.date_in)}</TableCell>
                <TableCell className="whitespace-nowrap">
                    {job.date_out ? (
                        <div className="flex flex-col">
                            {/* fecha_entrega es la fecha PROMETIDA y se muestra tal cual se
                                eligió (ver lib/fechaAR.ts). El rótulo evita que se lea como
                                "ya se entregó": la bici sigue en el taller. */}
                            <span className={`text-sm font-medium tabular-nums ${vencida ? 'text-red-600' : 'text-slate-900'}`}>
                                {diaCalendario(job.date_out)}
                                {horaCorta(job.hora_out) && <span className="ml-1.5 font-normal text-slate-500">{horaCorta(job.hora_out)}</span>}
                            </span>
                            <span className={`text-xs ${vencida ? 'text-red-600' : esHoy ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                                {vencida ? 'vencida' : esHoy ? 'hoy' : 'estimada'}
                            </span>
                        </div>
                    ) : (
                        <span className="text-sm text-slate-400">-</span>
                    )}
                </TableCell>
                <TableCell>
                    <div className="flex flex-col">
                        <span className="max-w-[12rem] truncate text-sm font-semibold text-slate-900" title={nombrePropio(job.client_name)}>{nombrePropio(job.client_name)}</span>
                        <span className="text-xs text-slate-500 tabular-nums">$ {(job.total_price || 0).toLocaleString("es-AR")}</span>
                    </div>
                </TableCell>
                <TableCell>
                    <div className="flex flex-col items-start">
                        <span className="text-sm font-medium text-slate-800">{conMayuscula(job.bike_model)}</span>
                        <span className="text-xs text-slate-500">{conMayuscula(job.bike_brand)}</span>
                        {job.pieza && (
                            <span className="mt-1 w-fit text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                Solo {piezaEnFrase(job.pieza)}
                            </span>
                        )}
                    </div>
                </TableCell>
                <TableCell>{serviceBadge}</TableCell>
                <TableCell className="text-right">
                    {/* Un solo renglón: antes eran tres botones apilados por fila. */}
                    <div className="flex flex-nowrap items-center justify-end gap-1.5">
                        {job.client_phone && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
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
                                title="Abrir el chat con el cliente"
                                aria-label="Abrir el chat de WhatsApp con el cliente"
                            >
                                <MessageCircle className="h-4 w-4" />
                            </Button>
                        )}
                        {/* La fila entera ya abre la orden: el lápiz es un atajo, no un botón más. */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            onClick={(e) => { e.stopPropagation(); onClick(); }}
                            title="Editar la orden"
                            aria-label="Editar la orden"
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                        {/* Reimprimir el comprobante de ingreso sin abrir nada, en cualquier
                            momento del service (Alejo, 11 a Fondo, 21-sep-2026). */}
                        <BotonTicketIngreso
                            servicioId={job.service_id}
                            variant="ghost"
                            soloIcono
                            className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        />
                        {job.status !== 'delivered' && (
                            <>
                                {/* Solo cuando la bici YA está lista: el botón dice "avisar que
                                    está lista" y manda el comprobante. Antes aparecía también en
                                    las órdenes en curso, al lado del de Finalizar, y un toque de
                                    más le avisaba al cliente que pasara a buscar una bici que
                                    seguía desarmada (14-sep-2026). */}
                                {WHATSAPP_CONFIGURADO && isReady && (
                                <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                                    onClick={notifyCustomer}
                                    disabled={isLoading}
                                    title="Avisarle que está lista (le manda el comprobante por WhatsApp)"
                                    aria-label="Avisarle que está lista por WhatsApp"
                                >
                                    {isLoading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </Button>
                                )}
                                {/* Los DOS pasos siempre a la vista: primero Finalizar, después Entregar.
                                    Si se finalizó por error, "Reabrir" queda como atajo al lado. */}
                                {isReady ? (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                        onClick={(e) => { e.stopPropagation(); onReopen(); }}
                                        title="Reabrir: se finalizó por error y vuelve a En curso"
                                        aria-label="Reabrir el service"
                                    >
                                        <Undo2 className="h-4 w-4" />
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        className="h-8 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                        onClick={handleFinish}
                                        title="El mecánico terminó el trabajo"
                                    >
                                        <CheckCircle className="h-4 w-4" /> Finalizar
                                    </Button>
                                )}
                                {/* Color FIJO y no el secundario del taller: en Leira el secundario
                                    es blanco y el botón era texto gris suelto (15-sep-2026). */}
                                <Button
                                    size="sm"
                                    variant={isReady ? "default" : "outline"}
                                    className={isReady
                                        ? "h-8 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white"
                                        : "h-8 gap-1.5 border-dashed text-slate-500 disabled:opacity-100"}
                                    onClick={(e) => { e.stopPropagation(); onDeliver(); }}
                                    disabled={!isReady}
                                    title={isReady ? "El cliente retiró la bici: pasa al historial" : "Primero finalizá el service"}
                                >
                                    <PackageCheck className="h-4 w-4" /> Entregar
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


function FinalizeJobDialog({ job, isOpen, onClose, ordenWebhookUrl }: { job: DashboardJob, isOpen: boolean, onClose: () => void, ordenWebhookUrl: string | null }) {
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

    // ── Quién hizo el service (opt-in por taller, 3-sep-2026).
    // Viene precargado con el que está usando la app: en el 90% de los casos es
    // el que lo hizo, y así el selector se mira y se pasa de largo en vez de
    // frenar a alguien con las manos sucias.
    const registrarMecanico = taller?.config_mecanicos?.habilitado === true;
    const miUserId = useAuthStore(s => s.session?.user?.id ?? null);
    const [gente, setGente] = useState<{ id: string; nombre: string; rol: string }[]>([]);
    // Los del taller que NO tienen usuario: los carga el taller en Configuración.
    // Antes la lista salía solo de `usuarios` y en un taller de tres aparecía uno,
    // así que "quién firma" no se podía usar de verdad.
    const rolUsuario = useAuthStore(s => s.rol);
    const setTallerAuth = useAuthStore(s => s.setTaller);
    const [otroNombre, setOtroNombre] = useState('');
    const nombresSueltos = useMemo(() => {
        // El que YA tiene usuario no aparece dos veces: si el mismo nombre se
        // pudiera elegir por las dos vías, en Métricas terminaría partido en dos
        // filas con la mitad de los services cada una.
        const conUsuario = new Set(gente.map(g => (g.nombre ?? '').trim().toLowerCase()));
        const lista = (taller?.config_mecanicos?.nombres ?? [])
            .map(n => String(n).trim()).filter(n => n && !conUsuario.has(n.toLowerCase()));
        // El nombre con el que ya quedó esta orden va igual, aunque después lo
        // hayan sacado de la lista: si no, al reabrirla se perdería.
        const guardado = (service?.mecanico_nombre ?? '').trim();
        return guardado && !lista.some(n => n.toLowerCase() === guardado.toLowerCase())
            ? [...lista, guardado] : lista;
    }, [taller, gente, service?.mecanico_nombre]);
    // Una sola caja para las dos clases de persona: `u:<uuid>` el que tiene login,
    // `n:<nombre>` el que no. Sin el prefijo, un nombre y un id conviven en el
    // mismo `value` y no hay forma de saber en qué columna se guarda.
    const [quienFirma, setQuienFirma] = useState<string>(
        service?.mecanico_id ? `u:${service.mecanico_id}`
            : service?.mecanico_nombre ? `n:${service.mecanico_nombre}`
                : miUserId ? `u:${miUserId}` : ''
    );

    useEffect(() => {
        if (!registrarMecanico || !isOpen || !taller_id) return;
        void (async () => {
            const { data } = await supabase
                .from('usuarios').select('id, nombre, rol')
                .eq('taller_id', taller_id)
                .in('rol', ['mecanico', 'admin'])   // el dueño también mete mano
                .order('nombre');
            setGente(data ?? []);
        })();
    }, [registrarMecanico, isOpen, taller_id]);

    // ── Los services del menú que se repiten solos (16-sep-2026). Se leen al abrir
    // la finalización y no en cada tecla: es una lista corta que casi nunca cambia.
    const [repetibles, setRepetibles] = useState<ServicioRepetible[]>([]);
    useEffect(() => {
        if (!isOpen || !taller_id) return;
        void (async () => {
            const { data } = await supabase
                .from('catalogo_servicios').select('nombre, meses_repeticion')
                .eq('taller_id', taller_id)
                .not('meses_repeticion', 'is', null);
            setRepetibles((data ?? [])
                .filter((s: any) => s.nombre && s.meses_repeticion > 0)
                .map((s: any) => ({ nombre: s.nombre, meses: s.meses_repeticion })));
        })();
    }, [isOpen, taller_id]);

    const [notes, setNotes] = useState(service?.notas_mecanico || "");
    // El día en que hay que escribirle para que vuelva, elegido al finalizar.
    const [avisarEl, setAvisarEl] = useState<string | null>(service?.avisar_el ?? null);
    const [avisarMotivo, setAvisarMotivo] = useState<string | null>(service?.avisar_motivo ?? null);
    const [notasInternas, setNotasInternas] = useState(service?.notas_internas || "");
    const [healthCheckData, setHealthCheckData] = useState<HealthCheckData[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [pendientesConfirm, setPendientesConfirm] = useState<string[] | null>(null);
    const [bloqueoPendientes, setBloqueoPendientes] = useState<string[] | null>(null);
    const [precioCeroConfirm, setPrecioCeroConfirm] = useState(false);
    const [avisosERP, setAvisosERP] = useState<AvisoOrdenERP[] | null>(null);
    const productos = useDataStore(s => s.productos);

    // ── Con qué se calcula la sugerencia del aviso.
    //
    // Las visitas del cliente salen del store que ya está cargado: no hay una
    // consulta nueva al finalizar, que es el momento en que menos se puede
    // esperar. Se juntan por CLIENTE y no por bici a propósito — el ritmo con que
    // alguien pasa por el taller es de la persona, y el que tiene tres bicis
    // aparece tres veces más seguido.
    const todasLasBicis = useDataStore(s => s.bicicletas);
    const todosLosServicios = useDataStore(s => s.servicios);
    const visitasDelCliente = useMemo(() => {
        const miBici = todasLasBicis.find(b => b.id === service?.bicicleta_id);
        if (!miBici?.cliente_id) return [];
        const suyas = new Set(todasLasBicis.filter(b => b.cliente_id === miBici.cliente_id).map(b => b.id));
        return todosLosServicios
            .filter(x => suyas.has(x.bicicleta_id) && !x.eliminado_en)
            .map(x => x.fecha_ingreso);
    }, [todasLasBicis, todosLosServicios, service?.bicicleta_id]);

    // Y el plazo de la regla general del taller, si tiene una prendida: es la
    // segunda mejor respuesta cuando al cliente todavía no se le puede leer el ritmo.
    const [plazoDelTaller, setPlazoDelTaller] = useState<number | null>(null);
    useEffect(() => {
        if (!isOpen || !taller_id) return;
        void (async () => {
            const { data } = await supabase.from('automatizaciones_wa')
                .select('dias_despues').eq('evento', 'dias_despues').eq('activa', true).limit(1);
            setPlazoDelTaller(data?.[0]?.dias_despues ?? null);
        })();
    }, [isOpen, taller_id]);


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
        await chequearPrecioYFinalizar();
    };

    // ─────────────────────────────────────────────────────────────
    // Segundo eslabón antes de cerrar: la orden no se cierra en $0 sin que
    // alguien lo vea. Nace del cierre de Crono Bikes (4-ago-2026): con el
    // catálogo vacío la orden salió tipo "OTRO", tipearon 6 ítems por
    // $296.625 en el campo de notas y el sistema la guardó en CERO. El
    // equipo vio ese comprobante el primer día. No bloquea (puede ser una
    // garantía o un ajuste sin cargo), pero obliga a decidirlo a propósito.
    //
    // Usa la MISMA cuenta que las métricas (base + items, sin precio_total)
    // para que las dos pantallas nunca se contradigan.
    // ─────────────────────────────────────────────────────────────
    const chequearPrecioYFinalizar = async () => {
        if (!service) return;
        const estadoActual = (service.estado || '').toLowerCase();
        const yaCerrado = estadoActual === 'ready' || estadoActual === 'delivered';

        if (!yaCerrado && servicioRevenue(service).facturacion <= 0) {
            setPrecioCeroConfirm(true);
            return;
        }
        await chequearItemsYFinalizar();
    };

    // ─────────────────────────────────────────────────────────────
    // Cuarto eslabón: el candado de la ORDEN DE VENTA al ERP (20-ago-2026).
    //
    // Nace de dos órdenes reales de Probikes que se cerraron bien en la app y
    // NUNCA generaron su orden de venta en Contabilium, sin que nadie se
    // enterara: la 311 (un renglón de repuesto guardado sin nombre, $50.288) y
    // la 319 (dos cámaras cuyo nombre no existe en el ERP, porque el buscador
    // lo había aprendido de alguien que lo tipeó). Ver `chequeoOrdenERP.ts`.
    //
    // Lo que hace acá es lo único que se puede hacer a tiempo: avisar mientras
    // la orden todavía se puede corregir. NO bloquea, igual que los otros tres.
    // ─────────────────────────────────────────────────────────────
    // Trae del catálogo del taller lo que se sabe de cada repuesto de la orden:
    // su nombre en el ERP, su SKU y su idConcepto. Lo usan LOS DOS lados —
    // el candado (para avisar) y el payload del webhook (para mandárselos a la
    // automatización). `pudoMedir` en false significa "no sé", que no es lo
    // mismo que "no está vinculado".
    //
    // Se consulta el catálogo COMPLETO del taller, sin los filtros del buscador
    // (`activo`/`sugerible`): la pregunta es "¿existe en el ERP?", no "¿lo
    // sugiere el buscador?". Un casco está en Contabilium aunque el buscador no
    // lo ofrezca como repuesto.
    const cargarVinculosERP = () => cargarVinculosERPDelTaller(taller_id, service?.items_extra);

    const chequearItemsYFinalizar = async () => {
        if (!service) return;
        const estadoActual = (service.estado || '').toLowerCase();
        const yaCerrado = estadoActual === 'ready' || estadoActual === 'delivered';

        // Ya cerrado = el webhook no vuelve a salir, no hay nada que prevenir.
        if (yaCerrado) { await doFinalize(); return; }

        // El chequeo del ERP solo aplica si esta finalización va a disparar el
        // webhook de verdad (mismo guard y mismo anti-doble-disparo que abajo).
        const erpActivo = !!resolveOrdenWebhookUrl(taller_id, ordenWebhookUrl) && !service.webhook_erp_disparado;

        // Sin ERP no hace falta ir al catálogo: solo corre el chequeo de
        // "renglón sin nombre", que no necesita nada de la base.
        const { vinculos, pudoMedir } = erpActivo
            ? await cargarVinculosERP()
            : { vinculos: new Map<string, VinculoProducto>(), pudoMedir: true };

        const avisos = chequearOrdenParaERP({
            items: service.items_extra,
            vinculos,
            // No se pudo leer el catálogo → NO se inventa un aviso. Un candado
            // que grita sin haber medido es peor que uno mudo: en dos semanas
            // lo ignoran.
            erpActivo: erpActivo && pudoMedir,
            sugerir: (descripcion) => sugerirProductoERP(descripcion, productos),
            // El aviso solo salta si el ERP NO va a poder encontrarlo. Se usa el
            // MISMO buscador que ve el mecánico (todos los términos tienen que
            // aparecer), restringido a productos que sí están en el ERP: es el
            // proxy honesto de "un matcher por texto lo halla". Sin este filtro
            // el cartel saltaba en el 54% de las órdenes de Probikes en vez del
            // 25%, y a esa altura nadie lo lee. Ver chequeoOrdenERP.ts.
            encontrableEnERP: (descripcion) =>
                buscarProductos(productos.filter(estaVinculadoAlERP), descripcion, { limite: 1 }).length > 0,
        });

        if (avisos.length > 0) {
            setAvisosERP(avisos);
            return;
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
                notas_internas: notasInternas,
                checklist_data: {},
                // El aviso por esta orden. Va acá y no en un paso aparte: es un
                // campo al lado de las notas, y si el mecánico no lo toca queda
                // como vino. Lo dispara el cron, mirando este día.
                avisar_el: avisarEl,
                avisar_motivo: avisarMotivo,
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
                await updateServicio(job.service_id, {
                    estado: 'ready',
                    fecha_finalizacion: fechaFinalizacion,
                    // Solo si el taller lo pidió: si no, se deja como estaba y no
                    // se pisa un dato viejo con null.
                    // Vacío = "sin registrar": se deja como estaba, no se pisa un
                    // dato viejo con null.
                    ...(registrarMecanico ? quienFirmaPatch(quienFirma, otroNombre) : {}),
                });

                // Un nombre escrito a mano se suma a la lista del taller para no
                // volver a escribirlo mañana. Best-effort a propósito: `talleres`
                // solo lo puede escribir el admin (RLS), y si esto falla no pasa
                // nada, la orden ya quedó registrada con ese nombre.
                const nombreNuevo = quienFirma === OTRO_FIRMANTE ? limpiarNombreFirmante(otroNombre) : '';
                if (nombreNuevo && taller && rolUsuario?.toLowerCase()?.trim() === 'admin') {
                    const lista = (taller.config_mecanicos?.nombres ?? []).map(n => String(n).trim()).filter(Boolean);
                    if (!lista.some(n => n.toLowerCase() === nombreNuevo.toLowerCase())) {
                        const config_mecanicos = { ...(taller.config_mecanicos || { habilitado: true }), nombres: [...lista, nombreNuevo] };
                        const { error } = await supabase.from('talleres').update({ config_mecanicos }).eq('id', taller.id);
                        if (!error) setTallerAuth({ ...taller, config_mecanicos } as any);
                    }
                }

                // ── Los services del menú que se repiten (16-sep-2026).
                // Van acá y no arriba con el diagnóstico porque se agendan cuando el
                // trabajo QUEDÓ HECHO: un guardado a mitad de camino no agenda nada.
                // Escriben en `recordatorios`, la misma tabla de los vencimientos, así
                // que Retención, la campana y el cron de WhatsApp los levantan sin
                // enterarse de que son nuevos.
                if (taller_id && service.bicicleta_id && repetibles.length) {
                    const repes = repeticionesDeLaOrden(service, repetibles);
                    if (repes.length) {
                        await upsertRecordatorios(repes.map(r => ({
                            taller_id,
                            bicicleta_id: service.bicicleta_id,
                            componente: r.componente,
                            fecha_vencimiento: r.fecha,
                            fecha_asignacion: new Date().toISOString(),
                            estado: 'Pendiente',
                        })));
                    }
                }

                // El aviso de "ya está lista" con el comprobante, si el taller lo
                // dejó prendido. Sin `await` a propósito: el mecánico ya terminó
                // su trabajo y no tiene por qué esperar a que salga un WhatsApp.
                void dispararMensajesAutomaticos({
                    servicioId: job.service_id,
                    evento: 'service_finalizado',
                    serviceData: { ...service, estado: 'ready', fecha_finalizacion: fechaFinalizacion },
                    clientName: job.client_name,
                    bikeModel: job.bike_model,
                    clientPhone: job.client_phone || '',
                });

                // 2. Inmediatamente después del éxito del update, enviamos el Webhook
                try {
                    // Solo los ítems que son productos (sin mano de obra ni ML).
                    // 🚩 El filtro vive en `chequeoOrdenERP.ts` y lo usan los DOS:
                    // el que arma este payload y el candado que chequea la orden
                    // antes de finalizar. Si midieran conjuntos distintos, el
                    // candado avisaría de ítems que no viajan y callaría los que sí.
                    const productosFisicos = itemsQueVanAlERP(service.items_extra || []);

                    if (productosFisicos.length > 0) {
                        // ── Lo que el ERP necesita para no adivinar (20-ago-2026) ──
                        // Hasta hoy el payload mandaba SOLO la descripción que
                        // escribió el mecánico, y la automatización la matcheaba por
                        // texto contra el catálogo. Cuando el nombre del taller no es
                        // el del ERP ("Camara Specialized Ruta 20-28 48mm" contra
                        // "PV TUBE 700X20-28 48MM") el match falla y la orden de venta
                        // no se genera. El SKU y el nombre del ERP hacen el match
                        // determinístico.
                        //
                        // 🚩 Los campos viejos NO se tocan: los nuevos se AGREGAN, y
                        // solo cuando existen. La automatización actual sigue leyendo
                        // `descripcion` y funciona igual sin enterarse del cambio.
                        const { vinculos } = await cargarVinculosERP();

                        // El armado vive en `ordenVentaERP.ts` y lo usa también la
                        // corrección que sale al editar una orden ya enviada: si los
                        // dos armaran distinto, la corrección pisaría la orden con
                        // otra forma.
                        const payload = armarPayloadOrden({
                            numeroOrden: service.numero_orden,
                            servicioId: service.id,
                            dni: client?.dni,
                            nombre: client?.nombre,
                            fechaFinalizacion,
                            items: productosFisicos,
                            vinculos,
                        });

                        // Multi-taller: dispara a la URL propia del taller (o al fallback
                        // Probikes). Si el taller no tiene webhook configurado → null → no
                        // dispara y nunca toca la automatización ajena. Ver lib/ordenWebhook.ts.
                        // Guard anti-doble-disparo: si el service se reabrió y se volvió a
                        // finalizar, el stock ya se descontó la primera vez.
                        const ordenUrl = resolveOrdenWebhookUrl(taller_id, ordenWebhookUrl);
                        if (ordenUrl && !service.webhook_erp_disparado) {
                            // ── Se REGISTRA qué contestó, no se manda y se olvida ────────
                            // Antes esto era `fetch(...).catch(console.error)`: si el POST
                            // no llegaba (el webhook de Probikes vive detrás de un túnel
                            // ngrok), no quedaba rastro en ningún lado y "se generó la orden
                            // de venta" era una esperanza. Ahora es un dato que la pantalla
                            // muestra. Ver migración 20260820213000.
                            //
                            // No se espera la respuesta para cerrar el modal: el mecánico no
                            // tiene por qué mirar un spinner mientras el ERP piensa. El
                            // registro se escribe cuando llega, aunque el modal ya se haya
                            // cerrado (va a la base, no al estado de React).
                            const servicioId = job.service_id;
                            // En la misma fila que las correcciones: una edición hecha
                            // mientras este envío viaja sale después, no antes. Y el
                            // registro va ADENTRO de la fila: la corrección lee de la base
                            // si la orden llegó, así que tiene que encontrarlo escrito.
                            void enFila(servicioId, async () => {
                                const { ok, detalle } = await mandarOrden(ordenUrl, payload);
                                if (!ok) console.error("Webhook de orden: no llegó —", detalle);
                                await registrarRespuestaERP(servicioId, ok, detalle);
                            });
                            await updateServicio(job.service_id, { webhook_erp_disparado: true });
                        } else if (service.webhook_erp_disparado) {
                            console.log("Webhook de orden NO re-disparado: ya corrió para este service (reabierto y re-finalizado).");
                        } else {
                            console.log("Webhook de orden NO disparado: taller sin webhook configurado.");
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
                    hora_out: service.hora_entrega,
                    date_delivered: service.fecha_entregado,
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
            <DialogContent
                className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
                /* Mientras corre el tutorial contextual, el clic en el globo no
                   debe cerrar este modal (Radix lo toma como clic afuera). */
                onPointerDownOutside={tourBloqueaCierreDialog}
                onInteractOutside={tourBloqueaCierreDialog}
                onEscapeKeyDown={tourBloqueaCierreDialog}
            >
                <DialogHeader>
                    <DialogTitle className="text-2xl text-primary">Finalizar Service: {job.client_name}</DialogTitle>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{job.bike_brand} {job.bike_model} - {job.service_type}</span>
                        {/* El telefono a un toque, pedido de Alejo (11 a Fondo, 10-sep-2026). */}
                        <TelefonoCopiable telefono={client?.telefono} className="text-sm" />
                    </p>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div data-tour="finalizar-resumen" className="space-y-2">
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
                        <div data-tour="finalizar-obs" className="space-y-2">
                            <Label htmlFor="notes">{ETIQUETAS_NOTAS.cliente}</Label>
                            <Textarea id="notes" className="h-32" placeholder={ETIQUETAS_NOTAS.clientePlaceholder} value={notes} onChange={(e) => setNotes(e.target.value)} />
                            <p className="text-xs text-muted-foreground">{ETIQUETAS_NOTAS.clienteAyuda}</p>

                            {/* Debajo de las notas del cliente y no en un diálogo
                                nuevo: la cadena de finalizar ya tiene cuatro pasos y
                                un quinto es el que se aprieta sin leer. */}
                            <div className="pt-3 mt-3 border-t border-slate-100">
                                <AvisoDeVuelta
                                    visitas={visitasDelCliente}
                                    plazoDelTaller={plazoDelTaller}
                                    valor={avisarEl}
                                    onCambio={(dia, motivo) => { setAvisarEl(dia); setAvisarMotivo(motivo); }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notas internas: lo que el taller necesita recordar y el cliente
                        no tiene por qué leer. NUNCA salen en el comprobante (el candado
                        vive en lib/notasServicio.ts, con tests). */}
                    <div className="space-y-2">
                        <Label htmlFor="notas-internas" className="flex items-center gap-2">
                            <Lock className="h-3.5 w-3.5 text-slate-500" /> {ETIQUETAS_NOTAS.interna}
                        </Label>
                        <Textarea
                            id="notas-internas"
                            className="h-20 bg-slate-50"
                            placeholder={ETIQUETAS_NOTAS.internaPlaceholder}
                            value={notasInternas}
                            onChange={(e) => setNotasInternas(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">{ETIQUETAS_NOTAS.internaAyuda}</p>
                    </div>

                    {/* Quién hizo el trabajo. Solo si el taller prendió la preferencia. */}
                    {!isCompleted && registrarMecanico && (
                        <div className="pt-2">
                            <label className="text-sm font-semibold mb-1.5 block">Quién lo hizo</label>
                            <select
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                value={quienFirma}
                                onChange={(e) => setQuienFirma(e.target.value)}
                                aria-label="Quién firma este service"
                            >
                                <option value="">Sin registrar</option>
                                {gente.map((g) => (
                                    <option key={g.id} value={`u:${g.id}`}>{g.nombre}</option>
                                ))}
                                {nombresSueltos.map((n) => (
                                    <option key={n} value={`n:${n}`}>{n}</option>
                                ))}
                                <option value={OTRO_FIRMANTE}>Otro… (escribir el nombre)</option>
                            </select>
                            {quienFirma === OTRO_FIRMANTE && (
                                <>
                                    <input
                                        autoFocus
                                        value={otroNombre}
                                        onChange={(e) => setOtroNombre(e.target.value)}
                                        maxLength={40}
                                        placeholder="El nombre de quien lo hizo"
                                        className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                    />
                                    {/* Elegir "Otro…" y no escribir nada no puede terminar en un
                                        dato que desaparece sin avisar. */}
                                    {!otroNombre.trim() && (
                                        <p className="text-[11px] text-amber-700 mt-1">
                                            Escribí el nombre. Si lo dejás vacío, la orden queda sin registrar.
                                        </p>
                                    )}
                                </>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Viene puesto el que está usando la app. Cambialo si lo hizo otro: va
                                cualquier nombre, esté cargado o no.
                            </p>
                        </div>
                    )}

                    {/* Diagnóstico al finalizar: se muestra salvo que el taller haya
                        elegido registrarlo SOLO 'durante' el service (Tarea G-pref). */}
                    {!isCompleted && (taller?.config_notificaciones?.momento_diagnostico || 'final') !== 'durante' && (
                        <div data-tour="finalizar-diagnostico" className="pt-2">
                            {job.pieza && (
                                <p className="mb-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                    Trajo solo {piezaEnFrase(job.pieza)}: tildá solo lo que miraste. El resto de la bici no pasó por el taller.
                                </p>
                            )}
                            <HealthCheckWidget onChange={setHealthCheckData} />
                        </div>
                    )}

                    {/* El segundo par de ojos (idea 7): la IA mira el historial de
                        esta bici y avisa lo que se está escapando. Carga en paralelo
                        y si falla no aparece: NUNCA frena el botón de finalizar. */}
                    {!isCompleted && <SegundoParDeOjos servicioId={job.service_id} />}
                </div>

                <DialogFooter data-tour="finalizar-boton" className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    {/* La A4 que se corta al medio (Alejo, 11 a Fondo): arriba el comprobante
                        del cliente, abajo el checklist del taller. No reemplaza al comprobante
                        del service, que sale igual al entregar. Este era el ÚNICO lugar donde
                        estaba el botón —y este diálogo se abre para CERRAR la orden, no para
                        recibir la bici—: desde el 21-sep está también al confirmar el ingreso,
                        en la fila, adentro de la orden y en el historial. */}
                    <BotonTicketIngreso servicioId={job.service_id} />
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
                    onConfirm={() => { setPendientesConfirm(null); chequearPrecioYFinalizar(); }}
                    icon={<ListChecks className="h-7 w-7" />}
                    iconClassName="bg-primary/10 text-primary"
                    title={`Quedaron ${pendientesConfirm.length} trabajo(s) sin tildar`}
                    description={
                        <div className="text-left bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                            {pendientesConfirm.map((etiqueta, i) => (
                                <div key={i} className="flex items-start gap-2 py-0.5">
                                    <span className="text-slate-500 mt-0.5">•</span>
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

            {/* Candado del precio en $0: avisa antes de cerrar un comprobante vacío. */}
            {precioCeroConfirm && (
                <ConfirmDialog
                    open={precioCeroConfirm}
                    onClose={() => { setPrecioCeroConfirm(false); onClose(); }}
                    /* Sigue por la cadena, NO salta a doFinalize: si no, una orden
                       en $0 se saltearía el chequeo de los repuestos del ERP. */
                    onConfirm={() => { setPrecioCeroConfirm(false); chequearItemsYFinalizar(); }}
                    icon={<CircleDollarSign className="h-7 w-7" />}
                    iconClassName="bg-amber-100 text-amber-600"
                    title="Esta orden va a quedar en $0"
                    description={
                        <div className="text-left bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                            <p className="text-slate-700">
                                No tiene cargada ni mano de obra ni repuestos, así que el comprobante
                                del cliente va a salir en cero y no va a sumar a tus métricas.
                            </p>
                            <p className="text-slate-500 text-xs">
                                Si todavía no cargaste tus services con sus precios, se hace una sola vez
                                desde Configuración y después salen solos en cada orden.
                            </p>
                        </div>
                    }
                    confirmLabel="Cerrar en $0 igual"
                    confirmClassName="bg-green-600 hover:bg-green-700 text-white"
                    cancelLabel="Volver y cargar el precio"
                />
            )}

            {/* Candado de la orden de venta al ERP: avisa lo que la automatización
                no va a poder facturar. No bloquea (ver chequeoOrdenERP.ts). */}
            {avisosERP && (
                <ConfirmDialog
                    open={!!avisosERP}
                    onClose={() => { setAvisosERP(null); onClose(); }}
                    onConfirm={() => { setAvisosERP(null); doFinalize(); }}
                    icon={<PackageSearch className="h-7 w-7" />}
                    iconClassName="bg-amber-100 text-amber-600"
                    title={avisosERP.length === 1 ? "Revisá este repuesto antes de cerrar" : `Revisá ${avisosERP.length} repuestos antes de cerrar`}
                    description={
                        <div className="text-left space-y-3">
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3 max-h-56 overflow-y-auto">
                                {avisosERP.map((aviso, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <span className="text-amber-500 mt-0.5">•</span>
                                        {aviso.tipo === 'sin_nombre' ? (
                                            <div>
                                                <p className="text-slate-800 font-semibold">
                                                    {aviso.veces === 1
                                                        ? `Hay un renglón sin nombre, de $ ${aviso.precio.toLocaleString("es-AR")}.`
                                                        : `Hay ${aviso.veces} renglones sin nombre, de $ ${aviso.precio.toLocaleString("es-AR")} en total.`}
                                                </p>
                                                <p className="text-slate-600 text-xs mt-0.5">
                                                    Va a salir en blanco en el comprobante del cliente. Completalo desde la orden.
                                                </p>
                                            </div>
                                        ) : aviso.tipo === 'parece_repuesto' ? (
                                            <div>
                                                <p className="text-slate-800">
                                                    <span className="font-semibold">"{aviso.descripcion}"</span>
                                                    {aviso.veces > 1 ? ` (x${aviso.veces})` : ''} está cargado como mano de obra,
                                                    y lo venís cargando como repuesto ({aviso.vecesComoRepuesto} veces).
                                                </p>
                                                <p className="text-slate-600 text-xs mt-0.5">
                                                    Así no baja del stock ni entra en la orden de venta. Se cambia con el botón
                                                    del 📦 en la orden.
                                                </p>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-slate-800">
                                                    <span className="font-semibold">"{aviso.descripcion}"</span>
                                                    {aviso.veces > 1 ? ` (x${aviso.veces})` : ''} no está en el catálogo del ERP.
                                                </p>
                                                {aviso.sugerencia ? (
                                                    <p className="text-slate-600 text-xs mt-0.5">
                                                        ¿Puede ser <span className="font-semibold text-slate-700">"{aviso.sugerencia}"</span>? Cambialo desde la orden y buscalo con el buscador.
                                                    </p>
                                                ) : (
                                                    <p className="text-slate-600 text-xs mt-0.5">
                                                        Buscalo con el buscador de la orden y elegí el del catálogo.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <p className="text-slate-500 text-xs">
                                Si lo dejás así, la orden de venta puede no generarse en el ERP y nadie te va a avisar.
                            </p>
                        </div>
                    }
                    confirmLabel="Finalizar igual"
                    confirmClassName="bg-green-600 hover:bg-green-700 text-white"
                    cancelLabel="Volver y corregir"
                />
            )}
        </Dialog>
    )
}
