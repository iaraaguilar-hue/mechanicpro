// ─────────────────────────────────────────────────────────────
// EL CRONÓMETRO DE TRABAJO — las pantallas (14-oct-2026, Pro Bike Salta).
//
// Todo es invisible si el admin no lo prendió (Configuración → Tu equipo) o el plan no lo
// incluye (`cronometroActivo`). El estado sale SIEMPRE de la base (`useCronometro`): al
// reabrir la app con un reloj andando, vuelve a leerse de ahí.
//
// Un mecánico tiene UN reloj andando; arrancar otra cosa pausa lo anterior y eso lo hace la
// base. Acá no hay un "pausar el anterior" que pueda divergir.
//
// Colores: el del taller NO se usa (en-mp-el-color-del-taller-va-en-una-sola-cosa). Los botones
// son pizarra; el verde es la señal de "hay un reloj andando".
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Play, Pause, Timer, Wrench, Hammer, Store, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useCronometro } from '@/store/cronometroStore';
import { cronometroActivo } from '@/lib/planFeatures';
import { formatOrdenNumber } from '@/lib/formatId';
import {
    hhmm, accionDeLaOrden, otrosConLaBici, fraseOtrosConLaBici, descripcionDelTrabajo,
    duracionDeTramo, duracionLarga, totalDelReloj, horaAR, diaCortoAR, NOMBRE_DE_TIPO,
    type TramoTrabajo, type TipoTrabajo,
} from '@/lib/cronometro';

/** Un "ahora" que se actualiza solo y es EL MISMO para todos los relojes de la pantalla (así la barra
 *  y el chip de una orden nunca se desfasan un minuto). Cada 10 s alcanza: se muestran horas y minutos. */
let ahoraComun = Date.now();
const oyentes = new Set<(t: number) => void>();
let reloj: ReturnType<typeof setInterval> | null = null;
function useAhora(_cadaMs = 10000) {
    const [ahora, setAhora] = useState(() => { if (!reloj) ahoraComun = Date.now(); return ahoraComun; });
    useEffect(() => {
        oyentes.add(setAhora);
        if (!reloj) reloj = setInterval(() => { ahoraComun = Date.now(); oyentes.forEach(f => f(ahoraComun)); }, 10000);
        return () => {
            oyentes.delete(setAhora);
            if (oyentes.size === 0 && reloj) { clearInterval(reloj); reloj = null; }
        };
    }, []);
    return ahora;
}

/** ¿Está prendido para este taller? + mi id. */
export function useCronometroActivo() {
    const taller = useAuthStore(s => s.taller);
    const miId = useAuthStore(s => s.session?.user?.id ?? null);
    return { activo: cronometroActivo(taller), miId };
}

/** Mi reloj andando (el único que puedo tener), o null. */
function useMiReloj() {
    const { miId } = useCronometroActivo();
    const andando = useCronometro(s => s.andando);
    return useMemo(() => andando.find(a => a.usuario_id === miId) ?? null, [andando, miId]);
}

// ── Botón de una orden ───────────────────────────────────────
export function BotonCronometro({ servicioId, variante = 'tarjeta' }: { servicioId: string; variante?: 'tarjeta' | 'fila' | 'modal' }) {
    const { activo, miId } = useCronometroActivo();
    const andando = useCronometro(s => s.andando);
    const acumulado = useCronometro(s => s.acumulado);
    const ocupado = useCronometro(s => s.ocupado);
    const arrancar = useCronometro(s => s.arrancar);
    const pausar = useCronometro(s => s.pausar);
    const ahora = useAhora();
    const [error, setError] = useState<string | null>(null);
    if (!activo || !miId) return null;

    const mio = andando.find(a => a.usuario_id === miId && a.servicio_id === servicioId);
    const base = acumulado[servicioId] || 0;
    const total = base + (mio ? Math.max(0, ahora - new Date(mio.inicio).getTime()) : 0);
    const accion = accionDeLaOrden(!!mio, base);
    const otros = fraseOtrosConLaBici(otrosConLaBici(andando, servicioId, miId));

    const tocar = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setError(null);
        const r = mio ? await pausar(miId) : await arrancar(miId, { servicioId, tipo: 'orden' });
        if (!r.ok) setError(r.mensaje || 'No se pudo hacer.');
    };

    const chico = variante === 'fila';
    // Jerarquía (15-oct): Empezar/Seguir es secundario (contorno, como Reabrir); lo que resalta es el
    // reloj andando, con el verde que ya era la señal de "hay un reloj". Ningún color del taller.
    return (
        <div
            data-cronometro={servicioId}
            data-andando={mio ? 'si' : 'no'}
            className={`flex flex-col gap-1 ${mio && !chico ? 'rounded-xl bg-emerald-50 p-1.5 ring-1 ring-emerald-300' : ''}`}
            onClick={e => e.stopPropagation()}
        >
            <div className={chico ? 'flex flex-col items-start gap-1' : 'flex items-center gap-2'}>
                <button
                    type="button"
                    onClick={tocar}
                    disabled={ocupado}
                    aria-label={`${accion} el reloj en esta orden`}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold transition-colors disabled:opacity-60 ${chico ? 'h-8 px-2.5 text-xs' : 'h-11 px-4 text-sm'} ${mio
                        ? 'border-emerald-600 bg-white font-bold text-emerald-800 hover:bg-emerald-100 active:bg-emerald-100'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-100'}`}
                >
                    {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : mio ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {accion}
                </button>
                {(mio || base > 0) && (
                    <span
                        data-cronometro-tiempo
                        title={mio ? 'Tu reloj en esta orden, andando' : 'Tu tiempo en esta orden'}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${chico ? '' : 'h-8'} ${mio
                            ? 'border-emerald-700 bg-emerald-600 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                    >
                        <Timer className="h-3 w-3" /> {hhmm(total)}
                    </span>
                )}
            </div>
            {otros && <p data-cronometro-otros className="text-[11px] leading-snug text-slate-500">{otros}</p>}
            {error && <p role="alert" className="text-[11px] font-medium leading-snug text-red-600">{error}</p>}
        </div>
    );
}

// ── Indicador fijo del reloj propio + el que lee la base ─────
export function IndicadorCronometro() {
    const { activo, miId } = useCronometroActivo();
    const refrescar = useCronometro(s => s.refrescar);
    const limpiar = useCronometro(s => s.limpiar);
    const pausar = useCronometro(s => s.pausar);
    const ocupado = useCronometro(s => s.ocupado);
    const mio = useMiReloj();
    const acumulado = useCronometro(s => s.acumulado);
    const libreHoy = useCronometro(s => s.libreHoy);
    const servicios = useDataStore(s => s.servicios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const ahora = useAhora();
    const [error, setError] = useState<string | null>(null);

    // La base manda: se lee al abrir, cada 20 s y al volver a la pestaña.
    useEffect(() => {
        if (!activo || !miId) { limpiar(); return; }
        void refrescar(miId);
        const id = setInterval(() => { if (document.visibilityState === 'visible') void refrescar(miId); }, 20000);
        const alVolver = () => { if (document.visibilityState === 'visible') void refrescar(miId); };
        document.addEventListener('visibilitychange', alVolver);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
    }, [activo, miId, refrescar, limpiar]);

    // Finalizar una orden corta el reloj en la base: si la orden de mi reloj quedó cerrada, se relee ya.
    const ordenDeMiReloj = mio?.servicio_id ? servicios.find(s => s.id === mio.servicio_id) : undefined;
    const cerrada = !!ordenDeMiReloj && ['ready', 'delivered', 'completed', 'finalizado', 'entregado'].includes((ordenDeMiReloj.estado || '').toLowerCase());
    useEffect(() => { if (cerrada && miId) void refrescar(miId); }, [cerrada, miId, refrescar]);

    if (!activo || !miId || !mio) return null;

    const bici = ordenDeMiReloj ? bicicletas.find(b => b.id === ordenDeMiReloj.bicicleta_id) : undefined;
    const descripcion = descripcionDelTrabajo(mio, ordenDeMiReloj ? {
        numero: formatOrdenNumber(ordenDeMiReloj.numero_orden ?? undefined, ordenDeMiReloj.id),
        bici: [bici?.marca, bici?.modelo].filter(Boolean).join(' '),
    } : null);

    return (
        <div
            data-indicador-cronometro
            role="status"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-slate-900 px-4 pt-3 text-white shadow-[0_-4px_16px_rgba(0,0,0,0.18)] md:inset-x-auto md:bottom-6 md:right-6 md:w-auto md:max-w-lg md:rounded-xl md:border md:py-3"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
            <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <p className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm">
                    <span className="min-w-0 truncate">
                        <span className="text-slate-300">Estás con: </span>
                        <span className="font-semibold">{descripcion}</span>
                    </span>
                    <span data-indicador-tiempo className="shrink-0 font-bold tabular-nums">{hhmm(totalDelReloj(mio, acumulado, libreHoy, ahora))}</span>
                </p>
                <button
                    type="button"
                    disabled={ocupado}
                    onClick={async () => { setError(null); const r = await pausar(miId); if (!r.ok) setError(r.mensaje || 'No se pudo pausar.'); }}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-200 active:bg-slate-200 disabled:opacity-60"
                >
                    {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Pausar
                </button>
            </div>
            {error && <p role="alert" className="mt-1 text-xs font-medium text-red-300">{error}</p>}
        </div>
    );
}

// ── "Otro trabajo": lo que no tiene orden ────────────────────
const TIPOS_LIBRES: { tipo: Exclude<TipoTrabajo, 'orden'>; icono: typeof Wrench; ayuda: string }[] = [
    { tipo: 'armado', icono: Hammer, ayuda: 'Una bici nueva que se arma para vender' },
    { tipo: 'mostrador', icono: Store, ayuda: 'Atender gente, vender, cobrar' },
    { tipo: 'otro', icono: Wrench, ayuda: 'Cualquier otra cosa sin orden' },
];

export function OtroTrabajo() {
    const { activo, miId } = useCronometroActivo();
    const arrancar = useCronometro(s => s.arrancar);
    const ocupado = useCronometro(s => s.ocupado);
    const mio = useMiReloj();
    const [abierto, setAbierto] = useState(false);
    const [tipo, setTipo] = useState<Exclude<TipoTrabajo, 'orden'>>('armado');
    const [detalle, setDetalle] = useState('');
    const [error, setError] = useState<string | null>(null);
    if (!activo || !miId) return null;

    const empezar = async () => {
        setError(null);
        const r = await arrancar(miId, { tipo, detalle });
        if (!r.ok) { setError(r.mensaje || 'No se pudo empezar.'); return; }
        setAbierto(false); setDetalle('');
    };

    return (
        <>
            <div data-otro-trabajo className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Tu reloj</p>
                    <p className="text-xs text-muted-foreground">
                        {mio ? 'Está andando abajo. Para lo que no tiene orden, usá Otro trabajo.' : 'Empezalo en cada bici, o con Otro trabajo si no tiene orden (armado, mostrador).'}
                    </p>
                </div>
                <Button variant="outline" className="h-10 gap-2" onClick={() => { setError(null); setAbierto(true); }}>
                    <Plus className="h-4 w-4" /> Otro trabajo
                </Button>
            </div>
            <Dialog open={abierto} onOpenChange={setAbierto}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Otro trabajo</DialogTitle>
                        <DialogDescription>
                            Si tenías un reloj andando, se pausa solo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2" role="radiogroup" aria-label="Qué trabajo es">
                        {TIPOS_LIBRES.map(({ tipo: t, icono: Icono, ayuda }) => (
                            <button
                                key={t}
                                type="button"
                                role="radio"
                                aria-checked={tipo === t}
                                onClick={() => setTipo(t)}
                                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${tipo === t ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}
                            >
                                <Icono className="h-5 w-5 shrink-0 text-slate-600" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-slate-900">{NOMBRE_DE_TIPO[t]}</span>
                                    <span className="block text-xs text-muted-foreground">{ayuda}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                    <div>
                        <label htmlFor="crono-detalle" className="mb-1 block text-xs font-semibold text-slate-600">Detalle (opcional)</label>
                        <Input
                            id="crono-detalle"
                            value={detalle}
                            maxLength={120}
                            onChange={e => setDetalle(e.target.value)}
                            placeholder={tipo === 'armado' ? 'Ej: Specialized Allez 2026' : 'Ej: limpiar el local'}
                        />
                    </div>
                    {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
                    <Button className="h-11 w-full gap-2 bg-slate-900 text-white hover:bg-slate-800" onClick={empezar} disabled={ocupado}>
                        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Empezar
                    </Button>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ── Para el admin: los tramos de una orden (solo lectura) ────
export function TramosDeLaOrden({ servicioId }: { servicioId: string }) {
    const [tramos, setTramos] = useState<TramoTrabajo[] | null>(null);
    const [fallo, setFallo] = useState(false);
    const ahora = useAhora(30000);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const { data, error } = await supabase.from('tiempos_trabajo').select('*').eq('servicio_id', servicioId).order('inicio', { ascending: true });
            if (!vivo) return;
            if (error) setFallo(true); else setTramos((data as TramoTrabajo[]) || []);
        })();
        return () => { vivo = false; };
    }, [servicioId]);

    const total = (tramos || []).reduce((s, t) => s + duracionDeTramo(t, ahora), 0);
    return (
        <div data-tramos-orden className="rounded-lg border bg-white">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tiempos de esta orden</p>
                {tramos && tramos.length > 0 && <p className="text-xs font-semibold tabular-nums text-slate-700">Total {duracionLarga(total)}</p>}
            </div>
            {fallo && <p className="px-3 py-3 text-xs text-red-600">No se pudieron leer los tiempos. Probá de nuevo en un momento.</p>}
            {!fallo && tramos === null && <p className="px-3 py-3 text-xs text-muted-foreground">Cargando…</p>}
            {tramos && tramos.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Todavía nadie cronometró esta orden.</p>}
            {tramos && tramos.length > 0 && (
                <ul className="divide-y">
                    {tramos.map(t => (
                        <li key={t.id} data-tramo className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.usuario_nombre || 'Alguien'}</span>
                            <span className="tabular-nums text-xs text-slate-600">
                                {diaCortoAR(t.inicio)} · {horaAR(t.inicio)} a {t.fin ? horaAR(t.fin) : 'ahora'}
                            </span>
                            <span className="w-24 text-right text-xs font-semibold tabular-nums text-slate-800">{duracionLarga(duracionDeTramo(t, ahora))}</span>
                            <span className="flex gap-1">
                                {!t.fin && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">andando</span>}
                                {t.cerrado_solo && <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">se cortó solo</span>}
                                {t.corregido_at && <span title={`Lo marcó el administrador el ${diaCortoAR(t.corregido_at)}`} className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">corregido</span>}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** Lo que va adentro de la orden (ServiceModal): el botón para todos, y los tramos para el admin. */
export function CronometroEnLaOrden({ servicioId }: { servicioId: string }) {
    const { activo } = useCronometroActivo();
    const rol = useAuthStore(s => s.rol);
    const estado = useDataStore(s => s.servicios.find(sv => sv.id === servicioId)?.estado);
    if (!activo) return null;
    const esAdmin = rol?.toLowerCase()?.trim() === 'admin';
    const cerrada = ['ready', 'delivered', 'completed', 'finalizado', 'entregado'].includes((estado || '').toLowerCase());
    return (
        <div className="space-y-3">
            {!cerrada && <BotonCronometro servicioId={servicioId} variante="modal" />}
            {esAdmin && <TramosDeLaOrden servicioId={servicioId} />}
        </div>
    );
}
