import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore, type TallerData } from '@/store/authStore';
import { tieneFeature } from '@/lib/planFeatures';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/RichTextEditor';
import { NuevoBadge } from '@/components/NuevoBadge';
import {
    Settings, Loader2, Save, UploadCloud, Plus, Edit2, Check, X,
    AlertCircle, Sparkles, ListChecks, CheckCircle, Lock, Bell, HeartPulse,
    GraduationCap, PlayCircle
} from 'lucide-react';
import { useTourStore } from '@/components/OnboardingTour';
import { resetTours } from '@/lib/tourSeen';
import { ProductosOcultos } from '@/components/ProductosOcultos';
import ConectarWhatsApp from '@/pages/ConectarWhatsApp';

// ─────────────────────────────────────────────────────────────
// Guardrails del logo: la calidad del branding ya no pasa por Iara,
// la valida el sistema. Mínimos duros para que el white-label no se
// vea pixelado en sidebar / PDF.
// ─────────────────────────────────────────────────────────────
const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const LOGO_MIN_ANCHO = 512; // px (no aplica a SVG, que es vectorial)

async function validarLogo(file: File): Promise<string | null> {
    if (!LOGO_TIPOS.includes(file.type)) {
        return 'Formato no soportado. Usá PNG, JPG, WEBP o SVG.';
    }
    if (file.size > LOGO_MAX_BYTES) {
        return 'El archivo pesa más de 2 MB. Comprimilo o exportalo más liviano.';
    }
    if (file.type === 'image/svg+xml') return null;
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img.width < LOGO_MIN_ANCHO
                ? `La imagen tiene ${img.width}px de ancho y el mínimo es ${LOGO_MIN_ANCHO}px. Pedile a tu diseñador la versión en alta.`
                : null);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve('No se pudo leer la imagen.'); };
        img.src = url;
    });
}

/** Luminancia relativa 0..1 de un hex — para avisar si el texto blanco no se va a leer. */
function luminancia(hex?: string): number | null {
    if (!hex) return null;
    const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

interface ServicioCatalogo {
    id: string;
    taller_id: string;
    nombre: string;
    descripcion: string;
    precio: number;
    activo?: boolean;
}

export default function Configuracion() {
    const rol = useAuthStore(s => s.rol);
    const taller = useAuthStore(s => s.taller);
    const taller_id = useAuthStore(s => s.taller_id);
    const setTaller = useAuthStore(s => s.setTaller);

    const [activeTab, setActiveTab] = useState('taller');
    const [toast, setToast] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);

    // Abierta a todo el equipo del taller (admin + mecánicos, pedido de Iara
    // 21-jul-2026). El plan lo protege la BD (trigger proteger_plan_actual).
    const rolNorm = rol?.toLowerCase()?.trim();
    if (rolNorm === 'super_admin') return <Navigate to="/superadmin" />;
    if (!taller || !taller_id) {
        return <div className="p-8 text-center text-muted-foreground">Cargando configuración...</div>;
    }

    const puedeEditar = tieneFeature(taller, 'config_taller');

    const avisar = (tipo: 'ok' | 'error', msg: string) => {
        setToast({ tipo, msg });
        setTimeout(() => setToast(null), 4000);
    };

    return (
        <div className="space-y-6">
            <div data-tour="configuracion">
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <Settings className="h-8 w-8 text-primary" />
                    Configuración del Taller
                </h1>
                <p className="text-muted-foreground mt-1">
                    Tu marca, tu menú de services y cómo trabaja tu equipo. Los cambios se aplican al instante.
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="taller">Mi Taller</TabsTrigger>
                    <TabsTrigger value="servicios">Menú de Services</TabsTrigger>
                    <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
                    <TabsTrigger value="preferencias">Preferencias</TabsTrigger>
                </TabsList>

                <TabsContent value="taller" className="mt-6">
                    <TabMiTaller taller={taller} setTaller={setTaller} puedeEditar={puedeEditar} avisar={avisar} />
                </TabsContent>
                <TabsContent value="servicios" className="mt-6">
                    <TabMenuServices taller={taller} taller_id={taller_id} puedeEditar={puedeEditar} avisar={avisar} />
                </TabsContent>
                <TabsContent value="whatsapp" className="mt-6">
                    <ConectarWhatsApp taller={taller} avisar={avisar} />
                </TabsContent>
                <TabsContent value="preferencias" className="mt-6">
                    <TabPreferencias taller={taller} setTaller={setTaller} avisar={avisar} />
                </TabsContent>
            </Tabs>

            {toast && (
                <div className={`fixed bottom-4 right-4 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5 ${toast.tipo === 'error' ? 'bg-red-600' : 'bg-slate-800'}`}>
                    {toast.tipo === 'error'
                        ? <AlertCircle className="w-5 h-5" />
                        : <CheckCircle className="text-green-400 w-5 h-5" />}
                    <span className="text-sm font-medium">{toast.msg}</span>
                </div>
            )}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════
// TAB 1 — MI TALLER (logo, colores, textos del PDF)
// ═════════════════════════════════════════════════════════════
function TabMiTaller({ taller, setTaller, puedeEditar, avisar }: {
    taller: TallerData;
    setTaller: (t: TallerData) => void;
    puedeEditar: boolean;
    avisar: (tipo: 'ok' | 'error', msg: string) => void;
}) {
    const [form, setForm] = useState({
        color_primario: taller.color_primario || '#f25a30',
        color_secundario: taller.color_secundario || '#03adef',
        mensaje_informe: taller.mensaje_informe || '',
        politica_pago: (taller as any).politica_pago || '',
        firma_nombre: (taller as any).firma_nombre || '',
        voz_taller: (taller as any).voz_taller || '',
        ia_mensajes_activa: (taller as any).ia_mensajes_activa === true,
        // El default de la base es true: solo queda apagado si el taller lo apagó.
        ia_presupuesto_activa: (taller as any).ia_presupuesto_activa !== false,
    });
    const [isUploading, setIsUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [logoError, setLogoError] = useState<string | null>(null);

    const lum = luminancia(form.color_primario);
    const contrasteBajo = lum !== null && lum > 0.6;

    const handleFileUpload = async (file: File) => {
        if (!puedeEditar) return;
        setLogoError(null);
        const error = await validarLogo(file);
        if (error) { setLogoError(error); return; }
        try {
            setIsUploading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${taller.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('logos_talleres')
                .upload(fileName, file, { upsert: true });
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('logos_talleres')
                .getPublicUrl(fileName);
            const newLogoUrl = publicUrlData.publicUrl;

            const { error: updateError } = await supabase
                .from('talleres')
                .update({ logo_url: newLogoUrl })
                .eq('id', taller.id);
            if (updateError) throw updateError;

            setTaller({ ...taller, logo_url: newLogoUrl });
            avisar('ok', 'Logo actualizado. Ya se ve en toda la app.');
        } catch (error: any) {
            avisar('error', 'Error al subir el logo: ' + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const { error } = await supabase
                .from('talleres')
                .update({
                    color_primario: form.color_primario,
                    color_secundario: form.color_secundario,
                    mensaje_informe: form.mensaje_informe,
                    politica_pago: form.politica_pago,
                    firma_nombre: form.firma_nombre.trim() || null,
                    voz_taller: form.voz_taller.trim() || null,
                    ia_mensajes_activa: form.ia_mensajes_activa,
                    ia_presupuesto_activa: form.ia_presupuesto_activa,
                })
                .eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, ...form });
            avisar('ok', 'Cambios guardados. Los colores ya están aplicados.');
        } catch (error: any) {
            avisar('error', 'Error guardando: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Logo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div
                            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors ${!puedeEditar ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${isUploading ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:bg-muted/50'}`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                            }}
                            onClick={() => puedeEditar && document.getElementById('logo-upload-cfg')?.click()}
                        >
                            <input
                                id="logo-upload-cfg"
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                                disabled={isUploading || !puedeEditar}
                            />
                            {isUploading ? (
                                <div className="flex flex-col items-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                                    <p className="text-sm font-medium text-primary">Subiendo imagen...</p>
                                </div>
                            ) : taller.logo_url ? (
                                <div className="flex flex-col items-center w-full">
                                    <img src={taller.logo_url} alt="Logo actual" className="h-20 object-contain mb-3 rounded bg-white p-1 shadow-sm border" crossOrigin="anonymous" />
                                    <p className="text-sm font-medium">Click o arrastrá para cambiar el logo</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                                    <p className="text-sm font-medium">Click para subir o arrastrá una imagen</p>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            PNG, JPG, WEBP o SVG · mínimo {LOGO_MIN_ANCHO}px de ancho · máximo 2 MB. Ideal: PNG con fondo transparente.
                        </p>
                        {logoError && (
                            <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                {logoError}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Colores de tu marca</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Color Primario</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="color"
                                        className="w-12 h-10 p-1"
                                        value={form.color_primario}
                                        onChange={(e) => setForm({ ...form, color_primario: e.target.value })}
                                        disabled={!puedeEditar}
                                    />
                                    <Input
                                        value={form.color_primario}
                                        onChange={(e) => setForm({ ...form, color_primario: e.target.value })}
                                        placeholder="#f25a30"
                                        className="font-mono text-sm uppercase"
                                        disabled={!puedeEditar}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Color Secundario</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="color"
                                        className="w-12 h-10 p-1"
                                        value={form.color_secundario}
                                        onChange={(e) => setForm({ ...form, color_secundario: e.target.value })}
                                        disabled={!puedeEditar}
                                    />
                                    <Input
                                        value={form.color_secundario}
                                        onChange={(e) => setForm({ ...form, color_secundario: e.target.value })}
                                        placeholder="#03adef"
                                        className="font-mono text-sm uppercase"
                                        disabled={!puedeEditar}
                                    />
                                </div>
                            </div>
                        </div>
                        {contrasteBajo && (
                            <div className="flex items-start gap-1.5 text-amber-700 text-xs font-medium bg-amber-50 border border-amber-200 rounded-md p-2">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                Ese color primario es muy claro: el texto blanco de los botones puede quedar difícil de leer. Probá un tono más oscuro.
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Textos del PDF / orden de trabajo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Mensaje al pie del informe</Label>
                            <textarea
                                className="w-full min-h-[70px] p-2 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                                value={form.mensaje_informe}
                                onChange={(e) => setForm({ ...form, mensaje_informe: e.target.value })}
                                placeholder="Gracias por confiar en nosotros."
                                disabled={!puedeEditar}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Política de pago</Label>
                            <textarea
                                className="w-full min-h-[70px] p-2 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                                value={form.politica_pago}
                                onChange={(e) => setForm({ ...form, politica_pago: e.target.value })}
                                placeholder="MANO DE OBRA SOLO EFECTIVO O TRANSFERENCIA"
                                disabled={!puedeEditar}
                            />
                        </div>
                        <Button onClick={handleSave} disabled={saving || !puedeEditar} className="w-full">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Guardar cambios
                        </Button>
                    </CardContent>
                </Card>

                {/* Quién firma los WhatsApp y cómo habla.
                    Sin un nombre, el mensaje arranca sin dueño y el cliente lo
                    lee como un sistema — y a un sistema no se le contesta. */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Cómo le escribís a tus clientes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>¿Quién firma los mensajes?</Label>
                            <Input
                                value={form.firma_nombre}
                                onChange={(e) => setForm({ ...form, firma_nombre: e.target.value })}
                                placeholder="Luis"
                                disabled={!puedeEditar}
                            />
                            <p className="text-xs text-muted-foreground">
                                El nombre de pila del que atiende. Los mensajes van a empezar con
                                “Hola Marcos, acá {form.firma_nombre.trim() || '…'} de {taller.nombre || 'tu taller'}”.
                                Si lo dejás vacío, se firma con el nombre del taller.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Cómo hablás</Label>
                            <textarea
                                className="w-full min-h-[80px] p-2 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                                value={form.voz_taller}
                                onChange={(e) => setForm({ ...form, voz_taller: e.target.value })}
                                placeholder="Tuteamos, somos directos y cortos. No decimos 'estimado' ni 'aguardamos su respuesta'. Al cliente le hablamos como a un compañero de salida."
                                disabled={!puedeEditar}
                            />
                            <p className="text-xs text-muted-foreground">
                                Escribilo en tus palabras: si tuteás, qué muletillas usás, y sobre todo qué NO decís nunca.
                                Es lo que hace que tus mensajes suenen a vos y no a todos los talleres iguales.
                            </p>
                        </div>

                        {/* Los dos interruptores de abajo son de Pro/Expert (la IA es lo
                            que separa los planes, 17-ago). En Sport NO se muestran: un
                            switch que se puede prender y que el servidor rechaza es peor
                            que no tenerlo, y una demo con reloj genera bronca, no upgrade. */}
                        {tieneFeature(taller, 'mensaje_ia') && (
                        <div className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-slate-50">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Mensajes personalizados uno por uno</Label>
                                <p className="text-xs text-muted-foreground">
                                    Cada recordatorio se escribe mirando el historial de ese cliente: su bici,
                                    la carrera que corrió, lo que le hicimos la última vez. Apagado, sale el
                                    texto de siempre igual para todos.
                                </p>
                            </div>
                            <Switch
                                checked={form.ia_mensajes_activa}
                                onCheckedChange={(v) => setForm({ ...form, ia_mensajes_activa: v })}
                                disabled={!puedeEditar}
                            />
                        </div>
                        )}

                        {tieneFeature(taller, 'segundo_ojos') && (
                        <div className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-slate-50">
                            <div className="space-y-0.5">
                                <Label className="text-sm">Segundo par de ojos sobre el presupuesto</Label>
                                <p className="text-xs text-muted-foreground">
                                    Al finalizar una orden, el sistema mira el historial de esa bici y avisa
                                    lo que se está escapando ("la cadena es de hace 14 meses, preguntale").
                                    Sugiere, nunca agrega solo: el mecánico decide.
                                </p>
                            </div>
                            <Switch
                                checked={form.ia_presupuesto_activa}
                                onCheckedChange={(v) => setForm({ ...form, ia_presupuesto_activa: v })}
                                disabled={!puedeEditar}
                            />
                        </div>
                        )}

                        <Button onClick={handleSave} disabled={saving || !puedeEditar} className="w-full">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Guardar cambios
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Vista previa en vivo: cómo queda ANTES de guardar */}
            <Card className="h-fit lg:sticky lg:top-6">
                <CardHeader>
                    <CardTitle className="text-lg">Vista previa</CardTitle>
                    <p className="text-sm text-muted-foreground">Así se va a ver tu marca en la app y en la orden de trabajo.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="border rounded-lg overflow-hidden shadow-sm">
                        <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: form.color_primario }}>
                            {taller.logo_url
                                ? <img src={taller.logo_url} alt="Logo" className="h-8 object-contain" crossOrigin="anonymous" />
                                : <span className="text-white font-bold">{taller.nombre || 'Tu Taller'}</span>}
                            <span className="text-white/90 text-xs font-bold uppercase tracking-widest">Orden de trabajo</span>
                        </div>
                        <div className="p-4 bg-white space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Service Completo</span>
                                <span className="font-mono font-bold">$ 45.000</span>
                            </div>
                            <div className="flex justify-between items-center border-t pt-3">
                                <span className="text-xs text-slate-400">{form.mensaje_informe || 'Gracias por confiar en nosotros.'}</span>
                                <button className="text-white text-sm font-semibold px-4 py-2 rounded-md" style={{ backgroundColor: form.color_primario }}>
                                    Botón principal
                                </button>
                            </div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: form.color_secundario }}>
                                {form.politica_pago || 'Política de pago'}
                            </div>
                        </div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-4 flex items-center justify-center">
                        {taller.logo_url
                            ? <img src={taller.logo_url} alt="Logo sobre fondo oscuro" className="h-10 object-contain" crossOrigin="anonymous" />
                            : <span className="text-white/60 text-sm">Tu logo sobre fondo oscuro</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Si el logo no se ve bien sobre el fondo oscuro, subí una versión con fondo transparente o en blanco.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════
// TAB 2 — MENÚ DE SERVICES (catálogo con precio y descripción)
// Regla: NUNCA se borra un service (las órdenes históricas lo
// referencian por nombre). Se desactiva con el switch.
// ═════════════════════════════════════════════════════════════
function TabMenuServices({ taller, taller_id, puedeEditar, avisar }: {
    taller: TallerData;
    taller_id: string;
    puedeEditar: boolean;
    avisar: (tipo: 'ok' | 'error', msg: string) => void;
}) {
    const [servicios, setServicios] = useState<ServicioCatalogo[]>([]);
    const [loading, setLoading] = useState(true);
    const [nuevo, setNuevo] = useState({ nombre: '', descripcion: '', precio: '' });
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ nombre: '', descripcion: '', precio: '' });
    const [working, setWorking] = useState(false);

    const richText = tieneFeature(taller, 'rich_text');

    const fetchServicios = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('catalogo_servicios')
                .select('*')
                .eq('taller_id', taller_id)
                .order('nombre', { ascending: true });
            if (error) throw error;
            setServicios(data || []);
        } catch (error: any) {
            avisar('error', 'Error cargando el catálogo: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchServicios(); }, [taller_id]);

    const handleAdd = async () => {
        if (!nuevo.nombre || !nuevo.precio) return;
        try {
            setWorking(true);
            const { data, error } = await supabase
                .from('catalogo_servicios')
                .insert([{
                    taller_id,
                    nombre: nuevo.nombre.trim(),
                    descripcion: nuevo.descripcion,
                    precio: parseFloat(nuevo.precio),
                    activo: true,
                }])
                .select();
            if (error) throw error;
            if (data?.[0]) {
                setServicios([...servicios, data[0]].sort((a, b) => a.nombre.localeCompare(b.nombre)));
                setNuevo({ nombre: '', descripcion: '', precio: '' });
                avisar('ok', `"${data[0].nombre}" agregado al menú.`);
            }
        } catch (error: any) {
            avisar('error', 'Error al agregar: ' + error.message);
        } finally {
            setWorking(false);
        }
    };

    const handleUpdate = async (id: string) => {
        try {
            setWorking(true);
            const { error } = await supabase
                .from('catalogo_servicios')
                .update({
                    nombre: editForm.nombre.trim(),
                    descripcion: editForm.descripcion,
                    precio: parseFloat(editForm.precio) || 0,
                })
                .eq('id', id);
            if (error) throw error;
            setEditandoId(null);
            await fetchServicios();
            avisar('ok', 'Service actualizado.');
        } catch (error: any) {
            avisar('error', 'Error al actualizar: ' + error.message);
        } finally {
            setWorking(false);
        }
    };

    const handleToggleActivo = async (servicio: ServicioCatalogo) => {
        const nuevoEstado = servicio.activo === false;
        try {
            const { error } = await supabase
                .from('catalogo_servicios')
                .update({ activo: nuevoEstado })
                .eq('id', servicio.id);
            if (error) throw error;
            setServicios(servicios.map(s => s.id === servicio.id ? { ...s, activo: nuevoEstado } : s));
            avisar('ok', nuevoEstado
                ? `"${servicio.nombre}" vuelve a ofrecerse.`
                : `"${servicio.nombre}" desactivado: no aparece más al crear services.`);
        } catch (error: any) {
            avisar('error', 'Error: ' + error.message);
        }
    };

    return (
        <div className="space-y-4">
            <Card className="border-dashed bg-muted/20">
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Agregar service al menú</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                    <div className="flex flex-col md:flex-row gap-2 md:items-end">
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs">Nombre</Label>
                            <Input
                                className="h-9 text-sm"
                                value={nuevo.nombre}
                                onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
                                placeholder="Ej: Service Completo"
                                disabled={!puedeEditar}
                            />
                        </div>
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs">Qué incluye</Label>
                            {richText ? (
                                <RichTextEditor
                                    value={nuevo.descripcion}
                                    onChange={(html) => setNuevo({ ...nuevo, descripcion: html })}
                                    placeholder="Limpieza, lubricación, ajuste de cambios..."
                                    minHeight="60px"
                                />
                            ) : (
                                <textarea
                                    className="w-full min-h-[60px] p-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                                    value={nuevo.descripcion}
                                    onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
                                    placeholder="Limpieza, lubricación, ajuste de cambios..."
                                    disabled={!puedeEditar}
                                />
                            )}
                        </div>
                        <div className="w-full md:w-32 space-y-1">
                            <Label className="text-xs">Precio ($)</Label>
                            <Input
                                className="h-9 text-sm font-mono"
                                type="number"
                                value={nuevo.precio}
                                onChange={e => setNuevo({ ...nuevo, precio: e.target.value })}
                                placeholder="0"
                                min="0"
                                disabled={!puedeEditar}
                            />
                        </div>
                        <Button
                            size="sm"
                            className="h-9 px-4"
                            onClick={handleAdd}
                            disabled={working || !puedeEditar || !nuevo.nombre || !nuevo.precio}
                        >
                            <Plus className="h-4 w-4 mr-1" /> Agregar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="border rounded-md bg-card overflow-x-auto">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead>Service</TableHead>
                            <TableHead>Qué incluye</TableHead>
                            <TableHead className="text-right">Precio</TableHead>
                            <TableHead className="text-center w-24">Activo</TableHead>
                            <TableHead className="w-12"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : servicios.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                    Todavía no cargaste services. Agregá el primero arriba.
                                </TableCell>
                            </TableRow>
                        ) : (
                            servicios.map((servicio) => (
                                <TableRow key={servicio.id} className={servicio.activo === false ? 'opacity-50' : ''}>
                                    {editandoId === servicio.id ? (
                                        <>
                                            <TableCell>
                                                <Input
                                                    value={editForm.nombre}
                                                    onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                                                    className="h-8 shadow-none"
                                                />
                                            </TableCell>
                                            <TableCell className="align-top">
                                                {richText ? (
                                                    <RichTextEditor
                                                        value={editForm.descripcion}
                                                        onChange={(html) => setEditForm({ ...editForm, descripcion: html })}
                                                        minHeight="60px"
                                                    />
                                                ) : (
                                                    <textarea
                                                        className="w-full min-h-[60px] p-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        value={editForm.descripcion}
                                                        onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    value={editForm.precio}
                                                    onChange={(e) => setEditForm({ ...editForm, precio: e.target.value })}
                                                    className="h-8 text-right font-mono shadow-none"
                                                />
                                            </TableCell>
                                            <TableCell></TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:bg-green-50"
                                                        onClick={() => handleUpdate(servicio.id)}
                                                        disabled={working}
                                                    >
                                                        <Check size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-slate-50"
                                                        onClick={() => setEditandoId(null)}
                                                        disabled={working}
                                                    >
                                                        <X size={16} />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </>
                                    ) : (
                                        <>
                                            <TableCell className="font-medium">{servicio.nombre}</TableCell>
                                            <TableCell className="text-muted-foreground text-sm max-w-xs">
                                                {servicio.descripcion
                                                    ? <span dangerouslySetInnerHTML={{ __html: servicio.descripcion }} className="prose prose-xs max-w-none" />
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                $ {Number(servicio.precio).toLocaleString('es-AR')}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Switch
                                                    checked={servicio.activo !== false}
                                                    onCheckedChange={() => handleToggleActivo(servicio)}
                                                    disabled={!puedeEditar}
                                                />
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <div className="flex items-center justify-end">
                                                    <Button
                                                        variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/10"
                                                        onClick={() => {
                                                            setEditandoId(servicio.id);
                                                            setEditForm({
                                                                nombre: servicio.nombre,
                                                                descripcion: servicio.descripcion || '',
                                                                precio: servicio.precio.toString(),
                                                            });
                                                        }}
                                                        disabled={!puedeEditar}
                                                    >
                                                        <Edit2 size={16} />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            <p className="text-xs text-muted-foreground">
                Los services no se borran: se desactivan con el switch. Así el historial de órdenes viejas queda intacto.
                La opción "OTRO" (precio libre) está siempre disponible al crear un service.
            </p>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════
// TAB 3 — PREFERENCIAS (checklist de trabajos, pedido Cronobikes)
// El checklist NO se configura acá: se arma solo desde cada orden
// (service base + manos de obra + repuestos). Acá solo se prende/apaga.
// ═════════════════════════════════════════════════════════════
function TabPreferencias({ taller, setTaller, avisar }: {
    taller: TallerData;
    setTaller: (t: TallerData) => void;
    avisar: (tipo: 'ok' | 'error', msg: string) => void;
}) {
    const tienePlanChecklist = tieneFeature(taller, 'etapas');
    const [habilitado, setHabilitado] = useState(taller.config_avances?.habilitado === true);
    const [saving, setSaving] = useState(false);

    // Tareas del service (todos los planes) + candado de finalización.
    const [tareasHab, setTareasHab] = useState(taller.config_notificaciones?.tareas_habilitado === true);
    const [bloqueo, setBloqueo] = useState(taller.config_notificaciones?.bloquear_finalizacion === true);
    const [savingTareas, setSavingTareas] = useState(false);

    // Registro del diagnóstico: en qué momento del service se cargan los
    // avisos de mantenimiento futuro (Retención). 'final' | 'durante' | 'ambos'.
    const [momentoDiag, setMomentoDiag] = useState<'final' | 'durante' | 'ambos'>(
        taller.config_notificaciones?.momento_diagnostico || 'final'
    );
    const [savingDiag, setSavingDiag] = useState(false);

    // Autoguardado (pedido Iara 16-ago-2026): tocar el interruptor GUARDA. Antes
    // cada tarjeta tenía su propio botón "Guardar" y era fácil cambiar algo, irse, y
    // que no quedara guardado.
    //
    // Las tres son atómicas (un switch, una opción), así que no hay estado a medio
    // escribir que proteger. Van optimistas para que el control responda al toque,
    // PERO si el guardado falla el control VUELVE ATRÁS: un interruptor que quedó
    // prendido sin haber guardado es peor que el botón que sacamos, porque el taller
    // cree que la preferencia está aplicada.

    const guardarDiag = async (valor: 'final' | 'durante' | 'ambos') => {
        const anterior = momentoDiag;
        setMomentoDiag(valor);
        try {
            setSavingDiag(true);
            const config_notificaciones = {
                ...(taller.config_notificaciones || {}),
                momento_diagnostico: valor,
            };
            const { error } = await supabase
                .from('talleres')
                .update({ config_notificaciones })
                .eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_notificaciones: config_notificaciones as any });
            avisar('ok', 'Preferencia de diagnóstico guardada.');
        } catch (error: any) {
            setMomentoDiag(anterior);
            avisar('error', 'No se pudo guardar: ' + error.message);
        } finally {
            setSavingDiag(false);
        }
    };

    const guardarTareas = async (patch: { tareas?: boolean; bloqueo?: boolean }) => {
        const antesTareas = tareasHab;
        const antesBloqueo = bloqueo;
        const nuevoTareas = patch.tareas ?? tareasHab;
        // Sin tareas no hay candado posible: apagar una apaga la otra.
        const nuevoBloqueo = nuevoTareas ? (patch.bloqueo ?? bloqueo) : false;
        setTareasHab(nuevoTareas);
        setBloqueo(nuevoBloqueo);
        try {
            setSavingTareas(true);
            const config_notificaciones = {
                ...(taller.config_notificaciones || {}),
                tareas_habilitado: nuevoTareas,
                bloquear_finalizacion: nuevoBloqueo,
            };
            const { error } = await supabase
                .from('talleres')
                .update({ config_notificaciones })
                .eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_notificaciones: config_notificaciones as any });
            avisar('ok', nuevoTareas
                ? 'Tareas del service activadas. El mecánico ya puede anotar tareas en cada orden.'
                : 'Tareas del service desactivadas.');
        } catch (error: any) {
            setTareasHab(antesTareas);
            setBloqueo(antesBloqueo);
            avisar('error', 'No se pudo guardar: ' + error.message);
        } finally {
            setSavingTareas(false);
        }
    };

    const guardarAvances = async (valor: boolean) => {
        const anterior = habilitado;
        setHabilitado(valor);
        try {
            setSaving(true);
            const config_avances = { habilitado: valor };
            const { error } = await supabase
                .from('talleres')
                .update({ config_avances })
                .eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_avances: config_avances as any });
            avisar('ok', valor
                ? 'Checklist de trabajos activado. Lo vas a ver en cada orden de la Mesa de Trabajo.'
                : 'Checklist de trabajos desactivado.');
        } catch (error: any) {
            setHabilitado(anterior);
            avisar('error', 'No se pudo guardar: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    // Rediseño compacto (pedido Iara 3-ago-2026): las preferencias se leen de
    // un vistazo — grilla de 2 columnas en desktop, textos cortos, el ejemplo
    // plegado. La información es la misma; el scroll, la mitad.
    return (
        /* Sin items-start: las 2 tarjetas de cada fila se estiran a la misma
           altura y el Guardar queda anclado abajo (mt-auto) → columnas parejas. */
        <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    Checklist de trabajos del service
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Los trabajos de cada orden aparecen como lista tildable en la Mesa de Trabajo;
                    al finalizar, la app avisa si quedó algo sin marcar.
                </p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3">
                {!tienePlanChecklist && (
                    <div className="flex items-center gap-2 p-2.5 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-xs">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        Disponible en los planes Pro y Expert.
                    </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <p className="font-semibold text-sm pr-3">Activar checklist de trabajos</p>
                    <Switch
                        checked={habilitado}
                        onCheckedChange={guardarAvances}
                        disabled={!tienePlanChecklist || saving}
                    />
                </div>

                {/* Ejemplo concreto, plegado para no ocupar pantalla */}
                <details className="rounded-lg border bg-slate-50">
                    <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                        Ver ejemplo
                    </summary>
                    <div className="px-3 pb-3">
                        <p className="text-slate-600 text-xs mb-1.5">Si la orden tiene cargado:</p>
                        <ul className="space-y-1 text-slate-700 text-xs">
                            <li className="flex items-center gap-2"><Check size={13} className="text-green-600" /> Service Completo <span className="text-[10px] font-semibold px-1.5 rounded-full bg-primary/10 text-primary">Service</span></li>
                            <li className="flex items-center gap-2"><Check size={13} className="text-green-600" /> Cambio de cadena <span className="text-[10px] font-semibold px-1.5 rounded-full bg-blue-50 text-blue-600">Mano de obra</span></li>
                            <li className="flex items-center gap-2"><span className="w-3 h-3 border rounded-sm inline-block" /> Cadena Shimano 11v <span className="text-[10px] font-semibold px-1.5 rounded-full bg-slate-100 text-slate-500">Repuesto</span></li>
                        </ul>
                        <p className="text-slate-500 text-[11px] mt-1.5">
                            …ese es el checklist de esa orden. Se agrega un trabajo → aparece solo en la lista.
                        </p>
                    </div>
                </details>
            </CardContent>
        </Card>

        {/* ── Tareas del service (todos los planes) — pedido Cronobikes ── */}
        <Card className="flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    Tareas del service
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    El mecánico anota tareas libres en cada orden para no olvidarse
                    (ej: "colocar plato 34"). Todos los planes.
                </p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <p className="font-semibold text-sm pr-3">Activar tareas del service</p>
                    <Switch
                        checked={tareasHab}
                        onCheckedChange={v => guardarTareas({ tareas: v })}
                        disabled={savingTareas}
                    />
                </div>

                <div className={`flex items-center justify-between p-3 rounded-lg border transition-opacity ${tareasHab ? 'bg-amber-50/50 border-amber-200' : 'bg-muted/20 opacity-50'}`}>
                    <div className="pr-3">
                        <p className="font-semibold text-sm flex items-center gap-1.5">
                            <Lock className="h-4 w-4 text-amber-600" /> Candado de finalización
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            "Finalizar service" se bloquea hasta tildar todas las tareas de la orden.
                        </p>
                    </div>
                    <Switch
                        checked={bloqueo}
                        onCheckedChange={v => guardarTareas({ bloqueo: v })}
                        disabled={!tareasHab || savingTareas}
                    />
                </div>
            </CardContent>
        </Card>

        {/* ── Registro del diagnóstico (todos los planes) ── */}
        <Card className="flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-primary" />
                    Registro del diagnóstico
                    <NuevoBadge feature="registro-diagnostico" />
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    El diagnóstico genera los avisos de mantenimiento que aparecen en Retención.
                    ¿En qué momento del service se registra?
                </p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-2">
                {([
                    { val: 'final', tit: 'Al finalizar el service', desc: 'Al cerrar la orden. Por defecto.' },
                    { val: 'durante', tit: 'Durante el service', desc: 'Mientras se trabaja en la bici.' },
                    { val: 'ambos', tit: 'Durante y al finalizar', desc: 'Siempre disponible, con repaso al cerrar.' },
                ] as const).map(opt => (
                    <button
                        key={opt.val}
                        type="button"
                        onClick={() => guardarDiag(opt.val)}
                        disabled={savingDiag}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${momentoDiag === opt.val ? 'border-primary bg-primary/5' : 'bg-muted/20 hover:border-primary/40'}`}
                    >
                        <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${momentoDiag === opt.val ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`} />
                        <span className="flex-1 flex items-baseline justify-between gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{opt.tit}</span>
                            <span className="text-[11px] text-muted-foreground">{opt.desc}</span>
                        </span>
                    </button>
                ))}
            </CardContent>
        </Card>

        {/* ── Recorrido de bienvenida (todos los planes) ── */}
        <Card className="flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    Recorrido de bienvenida
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    El tutorial interactivo completo: recorre todas las secciones y, en los pasos
                    clave, la persona opera el sistema con sus propias manos (recibe una bici,
                    abre una finalización, explora una ficha). Ideal para capacitar a alguien
                    nuevo del equipo sin explicarle nada a mano.
                </p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
                <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-auto"
                    onClick={() => { resetTours(); useTourStore.getState().iniciar('bienvenida'); }}
                >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Ver el recorrido nuevamente
                </Button>
            </CardContent>
        </Card>

        {/* La vuelta atrás del "no sugerir más" del buscador de repuestos.
            Sin esto, ocultar un producto era una acción de un clic, permanente
            y sin deshacer. */}
        <ProductosOcultos avisar={avisar} />
        </div>
    );
}
