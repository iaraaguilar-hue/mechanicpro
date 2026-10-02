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
// 🔴 2-oct-2026, Iara entró a Clientes y lo vio así: «se ve demasiado, es horrible,
// no puedo subir el menú desplegable, y cuando dice pendiente de confirmación no
// puedo apretar». Las tres cosas eran ciertas:
//   · el panel ocupaba la pantalla entera (nueve tarjetas, cada una con su frase de
//     ayuda repetida) antes de llegar a la lista de clientes;
//   · NO SE PODÍA PLEGAR: con una venta para confirmar quedaba abierto a la fuerza
//     (`abierto || aConfirmar.length > 0`), así que la flecha no hacía nada;
//   · la venta para confirmar no tenía botón: había que ir a cargarla por otro lado,
//     y después seguía ahí pidiendo confirmación para siempre.
// Ahora: una fila por venta para confirmar con «Cargar al dueño» (abre «Vendí una
// bici» con la bici y la fecha puestas, y al guardar la saca de la lista), las
// informativas plegadas detrás de una línea, y la flecha pliega todo y se acuerda.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useDataStore } from '@/store/dataStore';
import { Button } from '@/components/ui/button';
import { VentaDeMostrador } from '@/components/VentaDeMostrador';
import { ChevronDown, ChevronUp, UserPlus } from 'lucide-react';

type Venta = {
    id: string;
    comprobante_id: string;
    fecha_venta: string | null;
    resultado: 'a_revisar' | 'lejos' | 'mayorista' | 'generico' | string;
    detalle: string | null;
    comprador: string | null;
    bici_modelo: string | null;
    bici_talle: string | null;
};

/** Por qué NO se cargó cada una de las informativas. Una línea, sin tarea: no hay nada que hacer. */
const MOTIVO_INFO: Record<string, string> = {
    lejos: 'compró desde otra provincia',   // si el detalle trae la provincia, se dice cuál (motivoInfo)
    mayorista: 'venta a un negocio, varias bicis',
    generico: 'facturada a consumidor final',
};

// fecha_venta es un DÍA DE CALENDARIO (viene `date` del ERP): se parte a mano y no
// se convierte de zona, que lo correría un día.
const dia = (f: string | null) => (f ? f.split('-').reverse().slice(0, 2).join('/') : '');

const motivoInfo = (v: Venta) => {
    // «RODRIGO SERGIO ROLNY · Mendoza: fuera de donde atiende el taller» → «compró desde Mendoza»
    const prov = v.resultado === 'lejos' ? (v.detalle ?? '').match(/ · ([^:]+):/)?.[1]?.trim() : null;
    return prov ? `compró desde ${prov}` : (MOTIVO_INFO[v.resultado] ?? 'no se cargó');
};

// Lo de antes de « · » o «:» en el detalle que escribió el script: el nombre del comprador.
const quienDe = (v: Venta) => v.comprador || (v.detalle ?? '').split(/ · |:| \(CUIT/)[0].trim();

const LLAVE_PLEGADO = 'mp_ventas_sin_cargar_plegado';
const leerPlegado = () => { try { return localStorage.getItem(LLAVE_PLEGADO) === '1'; } catch { return false; } };
const guardarPlegado = (v: boolean) => { try { localStorage.setItem(LLAVE_PLEGADO, v ? '1' : '0'); } catch { /* sin almacenamiento: se pliega igual, no se recuerda */ } };

export function VentasSinCargar() {
    const [ventas, setVentas] = useState<Venta[]>([]);
    const [cargando, setCargando] = useState(true);
    const [plegado, setPlegado] = useState(leerPlegado);
    const [verInfo, setVerInfo] = useState(false);
    const [cargandoA, setCargandoA] = useState<Venta | null>(null);
    const [descartando, setDescartando] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const bicicletas = useDataStore(s => s.bicicletas);

    const cargar = useCallback(async () => {
        setCargando(true);
        const { data } = await supabase
            .from('altas_desde_erp')
            .select('id, comprobante_id, fecha_venta, resultado, detalle, comprador, bici_modelo, bici_talle')
            .in('resultado', ['a_revisar', 'lejos', 'mayorista', 'generico'])
            .order('fecha_venta', { ascending: false, nullsFirst: false })
            .limit(50);
        setVentas((data as Venta[]) ?? []);
        setCargando(false);
    }, []);

    useEffect(() => { void cargar(); }, [cargar]);

    // La marca no viene en el ERP: se toma de una bici del taller con el mismo modelo
    // («Sirrus», «Tarmac»). Si no hay ninguna, va vacía y la escribe el mecánico.
    const marcaPorModelo = useMemo(() => {
        const m = new Map<string, string>();
        for (const b of bicicletas) {
            const k = (b.modelo ?? '').trim().split(/\s+/)[0]?.toLowerCase();
            if (k && b.marca && !m.has(k)) m.set(k, b.marca);
        }
        return (modelo: string) => m.get(modelo.trim().split(/\s+/)[0]?.toLowerCase() ?? '') ?? '';
    }, [bicicletas]);

    const inicial = useMemo(() => cargandoA ? {
        modelo: cargandoA.bici_modelo ?? '',
        talle: cargandoA.bici_talle ?? '',
        marca: marcaPorModelo(cargandoA.bici_modelo ?? ''),
        fechaVenta: cargandoA.fecha_venta ?? undefined,
        facturadaA: quienDe(cargandoA),
    } : undefined, [cargandoA, marcaPorModelo]);

    // El taller que no vende bicis desde el ERP no tiene por qué ver una tarjeta
    // vacía en su pantalla de clientes todos los días.
    if (cargando || ventas.length === 0) return null;

    const aConfirmar = ventas.filter((v) => v.resultado === 'a_revisar');
    const informativas = ventas.filter((v) => v.resultado !== 'a_revisar');

    const resolver = async (v: Venta, resultado: 'confirmado' | 'descartado', ids?: { cliente_id: string; bicicleta_id: string }) => {
        setError(null);
        const { error: e } = await supabase.rpc('resolver_venta_sin_cargar', {
            p_id: v.id, p_resultado: resultado,
            p_cliente_id: ids?.cliente_id ?? null, p_bicicleta_id: ids?.bicicleta_id ?? null,
        });
        if (e) { setError(resultado === 'confirmado'
            ? 'La bici quedó cargada, pero no se pudo sacar de esta lista. Recargá la página.'
            : 'No se pudo sacar de la lista. Probá de nuevo.'); return; }
        setVentas((vs) => vs.filter((x) => x.id !== v.id));
    };

    const plegar = () => { setPlegado((p) => { guardarPlegado(!p); return !p; }); };

    return (
        <section data-ventas-sin-cargar className={`rounded-xl border bg-white ${aConfirmar.length ? 'border-amber-200' : 'border-slate-200'}`}>
            <button type="button" onClick={plegar} aria-expanded={!plegado}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    {aConfirmar.length > 0 ? 'Bicis vendidas para cargar' : 'Ventas que no se cargaron'}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${aConfirmar.length ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {aConfirmar.length || informativas.length}
                    </span>
                </span>
                {plegado ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />}
            </button>

            {!plegado && (
                <div className="border-t border-slate-100 px-4 pb-3">
                    {aConfirmar.length > 0 && (
                        <>
                            <p className="pt-2 text-xs text-muted-foreground">
                                Se facturaron a una empresa. Preguntá de quién es la bici y cargala con el dueño.
                            </p>
                            <ul className="divide-y divide-slate-100">
                                {aConfirmar.map((v) => (
                                    <li key={v.id} data-venta-a-confirmar className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                                        <div className="min-w-0">
                                            <p data-contenido className="text-sm font-medium text-slate-800">
                                                {v.bici_modelo || 'Bici'}{v.bici_talle ? ` · talle ${v.bici_talle}` : ''}
                                            </p>
                                            <p data-contenido className="text-xs text-muted-foreground">{quienDe(v)} · {dia(v.fecha_venta)}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {descartando === v.id ? (
                                                <>
                                                    <span className="text-xs text-slate-600">¿Sacarla de la lista?</span>
                                                    <Button size="sm" variant="ghost" className="h-8 hover:text-slate-900" onClick={() => setDescartando(null)}>No</Button>
                                                    <Button size="sm" variant="outline" className="h-8 hover:text-slate-900" onClick={() => { setDescartando(null); void resolver(v, 'descartado'); }}>Sí, sacarla</Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button size="sm" variant="ghost" className="h-8 text-slate-500 hover:text-slate-900" onClick={() => setDescartando(v.id)}>
                                                        No la cargo
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="h-8 border-amber-300 text-amber-900 hover:bg-amber-50 hover:text-amber-950" onClick={() => setCargandoA(v)}>
                                                        <UserPlus className="h-4 w-4" /> Cargar al dueño
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {informativas.length > 0 && (
                        <div className={aConfirmar.length ? 'border-t border-slate-100 pt-2' : 'pt-2'}>
                            <button type="button" onClick={() => setVerInfo((x) => !x)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                                {verInfo ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                {aConfirmar.length ? `Otras ${informativas.length} que no se cargaron, sin nada que hacer` : `Ver las ${informativas.length}: no hay nada que hacer`}
                            </button>
                            {verInfo && (
                                <ul className="mt-1.5 space-y-1">
                                    {informativas.map((v) => (
                                        <li key={v.id} data-contenido className="text-xs text-slate-600">
                                            <span className="tabular-nums text-slate-400">{dia(v.fecha_venta)}</span>{' '}
                                            {quienDe(v).replace(/^"|"$/g, '')} · {motivoInfo(v)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    {error && <p className="pt-2 text-xs text-red-600">{error}</p>}
                </div>
            )}

            <VentaDeMostrador
                open={!!cargandoA}
                inicial={inicial}
                onClose={() => setCargandoA(null)}
                onListo={(ids) => { if (cargandoA) void resolver(cargandoA, 'confirmado', ids); }}
            />
        </section>
    );
}
