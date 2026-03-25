import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import {
    BarChart3,
    TrendingUp,
    Package,
    Wrench,
    Calendar,
    DollarSign,
    PieChart,
    ArrowUpRight,
    ArrowDownRight,
    Brain,
    Ticket,
    Tag
} from 'lucide-react';

export default function Metrics() {
    const tallerId = useAuthStore(s => s.taller_id);

    const [dateStart, setDateStart] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [dateEnd, setDateEnd] = useState<string>(new Date().toISOString().split('T')[0]);

    const [servicios, setServicios] = useState<any[]>([]);
    const [bicicletas, setBicicletas] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchMetricsData = async () => {
            if (!tallerId) return;
            setIsLoading(true);
            try {
                // 1. Fetch bicicletas for this tenant
                const { data: bData } = await supabase
                    .from('bicicletas')
                    .select('*')
                    .eq('taller_id', tallerId);

                if (bData) setBicicletas(bData);

                // 2. Fetch completed/charged services matching date range, excluding soft deletes
                const startStr = `${dateStart}T00:00:00.000Z`;
                const endStr = `${dateEnd}T23:59:59.999Z`;

                const { data: sData, error: sError } = await supabase
                    .from('servicios')
                    .select('*')
                    .eq('taller_id', tallerId)
                    .is('eliminado_en', null)
                    .in('estado', ['Completed', 'completed', 'finalizado', 'entregado'])
                    .gte('fecha_entrega', startStr)
                    .lte('fecha_entrega', endStr);

                if (sError) {
                    console.error("Error fetching services:", sError);
                } else {
                    setServicios(sData || []);
                }
            } catch (err) {
                console.error("Data fetch error in Metrics:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetricsData();
    }, [tallerId, dateStart, dateEnd]);

    // --- FILTER & ANALYTICS ENGINE ---
    const stats = useMemo(() => {
        // Services are already filtered by Date, Status, Tenant, and Trash from backend
        const filtered = servicios;

        // 1. Financial KPIs
        let totalRevenue = 0;
        let totalLabor = 0;
        let totalPartsRevenue = 0;
        let totalPartsCount = 0;
        const uniqueBikes = new Set();

        // 2. Stock Analysis (Micro)
        const productCounts: Record<string, number> = {};

        // 3. Workshop Trends (Macro)
        const trendCategories: Record<string, number> = {
            'Cadenas': 0,
            'Frenos': 0,
            'Ruedas': 0,
            'Transmisión': 0,
            'Servicios': 0,
            'Otros': 0
        };

        // 4. Service Distribution (Types)
        const serviceTypeCounts: Record<string, number> = {};

        // 5. Brand Market Share
        const brandCounts: Record<string, number> = {};

        filtered.forEach(s => {
            totalRevenue += s.precio_total || 0;
            uniqueBikes.add(s.bicicleta_id);

            // Analyze Service Types
            const rawType = (s.tipo_servicio || 'General').trim();
            const normalizedType = rawType.length > 1
                ? rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase()
                : rawType.toUpperCase();
            serviceTypeCounts[normalizedType] = (serviceTypeCounts[normalizedType] || 0) + 1;

            // Analyze Brands (Dynamic from modelo)
            const bike = bicicletas.find(b => b.id === s.bicicleta_id);
            let brandName = "Desconocida";
            if (bike && bike.modelo && bike.modelo.trim()) {
                brandName = bike.modelo.trim().split(/\s+/)[0];
            }
            brandName = brandName.trim();
            if (brandName.length > 0) {
                brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1).toLowerCase();
            } else {
                brandName = "Desconocida";
            }
            brandCounts[brandName] = (brandCounts[brandName] || 0) + 1;

            // Analyze Items
            const items = s.items_extra || [];
            totalLabor += s.precio_base || 0;

            items.forEach((item: any) => {
                if (item.categoria === 'part') {
                    totalPartsRevenue += item.precio || 0;
                    totalPartsCount++;
                    const name = (item.descripcion || '').trim();
                    if (name) productCounts[name] = (productCounts[name] || 0) + 1;

                    const lower = (item.descripcion || '').toLowerCase();
                    if (lower.includes('cadena')) trendCategories['Cadenas']++;
                    else if (lower.includes('pastilla') || lower.includes('freno') || lower.includes('disco') || lower.includes('cable') || lower.includes('ducto')) trendCategories['Frenos']++;
                    else if (lower.includes('cubierta') || lower.includes('tubeless') || lower.includes('camara') || lower.includes('cámara') || lower.includes('parche')) trendCategories['Ruedas']++;
                    else if (lower.includes('piñon') || lower.includes('piñón') || lower.includes('cassette') || lower.includes('plato') || lower.includes('cambio') || lower.includes('shifter')) trendCategories['Transmisión']++;
                    else trendCategories['Otros']++;
                } else {
                    totalLabor += item.precio || 0;
                }
            });
        });

        // Process Top 5 Products
        const sortedProducts = Object.entries(productCounts)
            .sort(([, a], [, b]) => b - a).slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        // Process Trends
        const totalTrendCount = Object.values(trendCategories).reduce((a, b) => a + b, 0);
        const trendData = Object.entries(trendCategories)
            .filter(([, count]) => count > 0)
            .map(([category, count]) => ({
                category, count,
                percentage: totalTrendCount > 0 ? Math.round((count / totalTrendCount) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count);

        // Process Service Distribution
        const totalServices = filtered.length;
        const serviceDistData = Object.entries(serviceTypeCounts)
            .map(([type, count]) => ({
                type, count,
                percentage: totalServices > 0 ? Math.round((count / totalServices) * 100) : 0
            }))
            .sort((a, b) => b.count - a.count);

        // Process Brand Distribution
        const brandEntries = Object.entries(brandCounts).sort(([, a], [, b]) => b - a);
        let finalBrandData = [];
        if (brandEntries.length > 4) {
            const top4 = brandEntries.slice(0, 4);
            const othersCount = brandEntries.slice(4).reduce((sum, [, count]) => sum + count, 0);
            finalBrandData = top4.map(([brand, count]) => ({
                brand, count,
                percentage: totalServices > 0 ? Math.round((count / totalServices) * 100) : 0
            }));
            if (othersCount > 0) {
                finalBrandData.push({
                    brand: 'Otras', count: othersCount,
                    percentage: totalServices > 0 ? Math.round((othersCount / totalServices) * 100) : 0
                });
            }
        } else {
            finalBrandData = brandEntries.map(([brand, count]) => ({
                brand, count,
                percentage: totalServices > 0 ? Math.round((count / totalServices) * 100) : 0
            }));
        }

        const avgTicket = totalServices > 0 ? Math.round(totalRevenue / totalServices) : 0;
        const laborPerc = totalRevenue > 0 ? Math.round((totalLabor / totalRevenue) * 100) : 0;
        const partsPerc = totalRevenue > 0 ? Math.round((totalPartsRevenue / totalRevenue) * 100) : 0;

        return {
            count: filtered.length,
            revenue: totalRevenue,
            labor: totalLabor,
            parts: totalPartsRevenue,
            partsCount: totalPartsCount,
            bikesCount: uniqueBikes.size,
            topProducts: sortedProducts,
            trends: trendData,
            serviceDist: serviceDistData,
            brandDist: finalBrandData,
            avgTicket,
            laborPerc,
            partsPerc
        };
    }, [servicios, bicicletas]);

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">Cargando métricas...</div>;
    }

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
            {/* HEADER & CONTROLS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <BarChart3 className="h-8 w-8 text-primary" />
                        Métricas y Estadísticas
                    </h1>
                    <p className="text-muted-foreground">Análisis financiero y operativo del taller.</p>
                </div>

                <Card className="p-1 px-4 flex items-center gap-4 bg-muted/50 border-none">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-muted-foreground">Período:</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="bg-white h-8 w-fit text-xs" />
                        <span className="text-muted-foreground">-</span>
                        <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="bg-white h-8 w-fit text-xs" />
                    </div>
                </Card>
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <KPICard title="Facturación Total" value={`$ ${stats.revenue.toLocaleString('es-AR')}`} icon={<DollarSign className="w-5 h-5 text-green-600" />} trend="+12%" trendUp={true} className="bg-green-50 border-green-100" />
                <KPICard title="Mano de Obra" value={`$ ${stats.labor.toLocaleString('es-AR')}`} icon={<Wrench className="w-5 h-5 text-primary" />} sublabel={`${stats.count} Servicios realizados`} />
                <KPICard title="Venta Repuestos" value={`$ ${stats.parts.toLocaleString('es-AR')}`} icon={<Package className="w-5 h-5 text-secondary" />} sublabel={`${stats.partsCount} Productos vendidos`} />
                <KPICard title="Ticket Promedio" value={`$ ${stats.avgTicket.toLocaleString('es-AR')}`} icon={<Ticket className="w-5 h-5 text-primary" />} sublabel="Por visita de cliente" />
                <KPICard title="Bicis Atendidas" value={stats.bikesCount.toString()} icon={<TrendingUp className="w-5 h-5 text-purple-600" />} sublabel="En el período seleccionado" />

                {/* MIX DE FACTURACIÓN CARD */}
                <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-2">
                            <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">
                                <PieChart className="w-5 h-5 text-indigo-600" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">Mix Facturación</h3>
                            <div className="pt-1">
                                <div className="flex justify-between text-xs font-bold mb-1">
                                    <span className="text-primary">{stats.laborPerc}% MO</span>
                                    <span className="text-secondary">{stats.partsPerc}% REP</span>
                                </div>
                                <div className="h-3 w-full bg-secondary/20 rounded-full overflow-hidden flex">
                                    <div className="bg-primary h-full transition-all duration-1000" style={{ width: `${stats.laborPerc}%` }} />
                                    <div className="bg-secondary h-full transition-all duration-1000" style={{ width: `${stats.partsPerc}%` }} />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* MAIN ANALYSIS GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                {/* 1. STOCK RANKING */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <Package className="w-6 h-6 text-primary" />
                            <h3 className="text-lg font-bold text-gray-900">Ranking de Stock</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Top 5 Vendidos</span>
                    </div>
                    <div className="flex-1">
                        {stats.topProducts.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos de ventas en este período.</div>
                        ) : (
                            <div className="space-y-4">
                                {stats.topProducts.map((prod, idx) => (
                                    <div key={idx} className="flex items-center gap-4 group">
                                        <div className="flex-none font-bold text-2xl text-slate-200 w-8 text-center group-hover:text-primary transition-colors">#{idx + 1}</div>
                                        <div className="flex-1">
                                            <div className="font-semibold text-slate-800">{prod.name}</div>
                                            <div className="text-xs text-muted-foreground">Repuesto específico</div>
                                        </div>
                                        <div className="flex-none bg-primary/10 text-primary font-bold px-3 py-1 rounded-lg">{prod.count} u.</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. REPAIR TRENDS */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <PieChart className="w-6 h-6 text-primary" />
                            <h3 className="text-lg font-bold text-gray-900">Tendencias de Taller</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Categorías</span>
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                        {stats.trends.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos de servicios en este período.</div>
                        ) : (
                            <div className="space-y-6 pt-2">
                                {stats.trends.map((cat, idx) => (
                                    <div key={idx} className="space-y-1">
                                        <div className="flex justify-between items-center mb-1 text-sm font-medium">
                                            <span className="flex items-center gap-2">
                                                {getCategoryIcon(cat.category)}
                                                <span className="text-slate-700">{cat.category}</span>
                                            </span>
                                            <span className="text-slate-600 font-bold">{cat.percentage}% <span className="text-xs text-muted-foreground font-normal">({cat.count})</span></span>
                                        </div>
                                        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-1000 ${getCategoryColor(cat.category)}`} style={{ width: `${cat.percentage}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="mt-6 pt-4 border-t text-xs text-muted-foreground text-center">
                            * Agrupación automática basada en descripción de items.
                        </div>
                    </div>
                </div>

                {/* 3. SERVICE DISTRIBUTION */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <Brain className="w-6 h-6 text-primary" />
                            <h3 className="text-lg font-bold text-gray-900">Distribución de Services</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Tipos</span>
                    </div>
                    <div className="flex-1">
                        {stats.serviceDist.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos de servicios en este período.</div>
                        ) : (
                            <div className="space-y-6 pt-2">
                                {stats.serviceDist.map((item, idx) => (
                                    <div key={idx} className="space-y-1">
                                        <div className="flex justify-between items-center mb-1 text-sm font-medium">
                                            <span className="flex items-center gap-2">
                                                {item.type === 'Sport' ? '🚴' : item.type === 'Expert' ? '🚵' : '🔧'}
                                                <span className="text-slate-700">{item.type}</span>
                                            </span>
                                            <span className="text-slate-600 font-bold">{item.percentage}% <span className="text-xs text-muted-foreground font-normal">({item.count})</span></span>
                                        </div>
                                        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-1000 ${item.type === 'Sport' ? 'bg-emerald-500' : item.type === 'Expert' ? 'bg-indigo-500' : 'bg-slate-400'}`} style={{ width: `${item.percentage}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 4. BRAND DISTRIBUTION */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <Tag className="w-6 h-6 text-primary" />
                            <h3 className="text-lg font-bold text-gray-900">Flota por Marcas</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Distribución</span>
                    </div>
                    <div className="flex-1">
                        {stats.brandDist.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos de marcas en este período.</div>
                        ) : (
                            <div className="space-y-6 pt-2">
                                {stats.brandDist.map((item, idx) => (
                                    <div key={idx} className="space-y-1">
                                        <div className="flex justify-between items-center mb-1 text-sm font-medium">
                                            <span className="flex items-center gap-2">
                                                <span className="text-slate-700">{item.brand}</span>
                                            </span>
                                            <span className="text-slate-600 font-bold">{item.percentage}% <span className="text-xs text-muted-foreground font-normal">({item.count})</span></span>
                                        </div>
                                        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-1000 ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-primary/80' : idx === 2 ? 'bg-primary/60' : idx === 3 ? 'bg-slate-400' : 'bg-slate-300'}`} style={{ width: `${item.percentage}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- HELPER COMPONENTS ---
function KPICard({ title, value, icon, sublabel, trend, trendUp, className }: any) {
    return (
        <Card className={`${className} hover:shadow-md transition-shadow`}>
            <CardContent className="p-6">
                <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">{icon}</div>
                    {trend && (
                        <div className={`flex items-center text-xs font-bold ${trendUp ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'} px-2 py-1 rounded-full`}>
                            {trendUp ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                            {trend}
                        </div>
                    )}
                </div>
                <div className="space-y-1">
                    <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
                    <div className="text-2xl font-bold text-slate-900">{value}</div>
                    {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
                </div>
            </CardContent>
        </Card>
    )
}

function getCategoryColor(cat: string) {
    switch (cat) {
        case 'Cadenas': return 'bg-secondary';
        case 'Frenos': return 'bg-red-500';
        case 'Ruedas': return 'bg-blue-500';
        case 'Transmisión': return 'bg-purple-500';
        default: return 'bg-slate-400';
    }
}

function getCategoryIcon(cat: string) {
    switch (cat) {
        case 'Cadenas': return '⛓️';
        case 'Frenos': return '🛑';
        case 'Ruedas': return '🔘';
        case 'Transmisión': return '⚙️';
        default: return '📦';
    }
}
