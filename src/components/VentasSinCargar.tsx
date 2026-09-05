// ─────────────────────────────────────────────────────────────
// LAS BICIS QUE SE VENDIERON Y NO ENTRARON SOLAS.
//
// Cuando el local factura una bici, el alta automática la carga leyéndola del
// ERP. Pero hay ventas que a propósito NO se cargan, y hasta hoy quedaban
// anotadas en una tabla que **no se mostraba en ninguna pantalla**. La pantalla
// de Configuración le prometía al taller, textual, que la venta "se anota para
// que preguntes de quién es la bici" — y no había dónde leerlo. Una promesa sin
// superficie es una mentira con buena intención.
//
// EL CASO QUE PIDIÓ IARA (5-sep-2026), textual: *"con el tema de las bicis
// vendidas que están a nombre de una empresa quiero que aparezca en Mechanic Pro
// algo que diga tipo «pendiente de confirmación de cliente»"*. Es el caso
// `a_revisar`: una sola bici facturada a un CUIT de empresa. Mucha gente factura
// SU bicicleta a SU empresa para descargar IVA y sí es cliente del taller; lo que
// no lo es, es la S.A. que se lleva tres. Por eso no se crea un cliente con el
// nombre de la empresa: se pregunta.
//
// 🔴 SE MUESTRAN LOS CUATRO MOTIVOS, no solo ese. Los otros tres (de otra
// provincia, mayorista, "consumidor final") también son ventas que el taller
// nunca vio, y esconderlas dejaría la misma promesa a medio cumplir.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, HelpCircle, MapPin, Building2, UserX, ChevronDown, ChevronUp } from 'lucide-react';

type Venta = {
    id: string;
    comprobante_id: string;
    fecha_venta: string | null;
    resultado: 'a_revisar' | 'lejos' | 'mayorista' | 'generico' | string;
    detalle: string | null;
};

/**
 * Cómo se llama cada motivo en la pantalla, y qué tiene que hacer el taller.
 *
 * El de `a_revisar` lleva las palabras exactas que pidió Iara. Los otros tres
 * dicen que NO hay nada que hacer, que es tan importante como decir que sí: una
 * lista donde todo parece pendiente se deja de mirar a la semana.
 */
const MOTIVOS: Record<string, { titulo: string; queHacer: string; Icono: typeof HelpCircle; clase: string; accionable: boolean }> = {
    a_revisar: {
        titulo: 'Pendiente de confirmación de cliente',
        queHacer: 'La factura salió a nombre de una empresa. Preguntale de quién es la bici y cargala vos con el dueño real.',
        Icono: HelpCircle,
        clase: 'bg-amber-50 text-amber-800 border-amber-200',
        accionable: true,
    },
    lejos: {
        titulo: 'Compró de otra provincia',
        queHacer: 'No se cargó porque no va a traerte la bici. Si igual la atendés, cargala a mano.',
        Icono: MapPin,
        clase: 'bg-slate-100 text-slate-600 border-slate-200',
        accionable: false,
    },
    mayorista: {
        titulo: 'Venta a un negocio',
        queHacer: 'Varias bicis en la misma factura. No es un ciclista, así que no se cargó.',
        Icono: Building2,
        clase: 'bg-slate-100 text-slate-600 border-slate-200',
        accionable: false,
    },
    generico: {
        titulo: 'Facturada a consumidor final',
        queHacer: 'La factura no tiene un nombre real, así que no hay a quién cargar. Si sabés quién es, cargalo a mano.',
        Icono: UserX,
        clase: 'bg-slate-100 text-slate-600 border-slate-200',
        accionable: false,
    },
};

export function VentasSinCargar() {
    const [ventas, setVentas] = useState<Venta[]>([]);
    const [cargando, setCargando] = useState(true);
    const [abierto, setAbierto] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        const { data } = await supabase
            .from('altas_desde_erp')
            .select('id, comprobante_id, fecha_venta, resultado, detalle')
            .in('resultado', ['a_revisar', 'lejos', 'mayorista', 'generico'])
            .order('fecha_venta', { ascending: false, nullsFirst: false })
            .limit(50);
        setVentas((data as Venta[]) ?? []);
        setCargando(false);
    }, []);

    useEffect(() => { void cargar(); }, [cargar]);

    // El taller que no vende bicis desde el ERP no tiene por qué ver una tarjeta
    // vacía en su pantalla de clientes todos los días.
    if (cargando || ventas.length === 0) return null;

    const aConfirmar = ventas.filter((v) => v.resultado === 'a_revisar');
    // Se abre sola SOLO si hay algo que hacer. Las informativas no interrumpen.
    const desplegado = abierto || aConfirmar.length > 0;
    const aMostrar = desplegado ? ventas : [];

    return (
        <Card className="border-amber-200">
            <CardHeader className="pb-3">
                <button
                    type="button"
                    className="flex items-center justify-between gap-3 w-full text-left"
                    onClick={() => setAbierto((v) => !v)}
                >
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            Bicis vendidas que no entraron solas
                            {aConfirmar.length > 0 && (
                                <span className="text-xs bg-amber-500 text-white rounded-full px-2 py-0.5">
                                    {aConfirmar.length} para confirmar
                                </span>
                            )}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                            {ventas.length} {ventas.length === 1 ? 'venta' : 'ventas'} de tu sistema de facturación
                            que no se cargaron como cliente, y por qué.
                        </p>
                    </div>
                    {desplegado ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
                </button>
            </CardHeader>

            {desplegado && (
                <CardContent className="space-y-2">
                    {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
                    {aMostrar.map((v) => {
                        const m = MOTIVOS[v.resultado] ?? MOTIVOS.generico;
                        return (
                            <div
                                key={v.id}
                                className={`p-3 rounded-lg border ${m.accionable ? 'bg-white border-amber-200' : 'bg-slate-50/60 border-slate-200'}`}
                            >
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${m.clase}`}>
                                        <m.Icono className="h-3 w-3" /> {m.titulo}
                                    </span>
                                    {v.fecha_venta && (
                                        <span className="text-[11px] text-muted-foreground">
                                            {/* fecha_venta es un DÍA DE CALENDARIO (viene `date` del
                                                ERP), así que se parte a mano y no se convierte de zona:
                                                pasarlo por una conversión de instante lo corre un día. */}
                                            {v.fecha_venta.split('-').reverse().join('/')}
                                        </span>
                                    )}
                                </div>
                                {/* El detalle lo escribió el script con los datos del ERP: quién
                                    compró, qué bici y con qué documento. Va tal cual. */}
                                {v.detalle && <p className="text-sm text-slate-700 mt-1.5">{v.detalle}</p>}
                                <p className="text-xs text-muted-foreground mt-1">{m.queHacer}</p>
                            </div>
                        );
                    })}
                </CardContent>
            )}
        </Card>
    );
}
