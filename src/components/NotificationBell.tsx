import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { avancesActivos, tareasActivas, trabajosPendientes, tareasLibresPendientes } from '@/lib/planFeatures';
import { buildRetentionAlerts } from '@/lib/retentionAlerts';
import { getNovedadesVistas, saveNovedadesVistas } from '@/lib/novedadesSeen';
import { Bell, Wrench, PackageCheck, HeartPulse, Megaphone } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Centro de notificaciones (la campana). Dos pestañas:
//  · Pendientes: tareas de service sin tildar + bicis listas para avisar
//    al cliente + mantenimiento vencido (recordatorios). Se computa del
//    store, sin tabla de notificaciones.
//  · Novedades: anuncios del proveedor (tabla global `novedades`), broadcast
//    a todos los talleres. "Leídas" se marcan por dispositivo (localStorage).
// ─────────────────────────────────────────────────────────────

interface Novedad { id: string; titulo: string; cuerpo: string; fecha: string; activa: boolean; }

const waLink = (phone: string | undefined, msg: string) =>
    `https://wa.me/${(phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`;

export function NotificationBell({ variant = 'mobile' }: { variant?: 'mobile' | 'desktop' }) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<'pendientes' | 'novedades'>('pendientes');
    const [novedades, setNovedades] = useState<Novedad[]>([]);
    const [seen, setSeen] = useState<string[]>(getNovedadesVistas());
    const ref = useRef<HTMLDivElement>(null);

    const servicios = useDataStore(s => s.servicios);
    const recordatorios = useDataStore(s => s.recordatorios);
    const clientes = useDataStore(s => s.clientes);
    const bicicletas = useDataStore(s => s.bicicletas);
    const carreras = useDataStore(s => s.carreras);
    const taller = useAuthStore(s => s.taller);
    const navigate = useNavigate();

    // Novedades activas del proveedor (broadcast; tolera que la tabla no exista aún).
    useEffect(() => {
        let alive = true;
        supabase.from('novedades').select('*').eq('activa', true).order('fecha', { ascending: false })
            .then(({ data, error }) => { if (alive && !error && data) setNovedades(data as Novedad[]); });
        return () => { alive = false; };
    }, []);

    // Cerrar al hacer clic afuera.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const bikeDe = (bikeId: string) => bicicletas.find(b => b.id === bikeId);
    const clienteDe = (bikeId: string) => { const b = bikeDe(bikeId); return b ? clientes.find(c => c.id === b.cliente_id) : null; };

    const activos = servicios.filter(s => !s.eliminado_en && (s.estado || '').toLowerCase() !== 'delivered');

    // 1. Tareas de service sin tildar (órdenes en curso, no las ya finalizadas).
    const verTareas = tareasActivas(taller);
    const verEtapas = avancesActivos(taller);
    const conTareas = (verTareas || verEtapas)
        ? activos
            .filter(s => (s.estado || '').toLowerCase() !== 'ready')
            .map(s => ({ s, pend: (verEtapas ? trabajosPendientes(s).length : 0) + (verTareas ? tareasLibresPendientes(s).length : 0) }))
            .filter(x => x.pend > 0)
        : [];

    // 2. Bicis listas para entregar → avisar al cliente.
    const paraAvisar = activos.filter(s => (s.estado || '').toLowerCase() === 'ready');

    // 3. Mantenimiento vencido (retención). MISMA fuente que la página de
    //    Retención (buildRetentionAlerts) → respeta alertas_ocultas, así que
    //    descartar un aviso en Retención baja este contador y queda coherente
    //    al recargar. Antes esto filtraba `recordatorios` a mano e IGNORABA
    //    alertas_ocultas (por eso el número no bajaba nunca).
    const vencidos = buildRetentionAlerts({ recordatorios, bicicletas, clientes, servicios, carreras })
        .filter(a => a.daysRemaining <= 0);

    const totalPendientes = conTareas.length + paraAvisar.length + vencidos.length;
    const noLeidas = novedades.filter(n => !seen.includes(n.id)).length;
    const badge = totalPendientes + noLeidas;

    // Acceso rápido (Tarea F): abrir la orden puntual para completar sus
    // tareas. La notificación NO se descarta a mano: desaparece sola cuando
    // el mecánico tilda la última tarea (se recomputa del store).
    const abrirService = (serviceId: string) => { setOpen(false); navigate(`/?openService=${serviceId}`); };
    const verNovedades = () => {
        setTab('novedades');
        const ids = novedades.map(n => n.id);
        setSeen(ids); saveNovedadesVistas(ids);
    };

    const panelPos = variant === 'desktop' ? 'fixed top-3 left-28' : 'absolute right-0 top-full mt-2';

    return (
        <div className="relative" ref={ref}>
            {variant === 'desktop' ? (
                <button
                    onClick={() => setOpen(o => !o)}
                    className="relative h-auto w-24 py-2 px-1 flex flex-col items-center gap-1 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Alertas"
                >
                    <span className="relative">
                        <Bell size={22} />
                        {badge > 0 && (
                            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-[#f25a30] rounded-full border border-card">
                                {badge > 9 ? '9+' : badge}
                            </span>
                        )}
                    </span>
                    <span className="text-[10px] font-semibold leading-tight">Alertas</span>
                </button>
            ) : (
                <button onClick={() => setOpen(o => !o)} className="p-2 text-slate-600 relative" aria-label="Notificaciones">
                    <Bell size={20} />
                    {badge > 0 && (
                        <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-[#f25a30] rounded-full border border-white">
                            {badge > 9 ? '9+' : badge}
                        </span>
                    )}
                </button>
            )}

            {open && (
                <div className={`${panelPos} z-[60] w-80 max-w-[90vw] bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150`}>
                    <div className="flex border-b border-slate-100">
                        <button
                            onClick={() => setTab('pendientes')}
                            className={`flex-1 px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${tab === 'pendientes' ? 'text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Pendientes {totalPendientes > 0 && <span className="ml-1 text-[10px] bg-[#f25a30] text-white rounded-full px-1.5">{totalPendientes}</span>}
                        </button>
                        <button
                            onClick={verNovedades}
                            className={`flex-1 px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${tab === 'novedades' ? 'text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Novedades {noLeidas > 0 && <span className="ml-1 text-[10px] bg-[#f25a30] text-white rounded-full px-1.5">{noLeidas}</span>}
                        </button>
                    </div>

                    <div className="max-h-96 overflow-y-auto p-2">
                        {tab === 'pendientes' ? (
                            totalPendientes === 0 ? (
                                <div className="flex flex-col items-center py-8 text-slate-400 gap-1">
                                    <Bell size={22} className="opacity-30" />
                                    <p className="text-xs">Todo al día 🎉</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {conTareas.map(({ s, pend }) => {
                                        const cli = clienteDe(s.bicicleta_id);
                                        return (
                                            <button key={`t-${s.id}`} onClick={() => abrirService(s.id)} className="w-full text-left flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors group">
                                                <span className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0"><Wrench size={14} /></span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm text-slate-700 font-medium truncate">{cli?.nombre || 'Cliente'}</span>
                                                    <span className="block text-xs text-slate-500">{pend} tarea{pend > 1 ? 's' : ''} sin completar</span>
                                                </span>
                                                <span className="shrink-0 text-[11px] font-semibold text-primary border border-primary/30 rounded-md px-2 py-1 group-hover:bg-primary/10">Resolver</span>
                                            </button>
                                        );
                                    })}

                                    {paraAvisar.map(s => {
                                        const cli = clienteDe(s.bicicleta_id);
                                        const bike = bikeDe(s.bicicleta_id);
                                        const msg = `Hola ${cli?.nombre || ''}! Tu ${bike?.marca || 'bici'} ${bike?.modelo || ''} ya está lista para retirar. Te esperamos 🚲`;
                                        return (
                                            <div key={`r-${s.id}`} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                                                <span className="mt-0.5 p-1.5 rounded-md bg-green-100 text-green-600 shrink-0"><PackageCheck size={14} /></span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm text-slate-700 font-medium truncate">{cli?.nombre || 'Cliente'}</span>
                                                    <span className="block text-xs text-slate-500">Lista para entregar — avisale</span>
                                                </span>
                                                {cli?.telefono && (
                                                    <a href={waLink(cli.telefono, msg)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="shrink-0 text-[11px] font-semibold text-green-600 border border-green-200 rounded-md px-2 py-1 hover:bg-green-50">WhatsApp</a>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {vencidos.map(a => {
                                        const msg = a.isPostCarrera
                                            ? `Hola ${a.clientName}! ¿Cómo te fue en ${a.carreraName}? Contanos cómo se portó la bici 🚲`
                                            : `Hola ${a.clientName}! Pasó el tiempo recomendado para ${a.component || 'el mantenimiento'} de tu ${a.bikeModel || 'bici'}. ¿Coordinamos una revisión? 🔧`;
                                        return (
                                            <div key={`m-${a.id}`} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                                                <span className="mt-0.5 p-1.5 rounded-md bg-amber-100 text-amber-600 shrink-0"><HeartPulse size={14} /></span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm text-slate-700 font-medium truncate">{a.clientName || 'Cliente'}</span>
                                                    <span className="block text-xs text-slate-500 truncate">{a.isPostCarrera ? 'Seguimiento' : 'Mantenimiento'}: {a.component}</span>
                                                </span>
                                                {a.clientPhone && (
                                                    <a href={waLink(a.clientPhone, msg)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="shrink-0 text-[11px] font-semibold text-amber-600 border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-50">WhatsApp</a>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        ) : (
                            novedades.length === 0 ? (
                                <div className="flex flex-col items-center py-8 text-slate-400 gap-1">
                                    <Megaphone size={22} className="opacity-30" />
                                    <p className="text-xs">No hay novedades por ahora</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {novedades.map(n => (
                                        <div key={n.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Megaphone size={13} className="text-primary shrink-0" />
                                                <span className="text-sm font-bold text-slate-800">{n.titulo}</span>
                                            </div>
                                            <p className="text-xs text-slate-600 whitespace-pre-wrap">{n.cuerpo}</p>
                                            <p className="text-[10px] text-slate-400 mt-1.5">{new Date(n.fecha).toLocaleDateString('es-AR')}</p>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
