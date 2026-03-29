import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
    conteo: number;
}

interface TimelineStat {
    fecha: string;
    ingresos: number;
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
        return (
            <div className="bg-white border border-gray-100 shadow-sm rounded-xl px-4 py-2 text-sm">
                <p className="font-bold text-gray-900">{d.name}</p>
                <p className="text-gray-600">{d.value} ítems registrados</p>
            </div>
        );
    }
    return null;
};

// ─── Custom Tooltip for AreaChart ─────────────────────────────────────────────
const CustomAreaTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-gray-100 shadow-sm rounded-xl px-4 py-3 text-sm">
                <p className="font-bold text-gray-900 mb-1">{label}</p>
                <p className="font-medium text-emerald-600">
                    Facturación: ${payload[0].value.toLocaleString('es-AR')}
                </p>
            </div>
        );
    }
    return null;
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function ExpertMetrics({ tallerId, servicios, isLoading }: Props) {
    const [trends, setTrends] = useState<TrendItem[]>([]);
    const [revenueTimeline, setRevenueTimeline] = useState<TimelineStat[]>([]);
    const [loadingTrends, setLoadingTrends] = useState(true);

    // ── Load trend data from RPC ──────────────────────────────────────────────
    useEffect(() => {
        if (!tallerId) return;

        const fetchTrends = async () => {
            setLoadingTrends(true);
            try {
                const { data, error } = await supabase.rpc('analizar_tendencias_regex', {
                    p_taller_id: tallerId,
                });
                if (error) throw error;
                setTrends((data as TrendItem[]) || []);
            } catch (err) {
                console.error('[ExpertMetrics] RPC trend error:', err);
            } finally {
                setLoadingTrends(false);
            }
        };

        fetchTrends();
    }, [tallerId]);

    // ── Compute revenue timeline from servicios ───────────────────────────
    useEffect(() => {
        if (!servicios.length) { setRevenueTimeline([]); return; }

        const timelineMap: Record<string, number> = {};

        servicios.forEach((s: any) => {
            const dateStr = s.fecha_entrega || s.created_at || new Date().toISOString();
            const dateKey = dateStr.split('T')[0]; // YYYY-MM-DD

            const revenue = Number(s.precio_total) || Number(s.precio_base) || 0;
            timelineMap[dateKey] = (timelineMap[dateKey] || 0) + revenue;
        });

        const computed: TimelineStat[] = Object.entries(timelineMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([dateKey, ingresos]) => {
                const parts = dateKey.split('-');
                const shortDate = `${parts[2]}/${parts[1]}`;
                return {
                    fecha: shortDate,
                    ingresos
                };
            });

        setRevenueTimeline(computed);
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

                {/* Análisis Categórico Semántico (Donut) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <PieIcon className="w-6 h-6 text-primary" />
                            <h3 className="text-lg font-bold text-gray-900">Análisis Categórico Semántico</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Motor Regex</span>
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

                {/* Evolución de Ingresos (Area) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-6 h-6 text-primary" />
                            <h3 className="text-lg font-bold text-gray-900">Evolución de Ingresos</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Facturación Total</span>
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
                                        <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
                                        dataKey="ingresos"
                                        stroke="#10b981"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorIngresos)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
