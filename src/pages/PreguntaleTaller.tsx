import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tieneFeature } from '@/lib/planFeatures';
import { Lock, Loader2, Send, ThumbsUp, ThumbsDown, MessageCircleQuestion, AlertTriangle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// PREGUNTALE A TU TALLER (idea 3): escribís en criollo, contesta con los
// datos de ESTE taller. "Todo es todo" (decisión de Iara): sin lista
// blanca de preguntas — pero la PLATA va atada al rol, y eso lo decide el
// servidor (al mecánico la herramienta de facturación no le existe).
//
// Cada pregunta queda registrada por la Edge Function con las
// herramientas que usó (evidencia); acá solo se carga el feedback, una
// vez. Sin medición no hay feature.
// ─────────────────────────────────────────────────────────────

interface Pregunta {
    id: string;
    pregunta: string;
    respuesta: string | null;
    herramientas: { herramienta: string }[] | null;
    feedback: 'util' | 'no_util' | null;
    created_at: string;
}

const NOMBRES_TOOL: Record<string, string> = {
    buscar_cliente: 'clientes',
    historial_cliente: 'historial',
    servicios_activos: 'órdenes',
    buscar_stock: 'stock',
    recordatorios_vencidos: 'recordatorios',
    carreras_proximas: 'carreras',
    facturacion: 'facturación',
    top_clientes: 'clientes por gasto',
    retencion_resumen: 'retención',
    bicis_paradas_resumen: 'bicis paradas',
};

const EJEMPLOS = [
    '¿Qué services tengo sin entregar?',
    '¿Qué bicis tiene Juan?',
    '¿Cuánto facturé este mes?',
    '¿A quién se le vence la cadena?',
];

export default function PreguntaleTaller() {
    const taller = useAuthStore(s => s.taller);
    const [historial, setHistorial] = useState<Pregunta[]>([]);
    const [texto, setTexto] = useState('');
    const [pensando, setPensando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const finRef = useRef<HTMLDivElement>(null);

    const habilitado = tieneFeature(taller, 'preguntale');

    useEffect(() => {
        if (!habilitado) return;
        (async () => {
            const { data } = await supabase
                .from('preguntas_taller')
                .select('id, pregunta, respuesta, herramientas, feedback, created_at')
                .order('created_at', { ascending: false })
                .limit(20);
            setHistorial(((data as Pregunta[]) ?? []).reverse());
        })();
    }, [habilitado]);

    useEffect(() => {
        finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [historial, pensando]);

    const preguntar = async (q?: string) => {
        const pregunta = (q ?? texto).trim();
        if (!pregunta || pensando) return;
        setTexto('');
        setAviso(null);
        setPensando(true);
        // La pregunta aparece como ENVIADA al instante (pedido de Iara,
        // 19-ago): la respuesta la completa después, en la misma burbuja.
        const tmpId = `tmp-${Date.now()}`;
        setHistorial(h => [...h, {
            id: tmpId,
            pregunta,
            respuesta: null,
            herramientas: null,
            feedback: null,
            created_at: new Date().toISOString(),
        }]);
        try {
            const llamada = supabase.functions.invoke('preguntar-taller', { body: { pregunta } });
            const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 90000));
            const { data, error } = await Promise.race([llamada, timeout]) as any;
            if (error) {
                let codigo = 'fallo';
                try { codigo = (await error?.context?.json?.())?.error ?? 'fallo'; } catch { /* no era JSON */ }
                if (codigo === 'plan_sin_ia') setAviso('Preguntale a tu taller es de los planes Pro y Expert.');
                else setAviso('No se pudo responder. Probá de nuevo en un rato.');
                return;
            }
            setHistorial(h => h.map(x => x.id === tmpId ? {
                ...x,
                id: data.pregunta_id ?? tmpId,
                respuesta: data.respuesta,
                herramientas: (data.herramientas ?? []).map((y: string) => ({ herramienta: y })),
            } : x));
        } catch (e: any) {
            setAviso(e?.message === 'timeout'
                ? 'La respuesta tardó demasiado y se cortó a los 90 segundos. Probá de nuevo.'
                : 'No se pudo responder. Revisá la conexión y probá de nuevo.');
        } finally {
            setPensando(false);
        }
    };

    const votar = async (p: Pregunta, feedback: 'util' | 'no_util') => {
        if (p.feedback || p.id.startsWith('tmp-')) return;
        const { error } = await supabase.from('preguntas_taller').update({ feedback }).eq('id', p.id);
        if (!error) setHistorial(h => h.map(x => x.id === p.id ? { ...x, feedback } : x));
    };

    if (!habilitado) {
        return (
            <Card><CardContent className="p-8 text-center">
                <Lock className="mx-auto mb-3 text-slate-400" size={28} />
                <h2 className="text-lg font-bold">Preguntale a tu taller</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    En los planes Pro y Expert escribís en criollo ("¿cuánto facturé este mes?",
                    "¿qué bicis tiene Juan?") y el sistema contesta con los datos de tu taller.
                </p>
            </CardContent></Card>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
            <div className="mb-3">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <MessageCircleQuestion size={24} /> Preguntale a tu taller
                </h1>
                <p className="text-sm text-muted-foreground">
                    Escribí en criollo. Contesta solo con los datos cargados en tu taller: lo que no está, te lo dice.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {historial.length === 0 && !pensando && (
                    <Card><CardContent className="p-5 text-sm text-muted-foreground">
                        <p className="mb-3">Probá con una de estas:</p>
                        <div className="flex flex-wrap gap-2">
                            {EJEMPLOS.map(e => (
                                <button key={e} onClick={() => preguntar(e)}
                                    className="text-xs border border-border rounded-full px-3 py-1.5 hover:bg-slate-50 transition-colors">
                                    {e}
                                </button>
                            ))}
                        </div>
                    </CardContent></Card>
                )}

                {historial.map(p => (
                    <div key={p.id} className="space-y-2">
                        <div className="flex justify-end">
                            <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-[85%]">
                                {p.pregunta}
                            </div>
                        </div>
                        {p.respuesta && (
                            <div className="flex justify-start">
                                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[85%]">
                                    <div className="whitespace-pre-wrap">{p.respuesta}</div>
                                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-border/60">
                                        {(p.herramientas?.length ?? 0) > 0 && (
                                            <span className="text-[11px] text-muted-foreground">
                                                Se apoyó en: {[...new Set((p.herramientas ?? []).map(h => NOMBRES_TOOL[h.herramienta] ?? h.herramienta))].join(', ')}
                                            </span>
                                        )}
                                        <span className="ml-auto flex gap-1">
                                            {p.feedback ? (
                                                <span className="text-[11px] text-muted-foreground">
                                                    {p.feedback === 'util' ? 'Marcada útil' : 'Marcada no útil'}
                                                </span>
                                            ) : !p.id.startsWith('tmp-') && (
                                                <>
                                                    <button onClick={() => votar(p, 'util')} title="Me sirvió"
                                                        className="p-1 text-slate-400 hover:text-emerald-600"><ThumbsUp size={14} /></button>
                                                    <button onClick={() => votar(p, 'no_util')} title="No me sirvió"
                                                        className="p-1 text-slate-400 hover:text-red-500"><ThumbsDown size={14} /></button>
                                                </>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {pensando && (
                    <div className="flex justify-start">
                        <div className="bg-card border border-border rounded-2xl px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="animate-spin" size={14} /> Mirando los datos del taller…
                        </div>
                    </div>
                )}
                <div ref={finRef} />
            </div>

            {aviso && (
                <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mt-2 flex items-start gap-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {aviso}
                </div>
            )}

            <form
                className="mt-3 flex gap-2"
                onSubmit={e => { e.preventDefault(); preguntar(); }}
            >
                <Input
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    placeholder='Ej: "¿qué services tengo sin entregar?"'
                    maxLength={500}
                    disabled={pensando}
                />
                <Button type="submit" disabled={pensando || !texto.trim()}>
                    {pensando ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                </Button>
            </form>
        </div>
    );
}
