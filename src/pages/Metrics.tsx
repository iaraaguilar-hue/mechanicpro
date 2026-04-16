import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import ExpertMetrics from '@/components/ExpertMetrics';
import { normalizeBikeData, normalizeServiceType } from '@/lib/bikeDataNormalizer';
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
    Tag,
    Loader2,
    Lock,
    Layers,
    Bike
} from 'lucide-react';

// --- SEMANTIC ENGINE HELPERS ---
export function parseItemQuantityAndName(rawDesc: string) {
    let name = rawDesc.trim();
    let qty = 1;

    if (!name) return { name: "Desconocido", qty: 1 };

    const lower = name.toLowerCase();

    // Golden Tubeless Rule
    if (lower.includes('tubeless') || lower.includes('tubelizado') || lower.includes('liquido') || lower.includes('líquido')) {
        const match = lower.match(/(?:x\s*|por\s*)(\d+)\s*$/i);
        if (match) {
            qty = parseInt(match[1], 10);
        } else if (lower.includes('x2') || lower.includes('x 2') || lower.includes('ambas') || lower.includes('dos')) {
            qty = 2;
        }
        return { name: "Recargas Tubeless", qty };
    }

    // Generic Multiplier Regex (e.g., "x2", "x 3", "x12")
    const match = name.match(/\s*x\s*(\d+)$/i);
    if (match) {
        qty = parseInt(match[1], 10);
        name = name.replace(/\s*x\s*(\d+)$/i, '').trim();
    }

    // Apply Semantic Normalization
    name = normalizeItemName(name);

    return { name, qty };
}

export function normalizeItemName(rawName: string): string {
    let lower = rawName.toLowerCase().trim();

    // 1. Hardcoded Rules (Master Names)
    if (lower.includes('b05s') && (lower.includes('pastilla') || lower.includes('freno'))) {
        return 'Pastillas Shimano B05S';
    }
    if (lower.includes('hg601')) return 'Cadena Shimano 11v (HG601)';
    if (lower.includes('hg40')) return 'Cadena Shimano 8v (HG40)';
    if (lower.includes('nx') && lower.includes('cadena')) return 'Cadena SRAM NX';

    // 2. Remove Noise Words
    const noiseWords = ['de resina', 'mtb', 'ruta', 'compatible con'];
    noiseWords.forEach(word => {
        lower = lower.replace(new RegExp(word, 'gi'), '');
    });

    // Clean multi-spaces left by replacements
    lower = lower.replace(/\s+/g, ' ').trim();

    // 3. Capitalize Each Word (Title Case)
    if (lower.length === 0) return "Desconocido";

    return lower.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function getSemanticCategory(rawDesc: string): string {
    const lower = rawDesc.toLowerCase();

    const dic = {
        'Transmisión': ['piñon', 'piñón', 'cadena', 'plato', 'palanca', 'caja pedalera', 'cambio', 'fusible', 'descarrilador', 'polea', 'hg', 'sram', 'shimano', 'cassette', 'shifter'],
        'Frenos': ['pastilla', 'patin', 'disco', 'freno', 'purgado', 'ducto', 'liquido de freno', 'avid', 'cable'],
        'Neumáticos y Ruedas': ['tubeless', 'tubelizado', 'camara', 'cámara', 'cubierta', 'aro', 'maza', 'centrado', 'rayo', 'roval', 'parche'],
        'Suspensión': ['horquilla', 'shock', 'brain', 'rockshox', 'reten', 'retén'],
        'Cockpit y Componentes': ['stem', 'manubrio', 'asiento', 'tija', 'pedal', 'cinta'],
        'Mantenimiento General': ['lubricante', 'm.o.', 'limpieza', 'service', 'ajuste']
    };

    for (const [category, keywords] of Object.entries(dic)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return category;
        }
    }

    return 'Otros';
}

export default function Metrics() {
    const tallerId = useAuthStore(s => s.taller_id);
    const taller = useAuthStore(s => s.taller);
    const planActual: string = taller?.plan_actual || 'Sport';

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
                const { data: bData } = await supabase
                    .from('bicicletas')
                    .select('*')
                    .eq('taller_id', tallerId);

                if (bData) setBicicletas(bData);

                // ── TZ-safe date range: build the ISO string directly from the
                // local date string to avoid the UTC offset shift that toISOString() produces.
                // Example: dateStart = "2025-04-01" → "2025-04-01T00:00:00"
                const isoStart = `${dateStart}T00:00:00`;
                const isoEnd = `${dateEnd}T23:59:59.999`;

                // ── FIX: removed .in('estado', [...]) filter.
                // History counts ALL non-deleted services; Metrics must do the same.
                // ── FIX: filter on fecha_ingreso (always set) instead of fecha_entrega
                // (null for in-progress services), which was silently excluding them.
                const { data: sData, error: sError } = await supabase
                    .from('servicios')
                    .select('*, servicio_items(*)')
                    .eq('taller_id', tallerId)
                    .is('eliminado_en', null)
                    .gte('fecha_ingreso', isoStart)
                    .lte('fecha_ingreso', isoEnd);

                if (sError) console.error("Error fetching services:", sError);
                else setServicios(sData || []);
            } catch (err) {
                console.error("Data fetch error in Metrics:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetricsData();
    }, [tallerId, dateStart, dateEnd]);

    // --- ANALYTICS ENGINE ---
    const stats = useMemo(() => {
        const filtered = servicios;
        // Normalize bikes ONCE before aggregating
        const normalizedBikes = normalizeBikeData(bicicletas);
        let totalRevenue = 0;
        let totalLabor = 0;
        let totalPartsRevenue = 0;
        let totalPartsCount = 0;
        const uniqueBikes = new Set();
        const productCounts: Record<string, number> = {};
        const trendCategories: Record<string, number> = {
            'Transmisión': 0, 'Frenos': 0, 'Neumáticos y Ruedas': 0,
            'Suspensión': 0, 'Cockpit y Componentes': 0, 'Mantenimiento General': 0, 'Otros': 0
        };
        const serviceTypeCounts: Record<string, number> = {};
        const brandCounts: Record<string, number> = {};
        const modelCounts: Record<string, number> = {};
        const categoryCounts: Record<string, number> = {};

        filtered.forEach(s => {
            const precioTotal = Number(s.precio_total) || 0;
            const precioBase = Number(s.precio_base) || 0;
            totalRevenue += precioTotal > 0 ? precioTotal : precioBase;
            totalLabor += precioBase;
            uniqueBikes.add(s.bicicleta_id);

            const normalizedType = normalizeServiceType(s.tipo_servicio || '');
            serviceTypeCounts[normalizedType] = (serviceTypeCounts[normalizedType] || 0) + 1;

            const bike = normalizedBikes.find(b => b.id === s.bicicleta_id);

            // Consume strictly bike.marca for brand
            let brandName = bike?.marca?.trim() || 'Desconocida';
            brandName = brandName.length > 0 ? brandName.charAt(0).toUpperCase() + brandName.slice(1).toLowerCase() : 'Desconocida';
            brandCounts[brandName] = (brandCounts[brandName] || 0) + 1;

            // Normalized model family (ej. "Epic 8 Pro (azul)" → "Epic")
            const modelFamily = bike?.modelFamily || 'Desconocido';
            modelCounts[modelFamily] = (modelCounts[modelFamily] || 0) + 1;

            // Inferred segment (ej. "Epic" → "MTB")
            const segment = bike?.segment || 'Otros';
            categoryCounts[segment] = (categoryCounts[segment] || 0) + 1;

            const items = Array.isArray(s.servicio_items) ? s.servicio_items : (Array.isArray(s.items_extra) ? s.items_extra : []);
            items.forEach((item: any) => {
                const itemPrecio = Number(item.precio) || 0;
                if (item.categoria === 'part' || item.categoria === 'producto' || item.categoria === 'repuesto') {
                    const desc = (item.descripcion || '').trim();
                    if (!desc) return;
                    const { name, qty } = parseItemQuantityAndName(desc);
                    totalPartsRevenue += itemPrecio;
                    totalPartsCount += qty;
                    productCounts[name] = (productCounts[name] || 0) + qty;
                    const category = getSemanticCategory(desc);
                    trendCategories[category] += qty;
                } else {
                    totalLabor += itemPrecio;
                }
            });
        });

        const sortedProducts = Object.entries(productCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, count]) => ({ name, count }));
        const totalTrendCount = Object.values(trendCategories).reduce((a, b) => a + b, 0);
        const trendData = Object.entries(trendCategories)
            .filter(([, count]) => count > 0)
            .map(([category, count]) => ({ category, count, percentage: totalTrendCount > 0 ? Math.round((count / totalTrendCount) * 100) : 0 }))
            .sort((a, b) => b.count - a.count);

        const totalServices = filtered.length;
        const serviceDistData = Object.entries(serviceTypeCounts)
            .map(([type, count]) => ({ type, count, percentage: totalServices > 0 ? Math.round((count / totalServices) * 100) : 0 }))
            .sort((a, b) => b.count - a.count);

        // Utility to process TOP N + "Otras" residual bar.
        // Using limit=6 to reduce the inflated "Otras" percentage and show more granular data.
        const processTopN = (countsMap: Record<string, number>, limit = 6) => {
            const entries = Object.entries(countsMap).sort(([, a], [, b]) => b - a);
            const total = entries.reduce((sum, [, c]) => sum + c, 0);
            const pct = (count: number) => total > 0 ? Math.round((count / total) * 100) : 0;
            if (entries.length > limit) {
                const topN = entries.slice(0, limit);
                const othersCount = entries.slice(limit).reduce((sum, [, count]) => sum + count, 0);
                const finalData = topN.map(([name, count]) => ({ name, count, percentage: pct(count) }));
                if (othersCount > 0) finalData.push({ name: 'Otras', count: othersCount, percentage: pct(othersCount) });
                return finalData;
            }
            return entries.map(([name, count]) => ({ name, count, percentage: pct(count) }));
        };

        const finalBrandData = processTopN(brandCounts);
        const finalModelData = processTopN(modelCounts);
        const finalCategoryData = processTopN(categoryCounts);

        const totalFacturacion = totalLabor + totalPartsRevenue;
        const avgTicket = uniqueBikes.size > 0 ? Math.round(totalFacturacion / uniqueBikes.size) : 0;
        const laborPerc = totalFacturacion > 0 ? Math.round((totalLabor / totalFacturacion) * 100) : 0;
        const partsPerc = totalFacturacion > 0 ? Math.round((totalPartsRevenue / totalFacturacion) * 100) : 0;

        return {
            count: filtered.length, revenue: totalFacturacion, labor: totalLabor,
            parts: totalPartsRevenue, partsCount: totalPartsCount, bikesCount: uniqueBikes.size,
            topProducts: sortedProducts, trends: trendData, serviceDist: serviceDistData,
            brandDist: finalBrandData, modelDist: finalModelData, categoryDist: finalCategoryData,
            avgTicket, laborPerc, partsPerc
        };
    }, [servicios, bicicletas]);

    // ─── Shared Header ────────────────────────────────────────────────────────
    const header = (
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
                    {isLoading && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                </div>
                <div className="flex items-center gap-2">
                    <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="bg-white h-8 w-fit text-xs" />
                    <span className="text-muted-foreground">-</span>
                    <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="bg-white h-8 w-fit text-xs" />
                </div>
            </Card>
        </div>
    );

    // ─── Shared KPI cards ─────────────────────────────────────────────────────
    const kpiCards = (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard title="Facturación Total" value={`$ ${stats.revenue.toLocaleString('es-AR')}`} icon={<DollarSign className="w-5 h-5 text-green-600" />} trend="+12%" trendUp={true} className="bg-green-50 border-green-100" />
            <KPICard title="Mano de Obra" value={`$ ${stats.labor.toLocaleString('es-AR')}`} icon={<Wrench className="w-5 h-5 text-primary" />} sublabel={`${stats.count} Servicios realizados`} />
            <KPICard title="Venta Repuestos" value={`$ ${stats.parts.toLocaleString('es-AR')}`} icon={<Package className="w-5 h-5 text-secondary" />} sublabel={`${stats.partsCount} Productos vendidos`} />
            <KPICard title="Ticket Promedio" value={`$ ${stats.avgTicket.toLocaleString('es-AR')}`} icon={<Ticket className="w-5 h-5 text-primary" />} sublabel="Por visita de cliente" />
            <KPICard title="Bicis Atendidas" value={stats.bikesCount.toString()} icon={<TrendingUp className="w-5 h-5 text-purple-600" />} sublabel="En el período seleccionado" />
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
    );

    // ─── Pro analysis panels ──────────────────────────────────────────────────
    const analysisPanels = (
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 1. STOCK RANKING */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <Package className="w-6 h-6 text-primary" />
                        <h3 className="text-lg font-bold text-gray-900">Ranking de Stock</h3>
                    </div>
                    <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Top 5</span>
                </div>
                <div className="flex-1">
                    {stats.topProducts.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos de ventas en este período.</div>
                    ) : (
                        <div className="space-y-4">
                            {stats.topProducts.map((prod: any, idx: number) => (
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
                            {stats.trends.map((cat: any, idx: number) => (
                                <div key={idx} className="space-y-1">
                                    <div className="flex justify-between items-center mb-1 text-sm font-medium">
                                        <span className="flex items-center gap-2">{getCategoryIcon(cat.category)}<span className="text-slate-700">{cat.category}</span></span>
                                        <span className="text-slate-600 font-bold">{cat.percentage}% <span className="text-xs text-muted-foreground font-normal">({cat.count})</span></span>
                                    </div>
                                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${getCategoryColor(cat.category)}`} style={{ width: `${cat.percentage}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="mt-6 pt-4 border-t text-xs text-muted-foreground text-center">* Agrupación automática basada en descripción de items.</div>
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
                        <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos en este período.</div>
                    ) : (
                        <div className="space-y-6 pt-2">
                            {stats.serviceDist.map((item: any, idx: number) => (
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
                    <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Top 6</span>
                </div>
                <div className="flex-1">
                    {stats.brandDist.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos en este período.</div>
                    ) : (
                        <div className="space-y-6 pt-2">
                            {stats.brandDist.map((item: any, idx: number) => (
                                <div key={idx} className="space-y-1">
                                    <div className="flex justify-between items-center mb-1 text-sm font-medium">
                                        <span className="text-slate-700">{item.name}</span>
                                        <span className="text-slate-600 font-bold">{item.percentage}% <span className="text-xs text-muted-foreground font-normal">({item.count})</span></span>
                                    </div>
                                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${item.name === 'Otras' ? 'bg-slate-300' : idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-primary/80' : idx === 2 ? 'bg-primary/60' : 'bg-primary/40'}`} style={{ width: `${item.percentage}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 5. MODEL DISTRIBUTION */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <Layers className="w-6 h-6 text-fuchsia-600" />
                        <h3 className="text-lg font-bold text-gray-900">Distribución por Modelo</h3>
                    </div>
                    <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Top 6</span>
                </div>
                <div className="flex-1">
                    {stats.modelDist.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos en este período.</div>
                    ) : (
                        <div className="space-y-6 pt-2">
                            {stats.modelDist.map((item: any, idx: number) => (
                                <div key={idx} className="space-y-1">
                                    <div className="flex justify-between items-center mb-1 text-sm font-medium">
                                        <span className="text-slate-700">{item.name}</span>
                                        <span className="text-slate-600 font-bold">{item.percentage}% <span className="text-xs text-muted-foreground font-normal">({item.count})</span></span>
                                    </div>
                                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${item.name === 'Otras' ? 'bg-slate-300' : idx === 0 ? 'bg-fuchsia-600' : idx === 1 ? 'bg-fuchsia-500' : idx === 2 ? 'bg-fuchsia-400' : 'bg-fuchsia-300'}`} style={{ width: `${item.percentage}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 6. CATEGORY DISTRIBUTION */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <Bike className="w-6 h-6 text-sky-600" />
                        <h3 className="text-lg font-bold text-gray-900">Segmento de Bicicletas</h3>
                    </div>
                    <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Top 6</span>
                </div>
                <div className="flex-1">
                    {stats.categoryDist.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-muted-foreground italic">No hay datos en este período.</div>
                    ) : (
                        <div className="space-y-6 pt-2">
                            {stats.categoryDist.map((item: any, idx: number) => (
                                <div key={idx} className="space-y-1">
                                    <div className="flex justify-between items-center mb-1 text-sm font-medium">
                                        <span className="text-slate-700">{item.name}</span>
                                        <span className="text-slate-600 font-bold">{item.percentage}% <span className="text-xs text-muted-foreground font-normal">({item.count})</span></span>
                                    </div>
                                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${item.name === 'Otras' ? 'bg-slate-300' : idx === 0 ? 'bg-sky-600' : idx === 1 ? 'bg-sky-500' : idx === 2 ? 'bg-sky-400' : 'bg-sky-300'}`} style={{ width: `${item.percentage}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // ─── Plan: Sport → BasicMetrics ───────────────────────────────────────────
    if (planActual === 'Sport') {
        return (
            <div className="p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
                {header}
                {kpiCards}
                {/* Upgrade nudge */}
                <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
                    <Lock className="w-4 h-4 shrink-0" />
                    Actualiza al plan <strong className="mx-1">Pro</strong> o <strong className="mx-1">Expert</strong> para desbloquear análisis de tendencias, distribución de marcas e inteligencia de equipo.
                </div>
            </div>
        );
    }

    // ─── Plan: Pro → OperationalMetrics ──────────────────────────────────────
    if (planActual === 'Pro') {
        return (
            <div className="p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
                {header}
                {kpiCards}
                {analysisPanels}
            </div>
        );
    }

    // ─── Plan: Expert → ExpertMetrics ────────────────────────────────────────
    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
            {header}
            {kpiCards}
            {analysisPanels}
            <ExpertMetrics
                tallerId={tallerId || ''}
                dateStart={dateStart}
                dateEnd={dateEnd}
                stats={stats}
                servicios={servicios}
                isLoading={isLoading}
            />
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
        case 'Transmisión': return 'bg-purple-500';
        case 'Frenos': return 'bg-red-500';
        case 'Neumáticos y Ruedas': return 'bg-blue-500';
        case 'Suspensión': return 'bg-amber-500';
        case 'Cockpit y Componentes': return 'bg-emerald-500';
        case 'Mantenimiento General': return 'bg-teal-500';
        default: return 'bg-slate-400';
    }
}

function getCategoryIcon(cat: string) {
    switch (cat) {
        case 'Transmisión': return '⚙️';
        case 'Frenos': return '🛑';
        case 'Neumáticos y Ruedas': return '🔘';
        case 'Suspensión': return '🪱';
        case 'Cockpit y Componentes': return '💺';
        case 'Mantenimiento General': return '🧰';
        default: return '📦';
    }
}
