// ─────────────────────────────────────────────────────────────
// DAR UN TURNO, O RESERVAR TIEMPO (25-sep-2026).
//
// Juan Otero (Private Garage) da los turnos él, por WhatsApp, y a veces se
// guarda el día entero para lo atrasado o para armar bicis de la bicicletería.
// Este formulario es el cuaderno: quién, qué día, qué se le hace. El cliente
// puede no estar en la base todavía (lo primero que hay de alguien que pide
// turno es un nombre y un WhatsApp): se anota igual y se crea cuando llega.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AvisoTelefono } from '@/components/AvisoTelefono';
import { useDataStore } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { horaCorta } from '@/lib/fechaAR';
import { diaEnPalabras, type Turno, type TipoTurno } from '@/lib/turnos';
import { CalendarDays, Check, Loader2, Lock, UserPlus, X } from 'lucide-react';

const DIA_OK = /^\d{4}-\d{2}-\d{2}$/;

interface Props {
    open: boolean;
    onClose: () => void;
    onGuardado: (t: Turno) => void;
    /** Para editar: el turno entero. Para uno nuevo: lo que ya se sabe (el día que se tocó, el tipo). */
    inicial?: Partial<Turno> | null;
}

export function TurnoDialog({ open, onClose, onGuardado, inicial }: Props) {
    const taller_id = useAuthStore(s => s.taller_id);
    const clientes = useDataStore(s => s.clientes);
    const bicicletas = useDataStore(s => s.bicicletas);

    const editando = !!inicial?.id;
    const [tipo, setTipo] = useState<TipoTurno>('turno');
    const [fecha, setFecha] = useState('');
    const [hora, setHora] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [clienteId, setClienteId] = useState<string | null>(null);
    const [bicicletaId, setBicicletaId] = useState<string | null>(null);
    const [nuevo, setNuevo] = useState(false);
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [trabajo, setTrabajo] = useState('');
    const [nota, setNota] = useState('');
    const [catalogo, setCatalogo] = useState<string[]>([]);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cada vez que se abre arranca de lo que trae `inicial`, no de lo que quedó de la vez anterior.
    useEffect(() => {
        if (!open) return;
        setTipo(inicial?.tipo ?? 'turno');
        setFecha(inicial?.fecha ?? '');
        setHora(horaCorta(inicial?.hora));
        setClienteId(inicial?.cliente_id ?? null);
        setBicicletaId(inicial?.bicicleta_id ?? null);
        setNuevo(!inicial?.cliente_id && !!inicial?.nombre);
        setNombre(inicial?.nombre ?? '');
        setTelefono(inicial?.telefono ?? '');
        setTrabajo(inicial?.trabajo ?? '');
        setNota(inicial?.nota ?? '');
        setBusqueda('');
        setError(null);
    }, [open, inicial]);

    // Los services del menú del taller como sugerencia de "qué se le hace" (se puede escribir otra cosa).
    useEffect(() => {
        if (!open || !taller_id) return;
        supabase.from('catalogo_servicios').select('nombre, activo').eq('taller_id', taller_id)
            .then(({ data }) => setCatalogo((data ?? [])
                .filter((s: any) => s.activo !== false && s.nombre && s.nombre.trim().toUpperCase() !== 'OTRO')
                .map((s: any) => s.nombre)));
    }, [open, taller_id]);

    const coincidencias = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (q.length < 2) return [];
        const digitos = q.replace(/\D/g, '');
        return clientes
            .filter(c => !c.eliminado_en && (
                (c.nombre ?? '').toLowerCase().includes(q)
                || (digitos.length >= 3 && ((c.telefono ?? '').replace(/\D/g, '').includes(digitos) || (c.dni ?? '').includes(digitos)))
            ))
            .slice(0, 6);
    }, [clientes, busqueda]);
    const elegido = clientes.find(c => c.id === clienteId);
    const susBicis = useMemo(() => bicicletas.filter(b => b.cliente_id === clienteId), [bicicletas, clienteId]);

    const hayQuien = !!clienteId || (nuevo && nombre.trim().length > 1);
    const fechaOk = DIA_OK.test(fecha);
    // El motivo de un botón apagado va escrito a la vista (en el celular no hay tooltip).
    const falta = !fechaOk ? 'Elegí el día.'
        : tipo === 'turno' && !hayQuien ? 'Falta de quién es el turno.'
        : tipo === 'reservado' && !trabajo.trim() ? 'Falta para qué lo reservás.'
        : null;

    const guardar = async () => {
        if (!taller_id || falta || guardando) return;
        setGuardando(true);
        setError(null);
        const esTurno = tipo === 'turno';
        const fila = {
            taller_id,
            tipo,
            fecha,
            hora: hora || null,
            cliente_id: esTurno ? clienteId : null,
            bicicleta_id: esTurno && clienteId ? bicicletaId : null,
            nombre: esTurno && !clienteId ? nombre.trim() : null,
            telefono: esTurno && !clienteId ? (telefono.trim() || null) : null,
            trabajo: trabajo.trim() || null,
            nota: nota.trim() || null,
            // Guardar desde el formulario es decir que sí: uno leído del WhatsApp queda confirmado.
            ...(inicial?.estado === 'a_confirmar' ? { estado: 'confirmado' } : {}),
        };
        try {
            const consulta = editando
                ? supabase.from('turnos').update({ ...fila, actualizado_at: new Date().toISOString() }).eq('id', inicial!.id!)
                : supabase.from('turnos').insert(fila);
            const { data, error: e } = await consulta.select().single();
            if (e) throw e;
            onGuardado(data as Turno);
        } catch (e: any) {
            setError('No se pudo guardar: ' + (e?.message ?? 'error desconocido'));
        } finally {
            setGuardando(false);
        }
    };

    const titulo = editando
        ? (tipo === 'reservado' ? 'Tiempo reservado' : 'Turno')
        : (tipo === 'reservado' ? 'Reservar tiempo' : 'Nuevo turno');

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {tipo === 'reservado' ? <Lock className="h-5 w-5 text-slate-500" /> : <CalendarDays className="h-5 w-5 text-slate-500" />}
                        {titulo}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                    {/* ── Qué es ── */}
                    {!editando && (
                        <div className="grid grid-cols-2 gap-1 rounded-lg border bg-slate-50 p-1" role="radiogroup">
                            {([['turno', 'Turno de un cliente'], ['reservado', 'Tiempo reservado']] as const).map(([v, txt]) => (
                                <button
                                    key={v}
                                    type="button"
                                    role="radio"
                                    aria-checked={tipo === v}
                                    onClick={() => setTipo(v)}
                                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tipo === v
                                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                                        : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    {txt}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Cuándo ── */}
                    <section className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                Día
                                <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                {tipo === 'reservado' ? 'Desde qué hora (vacío = todo el día)' : 'Hora (si quedaron en una)'}
                                <Input type="time" value={hora} onChange={e => setHora(e.target.value)} />
                            </label>
                        </div>
                        {fechaOk && <p className="text-xs text-slate-600">{diaEnPalabras(fecha)}{hora ? ` a las ${hora}` : ''}</p>}
                    </section>

                    {/* ── De quién (solo turnos) ── */}
                    {tipo === 'turno' && (
                        <section className="space-y-2">
                            <Label className="text-sm font-semibold">De quién</Label>
                            {elegido ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm truncate">{elegido.nombre}</p>
                                            {elegido.telefono && <p className="text-xs text-muted-foreground">{elegido.telefono}</p>}
                                        </div>
                                        <button type="button" onClick={() => { setClienteId(null); setBicicletaId(null); }} className="p-1 text-slate-400 hover:text-slate-700" title="Cambiar">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {susBicis.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {susBicis.map(b => (
                                                <button
                                                    key={b.id}
                                                    type="button"
                                                    onClick={() => setBicicletaId(bicicletaId === b.id ? null : b.id)}
                                                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${bicicletaId === b.id
                                                        ? 'border-slate-900 bg-slate-900 text-white'
                                                        : 'border-slate-200 text-slate-700 hover:border-slate-400 hover:text-slate-900'}`}
                                                >
                                                    {[b.marca, b.modelo].filter(Boolean).join(' ')}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : nuevo ? (
                                <div className="space-y-2 rounded-lg border p-3">
                                    <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" autoFocus={!editando} />
                                    <Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Celular (opcional)" inputMode="tel" />
                                    {telefono.trim() && <AvisoTelefono valor={telefono} />}
                                    <p className="text-[11px] text-muted-foreground">Queda anotado así. Cuando llegue, se carga como cliente.</p>
                                    <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setNuevo(false)}>
                                        Buscar uno que ya está cargado
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, celular o DNI" autoFocus={!editando} />
                                    {coincidencias.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => { setClienteId(c.id); setBusqueda(''); setBicicletaId(null); }}
                                            className="w-full text-left rounded-md border px-3 py-2 hover:bg-slate-50 text-sm"
                                        >
                                            <span className="font-medium">{c.nombre}</span>
                                            {c.telefono && <span className="text-xs text-muted-foreground ml-2">{c.telefono}</span>}
                                        </button>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" className="w-full hover:text-slate-900" onClick={() => { setNuevo(true); setNombre(busqueda.trim()); }}>
                                        <UserPlus className="h-4 w-4 mr-1.5" /> No está cargado
                                    </Button>
                                </div>
                            )}
                        </section>
                    )}

                    {/* ── Qué se le hace / para qué ── */}
                    <section className="space-y-2">
                        <label className="flex flex-col gap-1 text-sm font-semibold">
                            {tipo === 'reservado' ? 'Para qué' : 'Qué se le hace'}
                            <Input
                                value={trabajo}
                                onChange={e => setTrabajo(e.target.value)}
                                placeholder={tipo === 'reservado' ? 'Armar el pedido de la bicicletería, ponerme al día…' : 'Service de horquilla, cambio de cadena…'}
                                list={tipo === 'turno' ? 'turno-catalogo' : undefined}
                                className="font-normal"
                            />
                        </label>
                        {tipo === 'turno' && (
                            <datalist id="turno-catalogo">
                                {catalogo.map(n => <option key={n} value={n} />)}
                            </datalist>
                        )}
                        <Textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional)" rows={2} />
                    </section>

                    {inicial?.evidencia && (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            Leído del WhatsApp: <span className="italic">"{inicial.evidencia}"</span>
                        </p>
                    )}

                    {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

                    <div className="flex items-center justify-end gap-2">
                        {falta && <p className="mr-auto text-xs text-muted-foreground">{falta}</p>}
                        <Button variant="outline" onClick={onClose} disabled={guardando} className="hover:text-slate-900">Cancelar</Button>
                        <Button onClick={guardar} disabled={!!falta || guardando}>
                            {guardando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                            {editando ? 'Guardar' : tipo === 'reservado' ? 'Reservar' : 'Anotar el turno'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
