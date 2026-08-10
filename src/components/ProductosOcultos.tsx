/**
 * ProductosOcultos — la vuelta atrás del "no sugerir más" del buscador de repuestos.
 *
 * POR QUÉ EXISTE (Iara, 10-ago-2026): *"no sé si después lo podés ocultar o se
 * oculta cuando cargás otro producto… porque si es para siempre es grave"*.
 * Tenía razón: ocultar era permanente, para todo el taller, y sin ninguna forma
 * de deshacerlo. Una acción de un clic que no se puede revertir y que ni siquiera
 * avisa que es definitiva no puede vivir dentro de un desplegable.
 *
 * Ocultar NO borra el producto: le pone `activo = false`. Las órdenes viejas lo
 * siguen nombrando y el historial queda intacto; solo deja de sugerirse. Acá se
 * ve todo lo oculto y se vuelve a mostrar con un clic.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EyeOff, Eye, Search, Loader2 } from 'lucide-react';

interface Oculto {
    id: string;
    nombre: string;
    sku: string | null;
    precio: number | null;
    categoria: string;
    veces_usado: number;
}

export function ProductosOcultos({ avisar }: { avisar: (tipo: 'ok' | 'error', msg: string) => void }) {
    const tallerId = useAuthStore(s => s.taller?.id);
    const fetchProductos = useDataStore(s => s.fetchProductos);

    const [ocultos, setOcultos] = useState<Oculto[]>([]);
    const [noRepuestos, setNoRepuestos] = useState(0);
    const [cargando, setCargando] = useState(true);
    const [filtro, setFiltro] = useState('');
    const [restaurando, setRestaurando] = useState<string | null>(null);

    const cargar = async () => {
        if (!tallerId) return;
        setCargando(true);
        const { data, error } = await supabase
            .from('productos_taller')
            .select('id,nombre,sku,precio,categoria,veces_usado')
            .eq('taller_id', tallerId)
            .eq('activo', false)
            .order('nombre');
        if (error) avisar('error', 'No pude leer los productos ocultos.');
        setOcultos((data as Oculto[]) ?? []);

        // Los que no se ofrecen por no ser repuesto de taller (bicis, ropa,
        // cascos) se cuentan aparte: son miles y no son decisiones de nadie,
        // pero tampoco pueden ser invisibles.
        const { count } = await supabase
            .from('productos_taller')
            .select('*', { count: 'exact', head: true })
            .eq('taller_id', tallerId)
            .eq('activo', true)
            .eq('sugerible', false);
        setNoRepuestos(count ?? 0);
        setCargando(false);
    };

    useEffect(() => { void cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tallerId]);

    const restaurar = async (o: Oculto) => {
        setRestaurando(o.id);
        const { error } = await supabase.from('productos_taller').update({ activo: true }).eq('id', o.id);
        setRestaurando(null);
        if (error) { avisar('error', 'No pude volver a mostrarlo.'); return; }
        setOcultos(prev => prev.filter(x => x.id !== o.id));
        // Que vuelva a estar en el buscador sin recargar la app.
        if (tallerId) void fetchProductos(tallerId, { forzar: true });
        avisar('ok', `"${o.nombre}" vuelve a aparecer en el buscador.`);
    };

    const visibles = filtro.trim()
        ? ocultos.filter(o => o.nombre.toLowerCase().includes(filtro.trim().toLowerCase()))
        : ocultos;

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                    Productos ocultos del buscador
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Cuando en la carga de una orden marcás un producto como “no sugerir más”, deja de
                    aparecer en el buscador de repuestos. No se borra: las órdenes que ya lo nombran
                    quedan igual. Acá los ves todos y los volvés a mostrar cuando quieras.
                </p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3">
                {cargando ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                    </p>
                ) : ocultos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No ocultaste ningún producto todavía.
                    </p>
                ) : (
                    <>
                        {ocultos.length > 8 && (
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                                <Input
                                    value={filtro}
                                    onChange={e => setFiltro(e.target.value)}
                                    placeholder={`Buscar entre ${ocultos.length} ocultos`}
                                    className="pl-9 h-9"
                                />
                            </div>
                        )}
                        <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                            {visibles.map(o => (
                                <div key={o.id} className="flex items-center gap-3 px-3 py-2">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm">{o.nombre}</span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {o.categoria === 'labor' ? 'mano de obra' : 'repuesto'}
                                            {o.sku && ` · ${o.sku}`}
                                            {o.veces_usado > 0 && ` · usado ${o.veces_usado}×`}
                                        </span>
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0"
                                        disabled={restaurando === o.id}
                                        onClick={() => void restaurar(o)}
                                    >
                                        {restaurando === o.id
                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            : <><Eye className="h-3.5 w-3.5 mr-1.5" /> Volver a mostrar</>}
                                    </Button>
                                </div>
                            ))}
                            {visibles.length === 0 && (
                                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                                    Ninguno coincide con “{filtro}”.
                                </p>
                            )}
                        </div>
                    </>
                )}

                {noRepuestos > 0 && (
                    <p className="text-xs text-muted-foreground leading-relaxed border-t pt-3 mt-auto">
                        Además, <span className="font-semibold text-slate-700">{noRepuestos.toLocaleString('es-AR')} productos</span> de
                        tu catálogo (bicicletas completas, ropa, cascos y calzado) no se ofrecen en el
                        buscador de repuestos, porque no son cosas que se carguen en una orden de service.
                        Siguen en tu ERP y se pueden vender igual. Si alguna vez cargás una en una orden,
                        vuelve a aparecer sola.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
