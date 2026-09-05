// ─────────────────────────────────────────────────────────────
// LO QUE LOS TALLERES PIDIERON Y TODAVÍA NO EXISTE.
//
// Dos cosas caen acá, y son la misma con distinta cara: un taller quiso hacer algo
// y el producto no llegaba.
//   · disparador → describió un momento que no sabemos disparar solo
//                  ("cuando la bici lleva una semana lista y no la vienen a buscar")
//   · campo      → necesitaba un dato que no está en la lista de botones
//
// POR QUÉ ESTA PANTALLA EXISTE Y NO ES SOLO UNA TABLA: una bandeja que nadie abre
// es lo mismo que no tenerla. Ya nos pasó con el radar que corrió cuatro días de
// más porque nadie miraba su salida. El pedido de un taller es la mejor
// información de roadmap que hay —un cliente diciendo qué le falta, gratis, justo
// en el momento en que le hace falta— y antes se perdía en un cartel de disculpas.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Inbox, Check, X, Clock } from 'lucide-react';

type Pedido = {
    id: string;
    taller_id: string;
    tipo: 'disparador' | 'campo';
    texto: string;
    estado: 'nuevo' | 'visto' | 'hecho' | 'descartado';
    creado_at: string;
    talleres?: { nombre: string } | null;
};

const TIPO: Record<Pedido['tipo'], { etiqueta: string; clase: string }> = {
    disparador: { etiqueta: 'un momento que no sabemos disparar', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
    campo: { etiqueta: 'un dato que no está', clase: 'bg-sky-50 text-sky-800 border-sky-200' },
};

export function PedidosDelTaller() {
    const [pedidos, setPedidos] = useState<Pedido[]>([]);
    const [cargando, setCargando] = useState(true);
    const [verTodos, setVerTodos] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        const { data } = await supabase
            .from('pedidos_del_taller')
            .select('*, talleres(nombre)')
            .order('creado_at', { ascending: false })
            .limit(100);
        setPedidos((data as Pedido[]) ?? []);
        setCargando(false);
    }, []);

    useEffect(() => { void cargar(); }, [cargar]);

    const marcar = async (p: Pedido, estado: Pedido['estado']) => {
        setPedidos((xs) => xs.map((x) => (x.id === p.id ? { ...x, estado } : x)));
        const { error } = await supabase.from('pedidos_del_taller').update({ estado }).eq('id', p.id);
        if (error) void cargar();
    };

    const abiertos = pedidos.filter((p) => p.estado === 'nuevo' || p.estado === 'visto');
    const aMostrar = verTodos ? pedidos : abiertos;

    // Sin pedidos no se dibuja nada: una tarjeta vacía permanente en el panel es
    // ruido que enseña a saltear esa parte de la pantalla.
    if (!cargando && pedidos.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                        <Inbox className="h-5 w-5" />
                        Lo que pidieron los talleres
                        {abiertos.length > 0 && (
                            <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5">
                                {abiertos.length}
                            </span>
                        )}
                    </CardTitle>
                    {pedidos.length > abiertos.length && (
                        <Button variant="ghost" size="sm" onClick={() => setVerTodos((v) => !v)}>
                            {verTodos ? 'Ver solo los abiertos' : `Ver todos (${pedidos.length})`}
                        </Button>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    Sale de la pantalla de plantillas de WhatsApp: cuando un mecánico describe un
                    momento que no sabemos disparar, o pide un dato que no está en la lista.
                </p>
            </CardHeader>

            <CardContent className="space-y-2">
                {cargando ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : aMostrar.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Nada abierto.</p>
                ) : aMostrar.map((p) => (
                    <div
                        key={p.id}
                        className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${
                            p.estado === 'hecho' || p.estado === 'descartado' ? 'opacity-50 bg-slate-50' : 'bg-white'
                        }`}
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{p.talleres?.nombre ?? 'un taller'}</span>
                                <span className={`text-[11px] px-1.5 py-0.5 rounded border ${TIPO[p.tipo].clase}`}>
                                    {TIPO[p.tipo].etiqueta}
                                </span>
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {new Date(p.creado_at).toLocaleDateString('es-AR')}
                                </span>
                            </div>
                            {/* El texto va tal cual lo escribió. No se resume ni se
                                normaliza: las palabras del taller son el dato. */}
                            <p className="text-sm text-slate-700 mt-1">{p.texto}</p>
                        </div>
                        {(p.estado === 'nuevo' || p.estado === 'visto') && (
                            <div className="flex gap-1 flex-shrink-0">
                                <Button variant="ghost" size="sm" title="Ya está hecho" onClick={() => marcar(p, 'hecho')}>
                                    <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="sm" title="No lo vamos a hacer" onClick={() => marcar(p, 'descartado')}>
                                    <X className="h-4 w-4 text-slate-400" />
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
