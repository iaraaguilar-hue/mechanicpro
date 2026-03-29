import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, PieChart as PieIcon, Users } from 'lucide-react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ─── Color palette ───────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
    'Sistemas de Frenado': '#ef4444',
    'Transmisión': '#8b5cf6',
    'Neumáticos y Ruedas': '#3b82f6',
    'Suspensión': '#f59e0b',
    'Cockpit y Componentes': '#10b981',
    'Mantenimiento General': '#14b8a6',
    'Otros': '#94a3b8',
};
const CHART_COLORS = ['#f25a30', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6'];

// ─── Types ───────────────────────────────────────────────────────────────────
interface TrendItem {
    categoria: string;
    conteo: number;
}

interface MechanicStat {
    mecanico: string;
    tickets: number;
    ticket_promedio: number;
}

interface Props {
    tallerId: string;
    dateStart?: string;
    dateEnd?: string;
    /** Pass the already-computed top KPI stats so ExpertMetrics can render the full Pro view + extras */
    stats: any;
    /** All services (already filtered by date range) */
    servicios: any[];
    isLoading: boolean;
}

// ─── Custom Tooltip for PieChart ─────────────────────────────────────────────
const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const d = payload[0];
        return (
            <div className="bg-white border border-slate-200 shadow-lg rounded-xl px-4 py-2 text-sm">
                <p className="font-bold text-slate-800">{d.name}</p>
                <p className="text-slate-600">{d.value} ítems registrados</p>
            </div>
        );
    }
    return null;
};

// ─── Custom Tooltip for BarChart ─────────────────────────────────────────────
const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-slate-200 shadow-lg rounded-xl px-4 py-2 text-sm space-y-1">
                <p className="font-bold text-slate-800 truncate max-w-[160px]">{label}</p>
                {payload.map((p: any) => (
                    <p key={p.dataKey} style={{ color: p.color }} className="font-medium">
                        {p.name}: {p.dataKey === 'ticket_promedio' ? `$${p.value.toLocaleString('es-AR')}` : p.value}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function ExpertMetrics({ tallerId, servicios, isLoading }: Props) {
    const [trends, setTrends] = useState<TrendItem[]>([]);
    const [teamStats, setTeamStats] = useState<MechanicStat[]>([]);
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

    // ── Compute mechanic performance from servicios ───────────────────────────
    useEffect(() => {
        if (!servicios.length) { setTeamStats([]); return; }

        const mechanicMap: Record<string, { total: number; count: number }> = {};

        servicios.forEach((s: any) => {
            const mecName: string =
                s.notas_mecanico?.split('\n')[0]?.trim() ||
                s.mecanico ||
                'Sin asignar';

            const revenue = Number(s.precio_total) || Number(s.precio_base) || 0;
            if (!mechanicMap[mecName]) mechanicMap[mecName] = { total: 0, count: 0 };
            mechanicMap[mecName].total += revenue;
            mechanicMap[mecName].count += 1;
        });

        const computed: MechanicStat[] = Object.entries(mechanicMap)
            .map(([mecanico, { total, count }]) => ({
                mecanico: mecanico.length > 18 ? mecanico.slice(0, 16) + '…' : mecanico,
                tickets: count,
                ticket_promedio: count > 0 ? Math.round(total / count) : 0,
            }))
            .sort((a, b) => b.tickets - a.tickets)
            .slice(0, 8);

        setTeamStats(computed);
    }, [servicios]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* ── Expert Badge ───────────────────────────────────────────── */}
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold tracking-wider uppercase shadow-md">
                    ✦ Expert Plan — Business Intelligence
                </span>
            </div>

            {/* ── Trends Pie + Team Bar ───────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Tendencias de Taller (Pie) */}
                <Card className="shadow-sm border-gray-100 overflow-hidden">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="p-2 bg-violet-50 rounded-lg">
                                <PieIcon className="w-5 h-5 text-violet-600" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900 leading-tight">Tendencias del Taller</h3>
                                <p className="text-xs text-muted-foreground">Motor semántico Regex — histórico completo</p>
                            </div>
                        </div>

                        {loadingTrends || isLoading ? (
                            <div className="h-64 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                                    <span className="text-xs">Analizando patrones...</span>
                                </div>
                            </div>
                        ) : trends.length === 0 ? (
                            <div className="h-64 flex items-center justify-center text-muted-foreground italic text-sm">
                                No hay suficientes datos para generar tendencias.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={trends}
                                        cx="50%"
                                        cy="45%"
                                        outerRadius={95}
                                        innerRadius={42}
                                        dataKey="conteo"
                                        nameKey="categoria"
                                        paddingAngle={2}
                                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                                            if (percent == null || midAngle == null || percent < 0.05) return null;
                                            const RADIAN = Math.PI / 180;
                                            const r = innerRadius + (outerRadius - innerRadius) * 0.55;
                                            const x = cx + r * Math.cos(-midAngle * RADIAN);
                                            const y = cy + r * Math.sin(-midAngle * RADIAN);
                                            return (
                                                <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
                                                    {`${(percent * 100).toFixed(0)}%`}
                                                </text>
                                            );
                                        }}
                                    >
                                        {trends.map((entry, idx) => (
                                            <Cell
                                                key={entry.categoria}
                                                fill={CATEGORY_COLORS[entry.categoria] || CHART_COLORS[idx % CHART_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomPieTooltip />} />
                                    <Legend
                                        formatter={(value) => (
                                            <span className="text-xs text-slate-600 font-medium">{value}</span>
                                        )}
                                        iconSize={10}
                                        iconType="circle"
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Rendimiento de Equipo (Bar) */}
                <Card className="shadow-sm border-gray-100 overflow-hidden">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="p-2 bg-indigo-50 rounded-lg">
                                <Users className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900 leading-tight">Rendimiento de Equipo</h3>
                                <p className="text-xs text-muted-foreground">Tickets atendidos vs. Ticket promedio ($)</p>
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="h-64 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                            </div>
                        ) : teamStats.length === 0 ? (
                            <div className="h-64 flex items-center justify-center text-muted-foreground italic text-sm">
                                No hay datos de mecánicos en el período seleccionado.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={teamStats} margin={{ top: 4, right: 8, left: 0, bottom: 32 }}
                                    barCategoryGap="30%"
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis
                                        dataKey="mecanico"
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        angle={-25}
                                        textAnchor="end"
                                        interval={0}
                                    />
                                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} width={28} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} width={48}
                                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                                    />
                                    <Tooltip content={<CustomBarTooltip />} />
                                    <Legend
                                        verticalAlign="top"
                                        formatter={(v) => <span className="text-xs text-slate-600 font-medium">{v}</span>}
                                        iconSize={10}
                                        wrapperStyle={{ paddingBottom: 8 }}
                                    />
                                    <Bar yAxisId="left" dataKey="tickets" name="Tickets" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Bar yAxisId="right" dataKey="ticket_promedio" name="Ticket Promedio $" fill="#f25a30" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
