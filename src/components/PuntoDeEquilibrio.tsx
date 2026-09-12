import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ComoFunciona } from '@/components/ComoFunciona';
import { Loader2, Save, Scale, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { calcular, margenDesdeMarkup, plata, type Finanzas } from '@/lib/puntoEquilibrio';

/**
 * «Cuánto tenés que vender» — el punto de equilibrio del taller.
 *
 * Pedido de Iara (10-sep-2026): métricas financieras serias en el plan Expert,
 * con lo que ve en Administración Financiera (UBA, cátedra Aire, Alderete).
 *
 * 🔴 SOLO EL ADMIN. Iara, el mismo día: «ponela solo accesible para el admin, no
 * para el mecánico porque el mecánico no tiene que ver eso». Acá se esconde, y
 * el candado de verdad está en la base: los números viven en `taller_finanzas`,
 * con RLS que solo deja al admin (ver la migración 20260910160000). Esconderlo
 * en la pantalla solo no alcanzaba: `talleres` la lee cualquier usuario del
 * taller y RLS es por fila, no por columna.
 *
 * 🔴 Los tres números de entrada los pone el taller porque el sistema NO puede
 * saberlos: `servicio_items` guarda el precio de venta y ningún costo.
 *
 * TODO SE HABLA POR MES. Los gastos fijos son mensuales; comparar contra un
 * rango de 8 meses daba «tu punto de equilibrio de estos 8 meses es
 * $49.155.164», que no es un número que nadie use.
 */
export function PuntoDeEquilibrio({ stats, dateStart, dateEnd }: {
    stats: { revenue: number; labor: number; parts: number; count: number } | null;
    dateStart?: string;
    dateEnd?: string;
}) {
    const taller = useAuthStore(s => s.taller);
    const rol = useAuthStore(s => s.rol);
    const esAdmin = rol?.toLowerCase()?.trim() === 'admin';

    const [finanzas, setFinanzas] = useState<Finanzas | null>(null);
    const [cargando, setCargando] = useState(true);
    const [editando, setEditando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [form, setForm] = useState({
        costos_fijos: '', markup_repuestos: '35', iva: '21',
        amortizaciones: '0', comision_mecanico: '0',
    });

    useEffect(() => {
        if (!esAdmin || !taller?.id) { setCargando(false); return; }
        let vivo = true;
        (async () => {
            const { data } = await supabase
                .from('taller_finanzas')
                .select('*')
                .eq('taller_id', taller.id)
                .maybeSingle();
            if (!vivo) return;
            if (data && Number(data.costos_fijos) > 0) {
                setFinanzas(data as Finanzas);
                setForm({
                    costos_fijos: String(data.costos_fijos),
                    markup_repuestos: String(data.markup_repuestos),
                    iva: String(data.iva),
                    amortizaciones: String(data.amortizaciones ?? 0),
                    comision_mecanico: String(data.comision_mecanico ?? 0),
                });
            }
            setCargando(false);
        })();
        return () => { vivo = false; };
    }, [esAdmin, taller?.id]);

    const dias = useMemo(() => {
        if (!dateStart || !dateEnd) return 30;
        const d = (new Date(dateEnd).getTime() - new Date(dateStart).getTime()) / 86400000;
        return d > 0 ? Math.round(d) + 1 : 30;
    }, [dateStart, dateEnd]);

    const r = useMemo(() => {
        if (!finanzas || !stats) return null;
        return calcular(
            { mano_obra: stats.labor || 0, repuestos: stats.parts || 0, ordenes: stats.count || 0, dias },
            finanzas,
        );
    }, [finanzas, stats, dias]);

    // 🔴 El mecánico no ve nada. Ni el panel, ni el formulario, ni que existe.
    if (!esAdmin || cargando) return null;

    const guardar = async () => {
        const fila = {
            taller_id: taller!.id,
            costos_fijos: Number(form.costos_fijos) || 0,
            markup_repuestos: Number(form.markup_repuestos) || 0,
            iva: Number(form.iva) || 0,
            amortizaciones: Number(form.amortizaciones) || 0,
            comision_mecanico: Number(form.comision_mecanico) || 0,
            actualizado_at: new Date().toISOString(),
        };
        if (fila.costos_fijos <= 0) return;
        setGuardando(true);
        try {
            const { data, error } = await supabase
                .from('taller_finanzas')
                .upsert(fila, { onConflict: 'taller_id' })
                .select()
                .single();
            if (error) throw error;
            setFinanzas(data as Finanzas);
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
                <Input type="number" min={0} inputMode="decimal" value={form[k]}
                    onChange={e => setForm({ ...form, [k]: e.target.value })} className="max-w-[11rem]" />
                <span className="text-sm text-muted-foreground">{sufijo}</span>
            </div>
            {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
        </div>
    );

    // ── Todavía no cargó sus números, o los está cambiando ───────────────────
    if (!finanzas || editando) {
        return (
            <Card>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">
                            <Scale className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900">Cuánto tenés que vender</h3>
                            <p className="text-xs text-muted-foreground">Solo lo ve el administrador.</p>
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {campo('costos_fijos', 'Gastos fijos del mes', '$', 'Alquiler, sueldos, luz. Lo que pagás igual.')}
                        {campo('markup_repuestos', 'Lo que le ponés al repuesto', '%', 'Si te cuesta $100 y lo vendés a $135, poné 35.')}
                        {campo('iva', 'IVA de tus precios', '%', 'Responsable inscripto: 21. Monotributista: 0.')}
                    </div>
                    <ComoFunciona titulo="Dos datos más, si te aplican">
                        <div className="grid gap-4 sm:grid-cols-2 pt-1">
                            {campo('amortizaciones', 'Amortizaciones del mes', '$', 'Casi siempre 0: las herramientas ya están amortizadas.')}
                            {campo('comision_mecanico', 'Comisión al mecánico', '%', 'Si le pagás un porcentaje por service, además del sueldo.')}
                        </div>
                    </ComoFunciona>
                    <ComoFunciona titulo="Por qué te los pedimos">
                        <p>
                            Con estos tres números te decimos cuánto tenés que facturar para no perder
                            plata. Van acá porque Mechanic Pro sabe lo que <strong>cobrás</strong> —está
                            en cada orden— pero no lo que te <strong>cuesta</strong>: el costo del
                            repuesto y el alquiler no pasan por acá.
                        </p>
                        <p>Se cargan una vez. Cuando te suba el alquiler, lo cambiás acá.</p>
                    </ComoFunciona>
                    <div className="flex gap-2">
                        <Button onClick={guardar} disabled={guardando || !(Number(form.costos_fijos) > 0)}>
                            {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Calcular
                        </Button>
                        {finanzas && <Button variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</Button>}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!r) {
        return (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
                En el período elegido no hay facturación para comparar contra tus gastos fijos.
                Probá con un rango más largo.
            </CardContent></Card>
        );
    }

    // Todo por mes: es la unidad de los gastos fijos y la que usa el dueño.
    const meses = Math.max(dias / 30, 0.1);
    const porMes = r.facturacion / meses;
    const equilibrioMes = r.equilibrio / meses;
    const enVerde = porMes >= equilibrioMes;
    // La barra deja el equilibrio SIEMPRE en el mismo lugar (70%): así la
    // posición del corte no salta entre un mes y otro y se compara de un vistazo.
    const CORTE = 70;
    const avance = Math.min((porMes / equilibrioMes) * CORTE, 100);
    const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',') + '%';
    const faltan = equilibrioMes - porMes;
    const cumplido = Math.round((porMes / equilibrioMes) * 100);
    // Las DOS palancas que tiene el taller para llegar: más órdenes, o el mismo
    // número de órdenes con un ticket más alto. Es el análisis de sensibilidad
    // de CVU bajado a lo que el mecánico puede hacer mañana.
    const ordenesMes = (stats?.count || 0) / meses;
    const ticketNecesario = ordenesMes > 0 ? equilibrioMes / ordenesMes : 0;
    const ordenesQueFaltan = r.ticketPromedio > 0 ? Math.ceil(faltan / r.ticketPromedio) : 0;
    // 🔴 Una palanca solo se sugiere si está AL ALCANCE. «Subí el ticket 20
    // veces» no es un consejo: es ruido con cara de dato. Si ninguna llega, se
    // dice lo que sí se puede mirar, que son los gastos fijos.
    const puedeConOrdenes = ordenesMes > 0 && ordenesQueFaltan <= ordenesMes * 0.5;
    const puedeConTicket = r.ticketPromedio > 0 && ticketNecesario <= r.ticketPromedio * 1.5;
    // Cuánto baja el punto de equilibrio por cada $100.000 menos de gasto fijo.
    const porCada100k = r.razon > 0 ? (100_000 / r.razon) * (1 + (Number(finanzas.iva) || 0) / 100) : 0;

    return (
        <Card>
            <CardContent className="p-6 space-y-5">
                {/* 🔴 EN EL CELULAR EL TÍTULO QUEDABA EN UNA COLUMNA DE 150 px (12-sep-2026):
                    «Cambiar mis números» le comía el costado y la bajada se partía en siete
                    renglones. En pantalla angosta van apilados; desde `sm`, uno al lado del otro. */}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">
                            <Scale className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900">Cuánto tenés que vender</h3>
                            <p className="text-xs text-muted-foreground">
                                Por mes · promedio de {meses < 1.2 ? 'el período elegido' : `los ${Math.round(meses)} meses elegidos arriba`}
                                {' '}· solo lo ve el administrador
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setEditando(true)} className="h-7 text-xs shrink-0 self-start -ml-2 sm:ml-0">
                        <Pencil className="h-3 w-3 mr-1" /> Cambiar mis números
                    </Button>
                </div>

                {/* El titular: un número grande y una barra. Es toda la pantalla. */}
                <div>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-3xl font-black tracking-tight text-slate-900">{plata(equilibrioMes)}</span>
                        <span className="text-sm text-muted-foreground">por mes es tu punto de equilibrio</span>
                    </div>

                    <div className="mt-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="relative h-9 rounded-lg bg-slate-100 overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-700 ${enVerde ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                    style={{ width: `${avance}%` }}
                                />
                                {/* La marca del equilibrio, siempre en el mismo lugar del ancho:
                                    así el corte no se mueve de un mes a otro y se compara a ojo. */}
                                <div className="absolute inset-y-0 w-0.5 bg-slate-900" style={{ left: `${CORTE}%` }} />
                            </div>
                            {/* 🔴 «facturás» y «equilibrio» iban en el MISMO renglón, uno anclado a
                                la izquierda y el otro a la marca del 70%. En un celular el ancho no
                                alcanza y se pisaban: se leía «facturás $ 640.0equilibrio»
                                (12-sep-2026). La etiqueta de la marca se queda bajo la marca; lo
                                que facturás baja a su propio renglón, que no choca con nada. */}
                            <div className="relative mt-1 h-4">
                                <span className="absolute text-[11px] font-semibold text-slate-900 -translate-x-1/2 whitespace-nowrap"
                                      style={{ left: `${CORTE}%` }}>
                                    equilibrio
                                </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                                facturás <strong className="text-slate-700">{plata(porMes)}</strong>
                            </div>
                        </div>
                        {/* El número que se repite en voz alta */}
                        <div className={`shrink-0 rounded-lg px-3 py-2 text-center ${enVerde ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            <div className="text-2xl font-black leading-none">{cumplido}%</div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5">del equilibrio</div>
                        </div>
                    </div>

                    <p className={`mt-4 text-sm font-medium ${enVerde ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {enVerde
                            ? `Estás arriba por ${plata(-faltan)} al mes.`
                            : `Te faltan ${plata(faltan)} al mes.`}
                    </p>

                    {/* Cómo se llega. Un taller no puede hacer aparecer clientes, pero
                        sí puede mover el ticket o el gasto: decirlo cambia qué hace el
                        lunes. Solo se sugiere lo que está al alcance. */}
                    {!enVerde && (
                        <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                            {puedeConOrdenes && (
                                <li>· <strong>{ordenesQueFaltan} órdenes más</strong> por mes, del ticket que ya tenés.</li>
                            )}
                            {puedeConTicket && (
                                <li>· o las mismas {Math.round(ordenesMes)} órdenes con el ticket en{' '}
                                    <strong>{plata(ticketNecesario)}</strong> en vez de {plata(r.ticketPromedio)}.</li>
                            )}
                            {!puedeConOrdenes && !puedeConTicket && (
                                <li>
                                    · La diferencia es grande para una sola palanca. Del otro lado:
                                    cada <strong>$100.000</strong> que bajes de gasto fijo son{' '}
                                    <strong>{plata(porCada100k)}</strong> menos que tenés que facturar.
                                </li>
                            )}
                        </ul>
                    )}
                    {!enVerde && r.zona === 'A' && (
                        <p className="mt-1 text-xs text-amber-700/90">
                            Y estás debajo del punto de caja: no alcanza ni para pagar los gastos del mes.
                        </p>
                    )}
                </div>

                {/* Los tres de apoyo, sin cajas: la caja ya es la tarjeta */}
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3 border-t pt-4">
                    <Dato
                        titulo={r.margenSeguridad > 0 ? 'Margen de seguridad' : 'Cuánto te falta'}
                        valor={r.margenSeguridad > 0 ? pct(r.margenSeguridad) : plata(faltan)}
                        pie={r.margenSeguridad > 0 ? 'puede caer la venta antes de que pierdas' : 'por mes, para no perder'}
                        alerta={r.margenSeguridad <= 0.1}
                    />
                    <Dato titulo="De cada $100 que entran" valor={plata(r.razon * 100)}
                        pie="quedan para pagar los gastos fijos" />
                    <Dato
                        titulo="La palanca"
                        valor={r.palanca ? `× ${r.palanca.toFixed(1).replace('.', ',')}` : '—'}
                        pie={r.palanca
                            ? 'por cada 1% más de venta, tu resultado sube eso'
                            : 'se calcula recién cuando el resultado da positivo'}
                    />
                </div>

                <ComoFunciona titulo="De dónde sale cada número">
                    <p>
                        <strong>Punto de equilibrio</strong>: tus gastos fijos divididos por lo que te
                        queda de cada peso que vendés. No se divide por el precio: se divide por la
                        contribución.
                    </p>
                    <p>
                        <strong>Lo que te queda de cada peso</strong> ({pct(r.razon)}): la mano de obra
                        contribuye casi entera —el sueldo del mecánico ya está en los gastos fijos— y de
                        los repuestos queda tu margen. Ojo que el {finanzas.markup_repuestos}% que le
                        ponés al costo es un margen del {pct(margenDesdeMarkup(finanzas.markup_repuestos))}
                        {' '}sobre la venta: no es el mismo número.
                    </p>
                    <p>
                        <strong>La palanca</strong> funciona en las dos direcciones: si la venta cae un
                        10%, el resultado cae {r.palanca ? (r.palanca * 10).toFixed(0) : '—'}%. Cuanto
                        más pesan tus gastos fijos, más larga es.
                    </p>
                    {(finanzas.amortizaciones || 0) > 0 ? (
                        <p>
                            <strong>Punto de caja</strong>: {plata(r.puntoDeCaja / meses)} por mes. Es el
                            mismo cálculo sacando lo que no se paga con plata. Por debajo de ahí no
                            alcanza ni para pagar los gastos del mes.
                        </p>
                    ) : (
                        <p>
                            <strong>Punto de caja</strong>: te da igual al de equilibrio porque cargaste 0
                            de amortizaciones, que es lo normal en un taller —las herramientas ya están
                            amortizadas—. Que coincidan no tranquiliza: quiere decir que no se junta nada
                            para el día que haya que reponer una máquina.
                        </p>
                    )}
                    <p>
                        La cuenta se hace sobre la venta sin IVA, porque ese IVA no es tuyo: lo juntás y
                        lo depositás. Y todo se muestra por mes, que es como se pagan los gastos fijos.
                    </p>
                </ComoFunciona>
            </CardContent>
        </Card>
    );
}

function Dato({ titulo, valor, pie, alerta }: { titulo: string; valor: string; pie: string; alerta?: boolean }) {
    return (
        <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</div>
            <div className={`text-xl font-bold mt-0.5 ${alerta ? 'text-amber-600' : 'text-slate-900'}`}>{valor}</div>
            <div className="text-[11px] text-muted-foreground leading-tight">{pie}</div>
        </div>
    );
}
