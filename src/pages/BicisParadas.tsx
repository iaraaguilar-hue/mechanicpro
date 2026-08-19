import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { tieneFeature } from '@/lib/planFeatures';
import {
    Bike, Phone, Ban, Sparkles, Lock, AlertTriangle, Loader2, Coins, RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// BICIS PARADAS (idea 15, paso 2): la bici que duerme en el local y los
// clientes de la base a los que les calza. MP no vende la bici: detecta al
// comprador — la venta la hace el mostrador.
//
// REGLAS DE HONESTIDAD, en píxeles y no en un doc:
// - La pantalla dice DE CUÁNDO es el dato de stock y que el ERP puede
//   sobre-reportar (ya pasó: 3 unidades de un talle que no estaba en la
//   percha). Sirve para decidir a quién llamar, no para prometer talles.
// - Dice a cuántos clientes dejó afuera el cruce y por qué (sin
//   disciplina inferible, sin talle cargado). No se disimula.
// - Cada match muestra EN QUÉ DATO se apoya (dato_usado, auditable).
//
// La generación gasta IA: corre solo cuando el dueño toca el botón, nunca
// al abrir la página. Los matches ya generados se leen de la tabla.
// ─────────────────────────────────────────────────────────────

interface Match {
    id: string;
    producto_id: string;
    cliente_id: string;
    producto_nombre: string;
    producto_talle: string | null;
    producto_disciplina: string | null;
    precio_snapshot: number | null;
    stock_snapshot: number | null;
    dias_sin_venta: number | null;
    argumento: string;
    dato_usado: string;
    estado: 'sugerido' | 'lo_llame' | 'no_aplica';
    created_at: string;
    clientes?: { nombre: string | null } | null;
}

interface Resumen {
    stock_actualizado_en: string | null;
    productos_con_stock: number | null;
    bicis_detectadas: number | null;
    bicis_paradas: number | null;
    clientes_total: number | null;
    clientes_con_disciplina: number | null;
    clientes_sin_disciplina: number | null;
    clientes_con_talle: number | null;
    dias_parada: number;
}

const plata = (n: number) =>
    n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

const fechaCorta = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : null;

export default function BicisParadas() {
    const taller = useAuthStore(s => s.taller);
    const rol = useAuthStore(s => s.rol);
    const [matches, setMatches] = useState<Match[] | null>(null);
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [stockFecha, setStockFecha] = useState<string | null>(null);
    const [generando, setGenerando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const [retorno, setRetorno] = useState<{ llamados: number; vendidas: number; monto: number } | null>(null);

    const esMecanico = rol?.toLowerCase()?.trim() === 'mecanico';
    const habilitado = tieneFeature(taller, 'bicis_paradas');
    const puedeVer = !esMecanico || taller?.bicis_paradas_ve_mecanico === true;

    const cargar = useCallback(async () => {
        const { data } = await supabase
            .from('matches_stock')
            .select('*, clientes(nombre)')
            .order('created_at', { ascending: false })
            .limit(300);
        setMatches((data as Match[]) ?? []);

        const { data: ret } = await supabase
            .from('retorno_matches_stock')
            .select('match_id, estado, vendida_despues, precio_snapshot');
        if (ret) {
            const llamados = ret.filter(r => r.estado === 'lo_llame').length;
            const vendidasFilas = ret.filter(r => r.vendida_despues);
            setRetorno({
                llamados,
                vendidas: vendidasFilas.length,
                monto: vendidasFilas.reduce((a, r) => a + (Number(r.precio_snapshot) || 0), 0),
            });
        }

        const { data: st } = await supabase
            .from('productos_taller')
            .select('stock_actualizado_en')
            .not('stock_actualizado_en', 'is', null)
            .order('stock_actualizado_en', { ascending: false })
            .limit(1);
        setStockFecha(st?.[0]?.stock_actualizado_en ?? null);
    }, []);

    useEffect(() => {
        if (habilitado && puedeVer) cargar();
    }, [habilitado, puedeVer, cargar]);

    // La generación gasta IA y tarda: botón explícito, con timeout visible.
    // Todo fallo SE DICE en pantalla (regla de la casa), nunca queda mudo.
    const generar = async () => {
        setGenerando(true);
        setAviso(null);
        try {
            const llamada = supabase.functions.invoke('cruce-stock', { body: {} });
            const timeout = new Promise<never>((_, rej) =>
                setTimeout(() => rej(new Error('timeout')), 120000));
            const { data, error } = await Promise.race([llamada, timeout]) as any;
            if (error) {
                let codigo = 'fallo';
                try { codigo = (await error?.context?.json?.())?.error ?? 'fallo'; } catch { /* no era JSON */ }
                if (codigo === 'plan_sin_ia') setAviso('El cruce con IA es de los planes Pro y Expert.');
                else if (codigo === 'rol_sin_acceso') setAviso('El administrador no habilitó esta vista para tu usuario.');
                else setAviso('No se pudo generar el cruce. Probá de nuevo en un rato.');
                return;
            }
            setResumen(data?.resumen ?? null);
            if (data?.motivo === 'sin_stock_cargado') {
                setAviso('No hay stock cargado: este panel necesita la integración con el ERP (o carga de stock) para saber qué bicis están paradas.');
            } else if (data?.motivo === 'sin_candidatos_nuevos') {
                setAviso('Sin candidatos nuevos: todas las bicis paradas ya tienen sus matches abajo, o no hay clientes que crucen con lo parado.');
            } else if (data?.matches_nuevos === 0) {
                setAviso('La IA no encontró un candidato con fundamento para las bicis paradas nuevas. Lista corta > lista inventada.');
            }
            await cargar();
        } catch (e: any) {
            setAviso(e?.message === 'timeout'
                ? 'El cruce tardó demasiado y se cortó a los 2 minutos. Probá de nuevo.'
                : 'No se pudo generar el cruce. Revisá la conexión y probá de nuevo.');
        } finally {
            setGenerando(false);
        }
    };

    const responder = async (m: Match, estado: 'lo_llame' | 'no_aplica') => {
        const { error } = await supabase
            .from('matches_stock')
            .update({ estado })
            .eq('id', m.id);
        if (error) {
            setAviso('No se pudo guardar la respuesta. Probá de nuevo.');
            return;
        }
        setMatches(prev => (prev ?? []).map(x => x.id === m.id ? { ...x, estado } : x));
        cargar();
    };

    // Agrupar por bici, la más cara primero. Los respondidos quedan abajo.
    const porBici = useMemo(() => {
        const grupos = new Map<string, Match[]>();
        for (const m of matches ?? []) {
            if (!grupos.has(m.producto_id)) grupos.set(m.producto_id, []);
            grupos.get(m.producto_id)!.push(m);
        }
        return [...grupos.values()].sort(
            (a, b) => (b[0].precio_snapshot ?? 0) - (a[0].precio_snapshot ?? 0));
    }, [matches]);

    if (!habilitado) {
        return (
            <Card><CardContent className="p-8 text-center">
                <Lock className="mx-auto mb-3 text-slate-400" size={28} />
                <h2 className="text-lg font-bold">Bicis paradas</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    El cruce de tu stock parado contra tu base de clientes es de los planes Pro y Expert:
                    te dice qué bici tenés durmiendo y a quién de tus clientes le calza.
                </p>
            </CardContent></Card>
        );
    }

    if (!puedeVer) {
        return (
            <Card><CardContent className="p-8 text-center">
                <Lock className="mx-auto mb-3 text-slate-400" size={28} />
                <p className="text-sm text-muted-foreground">
                    El administrador no habilitó esta vista para tu usuario.
                </p>
            </CardContent></Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Bike size={24} /> Bicis paradas
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Qué bici tenés durmiendo en el local, y a quién de tu base le calza.
                    </p>
                </div>
                <Button onClick={generar} disabled={generando}>
                    {generando
                        ? <><Loader2 className="animate-spin mr-2" size={16} /> Cruzando…</>
                        : <><Sparkles className="mr-2" size={16} /> Buscar candidatos</>}
                </Button>
            </div>

            {/* La letra chica que NO es chica: de cuándo es el dato y qué no es. */}
            <div className="text-xs text-muted-foreground bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-0.5">
                <div>
                    {stockFecha
                        ? <>Stock del ERP actualizado el <b>{fechaCorta(stockFecha)}</b>. El ERP puede sobre-reportar: <b>confirmá la percha antes de llamar</b> — esta lista es para decidir a quién llamar, no para prometer un talle.</>
                        : <>Todavía no hay stock cargado desde el ERP.</>}
                </div>
                {resumen && resumen.clientes_total !== null && (
                    <div>
                        Cruce: {resumen.bicis_paradas} bicis sin ventas hace {resumen.dias_parada}+ días ·
                        de tus {resumen.clientes_total} clientes, {resumen.clientes_con_disciplina} entran al cruce por la bici que ya tienen;
                        <b> {resumen.clientes_sin_disciplina} quedaron afuera</b> (no se les puede inferir disciplina) y
                        solo {resumen.clientes_con_talle} tienen talle cargado, así que el talle filtra poco todavía.
                    </div>
                )}
            </div>

            {aviso && (
                <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {aviso}
                </div>
            )}

            {retorno && retorno.llamados > 0 && (
                <Card><CardContent className="p-4 flex flex-wrap gap-6">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Phone size={12} /> Llamaste</div>
                        <div className="text-2xl font-bold">{retorno.llamados}</div>
                    </div>
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Coins size={12} /> Se vendieron después de llamar</div>
                        <div className="text-2xl font-bold text-emerald-600">{retorno.vendidas}{retorno.monto > 0 && <span className="text-base font-semibold ml-2">{plata(retorno.monto)}</span>}</div>
                        <div className="text-xs text-muted-foreground">Según la última venta que reporta el ERP. No sabemos si fue a ese cliente: sabemos que la bici parada se vendió después de la llamada.</div>
                    </div>
                </CardContent></Card>
            )}

            {matches !== null && matches.length === 0 && (
                <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Todavía no hay matches. Tocá <b>Buscar candidatos</b>: el sistema mira qué bicis
                    llevan {90}+ días sin venderse y busca en tu base a quién le calzan por disciplina,
                    talle (cuando está cargado) y gasto real.
                </CardContent></Card>
            )}

            {porBici.map(grupo => {
                const b = grupo[0];
                return (
                    <Card key={b.producto_id}>
                        <CardContent className="p-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 mb-3">
                                <div>
                                    <div className="font-bold">{b.producto_nombre}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {b.precio_snapshot != null && <>{plata(Number(b.precio_snapshot))} · </>}
                                        {b.stock_snapshot != null && <>stock {b.stock_snapshot} · </>}
                                        {b.dias_sin_venta != null && <>sin ventas hace {b.dias_sin_venta}+ días</>}
                                        {b.producto_talle && <> · talle {b.producto_talle}</>}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {grupo.map(m => (
                                    <div key={m.id} className={`rounded-lg border p-3 ${m.estado === 'no_aplica' ? 'opacity-50' : ''} ${m.estado === 'lo_llame' ? 'border-emerald-200 bg-emerald-50/50' : 'border-border'}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="font-semibold">{m.clientes?.nombre ?? 'Cliente'}</div>
                                            {m.estado === 'sugerido' ? (
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="outline" className="h-8" onClick={() => responder(m, 'lo_llame')}>
                                                        <Phone size={14} className="mr-1" /> Lo llamé
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => responder(m, 'no_aplica')}>
                                                        <Ban size={14} className="mr-1" /> No aplica
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-xs font-medium text-muted-foreground">
                                                    {m.estado === 'lo_llame' ? '✓ Llamado' : 'No aplica'}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm mt-1">{m.argumento}</p>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Se apoya en: {m.dato_usado}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}

            {matches !== null && matches.length > 0 && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <RefreshCw size={12} /> Los matches ya respondidos no se regeneran; los nuevos aparecen al volver a tocar Buscar candidatos.
                </div>
            )}
        </div>
    );
}
