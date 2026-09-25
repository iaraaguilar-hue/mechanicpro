// ─────────────────────────────────────────────────────────────
// TURNOS — el cuaderno del taller, en la app (25-sep-2026).
//
// Pedido de Juan Otero (Private Garage Workshop, Tandil), en la llamada con
// Iara: *"yo tengo un calendario mío escrito, puño y letra"*. Da los turnos
// él, por WhatsApp, y no quiere que el cliente se reserve solo (lo probó en
// otra app y no le servía: *"el único que tiene en la cabeza cómo viene la
// semana soy yo"*). Y se guarda días enteros para lo atrasado o para armar
// el pedido de la bicicletería, aunque no tenga turnos dados.
//
// Por eso la pantalla es la SEMANA a la vista, con dos cosas: el turno de un
// cliente y el tiempo reservado. Cuando el cliente llega, su turno abre la
// orden con la bici ya elegida.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useDataStore, type SupabaseClient, type SupabaseBike } from '@/store/dataStore';
import { tieneFeature, turnosActivos } from '@/lib/planFeatures';
import { hoyAR } from '@/lib/mantenimiento';
import { horaCorta } from '@/lib/fechaAR';
import { soloNumeros } from '@/lib/telefonoAR';
import {
    lunesDe, sumarDias, diasDeLaSemana, etiquetaDia, diaEnPalabras, rangoDeLaSemana,
    ordenarDelDia, diaReservado, turnosEnPie, cuantosTurnos, type Turno,
} from '@/lib/turnos';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ComoFunciona } from '@/components/ComoFunciona';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TelefonoCopiable } from '@/components/TelefonoCopiable';
import { TurnoDialog } from '@/components/TurnoDialog';
import { ServiceModal } from '@/components/ServiceModal';
import {
    CalendarDays, ChevronLeft, ChevronRight, Plus, Lock, Loader2, Check, X,
    UserX, Pencil, Wrench, MessageCircle, Undo2, Unlock,
} from 'lucide-react';

type Orden = { turno: Turno; cliente: SupabaseClient; bici: SupabaseBike | null };

export default function Turnos() {
    const taller = useAuthStore(s => s.taller);
    const taller_id = useAuthStore(s => s.taller_id);
    const clientes = useDataStore(s => s.clientes);
    const bicicletas = useDataStore(s => s.bicicletas);
    const createCliente = useDataStore(s => s.createCliente);

    const hoy = hoyAR();
    const [lunes, setLunes] = useState(() => lunesDe(hoyAR()));
    const [turnos, setTurnos] = useState<Turno[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const [form, setForm] = useState<Partial<Turno> | null>(null);   // el formulario abierto (nuevo o editar)
    const [abierto, setAbierto] = useState<Turno | null>(null);      // el turno que se tocó
    const [confirmar, setConfirmar] = useState<{ turno: Turno; que: 'cancelar' | 'liberar' } | null>(null);
    const [orden, setOrden] = useState<Orden | null>(null);
    const [trabajando, setTrabajando] = useState(false);

    const cargar = useCallback(async () => {
        if (!taller_id) return;
        setCargando(true);
        setError(null);
        const { data, error: e } = await supabase.from('turnos').select('*')
            .eq('taller_id', taller_id)
            .gte('fecha', lunes).lte('fecha', sumarDias(lunes, 6))
            .neq('estado', 'cancelado');
        if (e) setError(e.message);
        else setTurnos((data ?? []) as Turno[]);
        setCargando(false);
    }, [taller_id, lunes]);

    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        if (!aviso) return;
        const t = setTimeout(() => setAviso(null), 5000);
        return () => clearTimeout(t);
    }, [aviso]);

    const porDia = useMemo(() => {
        const m = new Map<string, Turno[]>();
        for (const t of turnos) m.set(t.fecha, [...(m.get(t.fecha) ?? []), t]);
        for (const [k, v] of m) m.set(k, ordenarDelDia(v));
        return m;
    }, [turnos]);

    // El domingo aparece solo si tiene algo: casi ningún taller abre, y una columna vacía le roba lugar a las otras seis.
    const dias = useMemo(() => {
        const todos = diasDeLaSemana(lunes);
        return (porDia.get(todos[6])?.length ?? 0) > 0 ? todos : todos.slice(0, 6);
    }, [lunes, porDia]);

    if (!tieneFeature(taller, 'turnos')) {
        return (
            <Card><CardContent className="p-8 text-center">
                <Lock className="mx-auto mb-3 text-slate-500" size={28} />
                <h2 className="text-lg font-bold">Turnos</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    El calendario de turnos es de los planes Pro y Expert.
                </p>
            </CardContent></Card>
        );
    }
    if (!turnosActivos(taller)) {
        return (
            <Card><CardContent className="p-8 text-center space-y-3">
                <CalendarDays className="mx-auto text-slate-500" size={28} />
                <h2 className="text-lg font-bold">Turnos</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    El calendario está apagado en este taller. Se prende en Configuración, pestaña Preferencias.
                </p>
                <Link to="/configuracion"><Button variant="outline" className="hover:text-slate-900">Ir a Configuración</Button></Link>
            </CardContent></Card>
        );
    }

    const reemplazar = (t: Turno) => setTurnos(prev => {
        const sin = prev.filter(x => x.id !== t.id);
        // Si lo movieron a otra semana o lo cancelaron, sale de esta vista.
        const enLaSemana = t.fecha >= lunes && t.fecha <= sumarDias(lunes, 6) && t.estado !== 'cancelado';
        return enLaSemana ? [...sin, t] : sin;
    });

    const cambiarEstado = async (t: Turno, estado: Turno['estado'], texto: string) => {
        setTrabajando(true);
        const { data, error: e } = await supabase.from('turnos')
            .update({ estado, actualizado_at: new Date().toISOString() })
            .eq('id', t.id).select().single();
        setTrabajando(false);
        if (e) { setAviso('No se pudo guardar: ' + e.message); return; }
        reemplazar(data as Turno);
        setAbierto(null);
        setAviso(texto);
    };

    const liberar = async (t: Turno) => {
        setTrabajando(true);
        const { error: e } = await supabase.from('turnos').delete().eq('id', t.id);
        setTrabajando(false);
        if (e) { setAviso('No se pudo borrar: ' + e.message); return; }
        setTurnos(prev => prev.filter(x => x.id !== t.id));
        setAbierto(null);
        setAviso('Listo, ese tiempo quedó libre.');
    };

    // El cliente llegó: se abre la orden con él y su bici. Si todavía no estaba en la
    // base, se busca por teléfono antes de crearlo (mismo celular = misma persona).
    const llego = async (t: Turno) => {
        if (!taller_id) return;
        setTrabajando(true);
        try {
            let cliente = t.cliente_id ? clientes.find(c => c.id === t.cliente_id) ?? null : null;
            if (!cliente) {
                const cola = soloNumeros(t.telefono).slice(-8);
                if (cola.length === 8) {
                    cliente = clientes.find(c => !c.eliminado_en && soloNumeros(c.telefono).slice(-8) === cola) ?? null;
                }
                if (!cliente) {
                    cliente = await createCliente({ taller_id, nombre: (t.nombre ?? '').trim(), telefono: t.telefono?.trim() || undefined });
                }
                const { data } = await supabase.from('turnos').update({ cliente_id: cliente.id }).eq('id', t.id).select().single();
                if (data) reemplazar(data as Turno);
            }
            const bici = t.bicicleta_id ? bicicletas.find(b => b.id === t.bicicleta_id) ?? null : null;
            setAbierto(null);
            setOrden({ turno: t, cliente, bici });
        } catch (e: any) {
            setAviso('No se pudo abrir la orden: ' + (e?.message ?? 'error desconocido'));
        } finally {
            setTrabajando(false);
        }
    };

    const quien = (t: Turno) => clientes.find(c => c.id === t.cliente_id)?.nombre ?? t.nombre ?? 'Sin nombre';
    const bici = (t: Turno) => {
        const b = bicicletas.find(x => x.id === t.bicicleta_id);
        return b ? [b.marca, b.modelo].filter(Boolean).join(' ') : null;
    };
    const telefono = (t: Turno) => clientes.find(c => c.id === t.cliente_id)?.telefono ?? t.telefono;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <CalendarDays size={24} /> Turnos
                    </h1>
                    <ComoFunciona>
                        <p>
                            Los turnos los das vos: el cliente no puede reservarse uno solo. Anotalos acá
                            con el día, y la hora si quedaron en una.
                        </p>
                        <p>
                            Cuando el cliente llega, tocá su turno y después <strong>Llegó</strong>: se abre la
                            orden con su bici ya elegida. Si no estaba cargado como cliente, se carga ahí.
                        </p>
                        <p>
                            El <strong>tiempo reservado</strong> es para los días que te guardás aunque no
                            tengas turnos: lo atrasado, un pedido de bicis para armar. Sin hora, toma el día entero.
                        </p>
                    </ComoFunciona>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setForm({ tipo: 'reservado', fecha: hoy >= lunes && hoy <= sumarDias(lunes, 6) ? hoy : lunes })} className="hover:text-slate-900">
                        <Lock className="mr-2" size={16} /> Reservar tiempo
                    </Button>
                    <Button onClick={() => setForm({ tipo: 'turno', fecha: hoy >= lunes && hoy <= sumarDias(lunes, 6) ? hoy : lunes })}>
                        <Plus className="mr-2" size={16} /> Nuevo turno
                    </Button>
                </div>
            </div>

            {/* ── La semana ── */}
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setLunes(sumarDias(lunes, -7))} aria-label="Semana anterior" className="hover:text-slate-900">
                    <ChevronLeft size={18} />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setLunes(sumarDias(lunes, 7))} aria-label="Semana siguiente" className="hover:text-slate-900">
                    <ChevronRight size={18} />
                </Button>
                <h2 className="text-base font-semibold text-slate-900 ml-1">{rangoDeLaSemana(lunes)}</h2>
                {lunes !== lunesDe(hoy) && (
                    <Button variant="ghost" size="sm" onClick={() => setLunes(lunesDe(hoy))} className="text-slate-600 hover:text-slate-900">
                        Volver a esta semana
                    </Button>
                )}
                {cargando && <Loader2 className="animate-spin text-slate-400" size={16} />}
            </div>

            {error && (
                <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    No se pudieron traer los turnos ({error}).
                    <Button size="sm" variant="outline" onClick={cargar} className="hover:text-slate-900">Reintentar</Button>
                </div>
            )}

            <div className={`grid grid-cols-1 gap-3 ${dias.length === 7 ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`}>
                {dias.map(dia => {
                    const delDia = porDia.get(dia) ?? [];
                    const reservadoEntero = diaReservado(delDia);
                    const enPie = turnosEnPie(delDia);
                    const et = etiquetaDia(dia);
                    const esHoy = dia === hoy;
                    const pasado = dia < hoy;
                    return (
                        <section
                            key={dia}
                            data-dia={dia}
                            className={`flex flex-col rounded-lg border bg-white ${esHoy ? 'border-slate-900' : 'border-slate-200'} ${pasado ? 'opacity-70' : ''}`}
                        >
                            <header className={`flex items-center justify-between gap-2 border-slate-100 px-3 py-2 ${delDia.length ? 'border-b' : 'lg:border-b'}`}>
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-[11px] font-semibold tracking-wider text-slate-500">{et.corto}</span>
                                    <span className="text-lg font-bold leading-none text-slate-900">{et.numero}</span>
                                    {esHoy && <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">HOY</span>}
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-[11px] text-slate-500">
                                        {reservadoEntero ? 'Reservado' : enPie.length ? cuantosTurnos(enPie.length) : 'Libre'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setForm({ tipo: 'turno', fecha: dia })}
                                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                                        aria-label={`Agregar un turno el ${diaEnPalabras(dia)}`}
                                        title="Agregar un turno"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </header>
                            {/* En el celular un día libre es una línea: seis cajas vacías empujan los turnos fuera de la pantalla. */}
                            <div className={`flex-1 flex-col gap-1.5 p-2 lg:min-h-[3rem] ${delDia.length ? 'flex' : 'hidden lg:flex'}`}>
                                {delDia.map(t => (
                                    <TarjetaTurno key={t.id} turno={t} quien={quien(t)} bici={bici(t)} onClick={() => setAbierto(t)} />
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>

            {aviso && (
                <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
                    {aviso}
                </div>
            )}

            {/* ── El turno que se tocó ── */}
            <Dialog open={!!abierto} onOpenChange={v => { if (!v) setAbierto(null); }}>
                <DialogContent className="max-w-md">
                    {abierto && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {abierto.tipo === 'reservado'
                                        ? <><Lock className="h-5 w-5 text-slate-500" /> Tiempo reservado</>
                                        : quien(abierto)}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-1.5 text-sm text-slate-700">
                                <p className="font-medium text-slate-900">
                                    {diaEnPalabras(abierto.fecha)}
                                    {abierto.hora ? `${abierto.tipo === 'reservado' ? ' desde las' : ' a las'} ${horaCorta(abierto.hora)}` : abierto.tipo === 'reservado' ? ', todo el día' : ', sin hora'}
                                </p>
                                {bici(abierto) && <p>{bici(abierto)}</p>}
                                {abierto.trabajo && <p>{abierto.trabajo}</p>}
                                {abierto.nota && <p className="text-slate-500">{abierto.nota}</p>}
                                {abierto.tipo === 'turno' && <TelefonoCopiable telefono={telefono(abierto)} />}
                                {abierto.evidencia && (
                                    <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                        <MessageCircle className="mr-1 inline h-3.5 w-3.5" /> Leído del WhatsApp: <span className="italic">"{abierto.evidencia}"</span>
                                    </p>
                                )}
                                <EstadoTexto turno={abierto} />
                            </div>
                            <AccionesDelTurno
                                turno={abierto}
                                trabajando={trabajando}
                                onLlego={() => llego(abierto)}
                                onConfirmar={() => cambiarEstado(abierto, 'confirmado', 'Turno confirmado.')}
                                onNoVino={() => cambiarEstado(abierto, 'no_vino', 'Anotado que no vino.')}
                                onEnPie={() => cambiarEstado(abierto, 'confirmado', 'El turno volvió a quedar en pie.')}
                                onCancelar={() => setConfirmar({ turno: abierto, que: 'cancelar' })}
                                onLiberar={() => setConfirmar({ turno: abierto, que: 'liberar' })}
                                onEditar={() => { setForm(abierto); setAbierto(null); }}
                            />
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <TurnoDialog
                open={!!form}
                inicial={form}
                onClose={() => setForm(null)}
                onGuardado={t => {
                    const nuevo = !form?.id;
                    reemplazar(t);
                    setForm(null);
                    // Si lo anotó para otra semana, que no desaparezca sin explicación.
                    const fuera = t.fecha < lunes || t.fecha > sumarDias(lunes, 6);
                    setAviso(fuera
                        ? `Quedó para el ${diaEnPalabras(t.fecha)}.`
                        : nuevo ? (t.tipo === 'reservado' ? 'Tiempo reservado.' : 'Turno anotado.') : 'Cambios guardados.');
                }}
            />

            {confirmar && (
                <ConfirmDialog
                    open
                    onClose={() => setConfirmar(null)}
                    onConfirm={() => {
                        const { turno, que } = confirmar;
                        setConfirmar(null);
                        if (que === 'liberar') liberar(turno);
                        else cambiarEstado(turno, 'cancelado', 'Turno cancelado.');
                    }}
                    icon={confirmar.que === 'liberar' ? <Unlock className="h-6 w-6" /> : <X className="h-6 w-6" />}
                    iconClassName="bg-red-50 text-red-600"
                    title={confirmar.que === 'liberar' ? 'Liberar este tiempo' : `Cancelar el turno de ${quien(confirmar.turno)}`}
                    description={confirmar.que === 'liberar'
                        ? `Se borra la reserva del ${diaEnPalabras(confirmar.turno.fecha)}.`
                        : `Sale del calendario del ${diaEnPalabras(confirmar.turno.fecha)}.`}
                    confirmLabel={confirmar.que === 'liberar' ? 'Liberar' : 'Cancelar el turno'}
                    confirmClassName="bg-red-600 hover:bg-red-700 text-white"
                    cancelLabel="Volver"
                />
            )}

            {orden && (
                <ServiceModal
                    isOpen
                    initialClientData={orden.cliente}
                    initialBikeData={orden.bici}
                    preSelectedClientId={orden.cliente.id}
                    preSelectedBikeId={orden.bici?.id}
                    onClose={() => setOrden(null)}
                    onSuccess={() => {
                        const t = orden.turno;
                        setOrden(null);
                        cambiarEstado(t, 'vino', 'Listo: la orden quedó en el Taller Activo.');
                    }}
                />
            )}
        </div>
    );
}

function TarjetaTurno({ turno: t, quien, bici, onClick }: { turno: Turno; quien: string; bici: string | null; onClick: () => void }) {
    if (t.tipo === 'reservado') {
        return (
            <button
                type="button"
                onClick={onClick}
                data-turno={t.id}
                className="w-full rounded-md border border-dashed border-slate-300 bg-[repeating-linear-gradient(135deg,#f8fafc_0,#f8fafc_6px,#f1f5f9_6px,#f1f5f9_12px)] px-2 py-1.5 text-left hover:border-slate-500"
            >
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <Lock size={11} /> Reservado{t.hora ? ` desde ${horaCorta(t.hora)}` : ''}
                </p>
                {t.trabajo && <p className="text-xs text-slate-800 line-clamp-2">{t.trabajo}</p>}
            </button>
        );
    }
    const apagado = t.estado === 'vino' || t.estado === 'no_vino';
    return (
        <button
            type="button"
            onClick={onClick}
            data-turno={t.id}
            className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:border-slate-500 ${t.estado === 'a_confirmar' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'} ${apagado ? 'opacity-60' : ''}`}
        >
            <p className="flex items-baseline gap-1.5">
                <span className="text-xs font-bold tabular-nums text-slate-900">{t.hora ? horaCorta(t.hora) : 'S/H'}</span>
                <span className={`min-w-0 truncate text-sm font-semibold text-slate-900 ${t.estado === 'no_vino' ? 'line-through' : ''}`}>{quien}</span>
            </p>
            {(bici || t.trabajo) && (
                <p className="text-xs text-slate-600 line-clamp-2">{[bici, t.trabajo].filter(Boolean).join(' · ')}</p>
            )}
            {t.estado === 'a_confirmar' && <p className="mt-0.5 text-[11px] font-semibold text-amber-800">Del WhatsApp: tocá para confirmar</p>}
            {t.estado === 'vino' && <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-green-700"><Check size={11} /> Vino</p>}
            {t.estado === 'no_vino' && <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-red-700"><UserX size={11} /> No vino</p>}
        </button>
    );
}

function EstadoTexto({ turno: t }: { turno: Turno }) {
    if (t.tipo === 'reservado') return null;
    if (t.estado === 'a_confirmar') return <p className="text-xs font-semibold text-amber-800">Lo leyó la app del WhatsApp. Confirmalo si está bien.</p>;
    if (t.estado === 'vino') return <p className="flex items-center gap-1 text-xs font-semibold text-green-700"><Check size={13} /> Vino y se abrió la orden.</p>;
    if (t.estado === 'no_vino') return <p className="flex items-center gap-1 text-xs font-semibold text-red-700"><UserX size={13} /> No vino.</p>;
    return null;
}

function AccionesDelTurno({ turno: t, trabajando, onLlego, onConfirmar, onNoVino, onEnPie, onCancelar, onLiberar, onEditar }: {
    turno: Turno; trabajando: boolean;
    onLlego: () => void; onConfirmar: () => void; onNoVino: () => void; onEnPie: () => void;
    onCancelar: () => void; onLiberar: () => void; onEditar: () => void;
}) {
    const secundario = 'hover:text-slate-900';
    if (t.tipo === 'reservado') {
        return (
            <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onLiberar} disabled={trabajando} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                    <Unlock className="mr-1.5 h-4 w-4" /> Liberar
                </Button>
                <Button variant="outline" onClick={onEditar} disabled={trabajando} className={secundario}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Editar
                </Button>
            </div>
        );
    }
    if (t.estado === 'vino' || t.estado === 'no_vino') {
        return (
            <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onEnPie} disabled={trabajando} className={secundario}>
                    <Undo2 className="mr-1.5 h-4 w-4" /> Volver a dejarlo en pie
                </Button>
            </div>
        );
    }
    if (t.estado === 'a_confirmar') {
        return (
            <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onCancelar} disabled={trabajando} className={secundario}>
                    <X className="mr-1.5 h-4 w-4" /> No es un turno
                </Button>
                <Button variant="outline" onClick={onEditar} disabled={trabajando} className={secundario}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Corregir
                </Button>
                <Button onClick={onConfirmar} disabled={trabajando}>
                    <Check className="mr-1.5 h-4 w-4" /> Confirmar
                </Button>
            </div>
        );
    }
    return (
        <div className="space-y-2 pt-2">
            <Button onClick={onLlego} disabled={trabajando} className="w-full">
                {trabajando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wrench className="mr-1.5 h-4 w-4" />}
                Llegó: abrir la orden
            </Button>
            <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={onNoVino} disabled={trabajando} className={secundario}>
                    <UserX className="mr-1 h-4 w-4" /> No vino
                </Button>
                <Button variant="outline" size="sm" onClick={onEditar} disabled={trabajando} className={secundario}>
                    <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
                <Button variant="outline" size="sm" onClick={onCancelar} disabled={trabajando} className={secundario}>
                    <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
            </div>
        </div>
    );
}
