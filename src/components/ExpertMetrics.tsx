import { useEffect, useState } from 'react';
import { getSemanticCategory } from '@/pages/Metrics';
import { Loader2, PieChart as PieIcon, TrendingUp } from 'lucide-react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ─── Color palette ───────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
    'Sistemas de Frenado': '#ef4444', // red-500
    'Transmisión': '#8b5cf6', // violet-500
    'Neumáticos y Ruedas': '#3b82f6', // blue-500
    'Suspensión': '#f59e0b', // amber-500
    'Cockpit y Componentes': '#10b981', // emerald-500
    'Mantenimiento General': '#14b8a6', // teal-500
    'Otros': '#94a3b8', // slate-400
};
const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#94a3b8'];

// ─── Types ───────────────────────────────────────────────────────────────────
interface TrendItem {
    categoria: string;
    conteo: number; // For Rentabilidad this actually means ARS revenue amount
}

interface TimelineStat {
    fecha: string;
    labor: number;
    parts: number;
}

interface Props {
    tallerId: string;
    dateStart?: string;
    dateEnd?: string;
    stats: any;
    servicios: any[];
    isLoading: boolean;
}

// ─── Custom Tooltip for PieChart ─────────────────────────────────────────────
const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const d = payload[0];
        // Calculate percentage from payload's internal percent value
        const pct = d.payload?.percent != null
            ? `(${(d.payload.percent * 100).toFixed(1)}%)`
            : '';

        return (
            <div className="bg-white border border-gray-100 shadow-sm rounded-xl px-4 py-2 text-sm">
                <p className="font-bold text-gray-900">{d.name}</p>
                <p className="text-emerald-600 font-medium">Facturación: ${d.value.toLocaleString('es-AR')} {pct}</p>
            </div>
        );
    }
    return null;
};

// ─── Custom Tooltip for AreaChart ─────────────────────────────────────────────
const CustomAreaTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const parts = payload.find((p: any) => p.dataKey === 'parts')?.value || 0;
        const labor = payload.find((p: any) => p.dataKey === 'labor')?.value || 0;
        const total = parts + labor;
        return (
            <div className="bg-white border border-gray-100 shadow-sm rounded-xl px-4 py-3 text-sm min-w-[160px]">
                <p className="font-bold text-gray-900 mb-2 border-b border-gray-100 pb-1">{label}</p>
                <div className="space-y-1">
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-gray-500 font-medium text-xs flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#f59e0b]"></div>Repuestos:</span>
                        <span className="font-bold text-gray-900">${parts.toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-gray-500 font-medium text-xs flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#10b981]"></div>Mano de Obra:</span>
                        <span className="font-bold text-gray-900">${labor.toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4 pt-1 mt-1 border-t border-gray-50">
                        <span className="text-gray-800 font-bold text-xs uppercase tracking-wider">Total Día:</span>
                        <span className="font-black text-primary">${total.toLocaleString('es-AR')}</span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function ExpertMetrics({ servicios, isLoading }: Props) {
    const [trends, setTrends] = useState<TrendItem[]>([]);
    const [revenueTimeline, setRevenueTimeline] = useState<TimelineStat[]>([]);
    const [loadingTrends, setLoadingTrends] = useState(true);

    // ── Compute both charts strictly from passed servicios ────────────────────────
    useEffect(() => {
        if (!servicios.length) {
            setRevenueTimeline([]);
            setTrends([]);
            setLoadingTrends(false);
            return;
        }

        const timelineMap: Record<string, { labor: number; parts: number }> = {};
        const systemRevenueMap: Record<string, number> = {
            'Transmisión': 0, 'Frenos': 0, 'Neumáticos y Ruedas': 0,
            'Suspensión': 0, 'Cockpit y Componentes': 0, 'Mantenimiento General': 0, 'Otros': 0
        };

        servicios.forEach((s: any) => {
            const dateStr = s.fecha_entrega || s.created_at || new Date().toISOString();
            const dateKey = dateStr.split('T')[0]; // YYYY-MM-DD

            if (!timelineMap[dateKey]) timelineMap[dateKey] = { labor: 0, parts: 0 };

            let serviceLabor = Number(s.precio_base) || 0;
            let serviceParts = 0;

            const items = Array.isArray(s.servicio_items) ? s.servicio_items : (Array.isArray(s.items_extra) ? s.items_extra : []);

            items.forEach((item: any) => {
                const itemPrecio = Number(item.precio) || 0;
                if (item.categoria === 'part' || item.categoria === 'producto' || item.categoria === 'repuesto') {
                    serviceParts += itemPrecio;
                    const cat = getSemanticCategory(item.descripcion || '');
                    if (systemRevenueMap[cat] !== undefined) {
                        systemRevenueMap[cat] += itemPrecio;
                    } else {
                        systemRevenueMap['Otros'] += itemPrecio;
                    }
                } else {
                    serviceLabor += itemPrecio;
                }
            });

            // Allocate labor to a category (heuristic using service type)
            if (serviceLabor > 0) {
                const catLabel = getSemanticCategory(s.tipo_servicio || 'Mantenimiento General');
                if (systemRevenueMap[catLabel] !== undefined) {
                    systemRevenueMap[catLabel] += serviceLabor;
                } else {
                    systemRevenueMap['Mantenimiento General'] += serviceLabor;
                }
            }

            timelineMap[dateKey].labor += serviceLabor;
            timelineMap[dateKey].parts += serviceParts;
        });

        // Compute Revenue Timeline
        const computedTimeline: TimelineStat[] = Object.entries(timelineMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([dateKey, vals]) => {
                const partsStr = dateKey.split('-');
                const shortDate = `${partsStr[2]}/${partsStr[1]}`;
                return {
                    fecha: shortDate,
                    labor: vals.labor,
                    parts: vals.parts
                };
            });

        setRevenueTimeline(computedTimeline);

        // Compute semantic profitability (calculate total first for percentages handled by Recharts natively, or we can just send amounts)
        const computedTrends: TrendItem[] = Object.entries(systemRevenueMap)
            .filter(([, sum]) => sum > 0)
            .map(([categoria, sum]) => ({ categoria, conteo: sum }))
            .sort((a, b) => b.conteo - a.conteo);

        setTrends(computedTrends);
        setLoadingTrends(false);
    }, [servicios]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* ── Expert Badge ───────────────────────────────────────────── */}
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold tracking-wider uppercase shadow-sm">
                    ✦ Expert Plan — Business Intelligence
                </span>
            </div>

            {/* ── Trends Donut + Revenue Area ───────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Rentabilidad por Sistema (Pie/Donut of volume) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <PieIcon className="w-6 h-6 text-primary" />
                            <h3 className="text-lg font-bold text-gray-900">Rentabilidad por Sistema</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Volumen en ARS</span>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        {loadingTrends || isLoading ? (
                            <div className="h-[300px] flex items-center justify-center">
                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                    <span className="text-xs">Analizando patrones...</span>
                                </div>
                            </div>
                        ) : trends.length === 0 ? (
                            <div className="h-[300px] flex items-center justify-center text-muted-foreground italic text-sm">
                                No hay suficientes datos para generar tendencias.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={trends}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={65}
                                        outerRadius={95}
                                        dataKey="conteo"
                                        nameKey="categoria"
                                        paddingAngle={3}
                                    >
                                        {trends.map((entry, idx) => (
                                            <Cell
                                                key={`cell-${idx}`}
                                                fill={CATEGORY_COLORS[entry.categoria] || CHART_COLORS[idx % CHART_COLORS.length]}
                                                stroke="none"
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomPieTooltip />} />
                                    <Legend
                                        verticalAlign="bottom"
                                        formatter={(value) => <span className="text-xs text-gray-600 font-medium">{value}</span>}
                                        iconSize={8}
                                        iconType="circle"
                                        wrapperStyle={{ paddingTop: 20 }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Composición de Ingresos (Stacked Area) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-6 h-6 text-primary" />
                            <h3 className="text-lg font-bold text-gray-900">Composición de Ingresos</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">MO vs Repuestos</span>
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        {isLoading ? (
                            <div className="h-[300px] flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            </div>
                        ) : revenueTimeline.length === 0 ? (
                            <div className="h-[300px] flex items-center justify-center text-muted-foreground italic text-sm">
                                No hay datos de facturación en el período seleccionado.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={revenueTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorLabor" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorParts" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="fecha"
                                        tick={{ fontSize: 12, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                        dy={10}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 12, fill: '#64748b' }}
                                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                                        axisLine={false}
                                        tickLine={false}
                                        dx={-10}
                                    />
                                    <Tooltip content={<CustomAreaTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="parts"
                                        stackId="1"
                                        stroke="#f59e0b"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorParts)"
                                        name="Repuestos"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="labor"
                                        stackId="1"
                                        stroke="#10b981"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorLabor)"
                                        name="Mano de Obra"
                                    />
                                    <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: 10 }} iconType="circle" iconSize={8} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
