import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ComoFunciona } from '@/components/ComoFunciona';
import { Loader2, Save, Scale, TrendingUp, AlertTriangle, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { calcular, margenDesdeMarkup, plata, type Finanzas } from '@/lib/puntoEquilibrio';

/**
 * «Cuánto tenés que vender» — el punto de equilibrio del taller.
 *
 * Pedido de Iara (10-sep-2026): métricas financieras serias en el plan Expert,
 * usando lo que ve en Administración Financiera (UBA, cátedra Aire, Alderete).
 *
 * 🔴 Los tres números de entrada los pone el taller porque el sistema NO puede
 * saberlos: `servicio_items` guarda el precio de venta y ningún costo. Todo lo
 * demás (facturación, mezcla, ticket) sale de sus órdenes reales.
 */
export function PuntoDeEquilibrio({ stats, dateStart, dateEnd }: {
    stats: { revenue: number; labor: number; parts: number; count: number } | null;
    dateStart?: string;
    dateEnd?: string;
}) {
    const taller = useAuthStore(s => s.taller);
    const setTaller = useAuthStore(s => s.setTaller);
    const guardadas: Finanzas | null = (taller as any)?.finanzas?.costos_fijos ? (taller as any).finanzas : null;

    const [editando, setEditando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [form, setForm] = useState({
        costos_fijos: String(guardadas?.costos_fijos ?? ''),
        markup_repuestos: String(guardadas?.markup_repuestos ?? 35),
        iva: String(guardadas?.iva ?? 21),
        amortizaciones: String(guardadas?.amortizaciones ?? 0),
        comision_mecanico: String(guardadas?.comision_mecanico ?? 0),
    });

    const dias = useMemo(() => {
        if (!dateStart || !dateEnd) return 30;
        const d = (new Date(dateEnd).getTime() - new Date(dateStart).getTime()) / 86400000;
        return d > 0 ? Math.round(d) + 1 : 30;
    }, [dateStart, dateEnd]);

    const r = useMemo(() => {
        if (!guardadas || !stats) return null;
        return calcular(
            { mano_obra: stats.labor || 0, repuestos: stats.parts || 0, ordenes: stats.count || 0, dias },
            guardadas,
        );
    }, [guardadas, stats, dias]);

    const guardar = async () => {
        const finanzas: Finanzas = {
            costos_fijos: Number(form.costos_fijos) || 0,
            markup_repuestos: Number(form.markup_repuestos) || 0,
            iva: Number(form.iva) || 0,
            amortizaciones: Number(form.amortizaciones) || 0,
            comision_mecanico: Number(form.comision_mecanico) || 0,
        };
        if (finanzas.costos_fijos <= 0) return;
        setGuardando(true);
        try {
            const { data, error } = await supabase
                .from('talleres')
                .update({ finanzas: { ...finanzas, actualizado_at: new Date().toISOString() } })
                .eq('id', taller!.id)
                .select()
                .single();
            if (error) throw error;
            // setTaller para que el número se vea sin recargar la pantalla.
            setTaller(data);
            setEditando(false);
        } catch (e: any) {
            alert('No se pudo guardar: ' + e.message);
        } finally {
            setGuardando(false);
        }
    };

    const campo = (k: keyof typeof form, etiqueta: string, sufijo: string, ayuda?: string) => (
        <div className="space-y-1">
            <Label className="text-sm">{etiqueta}</Label>
            <div className="flex items-center gap-2">
                <Input
                    type="number" min={0} inputMode="decimal"
                    value={form[k]}
                    onChange={e => setForm({ ...form, [k]: e.target.value })}
                    className="max-w-[11rem]"
                />
                <span className="text-sm text-muted-foreground">{sufijo}</span>
            </div>
            {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
        </div>
    );

    // ── Todavía no cargó los datos, o los está editando ──────────────────────
    if (!guardadas || editando) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Scale className="h-4 w-4 text-primary" /> Cuánto tenés que vender
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        {campo('costos_fijos', 'Gastos fijos del mes', '$', 'Alquiler, sueldos, luz. Lo que pagás igual.')}
                        {campo('markup_repuestos', 'Lo que le ponés al repuesto', '%', 'Si te cuesta $100 y lo vendés a $135, poné 35.')}
                        {campo('iva', 'IVA de tus precios', '%', 'Responsable inscripto: 21. Monotributista: 0.')}
                    </div>
                    <ComoFunciona titulo="Dos datos más, si te aplican">
                        <div className="grid gap-4 sm:grid-cols-2 pt-1">
                            {campo('amortizaciones', 'Amortizaciones del mes', '$', 'Casi siempre 0 en un taller: las herramientas ya están amortizadas.')}
                            {campo('comision_mecanico', 'Comisión al mecánico', '%', 'Si le pagás un porcentaje por service, además del sueldo.')}
                        </div>
                    </ComoFunciona>
                    <ComoFunciona titulo="Por qué te los pedimos">
                        <p>
                            Con estos tres números te decimos cuánto tenés que facturar para no
                            perder plata. Van acá porque Mechanic Pro sabe lo que
                            <strong> cobrás</strong> —está en cada orden— pero no
                            lo que te <strong>cuesta</strong>: el costo del repuesto y el alquiler no
                            pasan por acá. Con un margen inventado el número saldría lindo y sería
                            mentira, así que se te pide.
                        </p>
                        <p>
                            Se cargan una vez. Cuando te suba el alquiler, lo cambiás acá.
                        </p>
                    </ComoFunciona>
                    <div className="flex gap-2">
                        <Button onClick={guardar} disabled={guardando || !(Number(form.costos_fijos) > 0)}>
                            {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Calcular
                        </Button>
                        {guardadas && (
                            <Button variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!r) {
        return (
            <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                    En el período elegido no hay facturación para comparar contra tus gastos fijos.
                    Probá con un rango más largo.
                </CardContent>
            </Card>
        );
    }

    const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',') + '%';
    const enVerde = r.resultado > 0;
    const meses = dias / 30;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Scale className="h-4 w-4 text-primary" /> Cuánto tenés que vender
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setEditando(true)} className="h-7 text-xs">
                        <Pencil className="h-3 w-3 mr-1" /> Cambiar mis números
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* El titular: dónde está parado, en una frase */}
                <div className={`rounded-lg border p-4 ${enVerde ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex items-start gap-2">
                        {enVerde
                            ? <TrendingUp className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                            : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
                        <div>
                            <p className={`font-semibold ${enVerde ? 'text-emerald-900' : 'text-amber-900'}`}>
                                {r.zonaTexto}
                            </p>
                            <p className="text-sm text-slate-700 mt-0.5">
                                Facturaste <strong>{plata(r.facturacion)}</strong> y tu punto de equilibrio
                                {meses > 1.2 ? ` de estos ${Math.round(meses)} meses ` : ' del mes '}
                                es <strong>{plata(r.equilibrio)}</strong>.
                                {enVerde
                                    ? ` Te sobraron ${plata(r.resultado)}.`
                                    : ` Te faltaron ${plata(r.equilibrio - r.facturacion)}.`}
                            </p>
                            {meses > 1.2 && (
                                // El número que el dueño va a usar es el del mes, no el del
                                // rango que quedó elegido arriba.
                                <p className="text-sm text-slate-600 mt-1">
                                    Por mes: <strong>{plata(r.equilibrio / meses)}</strong>.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Dato titulo="Punto de equilibrio" valor={plata(r.equilibrio)}
                        pie={r.ordenesParaEquilibrio ? `${r.ordenesParaEquilibrio} órdenes como las tuyas` : undefined} />
                    {r.margenSeguridad > 0 ? (
                        <Dato titulo="Margen de seguridad" valor={pct(r.margenSeguridad)}
                            pie="lo que puede caer la venta antes de perder"
                            tono={r.margenSeguridad < 0.1 ? 'alerta' : 'ok'} />
                    ) : (
                        <Dato titulo="Te falta para el equilibrio" valor={plata(r.equilibrio - r.facturacion)}
                            pie="en el período elegido" tono="alerta" />
                    )}
                    <Dato titulo="De cada $100 que entran" valor={plata(r.razon * 100)}
                        pie="quedan para pagar los gastos fijos" />
                    <Dato titulo="Ticket promedio" valor={plata(r.ticketPromedio)}
                        pie={`${stats?.count ?? 0} órdenes en el período`} />
                </div>

                {r.palanca && (
                    <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                        <strong>La palanca:</strong> por cada 1% que subas la facturación, tu resultado
                        sube <strong>{r.palanca.toFixed(1).replace('.', ',')}%</strong>.
                        {' '}Vendiendo un 10% más, el resultado del período pasaría de {plata(r.resultado)} a{' '}
                        <strong>{plata(r.resultado * (1 + r.palanca * 0.1))}</strong>.
                        <ComoFunciona titulo="Y para el otro lado">
                            <p>
                                La palanca funciona en las dos direcciones: si la venta cae un 10%, el
                                resultado cae ese mismo {r.palanca.toFixed(1).replace('.', ',')}%.
                                Cuanto más pesan tus gastos fijos, más larga es la palanca.
                            </p>
                        </ComoFunciona>
                    </div>
                )}

                <ComoFunciona titulo="De dónde sale cada número">
                    <p>
                        <strong>Punto de equilibrio</strong>: tus gastos fijos divididos por lo que te
                        queda de cada peso que vendés. No se divide por el precio: se divide por la
                        contribución.
                    </p>
                    <p>
                        <strong>Lo que te queda de cada peso</strong> ({pct(r.razon)}): la mano de obra
                        contribuye casi entera —el sueldo del mecánico ya está en los gastos fijos— y de
                        los repuestos queda tu margen. Ojo que el {guardadas.markup_repuestos}% que le
                        ponés al costo es un margen del{' '}
                        {pct(margenDesdeMarkup(guardadas.markup_repuestos))} sobre la venta: no es el
                        mismo número.
                    </p>
                    {(guardadas.amortizaciones || 0) > 0 ? (
                        <p>
                            <strong>Punto de caja</strong>: {plata(r.puntoDeCaja)}. Es el mismo cálculo
                            sacando lo que no se paga con plata (las amortizaciones). Por debajo de ese
                            número no alcanza ni para pagar los gastos del mes.
                        </p>
                    ) : (
                        <p>
                            <strong>Punto de caja</strong>: te da igual al de equilibrio porque cargaste
                            0 de amortizaciones, que es lo normal en un taller —las herramientas ya
                            están amortizadas—. Que coincidan no tranquiliza: quiere decir que no se
                            está juntando nada para el día que haya que reponer una máquina.
                        </p>
                    )}
                    <p>
                        La cuenta se hace sobre la venta sin IVA ({plata(r.ventaNeta)}), porque ese IVA
                        no es tuyo: lo juntás y lo depositás. Los gastos fijos se llevan a la escala del
                        período elegido ({plata(r.fijosDelPeriodo)} por {dias} días).
                    </p>
                </ComoFunciona>
            </CardContent>
        </Card>
    );
}

function Dato({ titulo, valor, pie, tono }: { titulo: string; valor: string; pie?: string; tono?: 'ok' | 'alerta' }) {
    return (
        <div className="rounded-lg border p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</div>
            <div className={`text-xl font-bold mt-0.5 ${tono === 'alerta' ? 'text-amber-600' : ''}`}>{valor}</div>
            {pie && <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{pie}</div>}
        </div>
    );
}
