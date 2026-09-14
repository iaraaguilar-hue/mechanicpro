// ─────────────────────────────────────────────────────────────
// «VENDÍ UNA BICI» — la venta de mostrador (14-sep-2026).
//
// Pedido de Ariel Leira (Leira Bikes), contado por Iara: *"en el momento en que
// los chicos vendan en el mostrador, que tenga una fecha editable para que se le
// haga un ajuste a la bici, y que de ahí ya cargue que a los 4 meses le llegue el
// mensaje al cliente de que tiene el primer service"*.
//
// Es un formulario de mostrador: el cliente está enfrente, así que va todo en una
// sola pantalla y las fechas vienen puestas. El vendedor solo las toca si el
// cliente dice "el mes que viene me voy de viaje".
//
// Lo que deja: el cliente (si es nuevo), la bici con su `fecha_compra`, y una fila
// en `avisos_postventa` por cada aviso. El cron de las 10 los manda por WhatsApp
// el día que tocan; si el taller no tiene WhatsApp conectado, o el mensaje no
// sale, aparecen en Retención para escribirle a mano.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AvisoTelefono } from '@/components/AvisoTelefono';
import { useDataStore } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { configMantenimiento, hoyAR, sumarMeses, mesesEnPalabras, comoLeLlegaPostventa } from '@/lib/mantenimiento';
import { diaCalendario } from '@/lib/fechaAR';
import { Bike, Check, Loader2, UserPlus, X } from 'lucide-react';

interface Props {
    open: boolean;
    onClose: () => void;
}

const primerNombre = (n?: string | null) => (n ?? '').trim().split(/\s+/)[0] || '';

export function VentaDeMostrador({ open, onClose }: Props) {
    const taller = useAuthStore(s => s.taller);
    const taller_id = useAuthStore(s => s.taller_id);
    const clientes = useDataStore(s => s.clientes);
    const createCliente = useDataStore(s => s.createCliente);
    const createBicicleta = useDataStore(s => s.createBicicleta);
    const cfg = configMantenimiento(taller).postventa;

    const hoy = hoyAR();
    const [busqueda, setBusqueda] = useState('');
    const [clienteId, setClienteId] = useState<string | null>(null);
    const [nuevo, setNuevo] = useState(false);
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [marca, setMarca] = useState('');
    const [modelo, setModelo] = useState('');
    const [talle, setTalle] = useState('');
    const [fechaVenta, setFechaVenta] = useState(hoy);
    const [fechaAjuste, setFechaAjuste] = useState(sumarMeses(hoy, cfg.ajusteMeses));
    const [fechaPrimer, setFechaPrimer] = useState(sumarMeses(hoy, cfg.primerServiceMeses));
    const [conAjuste, setConAjuste] = useState(true);
    const [conPrimer, setConPrimer] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [listo, setListo] = useState<{ quien: string; bici: string; ajuste: string | null; primer: string | null } | null>(null);

    const reiniciar = () => {
        setBusqueda(''); setClienteId(null); setNuevo(false); setNombre(''); setTelefono('');
        setMarca(''); setModelo(''); setTalle(''); setFechaVenta(hoy);
        setFechaAjuste(sumarMeses(hoy, cfg.ajusteMeses)); setFechaPrimer(sumarMeses(hoy, cfg.primerServiceMeses));
        setConAjuste(true); setConPrimer(true); setError(null); setListo(null);
    };
    const cerrar = () => { reiniciar(); onClose(); };

    // Mover la fecha de venta mueve las dos fechas de los avisos: se cargó la venta
    // de ayer, y el ajuste va a un mes de ayer, no de hoy.
    const cambiarVenta = (v: string) => {
        setFechaVenta(v);
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            setFechaAjuste(sumarMeses(v, cfg.ajusteMeses));
            setFechaPrimer(sumarMeses(v, cfg.primerServiceMeses));
        }
    };

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

    const hayCliente = !!clienteId || (nuevo && nombre.trim().length > 1);
    const puede = hayCliente && marca.trim() && modelo.trim() && /^\d{4}-\d{2}-\d{2}$/.test(fechaVenta);

    const guardar = async () => {
        if (!taller_id || !puede || guardando) return;
        setGuardando(true);
        setError(null);
        try {
            let cid = clienteId;
            let quien = elegido?.nombre ?? '';
            if (!cid) {
                const c = await createCliente({ taller_id, nombre: nombre.trim(), telefono: telefono.trim() || undefined });
                cid = c.id;
                quien = c.nombre;
            }
            const bici = await createBicicleta({
                taller_id, cliente_id: cid!, marca: marca.trim(), modelo: modelo.trim(),
                talle: talle.trim() || undefined, fecha_compra: fechaVenta,
            });
            const avisos = [
                conAjuste && fechaAjuste ? { tipo: 'ajuste', fecha: fechaAjuste } : null,
                conPrimer && fechaPrimer ? { tipo: 'primer_service', fecha: fechaPrimer } : null,
            ].filter(Boolean) as { tipo: string; fecha: string }[];
            if (avisos.length) {
                const { error: e } = await supabase.from('avisos_postventa')
                    .insert(avisos.map(a => ({ taller_id, bicicleta_id: bici.id, tipo: a.tipo, fecha: a.fecha })));
                // La bici ya quedó: el error lo dice así, para que nadie la vuelva a cargar.
                if (e) throw new Error(`La bici quedó cargada, pero no se pudieron agendar los avisos (${e.message}). Probá de nuevo desde su ficha o avisanos.`);
            }
            setListo({
                quien, bici: `${marca.trim()} ${modelo.trim()}`,
                ajuste: conAjuste ? fechaAjuste : null, primer: conPrimer ? fechaPrimer : null,
            });
        } catch (e: any) {
            setError(e?.message ?? 'No se pudo guardar.');
        } finally {
            setGuardando(false);
        }
    };

    const clienteParaMostrar = primerNombre(elegido?.nombre ?? nombre) || 'Juan';
    const biciParaMostrar = modelo.trim() || 'bici';

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) cerrar(); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bike className="h-5 w-5 text-primary" /> Vendí una bici
                    </DialogTitle>
                </DialogHeader>

                {listo ? (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 space-y-1.5">
                            <p className="font-semibold flex items-center gap-1.5"><Check className="h-4 w-4" /> Quedó cargada la {listo.bici} de {listo.quien}.</p>
                            {listo.ajuste && <p>Ajuste: <strong>{diaCalendario(listo.ajuste)}</strong></p>}
                            {listo.primer && <p>Primer service: <strong>{diaCalendario(listo.primer)}</strong></p>}
                        </div>
                        {(listo.ajuste || listo.primer) && (
                            <p className="text-xs text-muted-foreground">
                                {taller?.wa_activo
                                    ? 'Ese día a las 10 le escribimos solos por WhatsApp. Si el mensaje no sale, te aparece en Retención para escribirle vos.'
                                    : 'Ese día te aparece en Retención, con el mensaje listo para mandarle.'}
                            </p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={reiniciar}>Cargar otra venta</Button>
                            <Button onClick={cerrar}>Listo</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* ── Quién la compró ── */}
                        <section className="space-y-2">
                            <Label className="text-sm font-semibold">Quién la compró</Label>
                            {elegido ? (
                                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm truncate">{elegido.nombre}</p>
                                        {elegido.telefono && <p className="text-xs text-muted-foreground">{elegido.telefono}</p>}
                                    </div>
                                    <button type="button" onClick={() => setClienteId(null)} className="p-1 text-slate-400 hover:text-slate-700" title="Cambiar">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : nuevo ? (
                                <div className="space-y-2 rounded-lg border p-3">
                                    <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellido" autoFocus />
                                    <Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Celular (para avisarle)" inputMode="tel" />
                                    {telefono.trim() && <AvisoTelefono valor={telefono} />}
                                    <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setNuevo(false)}>
                                        Buscar uno que ya está cargado
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, celular o DNI" autoFocus />
                                    {coincidencias.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => { setClienteId(c.id); setBusqueda(''); }}
                                            className="w-full text-left rounded-md border px-3 py-2 hover:bg-slate-50 text-sm"
                                        >
                                            <span className="font-medium">{c.nombre}</span>
                                            {c.telefono && <span className="text-xs text-muted-foreground ml-2">{c.telefono}</span>}
                                        </button>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => { setNuevo(true); setNombre(busqueda.trim()); }}>
                                        <UserPlus className="h-4 w-4 mr-1.5" /> Es un cliente nuevo
                                    </Button>
                                </div>
                            )}
                        </section>

                        {/* ── La bici ── */}
                        <section className="space-y-2">
                            <Label className="text-sm font-semibold">La bici</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <Input value={marca} onChange={e => setMarca(e.target.value)} placeholder="Marca" />
                                <Input value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Modelo" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Input value={talle} onChange={e => setTalle(e.target.value)} placeholder="Talle (opcional)" />
                                <label className="flex flex-col text-xs text-muted-foreground gap-1">
                                    Fecha de venta
                                    <Input type="date" value={fechaVenta} onChange={e => cambiarVenta(e.target.value)} max={hoy} />
                                </label>
                            </div>
                        </section>

                        {/* ── Lo que queda agendado ── */}
                        <section className="space-y-2">
                            <Label className="text-sm font-semibold">Lo que queda agendado</Label>
                            {[
                                { clave: 'ajuste', titulo: 'Ajuste', meses: cfg.ajusteMeses, fecha: fechaAjuste, setFecha: setFechaAjuste, con: conAjuste, setCon: setConAjuste },
                                { clave: 'primer', titulo: 'Primer service', meses: cfg.primerServiceMeses, fecha: fechaPrimer, setFecha: setFechaPrimer, con: conPrimer, setCon: setConPrimer },
                            ].map(a => (
                                <div key={a.clave} className={`flex items-center gap-3 rounded-lg border p-2.5 ${a.con ? 'bg-muted/20' : 'opacity-60'}`}>
                                    <Checkbox checked={a.con} onCheckedChange={v => a.setCon(v === true)} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{a.titulo}</p>
                                        <p className="text-[11px] text-muted-foreground">a {mesesEnPalabras(a.meses)} de la venta</p>
                                    </div>
                                    <Input type="date" value={a.fecha} onChange={e => a.setFecha(e.target.value)} disabled={!a.con} className="w-40" />
                                </div>
                            ))}
                            {(conAjuste || conPrimer) && (
                                <p className="text-[11px] text-muted-foreground leading-snug">
                                    Así le llega: "{comoLeLlegaPostventa(conPrimer ? cfg.textoPrimerService : cfg.textoAjuste, taller?.nombre ?? '', clienteParaMostrar, biciParaMostrar)}"
                                </p>
                            )}
                        </section>

                        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={cerrar} disabled={guardando}>Cancelar</Button>
                            <Button onClick={guardar} disabled={!puede || guardando}>
                                {guardando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                                Guardar la venta
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
