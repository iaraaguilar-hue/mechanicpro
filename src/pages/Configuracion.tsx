import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
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
    Settings, Loader2, Save, UploadCloud, Plus, Edit2, Check, X, Users,
    AlertCircle, Sparkles, ListChecks, CheckCircle, Lock, Bell, HeartPulse,
    GraduationCap, PlayCircle, PhoneCall, Eye, Bike, Hash, Printer, CalendarDays } from 'lucide-react';
import { useTourStore } from '@/components/OnboardingTour';
import { resetTours } from '@/lib/tourSeen';
import { ProductosOcultos } from '@/components/ProductosOcultos';
import ConectarWhatsApp from '@/pages/ConectarWhatsApp';
import { MensajesAutomaticos } from '@/components/MensajesAutomaticos';
import { AltasDesdeERP } from '@/components/AltasDesdeERP';
import { ComoFunciona } from '@/components/ComoFunciona';
import { PanelAjustes, FilaAjuste, SubAjuste, GrupoAjustes } from '@/components/FilaAjuste';
import { configTicketIngreso } from '@/lib/ticketIngreso';
import { configMantenimiento, COMPONENTES_BASE, PLAZOS_MESES, POSTVENTA_DEFAULT, mesesEnPalabras, comoLeLlegaPostventa, type ComponenteDiagnostico, type ConfigPostventa } from '@/lib/mantenimiento';
import { tintaSobre, tintaLegible, PISO_TEXTO_GRANDE } from '@/lib/contraste';
import { BuscadorDeAjustes, AJUSTES, type Ajuste, type PestanaConfig } from '@/components/BuscadorDeAjustes';

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


interface ServicioCatalogo {
    id: string;
    taller_id: string;
    nombre: string;
    descripcion: string;
    precio: number;
    activo?: boolean;
    /** Cada cuántos meses se repite. NULL = no se repite solo (16-sep-2026). */
    meses_repeticion?: number | null;
}

/** Lo que Preferencias necesita del menú para armar los avisos propios. */
type ServicioDelMenu = Pick<ServicioCatalogo, 'id' | 'nombre' | 'activo' | 'meses_repeticion'>;

export default function Configuracion() {
    const rol = useAuthStore(s => s.rol);
    const taller = useAuthStore(s => s.taller);
    const taller_id = useAuthStore(s => s.taller_id);
    const setTaller = useAuthStore(s => s.setTaller);

    const [activeTab, setActiveTab] = useState<string>('taller');
    const [toast, setToast] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);

    // Lleva a un ajuste: abre su pestaña, lo acomoda en pantalla y lo marca un
    // momento. El retraso es porque el contenido de una pestaña cerrada no existe
    // en el DOM hasta que se abre.
    function irAAjuste(a: { id: string; tab: PestanaConfig }) {
        setActiveTab(a.tab);
        setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-ajuste="${a.id}"]`);
            if (!el) return;
            const alto = el.getBoundingClientRect().height;
            el.scrollIntoView({ behavior: 'smooth', block: alto > window.innerHeight * 0.6 ? 'start' : 'center' });
            el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
            setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2400);
        }, 200);
    }

    // `/configuracion?ajuste=firma` abre directo en el ajuste: sirve para que otra
    // pantalla mande al lugar exacto ("cargá las formas de pago") y no a una
    // pestaña donde hay que volver a buscar.
    const [params] = useSearchParams();
    useEffect(() => {
        const a = AJUSTES.find(x => x.id === params.get('ajuste'));
        if (a && taller) irAAjuste(a);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params, !!taller]);

    // Abierta a todo el equipo del taller (admin + mecánicos, pedido de Iara
    // 21-jul-2026). El plan lo protege la BD (trigger proteger_plan_actual).
    const rolNorm = rol?.toLowerCase()?.trim();
    if (rolNorm === 'super_admin') return <Navigate to="/superadmin" />;
    if (!taller || !taller_id) {
        return <div className="p-8 text-center text-muted-foreground">Cargando configuración...</div>;
    }

    const puedeEditar = tieneFeature(taller, 'config_taller');
    // El número propio del taller y todo lo que sale solo son del Pro para
    // arriba (reparto de Iara, 9-sep-2026). En Sport la pestaña no aparece.
    const verWhatsApp = tieneFeature(taller, 'whatsapp_propio');

    const avisar = (tipo: 'ok' | 'error', msg: string) => {
        setToast({ tipo, msg });
        setTimeout(() => setToast(null), 4000);
    };

    // Solo se ofrece lo que está en pantalla para ESTE taller: un resultado que
    // lleva a un ajuste que su plan no muestra es un botón que no hace nada.
    const ajustesVisibles = AJUSTES.filter((a: Ajuste) =>
        (!a.requiere || tieneFeature(taller, a.requiere)) && (!a.soloAdmin || rolNorm === 'admin'));

    return (
        <div className="space-y-6">
            <div data-tour="configuracion" className="space-y-4">
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <Settings className="h-8 w-8 text-primary" />
                    Configuración del Taller
                </h1>
                {/* Acá decía "los cambios se aplican al instante", y en Mi Taller no era
                    cierto: había que apretar Guardar. En su lugar va lo que resuelve la
                    pregunta de verdad, "¿dónde se cambia tal cosa?" (14-sep-2026). */}
                <BuscadorDeAjustes ajustes={ajustesVisibles} onIr={irAAjuste} />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                {/* 🔴 `grid-cols-5` en 390px comprime las cinco pestañas hasta que se
                    pisan entre sí: se leía "Mi TallMenú de ServiMasMAppajes auton". Pasó
                    al sumar la quinta (Mensajes automáticos, 3-sep-2026). En pantalla
                    chica van en fila con scroll horizontal, que es lo que hace cualquier
                    app con más pestañas que ancho; desde `sm` vuelve la grilla pareja. */}
                <TabsList className={`flex w-full justify-start overflow-x-auto sm:grid ${verWhatsApp ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
                    <TabsTrigger value="taller" className="flex-shrink-0">Mi Taller</TabsTrigger>
                    <TabsTrigger value="servicios" className="flex-shrink-0">Menú de Services</TabsTrigger>
                    {/* El WhatsApp propio y todo lo que cuelga de él son del Pro
                        para arriba (reparto de Iara, 9-sep-2026). La pestaña no se
                        muestra en Sport: un botón que lleva a un cartel de "tu plan
                        no incluye esto" es peor que no tenerlo. */}
                    {verWhatsApp && <TabsTrigger value="whatsapp" data-tour="config-whatsapp" className="flex-shrink-0">WhatsApp</TabsTrigger>}
                    {/* "Mensajes" y no "Mensajes automáticos" (14-sep-2026): ahora arranca
                        con quién firma y cómo hablás, que valen para TODOS los planes
                        (vivían en Mi Taller, al lado del logo, donde nadie los buscaba).
                        Lo automático sigue siendo del Pro para arriba y en Sport no aparece. */}
                    <TabsTrigger value="automaticos" data-tour={verWhatsApp ? 'config-automaticos' : undefined} className="flex-shrink-0">Mensajes</TabsTrigger>
                    <TabsTrigger value="preferencias" className="flex-shrink-0">Preferencias</TabsTrigger>
                </TabsList>

                {/* `forceMount`: con cambios sin guardar, cambiar de pestaña los borraba
                    sin avisar (Radix desmonta la pestaña cerrada). Queda montada y
                    oculta, y lo escrito sigue ahí al volver. */}
                <TabsContent value="taller" forceMount className="mt-6 data-[state=inactive]:hidden">
                    <TabMiTaller taller={taller} setTaller={setTaller} puedeEditar={puedeEditar} avisar={avisar} />
                </TabsContent>
                <TabsContent value="servicios" className="mt-6">
                    <TabMenuServices taller={taller} taller_id={taller_id} puedeEditar={puedeEditar} avisar={avisar} />
                </TabsContent>
                {verWhatsApp && <TabsContent value="whatsapp" className="mt-6">
                    <div data-ajuste="whatsapp" className="rounded-lg">
                        <ConectarWhatsApp taller={taller} avisar={avisar} />
                    </div>
                </TabsContent>}
                <TabsContent value="automaticos" className="mt-6 space-y-6">
                    <ComoEscribis taller={taller} setTaller={setTaller} avisar={avisar} />
                    {verWhatsApp && (
                        <div data-ajuste="automaticos" data-tour="config-automaticos" className="rounded-lg">
                            <MensajesAutomaticos taller={taller} avisar={avisar} irAWhatsApp={() => { setActiveTab('whatsapp'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                        </div>
                    )}
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
    });
    // Lo que está guardado, para saber si hay cambios sin guardar. Quién firma,
    // cómo hablás y los interruptores de IA se mudaron el 14-sep-2026 a "Mensajes"
    // y "Preferencias": acá quedó solo la marca y el comprobante.
    const guardadoEnBase = {
        color_primario: taller.color_primario || '#f25a30',
        color_secundario: taller.color_secundario || '#03adef',
        mensaje_informe: taller.mensaje_informe || '',
        politica_pago: (taller as any).politica_pago || '',
    };
    const sinGuardar = (Object.keys(guardadoEnBase) as (keyof typeof guardadoEnBase)[])
        .some(k => form[k] !== guardadoEnBase[k]);
    // 🔴 LA VISTA PREVIA MOSTRABA UN SERVICE QUE EL TALLER NO TIENE (12-sep-2026).
    // Decía "Service Completo $ 45.000" fijo, para todos: en un taller con SPORT/PRO/EXPERT
    // la previa de SU comprobante mostraba un renglón que su comprobante nunca va a traer.
    // Va el PRIMER service que cargó (el principal de su menú, casi siempre): el más barato
    // salía "Lavado y lubricación", que es un renglón real pero no es su comprobante típico.
    // El ejemplo fijo queda solo si el menú está vacío.
    const [muestra, setMuestra] = useState<{ nombre: string; precio: number } | null>(null);
    useEffect(() => {
        let vivo = true;
        supabase.from('catalogo_servicios').select('nombre, precio')
            .eq('taller_id', taller.id).eq('activo', true)
            .order('creado_en', { ascending: true }).limit(1)
            .then(({ data }) => { if (vivo && data?.[0]) setMuestra({ nombre: data[0].nombre, precio: Number(data[0].precio) || 0 }); });
        return () => { vivo = false; };
    }, [taller.id]);
    const [isUploading, setIsUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [logoError, setLogoError] = useState<string | null>(null);

    // Ya no es un aviso de "puede quedar difícil de leer": la app calcula sola
    // la tinta que va encima de cada color (contraste.ts). Esto solo le anticipa
    // al taller qué va a pasar, para que no le parezca un error.
    // Origen: Ariel Leira eligió blanco de secundario y el aviso viejo ni lo
    // miraba — solo miraba el primario (10-sep-2026).
    const clarosDeMas = ([
        ['primario', form.color_primario],
        ['secundario', form.color_secundario],
    ] as const).filter(([, c]) => tintaSobre(c) !== '#FFFFFF').map(([q]) => q);

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
                <Card data-ajuste="logo">
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

                <Card data-ajuste="colores">
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
                        {clarosDeMas.length > 0 && (
                            <div className="flex items-start gap-1.5 text-slate-600 text-xs bg-slate-50 border border-slate-200 rounded-md p-2">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                <span>
                                    Elegiste un {clarosDeMas.join(' y un ')} claro, así que
                                    el texto que va encima sale <strong>oscuro</strong> en vez de blanco.
                                    Se ajusta solo para que se lea: mirá la vista previa.
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card data-ajuste="textos_pdf">
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
                        {/* La vista previa usa la MISMA tinta calculada que la app: si acá
                            saliera blanco fijo, un color claro se vería bien en la previa y
                            mal en la pantalla real, que es peor que no tener previa. */}
                        <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: form.color_primario }}>
                            {taller.logo_url
                                ? <img src={taller.logo_url} alt="Logo" className="h-8 object-contain" crossOrigin="anonymous" />
                                : <span className="font-bold" style={{ color: tintaSobre(form.color_primario) }}>{taller.nombre || 'Tu Taller'}</span>}
                            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: tintaSobre(form.color_primario), opacity: 0.9 }}>Orden de trabajo</span>
                        </div>
                        <div className="p-4 bg-white space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">{muestra?.nombre ?? 'Service Completo'}</span>
                                <span className="font-mono font-bold">$ {(muestra?.precio ?? 45000).toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between items-center border-t pt-3">
                                <span className="text-xs text-slate-500">{form.mensaje_informe || 'Gracias por confiar en nosotros.'}</span>
                                <button className="text-sm font-semibold px-4 py-2 rounded-md" style={{ backgroundColor: form.color_primario, color: tintaSobre(form.color_primario) }}>
                                    Botón principal
                                </button>
                            </div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tintaLegible(form.color_secundario, '#FFFFFF', PISO_TEXTO_GRANDE) }}>
                                {form.politica_pago || 'Política de pago'}
                            </div>
                        </div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-4 flex items-center justify-center">
                        {taller.logo_url
                            ? <img src={taller.logo_url} alt="Logo sobre fondo oscuro" className="h-10 object-contain" crossOrigin="anonymous" />
                            : <span className="text-white/60 text-sm">Tu logo sobre fondo oscuro</span>}
                    </div>
                    <ComoFunciona>
                        <p className="text-xs text-muted-foreground">
                            Si el logo no se ve bien sobre el fondo oscuro, subí una versión con fondo transparente o en blanco.
                        </p>
                    </ComoFunciona>
                </CardContent>
            </Card>

            {/* 🔴 UN SOLO GUARDAR, Y SOLO CUANDO HAY ALGO PARA GUARDAR (14-sep-2026).
                Había dos botones "Guardar cambios" iguales, uno por tarjeta, y los dos
                guardaban TODO: se cambiaba un color, se apretaba el de la otra tarjeta
                "por las dudas", y nadie sabía qué había quedado. Ahora la barra aparece
                apenas se toca algo y dice lo que pasa. */}
            {sinGuardar && (
                <div className="fixed inset-x-4 bottom-4 md:inset-x-auto md:right-8 z-40 flex items-center justify-between gap-3 rounded-xl bg-slate-900 text-white px-4 py-3 shadow-2xl">
                    <span className="text-sm font-medium">Tenés cambios sin guardar</span>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost" size="sm"
                            className="text-white hover:bg-white/10 hover:text-white"
                            onClick={() => setForm(guardadoEnBase)}
                            disabled={saving}
                        >
                            Descartar
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || !puedeEditar}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                            Guardar cambios
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════
// PESTAÑA MENSAJES — quién firma, cómo hablás, la IA de los mensajes.
//
// Vivía en "Mi Taller", entre el logo y los colores: el que quería cambiar la
// firma de los WhatsApp no la iba a buscar al lado del logo (14-sep-2026). Ahora
// encabeza "Mensajes", que ven todos los planes. Y se guarda sola al salir del
// campo: antes dependía del botón "Guardar" de otra tarjeta, y cambiar la firma
// e irse era perderla.
// ═════════════════════════════════════════════════════════════
function ComoEscribis({ taller, setTaller, avisar }: {
    taller: TallerData;
    setTaller: (t: TallerData) => void;
    avisar: (tipo: 'ok' | 'error', msg: string) => void;
}) {
    const [firma, setFirma] = useState((taller as any).firma_nombre || '');
    const [voz, setVoz] = useState((taller as any).voz_taller || '');
    const [iaMensajes, setIaMensajes] = useState((taller as any).ia_mensajes_activa === true);
    const [recienGuardado, setRecienGuardado] = useState<string | null>(null);

    const guardar = async (patch: Record<string, unknown>, cual: string): Promise<boolean> => {
        const { error } = await supabase.from('talleres').update(patch).eq('id', taller.id);
        if (error) { avisar('error', 'No se pudo guardar: ' + error.message); return false; }
        setTaller({ ...taller, ...patch } as TallerData);
        setRecienGuardado(cual);
        setTimeout(() => setRecienGuardado(g => (g === cual ? null : g)), 2500);
        return true;
    };

    const Guardado = ({ cual }: { cual: string }) => recienGuardado === cual
        ? <span className="text-xs text-green-700 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Guardado</span>
        : null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Cómo le escribís a tus clientes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Sin un nombre, el mensaje arranca sin dueño y el cliente lo lee
                    como un sistema — y a un sistema no se le contesta. */}
                <div className="space-y-2" data-ajuste="firma">
                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="firma-mensajes">¿Quién firma los mensajes?</Label>
                        <Guardado cual="firma" />
                    </div>
                    <Input
                        id="firma-mensajes"
                        value={firma}
                        onChange={(e) => setFirma(e.target.value)}
                        onBlur={() => {
                            const nueva = firma.trim();
                            if (nueva !== ((taller as any).firma_nombre || '')) void guardar({ firma_nombre: nueva || null }, 'firma');
                        }}
                        placeholder="Luis"
                    />
                    <ComoFunciona>
                        <p className="text-xs text-muted-foreground">
                            El nombre de pila del que atiende. Los mensajes van a empezar con
                            “Hola Marcos, acá {firma.trim() || '…'} de {taller.nombre || 'tu taller'}”.
                            Si lo dejás vacío, se firma con el nombre del taller.
                        </p>
                    </ComoFunciona>
                </div>

                <div className="space-y-2" data-ajuste="voz">
                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="voz-mensajes">Cómo hablás</Label>
                        <Guardado cual="voz" />
                    </div>
                    <textarea
                        id="voz-mensajes"
                        className="w-full min-h-[80px] p-2 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={voz}
                        onChange={(e) => setVoz(e.target.value)}
                        onBlur={() => {
                            const nueva = voz.trim();
                            if (nueva !== ((taller as any).voz_taller || '')) void guardar({ voz_taller: nueva || null }, 'voz');
                        }}
                        placeholder="Tuteamos, somos directos y cortos. No decimos 'estimado' ni 'aguardamos su respuesta'. Al cliente le hablamos como a un compañero de salida."
                    />
                    <ComoFunciona>
                        <p className="text-xs text-muted-foreground">
                            Escribilo en tus palabras: si tuteás, qué muletillas usás, y sobre todo qué NO decís nunca.
                            Es lo que hace que tus mensajes suenen a vos y no a todos los talleres iguales.
                        </p>
                    </ComoFunciona>
                </div>

                {/* De Pro/Expert (la IA es lo que separa los planes, 17-ago). En Sport NO
                    se muestra: un switch que se puede prender y que el servidor rechaza es
                    peor que no tenerlo. */}
                {tieneFeature(taller, 'mensaje_ia') && (
                    <div className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-slate-50" data-ajuste="ia_mensajes">
                        <div className="space-y-0.5">
                            <Label className="text-sm">Mensajes personalizados uno por uno</Label>
                            <ComoFunciona>
                                <p className="text-xs text-muted-foreground">
                                    Cada recordatorio se escribe mirando el historial de ese cliente: su bici,
                                    la carrera que corrió, lo que le hicimos la última vez. Apagado, sale el
                                    texto de siempre igual para todos.
                                </p>
                            </ComoFunciona>
                        </div>
                        <Switch
                            checked={iaMensajes}
                            onCheckedChange={async (v) => {
                                const antes = iaMensajes;
                                setIaMensajes(v);
                                if (!(await guardar({ ia_mensajes_activa: v }, 'ia'))) setIaMensajes(antes);
                            }}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
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

    // ── Cada cuánto se repite este service (Iara, 16-sep-2026). Se guarda al
    // tocar el select: es un dato de a uno, no hay formulario que confirmar.
    // El mismo campo se edita desde Preferencias (los avisos propios del taller).
    const handleRepeticion = async (id: string, meses: number | null) => {
        const antes = servicios;
        setServicios(servicios.map(s => (s.id === id ? { ...s, meses_repeticion: meses } : s)));
        const { error } = await supabase.from('catalogo_servicios').update({ meses_repeticion: meses }).eq('id', id);
        if (error) { setServicios(antes); avisar('error', 'No se pudo guardar: ' + error.message); }
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
        <div className="space-y-4 rounded-lg" data-ajuste="menu">
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
                            <TableHead className="text-center w-40">Se repite</TableHead>
                            <TableHead className="text-center w-24">Activo</TableHead>
                            <TableHead className="w-12"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : servicios.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
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
                                            <TableCell></TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                                                        onClick={() => handleUpdate(servicio.id)}
                                                        disabled={working}
                                                    >
                                                        <Check size={16} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
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
                                                <select
                                                    value={servicio.meses_repeticion ?? ''}
                                                    disabled={!puedeEditar}
                                                    onChange={e => handleRepeticion(servicio.id, e.target.value ? Number(e.target.value) : null)}
                                                    className="h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-60"
                                                    aria-label={`Cada cuánto se repite ${servicio.nombre}`}
                                                >
                                                    <option value="">No se repite</option>
                                                    {PLAZOS_MESES.map(m => <option key={m} value={m}>cada {mesesEnPalabras(m)}</option>)}
                                                </select>
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
                                                        variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-primary hover:bg-primary/10"
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
            <ComoFunciona>
                <p>
                    Los services no se borran: se desactivan con el switch. Así el historial de órdenes viejas queda intacto.
                    La opción "OTRO" (precio libre) está siempre disponible al crear un service.
                </p>
                <p>
                    <strong>Se repite:</strong> cada vez que una orden incluye ese service, esa bici
                    queda agendada para dentro del plazo que elijas. El aviso cae entre los
                    vencimientos de Retención y, con el WhatsApp conectado, sale solo el día que toca.
                    Sirve para lo que se hace seguido: un lavado y lubricación cada dos meses, por
                    ejemplo. Lo mismo se edita desde Preferencias.
                </p>
            </ComoFunciona>
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

    // Calendario de turnos (Juan Otero, Private Garage, 25-sep-2026): opt-in, Pro/Expert.
    const tienePlanTurnos = tieneFeature(taller, 'turnos');
    const [turnosHab, setTurnosHab] = useState(taller.config_turnos?.habilitado === true);
    const [savingTurnos, setSavingTurnos] = useState(false);

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

    // A las cuántas horas sin respuesta la orden avisa "llamalo" (8-sep-2026).
    // No es lo mismo un taller que entrega en el día que uno con dos semanas de
    // cola, así que lo elige el taller. Vive en su propia columna y no en el
    // jsonb porque el tablero lo lee en cada renglón de la mesa de trabajo.
    const [horasLlamar, setHorasLlamar] = useState<number>(Number((taller as any).horas_para_llamar ?? 3));
    const [savingHoras, setSavingHoras] = useState(false);

    const guardarHoras = async (valor: number) => {
        const anterior = horasLlamar;
        setHorasLlamar(valor);
        try {
            setSavingHoras(true);
            const { error } = await supabase
                .from('talleres')
                .update({ horas_para_llamar: valor })
                .eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, horas_para_llamar: valor } as any);
            avisar('ok', 'Listo, ese es el plazo.');
        } catch (error: any) {
            setHorasLlamar(anterior);
            avisar('error', 'No se pudo guardar: ' + error.message);
        } finally {
            setSavingHoras(false);
        }
    };

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

    // ── El ticket de ingreso A4 que se corta al medio (Alejo, 11 a Fondo, 20-sep-2026).
    // No reemplaza al comprobante: el entero sigue saliendo igual al entregar.
    const cfgTicket = configTicketIngreso(taller);
    const [ticketHab, setTicketHab] = useState(cfgTicket.habilitado);
    const [ticketNotas, setTicketNotas] = useState(cfgTicket.notasInternas);
    const [savingTicket, setSavingTicket] = useState(false);

    const guardarTicket = async (patch: { habilitado?: boolean; notas_internas?: boolean }) => {
        const antes = { habilitado: ticketHab, notas_internas: ticketNotas };
        const nuevo = {
            habilitado: patch.habilitado ?? ticketHab,
            notas_internas: patch.notas_internas ?? ticketNotas,
        };
        setTicketHab(nuevo.habilitado);
        setTicketNotas(nuevo.notas_internas);
        try {
            setSavingTicket(true);
            const { error } = await supabase
                .from('talleres')
                .update({ config_ticket_ingreso: nuevo })
                .eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_ticket_ingreso: nuevo as any });
            avisar('ok', nuevo.habilitado
                ? 'Listo. El boton "Comprobante de ingreso" esta al confirmar el ingreso, en la fila y adentro de la orden.'
                : 'Apagado. El boton sale de todos lados.');
        } catch (e: any) {
            setTicketHab(antes.habilitado);
            setTicketNotas(antes.notas_internas);
            avisar('error', e.message || 'No se pudo guardar');
        } finally {
            setSavingTicket(false);
        }
    };

    const guardarTurnos = async (v: boolean) => {
        const antes = turnosHab;
        setTurnosHab(v);
        try {
            setSavingTurnos(true);
            const config_turnos = { ...(taller.config_turnos || {}), habilitado: v };
            const { error } = await supabase.from('talleres').update({ config_turnos }).eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_turnos });
            avisar('ok', v
                ? 'Calendario de turnos prendido: ya está Turnos en el menú.'
                : 'Calendario de turnos apagado. Los turnos anotados quedan guardados.');
        } catch (error: any) {
            setTurnosHab(antes);
            avisar('error', 'No se pudo guardar: ' + error.message);
        } finally {
            setSavingTurnos(false);
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

    // ── Avisos suaves (3-sep-2026). Los umbrales se guardan al salir del campo
    // (onBlur) y no en cada tecla: guardar por cada dígito manda un update por
    // letra y deja estados intermedios raros como "1" mientras se escribe "120".
    const cfgSuaves = taller.config_notificaciones?.avisos_suaves || {};
    const [suavesHab, setSuavesHab] = useState(cfgSuaves.habilitado === true);
    const [suavesPS, setSuavesPS] = useState(cfgSuaves.primerServiceDias ?? 30);
    const [suavesNV, setSuavesNV] = useState(cfgSuaves.noVolvioDias ?? 120);
    // 14-sep-2026 (Leira): también el cliente que viene seguido. Prendido de fábrica.
    const [suavesFrec, setSuavesFrec] = useState(cfgSuaves.incluirFrecuentes !== false);
    const [savingSuaves, setSavingSuaves] = useState(false);

    const guardarSuaves = async (patch: { habilitado?: boolean; primerServiceDias?: number; noVolvioDias?: number; incluirFrecuentes?: boolean }) => {
        const antes = { habilitado: suavesHab, primerServiceDias: suavesPS, noVolvioDias: suavesNV, incluirFrecuentes: suavesFrec };
        if (patch.habilitado !== undefined) setSuavesHab(patch.habilitado);
        if (patch.incluirFrecuentes !== undefined) setSuavesFrec(patch.incluirFrecuentes);
        try {
            setSavingSuaves(true);
            const avisos_suaves = { ...antes, ...patch };
            const config_notificaciones = { ...(taller.config_notificaciones || {}), avisos_suaves };
            const { error } = await supabase.from('talleres').update({ config_notificaciones }).eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_notificaciones: config_notificaciones as any });
            if (patch.habilitado !== undefined) {
                avisar('ok', patch.habilitado
                    ? 'Listo. Los vas a ver en Retención, abajo de los vencimientos.'
                    : 'Desactivado.');
            }
        } catch (error: any) {
            setSuavesHab(antes.habilitado); setSuavesPS(antes.primerServiceDias); setSuavesNV(antes.noVolvioDias);
            setSuavesFrec(antes.incluirFrecuentes);
            avisar('error', 'No se pudo guardar: ' + error.message);
        } finally {
            setSavingSuaves(false);
        }
    };

    // ── Número de orden grande (Leira, 14-sep-2026): "va a usar mucho el número
    // de orden". Iara: solo para él, así que es un ajuste del taller y no un cambio
    // de la app.
    const [ordenGrande, setOrdenGrande] = useState(taller.config_vista?.numero_orden_grande === true);
    const guardarOrdenGrande = async (v: boolean) => {
        setOrdenGrande(v);
        try {
            const config_vista = { ...(taller.config_vista || {}), numero_orden_grande: v };
            const { error } = await supabase.from('talleres').update({ config_vista }).eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_vista });
        } catch (error: any) {
            setOrdenGrande(!v);
            avisar('error', 'No se pudo guardar: ' + error.message);
        }
    };

    // ── Componentes y plazos del diagnóstico (Leira, 14-sep-2026). Se guarda al
    // tocar: agregar, sacar o cambiar un plazo son cambios de a uno.
    const [componentes, setComponentes] = useState<ComponenteDiagnostico[]>(() => configMantenimiento(taller).componentes);
    const [nuevoComponente, setNuevoComponente] = useState('');
    const [savingComp, setSavingComp] = useState(false);
    const guardarComponentes = async (lista: ComponenteDiagnostico[] | null) => {
        const antes = componentes;
        setComponentes(lista ?? COMPONENTES_BASE);
        try {
            setSavingComp(true);
            const config_mantenimiento = { ...(taller.config_mantenimiento || {}), componentes: lista };
            const { error } = await supabase.from('talleres').update({ config_mantenimiento }).eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_mantenimiento });
        } catch (error: any) {
            setComponentes(antes);
            avisar('error', 'No se pudo guardar: ' + error.message);
        } finally {
            setSavingComp(false);
        }
    };
    const agregarComponente = () => {
        const nombre = nuevoComponente.trim();
        if (!nombre) return;
        if (componentes.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
            avisar('error', 'Ese componente ya está en la lista.');
            return;
        }
        setNuevoComponente('');
        guardarComponentes([...componentes, { nombre, meses: null }]);
    };

    // ── Después de vender una bici (Leira, 14-sep-2026): a cuántos meses el ajuste
    // y el primer service, y qué dice el mensaje. Los plazos se guardan al elegir;
    // los textos al salir del campo (onBlur), como los demás campos de escribir.
    const [postventa, setPostventa] = useState<ConfigPostventa>(() => configMantenimiento(taller).postventa);
    const guardarPostventa = async (patch: Partial<ConfigPostventa>) => {
        const antes = postventa;
        const nueva = { ...postventa, ...patch };
        // Un texto borrado vuelve al de fábrica: un hueco vacío en la plantilla hace
        // rebotar el mensaje entero en Meta.
        if (!nueva.textoAjuste.trim()) nueva.textoAjuste = POSTVENTA_DEFAULT.textoAjuste;
        if (!nueva.textoPrimerService.trim()) nueva.textoPrimerService = POSTVENTA_DEFAULT.textoPrimerService;
        setPostventa(nueva);
        try {
            const config_mantenimiento = { ...(taller.config_mantenimiento || {}), postventa: nueva };
            const { error } = await supabase.from('talleres').update({ config_mantenimiento }).eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_mantenimiento });
        } catch (error: any) {
            setPostventa(antes);
            avisar('error', 'No se pudo guardar: ' + error.message);
        }
    };

    // ── Quién hizo cada service (opt-in, 3-sep-2026).
    // Opt-in y no obligatorio porque un taller de una sola persona no tiene a
    // quién distinguir, y pedirle ese dato en cada service es fricción pura.
    const [mecanicosHab, setMecanicosHab] = useState(taller.config_mecanicos?.habilitado === true);
    const [savingMec, setSavingMec] = useState(false);

    // ── Los dos interruptores que vivían en "Mi Taller" (14-sep-2026). Ahí
    // dependían del botón "Guardar" de otra tarjeta; acá se guardan al tocarlos,
    // como todo lo de esta pestaña, y vuelven atrás si el guardado falla.
    // El default de ia_presupuesto_activa en la base es true: solo queda apagado si
    // el taller lo apagó. bicis_paradas_ve_mecanico es false: la lista trae
    // clientes con su gasto.
    const [segundoOjos, setSegundoOjos] = useState((taller as any).ia_presupuesto_activa !== false);
    const [paradasMecanico, setParadasMecanico] = useState((taller as any).bicis_paradas_ve_mecanico === true);
    const rolPref = useAuthStore(s => s.rol);
    const esAdminPref = rolPref?.toLowerCase()?.trim() === 'admin';

    const guardarInterruptor = async (
        columna: 'ia_presupuesto_activa' | 'bicis_paradas_ve_mecanico',
        valor: boolean, poner: (v: boolean) => void, anterior: boolean, ok: string,
    ) => {
        poner(valor);
        const { error } = await supabase.from('talleres').update({ [columna]: valor }).eq('id', taller.id);
        if (error) { poner(anterior); avisar('error', 'No se pudo guardar: ' + error.message); return; }
        setTaller({ ...taller, [columna]: valor } as any);
        avisar('ok', ok);
    };

    const guardarMecanicos = async (valor: boolean) => {
        const anterior = mecanicosHab;
        setMecanicosHab(valor);
        try {
            setSavingMec(true);
            const config_mecanicos = { ...(taller.config_mecanicos || {}), habilitado: valor };
            const { error } = await supabase.from('talleres').update({ config_mecanicos }).eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_mecanicos: config_mecanicos as any });
            avisar('ok', valor
                ? 'Listo. Al finalizar cada service vas a elegir quién lo hizo, y lo vas a ver en Métricas.'
                : 'Desactivado. Los services ya registrados no se borran.');
        } catch (error: any) {
            setMecanicosHab(anterior);
            avisar('error', 'No se pudo guardar: ' + error.message);
        } finally {
            setSavingMec(false);
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

    // ── Los avisos propios del taller (Iara, 16-sep-2026): un service del menú que
    // se repite cada N meses. "Si hace un lavado de lubricación, cada cuánto le
    // tiene que avisar que lo tiene que volver a hacer."
    //
    // El dato vive en `catalogo_servicios.meses_repeticion`, o sea en el service
    // mismo: se toca desde acá y desde la pestaña "Menú de Services", pero es un
    // solo campo. Dos tablas para el mismo dato terminan siempre en dos verdades.
    const [menu, setMenu] = useState<ServicioDelMenu[]>([]);
    const [menuCargado, setMenuCargado] = useState(false);
    const [nuevoRep, setNuevoRep] = useState<{ id: string; meses: number }>({ id: '', meses: 6 });

    useEffect(() => {
        void (async () => {
            const { data } = await supabase
                .from('catalogo_servicios')
                .select('id, nombre, activo, meses_repeticion')
                .eq('taller_id', taller.id)
                .order('nombre');
            setMenu((data ?? []) as ServicioDelMenu[]);
            setMenuCargado(true);
        })();
    }, [taller.id]);

    const guardarRepeticion = async (id: string, meses: number | null) => {
        const antes = menu;
        setMenu(menu.map(s => (s.id === id ? { ...s, meses_repeticion: meses } : s)));
        const { error } = await supabase.from('catalogo_servicios').update({ meses_repeticion: meses }).eq('id', id);
        if (error) { setMenu(antes); avisar('error', 'No se pudo guardar: ' + error.message); }
    };

    const repetibles = menu.filter(s => (s.meses_repeticion ?? 0) > 0);
    const sinRepetir = menu.filter(s => s.activo !== false && !((s.meses_repeticion ?? 0) > 0));

    // ── Los del taller que NO tienen usuario en el sistema (16-sep-2026).
    // Hasta hoy la lista de quién firma salía solo de `usuarios`: en un taller de
    // tres, dos no tienen login y el taller no los puede crear. Son nombres y no
    // cuentas a propósito: para firmar una orden no hace falta entrar a nada.
    const [gente, setGente] = useState<string[]>(taller.config_mecanicos?.nombres ?? []);
    const [nuevaPersona, setNuevaPersona] = useState('');

    const guardarGente = async (lista: string[]) => {
        const antes = gente;
        setGente(lista);
        const config_mecanicos = { ...(taller.config_mecanicos || { habilitado: false }), nombres: lista };
        const { error } = await supabase.from('talleres').update({ config_mecanicos }).eq('id', taller.id);
        if (error) { setGente(antes); avisar('error', 'No se pudo guardar: ' + error.message); return; }
        setTaller({ ...taller, config_mecanicos: config_mecanicos as any });
    };

    const agregarPersona = () => {
        const nombre = nuevaPersona.trim();
        if (!nombre) return;
        if (gente.some(g => g.toLowerCase() === nombre.toLowerCase())) {
            avisar('error', 'Ese nombre ya está en la lista.');
            return;
        }
        setNuevaPersona('');
        void guardarGente([...gente, nombre]);
    };

    // ── El molde de la pantalla (16-sep-2026, Iara):
    //   "me da mucho toque que no ocupen los mismos espacios todas las opciones.
    //   O sea, está demasiado desordenado. Es como que lo pusiste así nomás."
    //
    // Antes cada ajuste era una tarjeta suelta en una grilla de dos columnas: una
    // de un interruptor al lado de una de once componentes, la grilla las estira a
    // la misma altura y la corta queda medio vacía. Ahora un ajuste es una FILA
    // dentro del panel de su grupo (todas miden lo mismo por construcción) y los
    // tres que de verdad necesitan el ancho son su propio panel, con el contenido
    // repartido en columnas. Ver `components/FilaAjuste.tsx`.
    return (
        <div className="space-y-8">

        {/* ═══ EN CADA ORDEN ═══ */}
        <GrupoAjustes titulo="En cada orden">
            <PanelAjustes>
                <FilaAjuste
                    id="checklist"
                    icono={ListChecks}
                    titulo="Checklist de trabajos del service"
                    resumen="Los trabajos de la orden, tildables."
                    control={
                        <Switch
                            checked={habilitado}
                            onCheckedChange={guardarAvances}
                            disabled={!tienePlanChecklist || saving}
                        />
                    }
                    aviso={!tienePlanChecklist && (
                        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            Disponible en los planes Pro y Expert.
                        </div>
                    )}
                >
                    <ComoFunciona className="mt-0">
                        <p>
                            Los trabajos de cada orden aparecen como lista tildable en la Mesa de
                            Trabajo; al finalizar, la app avisa si quedó algo sin marcar.
                        </p>
                        <div>
                            <p className="mb-1.5 text-xs text-slate-600">Si la orden tiene cargado:</p>
                            <ul className="space-y-1 text-xs text-slate-700">
                                <li className="flex items-center gap-2"><Check size={13} className="text-green-600" /> Service Completo <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">Service</span></li>
                                <li className="flex items-center gap-2"><Check size={13} className="text-green-600" /> Cambio de cadena <span className="rounded-full bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-600">Mano de obra</span></li>
                                <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm border" /> Cadena Shimano 11v <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">Repuesto</span></li>
                            </ul>
                            <p className="mt-1.5 text-[11px] text-slate-500">
                                …ese es el checklist de esa orden. Se agrega un trabajo y aparece solo en la lista.
                            </p>
                        </div>
                    </ComoFunciona>
                </FilaAjuste>

                <FilaAjuste
                    id="ticket_ingreso"
                    icono={Printer}
                    titulo="Comprobante de ingreso"
                    resumen="Una A4 que se corta al medio."
                    control={
                        <Switch
                            checked={ticketHab}
                            onCheckedChange={v => guardarTicket({ habilitado: v })}
                            disabled={savingTicket}
                        />
                    }
                >
                    <SubAjuste
                        apagado={!ticketHab}
                        titulo="Imprimir las notas internas"
                        resumen="Solo en la mitad del taller."
                        control={
                            <Switch
                                checked={ticketNotas}
                                onCheckedChange={v => guardarTicket({ notas_internas: v })}
                                disabled={savingTicket || !ticketHab}
                            />
                        }
                    />
                    {/* La explicacion va PLEGADA, como todas (regla de Iara, 9-sep): a la vista
                        obliga a leerla a quien ya sabe lo que es. Y no lleva `data-contenido`:
                        esa marca es para el texto que ES contenido (el mensaje que sale), no para
                        una ayuda. Ponersela a una explicacion es taparle los ojos al candado. */}
                    <ComoFunciona>
                        <p>
                            Se imprime cuando la bici entra: arriba va lo que se lleva el cliente y
                            abajo el checklist del taller, con los trabajos para tildar y el telefono
                            a mano. <strong>El comprobante entero sigue saliendo igual al entregar</strong>,
                            esto no lo reemplaza.
                        </p>
                        <p>
                            Si prendes las notas internas, salen solo en la mitad de abajo, la que
                            queda en el taller. Es el unico lugar donde se imprimen: si un dia no
                            cortan la hoja, el cliente se las lleva.
                        </p>
                    </ComoFunciona>
                </FilaAjuste>

                <FilaAjuste
                    id="tareas"
                    icono={Bell}
                    titulo="Tareas del service"
                    resumen="Lo que el mecánico se anota."
                    control={
                        <Switch
                            checked={tareasHab}
                            onCheckedChange={v => guardarTareas({ tareas: v })}
                            disabled={savingTareas}
                        />
                    }
                >
                    <SubAjuste
                        apagado={!tareasHab}
                        titulo={<span className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-amber-600" /> Candado de finalización</span>}
                        resumen="No se finaliza hasta tildar todo."
                        control={
                            <Switch
                                checked={bloqueo}
                                onCheckedChange={v => guardarTareas({ bloqueo: v })}
                                disabled={!tareasHab || savingTareas}
                            />
                        }
                    />
                </FilaAjuste>

                <FilaAjuste
                    id="diagnostico"
                    icono={HeartPulse}
                    titulo={<span className="inline-flex items-center gap-2">Registro del diagnóstico <NuevoBadge feature="registro-diagnostico" /></span>}
                    resumen="En qué momento del service."
                    control={
                        <select
                            value={momentoDiag}
                            disabled={savingDiag}
                            onChange={e => guardarDiag(e.target.value as 'final' | 'durante' | 'ambos')}
                            className="h-9 rounded-md border bg-background px-2 text-xs"
                            aria-label="Cuándo se registra el diagnóstico"
                        >
                            <option value="final">Al finalizar el service</option>
                            <option value="durante">Durante el service</option>
                            <option value="ambos">Durante y al finalizar</option>
                        </select>
                    }
                />

                <FilaAjuste
                    id="horas"
                    icono={PhoneCall}
                    titulo="Cuánto esperar al cliente"
                    resumen="Sin respuesta, avisa que lo llames."
                    control={
                        <select
                            value={horasLlamar}
                            disabled={savingHoras}
                            onChange={e => guardarHoras(Number(e.target.value))}
                            className="h-9 rounded-md border bg-background px-2 text-xs"
                            aria-label="Horas antes de llamar al cliente"
                        >
                            {[1, 2, 3, 6, 24].map(h => (
                                <option key={h} value={h}>{h === 24 ? '1 día' : `${h} horas`}</option>
                            ))}
                        </select>
                    }
                >
                    <ComoFunciona className="mt-0">
                        <p>
                            Nadie contesta un WhatsApp en cero minutos: el plazo corto sirve para la bici
                            que está en el banco ahora, el largo para la que puede esperar.
                        </p>
                    </ComoFunciona>
                </FilaAjuste>

                {tieneFeature(taller, 'segundo_ojos') && (
                    <FilaAjuste
                        id="segundo_ojos"
                        icono={Eye}
                        titulo="Segundo par de ojos sobre el presupuesto"
                        resumen="Avisa lo que se escapa al finalizar."
                        control={
                            <Switch
                                checked={segundoOjos}
                                onCheckedChange={v => guardarInterruptor('ia_presupuesto_activa', v, setSegundoOjos, segundoOjos,
                                    v ? 'Listo: al finalizar te avisa lo que se está escapando.' : 'Desactivado.')}
                            />
                        }
                    >
                        <ComoFunciona className="mt-0">
                            <p>
                                Un ejemplo de lo que dice: "la cadena es de hace 14 meses, preguntale".
                                Aparece al cerrar la orden, y el mecánico decide si lo suma o lo deja pasar.
                            </p>
                        </ComoFunciona>
                    </FilaAjuste>
                )}

                <FilaAjuste
                    id="orden_grande"
                    icono={Hash}
                    titulo="Número de orden grande"
                    resumen="Para los que van por número."
                    control={
                        <>
                            <span
                                className={ordenGrande
                                    ? 'text-xl font-black tabular-nums text-primary'
                                    : 'text-[11px] font-bold text-primary'}
                                data-contenido
                            >
                                #0042
                            </span>
                            <Switch checked={ordenGrande} onCheckedChange={guardarOrdenGrande} />
                        </>
                    }
                />
            </PanelAjustes>

            {/* Panel propio: once componentes no entran en un riel. */}
            <Card data-ajuste="componentes" className="scroll-mt-24">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <HeartPulse className="h-4 w-4 text-primary" />
                        Componentes del diagnóstico
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">La lista del diagnóstico y sus plazos.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {componentes.map((c, i) => (
                            <div key={c.nombre} className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2">
                                <span className="min-w-0 flex-1 truncate text-sm">{c.nombre}</span>
                                <select
                                    value={c.meses ?? ''}
                                    disabled={savingComp}
                                    onChange={e => guardarComponentes(componentes.map((x, j) => j === i
                                        ? { ...x, meses: e.target.value ? Number(e.target.value) : null }
                                        : x))}
                                    className="h-8 min-w-0 shrink rounded-md border bg-background px-1 text-xs"
                                    title="Plazo sugerido"
                                    aria-label={`Plazo sugerido de ${c.nombre}`}
                                >
                                    <option value="">Sin sugerido</option>
                                    {PLAZOS_MESES.map(m => <option key={m} value={m}>{mesesEnPalabras(m)}</option>)}
                                </select>
                                <button
                                    type="button"
                                    disabled={savingComp || componentes.length <= 1}
                                    onClick={() => guardarComponentes(componentes.filter((_, j) => j !== i))}
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                    title={`Sacar ${c.nombre} de la lista`}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex max-w-md gap-2">
                        <Input
                            value={nuevoComponente}
                            onChange={e => setNuevoComponente(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') agregarComponente(); }}
                            placeholder="Agregar un componente"
                            className="h-9"
                        />
                        <Button type="button" variant="outline" size="sm" className="h-9" onClick={agregarComponente} disabled={!nuevoComponente.trim() || savingComp}>
                            Agregar
                        </Button>
                    </div>
                    <ComoFunciona>
                        <p>
                            El plazo sugerido se ve resaltado para tildarlo de un toque, pero no se
                            marca solo: cada bici se mira.
                        </p>
                        <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => guardarComponentes(null)}>
                            Volver a la lista de siempre
                        </button>
                    </ComoFunciona>
                </CardContent>
            </Card>
        </GrupoAjustes>

        {/* ═══ AGENDA ═══ */}
        <GrupoAjustes titulo="Agenda">
            <PanelAjustes>
                <FilaAjuste
                    id="turnos"
                    icono={CalendarDays}
                    titulo="Calendario de turnos"
                    resumen="Los turnos que das, semana a semana."
                    control={
                        <Switch
                            checked={turnosHab}
                            onCheckedChange={guardarTurnos}
                            disabled={!tienePlanTurnos || savingTurnos}
                        />
                    }
                    aviso={!tienePlanTurnos && (
                        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            Disponible en los planes Pro y Expert.
                        </div>
                    )}
                >
                    <ComoFunciona className="mt-0">
                        <p>
                            Prendido, aparece <strong>Turnos</strong> en el menú: la semana a la vista con los
                            turnos que das y el tiempo que te guardás para lo atrasado o para armar bicis.
                        </p>
                        <p>
                            Los turnos los das vos. El cliente no puede reservarse uno solo. Cuando llega,
                            su turno abre la orden con la bici ya elegida.
                        </p>
                    </ComoFunciona>
                </FilaAjuste>
            </PanelAjustes>
        </GrupoAjustes>

        {/* ═══ CLIENTES Y SEGUIMIENTO ═══ */}
        <GrupoAjustes titulo="Clientes y seguimiento">
            <Card data-ajuste="avisos_suaves" className="scroll-mt-24">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Bell className="h-4 w-4 text-primary" />
                                Avisos de "vale una llamada"
                            </CardTitle>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Gente para llamar, en Retención.</p>
                        </div>
                        <Switch checked={suavesHab} onCheckedChange={v => guardarSuaves({ habilitado: v })} disabled={savingSuaves} />
                    </div>
                </CardHeader>
                <CardContent className={`grid gap-5 transition-opacity md:grid-cols-2 ${suavesHab ? '' : 'pointer-events-none opacity-50'}`}>
                    <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Los que arma el sistema</p>
                        <SubAjuste
                            titulo="Primer service"
                            resumen="Días desde que se cargó y no vino."
                            control={
                                <Input
                                    type="number" min={7} max={365} className="w-20 text-center"
                                    value={suavesPS}
                                    onChange={e => setSuavesPS(Number(e.target.value))}
                                    onBlur={() => guardarSuaves({ primerServiceDias: suavesPS })}
                                    aria-label="Días para el aviso de primer service"
                                />
                            }
                        />
                        <SubAjuste
                            titulo="No volvió"
                            resumen="Días sin aparecer."
                            control={
                                <Input
                                    type="number" min={30} max={730} className="w-20 text-center"
                                    value={suavesNV}
                                    onChange={e => setSuavesNV(Number(e.target.value))}
                                    onBlur={() => guardarSuaves({ noVolvioDias: suavesNV })}
                                    aria-label="Días sin venir para el aviso"
                                />
                            }
                        />
                        <SubAjuste
                            titulo="También los que vienen seguido"
                            resumen="También el cliente de siempre."
                            control={<Switch checked={suavesFrec} onCheckedChange={v => guardarSuaves({ incluirFrecuentes: v })} disabled={savingSuaves} />}
                        />
                    </div>

                    {/* Iara, 16-sep: "el tema de los avisos de vale una llamada me gustaría
                        que también los puedan agregar. Tipo, que puedan agregar nuevos." */}
                    <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Los tuyos: un service que se repite</p>
                        {repetibles.length > 0 && (
                            <div className="space-y-2">
                                {repetibles.map(s => (
                                    <SubAjuste
                                        key={s.id}
                                        titulo={s.nombre}
                                        control={
                                            <>
                                                <select
                                                    value={s.meses_repeticion as number}
                                                    onChange={e => guardarRepeticion(s.id, Number(e.target.value))}
                                                    className="h-8 rounded-md border bg-background px-2 text-xs"
                                                    aria-label={`Cada cuánto se repite ${s.nombre}`}
                                                >
                                                    {PLAZOS_MESES.map(m => <option key={m} value={m}>cada {mesesEnPalabras(m)}</option>)}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => guardarRepeticion(s.id, null)}
                                                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                                    title={`Dejar de avisar por ${s.nombre}`}
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </>
                                        }
                                    />
                                ))}
                            </div>
                        )}

                        {menuCargado && menu.length === 0 ? (
                            // El vacío también tiene forma: la misma caja que las filas de
                            // al lado. Un texto suelto al lado de tres cajas se lee como
                            // media tarjeta en blanco, que es justo lo que se estaba arreglando.
                            <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                                Todavía no hay services en el menú. Se cargan en Menú de Services.
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={nuevoRep.id}
                                    onChange={e => setNuevoRep({ ...nuevoRep, id: e.target.value })}
                                    className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
                                    aria-label="Elegir un service del menú"
                                >
                                    <option value="">Elegí un service del menú…</option>
                                    {sinRepetir.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                </select>
                                <select
                                    value={nuevoRep.meses}
                                    onChange={e => setNuevoRep({ ...nuevoRep, meses: Number(e.target.value) })}
                                    className="h-9 rounded-md border bg-background px-2 text-xs"
                                    aria-label="Cada cuántos meses se repite"
                                >
                                    {PLAZOS_MESES.map(m => <option key={m} value={m}>cada {mesesEnPalabras(m)}</option>)}
                                </select>
                                <Button
                                    type="button" variant="outline" size="sm" className="h-9"
                                    disabled={!nuevoRep.id}
                                    onClick={() => { void guardarRepeticion(nuevoRep.id, nuevoRep.meses); setNuevoRep({ id: '', meses: 6 }); }}
                                >
                                    Agregar
                                </Button>
                            </div>
                        )}

                    </div>

                    <div className="md:col-span-2">
                        <ComoFunciona>
                            <p>
                                <strong>Dónde aparecen:</strong> en Retención, en su propia sección abajo
                                de los vencimientos, para que nunca tapen lo urgente. No van a la campana
                                y no se manda nada solo: el aviso es para vos, no para el cliente.
                            </p>
                            <p>
                                <strong>Cada cuánto vuelve el mismo nombre:</strong> una vez. Cuando le
                                escribís o lo descartás, ese nombre no vuelve a aparecer por el mismo
                                motivo. Si el cliente vuelve al taller y después pasa otra vez el plazo,
                                sí: ahí es un caso nuevo.
                            </p>
                            <p>
                                Se muestran <strong>los 12 que más gastaron</strong>, no todos: una lista
                                de cien no la llama nadie.
                            </p>
                            <p>
                                <strong>Los tuyos</strong> funcionan al revés: son del cliente. Ejemplo,
                                lavado y lubricación cada 2 meses. Cada vez que una orden lo incluye, esa
                                bici queda agendada para dentro de 2 meses; el aviso cae entre los
                                vencimientos de Retención y, con el WhatsApp conectado, sale solo el día
                                que toca. El mismo plazo se edita en el Menú de Services.
                            </p>
                        </ComoFunciona>
                    </div>
                </CardContent>
            </Card>

            <Card data-ajuste="postventa" className="scroll-mt-24">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Bike className="h-4 w-4 text-primary" />
                        Después de vender una bici
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">Lo que se agenda al vender una bici.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                        {([
                            { clave: 'ajuste', titulo: 'Ajuste', meses: postventa.ajusteMeses, texto: postventa.textoAjuste,
                              mesesKey: 'ajusteMeses', textoKey: 'textoAjuste' },
                            { clave: 'primer', titulo: 'Primer service', meses: postventa.primerServiceMeses, texto: postventa.textoPrimerService,
                              mesesKey: 'primerServiceMeses', textoKey: 'textoPrimerService' },
                        ] as const).map(a => (
                            <div key={a.clave} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-medium">{a.titulo}</p>
                                    <select
                                        value={a.meses}
                                        onChange={e => guardarPostventa({ [a.mesesKey]: Number(e.target.value) } as Partial<ConfigPostventa>)}
                                        className="h-8 rounded-md border bg-background px-2 text-xs"
                                        aria-label={`Cuándo se avisa el ${a.titulo.toLowerCase()}`}
                                    >
                                        {PLAZOS_MESES.map(m => <option key={m} value={m}>a {mesesEnPalabras(m)} de la venta</option>)}
                                    </select>
                                </div>
                                <Input
                                    value={a.texto}
                                    maxLength={80}
                                    onChange={e => setPostventa(p => ({ ...p, [a.textoKey]: e.target.value }))}
                                    onBlur={e => guardarPostventa({ [a.textoKey]: e.target.value } as Partial<ConfigPostventa>)}
                                    className="h-9 text-sm"
                                    placeholder="qué hay que revisar"
                                    aria-label={`Qué dice el aviso de ${a.titulo.toLowerCase()}`}
                                />
                                <p className="text-[11px] leading-snug text-muted-foreground" data-contenido>
                                    Así le llega: "{comoLeLlegaPostventa(a.texto, taller.nombre ?? '')}"
                                </p>
                            </div>
                        ))}
                    </div>
                    <ComoFunciona>
                        <p>
                            Con <strong>Vendí una bici</strong> (en el Taller Activo y en Clientes) quedan
                            agendados el ajuste y el primer service. Las fechas se pueden cambiar en el
                            momento de la venta.
                        </p>
                        <p>
                            Si tenés el WhatsApp conectado, ese día a las 10 le escribimos solos. Si no, o si
                            el mensaje no sale, te aparece en Retención para escribirle vos. Si la bici ya
                            pasó por el taller ese mes, no se le manda nada.
                        </p>
                    </ComoFunciona>
                </CardContent>
            </Card>

            <div data-ajuste="altas_erp" className="scroll-mt-24 rounded-lg">
                <AltasDesdeERP taller={taller} setTaller={setTaller} avisar={avisar} />
            </div>
        </GrupoAjustes>

        {/* ═══ TU EQUIPO ═══ */}
        <GrupoAjustes titulo="Tu equipo">
            <PanelAjustes>
                {/* Iara, 16-sep: "sigue sin estar lo de quién firma el service. No veo
                    bien cómo ponerlo." Estaba, pero se llamaba "quién hizo cada
                    service", vivía en el grupo de las órdenes y la lista de gente
                    salía sola de los usuarios con login. Las tres cosas eran el
                    defecto: el nombre, el lugar y el hueco de no poder cargar a nadie. */}
                <FilaAjuste
                    id="mecanico"
                    icono={Users}
                    titulo="Quién firma cada service"
                    resumen="Quién lo hizo, y cuánto generó."
                    control={<Switch checked={mecanicosHab} onCheckedChange={guardarMecanicos} disabled={savingMec} />}
                >
                    <div className={`space-y-2 transition-opacity ${mecanicosHab ? '' : 'pointer-events-none opacity-50'}`}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Quiénes trabajan en el taller
                        </p>
                        {gente.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {gente.map(n => (
                                    <span key={n} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 py-1 pl-3 pr-1.5 text-sm">
                                        {n}
                                        <button
                                            type="button"
                                            onClick={() => void guardarGente(gente.filter(g => g !== n))}
                                            className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            title={`Sacar a ${n} de la lista`}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex max-w-sm gap-2">
                            <Input
                                value={nuevaPersona}
                                onChange={e => setNuevaPersona(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') agregarPersona(); }}
                                placeholder="Nombre, como lo llaman en el taller"
                                className="h-9"
                                aria-label="Agregar a alguien del taller"
                            />
                            <Button type="button" variant="outline" size="sm" className="h-9" onClick={agregarPersona} disabled={!nuevaPersona.trim()}>
                                Agregar
                            </Button>
                        </div>
                        <ComoFunciona className="mt-1">
                            <p>
                                Los que tienen usuario para entrar al sistema ya aparecen solos en la
                                lista al finalizar. Acá se agregan los que no lo tienen: para firmar una
                                orden no hace falta que entren a nada.
                            </p>
                            <p>
                                Si aparece alguien que no está en la lista, al finalizar elegís
                                <strong> Otro</strong> y escribís el nombre en el momento; queda
                                agregado acá solo.
                            </p>
                            <p>
                                Se cuenta <strong>desde que lo prendés</strong>: los services que ya
                                cerraste no tienen guardado quién los hizo. Si trabajás solo, dejalo
                                apagado y te ahorrás un clic en cada orden.
                            </p>
                        </ComoFunciona>
                    </div>
                </FilaAjuste>

                {tieneFeature(taller, 'bicis_paradas') && (
                    <FilaAjuste
                        id="bicis_paradas_mecanico"
                        icono={Bike}
                        titulo="Quién ve Bicis paradas"
                        resumen="Trae cuánto gastó cada cliente."
                        control={
                            <Switch
                                checked={paradasMecanico}
                                disabled={!esAdminPref}
                                onCheckedChange={v => guardarInterruptor('bicis_paradas_ve_mecanico', v, setParadasMecanico, paradasMecanico,
                                    v ? 'Listo: los mecánicos también ven Bicis paradas.' : 'Listo: Bicis paradas la ve solo el administrador.')}
                            />
                        }
                        aviso={!esAdminPref && (
                            <p className="text-xs text-muted-foreground">Lo cambia el administrador.</p>
                        )}
                    />
                )}
            </PanelAjustes>
        </GrupoAjustes>

        {/* ═══ AYUDA Y REPUESTOS ═══ */}
        <GrupoAjustes titulo="Ayuda y repuestos">
            <PanelAjustes>
                <FilaAjuste
                    id="recorrido"
                    icono={GraduationCap}
                    titulo="Recorrido de bienvenida"
                    resumen="Para capacitar a alguien nuevo."
                    control={
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { resetTours(); useTourStore.getState().iniciar('bienvenida'); }}
                        >
                            <PlayCircle className="mr-2 h-4 w-4" />
                            Verlo
                        </Button>
                    }
                >
                    <ComoFunciona className="mt-0">
                        <p>
                            Recorre todas las secciones y, en los pasos clave, la persona opera el
                            sistema con sus propias manos (recibe una bici, abre una finalización,
                            explora una ficha).
                        </p>
                    </ComoFunciona>
                </FilaAjuste>
            </PanelAjustes>

            <div data-ajuste="ocultos" className="scroll-mt-24 rounded-lg">
                <ProductosOcultos avisar={avisar} />
            </div>
        </GrupoAjustes>
        </div>
    );
}
