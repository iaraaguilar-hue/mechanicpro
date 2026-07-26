import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Megaphone, Loader2, Send, Trash2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Publicador de novedades (solo super_admin = Iara). Lo que se publica
// acá aparece en la campana (pestaña Novedades) de TODOS los talleres.
// Broadcast global: tabla `novedades` sin taller_id. RLS: escribe solo
// super_admin, lee cualquier autenticado.
// ─────────────────────────────────────────────────────────────

interface Novedad { id: string; titulo: string; cuerpo: string; fecha: string; activa: boolean; }

export function NovedadesAdmin() {
    const [novedades, setNovedades] = useState<Novedad[]>([]);
    const [titulo, setTitulo] = useState('');
    const [cuerpo, setCuerpo] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

    const aviso = (tipo: 'ok' | 'error', texto: string) => { setMsg({ tipo, texto }); setTimeout(() => setMsg(null), 4000); };

    const cargar = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('novedades').select('*').order('fecha', { ascending: false });
        if (!error) setNovedades((data as Novedad[]) || []);
        setLoading(false);
    };
    useEffect(() => { cargar(); }, []);

    const publicar = async () => {
        if (!titulo.trim()) return;
        setSaving(true);
        const { error } = await supabase.from('novedades').insert({ titulo: titulo.trim(), cuerpo: cuerpo.trim() });
        setSaving(false);
        if (error) { aviso('error', 'No se pudo publicar: ' + error.message); return; }
        setTitulo(''); setCuerpo('');
        aviso('ok', 'Novedad publicada. Ya la ven todos los talleres en su campana.');
        cargar();
    };

    const toggleActiva = async (n: Novedad) => {
        const { error } = await supabase.from('novedades').update({ activa: !n.activa }).eq('id', n.id);
        if (error) { aviso('error', error.message); return; }
        cargar();
    };

    const borrar = async (id: string) => {
        const { error } = await supabase.from('novedades').delete().eq('id', id);
        if (error) { aviso('error', error.message); return; }
        cargar();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Novedades a los talleres</CardTitle>
                <p className="text-sm text-muted-foreground">Lo que publiques acá aparece en la campana (pestaña Novedades) de TODOS los talleres.</p>
            </CardHeader>
            <CardContent className="space-y-4">
                {msg && (
                    <div className={`text-sm rounded-md p-2 ${msg.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.texto}</div>
                )}

                <div className="space-y-2 rounded-lg border p-3 bg-muted/10">
                    <Input placeholder="Título (ej: Nueva función: tareas en el service)" value={titulo} onChange={e => setTitulo(e.target.value)} />
                    <Textarea placeholder="Contá la novedad…" value={cuerpo} onChange={e => setCuerpo(e.target.value)} className="min-h-[80px]" />
                    <Button onClick={publicar} disabled={saving || !titulo.trim()} className="w-full">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                        Publicar novedad
                    </Button>
                </div>

                <div className="space-y-2">
                    {loading ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Cargando…</p>
                    ) : novedades.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Todavía no publicaste novedades.</p>
                    ) : novedades.map(n => (
                        <div key={n.id} className="flex items-start gap-3 p-3 rounded-lg border">
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${n.activa ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{n.titulo}</p>
                                {n.cuerpo && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{n.cuerpo}</p>}
                                <p className="text-[10px] text-slate-400 mt-1">{new Date(n.fecha).toLocaleDateString('es-AR')} · {n.activa ? 'Visible' : 'Oculta'}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Switch checked={n.activa} onCheckedChange={() => toggleActiva(n)} title="Mostrar / ocultar" />
                                <button onClick={() => borrar(n.id)} className="text-slate-300 hover:text-red-500 transition" title="Borrar"><Trash2 size={15} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
