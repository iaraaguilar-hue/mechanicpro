import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Loader2, Save, UploadCloud, Plus, Trash2, Edit2, Check, X, AlertCircle } from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';

/** Regex: must start with https:// and contain a valid domain */
const HTTPS_URL_REGEX = /^https:\/\/[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+(\/[^\s]*)?$/;

interface Taller {
    id: string;
    nombre_taller: string;
    logo_url: string;
    color_primario: string;
    color_secundario: string;
    mensaje_informe: string;
    politica_pago?: string;
    plan_actual?: string;
    created_at?: string;
}

interface ServicioCatalogo {
    id: string;
    taller_id: string;
    nombre: string;
    descripcion: string;
    precio: number;
}

export default function SuperAdmin() {
    const rol = useAuthStore((state) => state.rol);
    const [talleres, setTalleres] = useState<Taller[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTaller, setEditingTaller] = useState<Taller | null>(null);
    const [saving, setSaving] = useState(false);

    // Tab and Upload States
    const [activeTab, setActiveTab] = useState('general');
    const [isUploading, setIsUploading] = useState(false);

    // Services States
    const [servicios, setServicios] = useState<ServicioCatalogo[]>([]);
    const [loadingServicios, setLoadingServicios] = useState(false);
    const [nuevoServicio, setNuevoServicio] = useState({ nombre: '', descripcion: '', precio: '' });
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ nombre: '', descripcion: '', precio: '' });

    // Webhook ERP URL state
    const [webhookErpUrl, setWebhookErpUrl] = useState('');
    const [webhookErpUrlError, setWebhookErpUrlError] = useState<string | null>(null);
    const [loadingWebhook, setLoadingWebhook] = useState(false);

    useEffect(() => {
        const fetchTalleres = async () => {
            try {
                setLoading(true);
                const { data, error } = await supabase.from('talleres').select('*');

                if (error) {
                    console.error("Error al buscar talleres:", error);
                    setLoading(false);
                    return;
                }

                if (data) {
                    setTalleres(data);
                }
            } catch (err) {
                console.error("Excepción en fetchTalleres:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchTalleres();
    }, []);

    const fetchServicios = async (tallerId: string) => {
        try {
            setLoadingServicios(true);
            const { data, error } = await supabase
                .from('catalogo_servicios')
                .select('*')
                .eq('taller_id', tallerId)
                .order('nombre', { ascending: true });

            if (error) throw error;
            setServicios(data || []);
        } catch (error: any) {
            console.error("Error fetching services:", error.message);
        } finally {
            setLoadingServicios(false);
        }
    };

    useEffect(() => {
        if (editingTaller && activeTab === 'servicios') {
            fetchServicios(editingTaller.id);
        }
    }, [editingTaller?.id, activeTab]);

    const fetchWebhookErpUrl = async (tallerId: string) => {
        try {
            setLoadingWebhook(true);
            const { data, error } = await supabase
                .from('taller_configuraciones')
                .select('valor')
                .eq('taller_id', tallerId)
                .eq('clave', 'webhook_erp_url')
                .maybeSingle();

            if (error) throw error;
            setWebhookErpUrl(data?.valor || '');
            setWebhookErpUrlError(null);
        } catch (err: any) {
            console.error('Error fetching webhook_erp_url:', err.message);
        } finally {
            setLoadingWebhook(false);
        }
    };

    const handleEditClick = (taller: Taller) => {
        setEditingTaller({ ...taller });
        setActiveTab('general');
        fetchWebhookErpUrl(taller.id);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!editingTaller) return;
        setEditingTaller({
            ...editingTaller,
            [e.target.name]: e.target.value,
        });
    };

    const handleFileUpload = async (file: File) => {
        if (!editingTaller) return;
        try {
            setIsUploading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${editingTaller.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('logos_talleres')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('logos_talleres')
                .getPublicUrl(fileName);

            const newLogoUrl = publicUrlData.publicUrl;

            // Actualizar en base de datos inmediatamente
            const { error: updateError } = await supabase
                .from('talleres')
                .update({ logo_url: newLogoUrl })
                .eq('id', editingTaller.id);

            if (updateError) throw updateError;

            // Update local state
            setEditingTaller({ ...editingTaller, logo_url: newLogoUrl });
            setTalleres(talleres.map(t => t.id === editingTaller.id ? { ...t, logo_url: newLogoUrl } : t));
        } catch (error: any) {
            console.error("Error uploading file:", error.message);
            alert("Error al subir imagen: " + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
        }
    };

    const handleSave = async () => {
        if (!editingTaller) return;

        // Validate webhook_erp_url if provided
        if (webhookErpUrl.trim() && !HTTPS_URL_REGEX.test(webhookErpUrl.trim())) {
            setWebhookErpUrlError('La URL debe comenzar con https:// y ser válida.');
            return;
        }

        try {
            setSaving(true);
            const { error } = await supabase
                .from('talleres')
                .update({
                    logo_url: editingTaller.logo_url,
                    color_primario: editingTaller.color_primario,
                    color_secundario: editingTaller.color_secundario,
                    mensaje_informe: editingTaller.mensaje_informe,
                    politica_pago: editingTaller.politica_pago,
                })
                .eq('id', editingTaller.id);

            if (error) throw error;

            // Upsert webhook_erp_url in taller_configuraciones
            const trimmedUrl = webhookErpUrl.trim();
            if (trimmedUrl) {
                const { error: cfgError } = await supabase
                    .from('taller_configuraciones')
                    .upsert(
                        {
                            taller_id: editingTaller.id,
                            clave: 'webhook_erp_url',
                            valor: trimmedUrl,
                        },
                        { onConflict: 'taller_id,clave' }
                    );
                if (cfgError) {
                    console.error('Error guardando webhook_erp_url:', cfgError.message);
                    alert('Error guardando webhook ERP URL: ' + cfgError.message);
                }
            } else {
                // If cleared, delete the row
                await supabase
                    .from('taller_configuraciones')
                    .delete()
                    .eq('taller_id', editingTaller.id)
                    .eq('clave', 'webhook_erp_url');
            }

            setTalleres(talleres.map(t => t.id === editingTaller.id ? editingTaller : t));
            setEditingTaller(null);
            setWebhookErpUrl('');
            setWebhookErpUrlError(null);
        } catch (error: any) {
            console.error("Error guardando taller:", error.message);
            alert("Error guardando taller: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAddServicio = async () => {
        if (!editingTaller || !nuevoServicio.nombre || !nuevoServicio.precio) return;
        try {
            setLoadingServicios(true);
            const { data, error } = await supabase
                .from('catalogo_servicios')
                .insert([{
                    taller_id: editingTaller.id,
                    nombre: nuevoServicio.nombre,
                    descripcion: nuevoServicio.descripcion,
                    precio: parseFloat(nuevoServicio.precio)
                }])
                .select();

            if (error) throw error;

            if (data && data.length > 0) {
                setServicios([...servicios, data[0]]);
                setNuevoServicio({ nombre: '', descripcion: '', precio: '' });
            }
        } catch (error: any) {
            console.error("Error adding service:", error.message);
            alert("Error al agregar servicio: " + error.message);
        } finally {
            setLoadingServicios(false);
        }
    };

    const handleDeleteServicio = async (id: string) => {
        try {
            setLoadingServicios(true);
            const { error } = await supabase
                .from('catalogo_servicios')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setServicios(servicios.filter(s => s.id !== id));
        } catch (error: any) {
            console.error("Error deleting service:", error.message);
            alert("Error al eliminar servicio: " + error.message);
        } finally {
            setLoadingServicios(false);
        }
    };

    const handleUpdateService = async (id: string) => {
        try {
            setLoadingServicios(true);
            const { error } = await supabase
                .from('catalogo_servicios')
                .update({
                    nombre: editForm.nombre,
                    descripcion: editForm.descripcion,
                    precio: parseFloat(editForm.precio) || 0
                })
                .eq('id', id);

            if (error) throw error;
            setEditingServiceId(null);
            if (editingTaller) {
                await fetchServicios(editingTaller.id);
            }
        } catch (error: any) {
            console.error("Error updating service:", error.message);
            alert("Error al actualizar servicio: " + error.message);
        } finally {
            setLoadingServicios(false);
        }
    };

    if (rol !== 'super_admin') {
        return <Navigate to="/" />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Super Admin Panel</h1>
                <p className="text-muted-foreground mt-2">
                    Gestión de Talleres (Multi-Tenant White-Labeling).
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Talleres Registrados</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Logo</TableHead>
                                        <TableHead>Color Primario</TableHead>
                                        <TableHead>Color Secundario</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {talleres.map((taller) => (
                                        <TableRow key={taller.id}>
                                            <TableCell className="font-medium">{taller.nombre_taller}</TableCell>
                                            <TableCell>
                                                {taller.logo_url ? (
                                                    <img src={taller.logo_url} alt="Logo" className="h-8 w-auto object-contain rounded bg-gray-50 p-1 border" crossOrigin="anonymous" />
                                                ) : (
                                                    <span className="text-muted-foreground text-sm italic">Ninguno</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: taller.color_primario || 'transparent' }} />
                                                    <span className="text-sm font-mono">{taller.color_primario || 'N/A'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: taller.color_secundario || 'transparent' }} />
                                                    <span className="text-sm font-mono">{taller.color_secundario || 'N/A'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => handleEditClick(taller)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Editar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {talleres.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                No hay talleres registrados.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!editingTaller} onOpenChange={(open) => !open && setEditingTaller(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Editar Taller: {editingTaller?.nombre_taller}</DialogTitle>
                    </DialogHeader>
                    {editingTaller && (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col mt-4">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="general">Configuración General</TabsTrigger>
                                <TabsTrigger value="servicios">Catálogo de Servicios</TabsTrigger>
                            </TabsList>

                            <TabsContent value="general" className="flex-1 overflow-y-auto pr-2 space-y-4 mt-4">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Logo del Taller</Label>
                                        <div
                                            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${isUploading ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:bg-muted/50'}`}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={onDrop}
                                            onClick={() => document.getElementById('logo-upload')?.click()}
                                        >
                                            <input
                                                id="logo-upload"
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={onFileChange}
                                                disabled={isUploading}
                                            />
                                            {isUploading ? (
                                                <div className="flex flex-col items-center">
                                                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                                                    <p className="text-sm font-medium text-primary">Subiendo imagen...</p>
                                                </div>
                                            ) : editingTaller.logo_url ? (
                                                <div className="flex flex-col items-center w-full">
                                                    <img src={editingTaller.logo_url} alt="Logo Preview" className="h-20 object-contain mb-4 rounded bg-white p-1 shadow-sm border" crossOrigin="anonymous" />
                                                    <p className="text-sm font-medium">Click o arrastra para cambiar el logo</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                                                    <p className="text-sm font-medium">Click para subir o arrastra una imagen</p>
                                                    <p className="text-xs text-muted-foreground mt-1">Soporta PNG y JPG</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Color Primario (Hex)</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="color"
                                                    name="color_primario"
                                                    className="w-12 h-10 p-1"
                                                    value={editingTaller.color_primario || '#000000'}
                                                    onChange={handleChange}
                                                />
                                                <Input
                                                    name="color_primario"
                                                    value={editingTaller.color_primario || ''}
                                                    onChange={handleChange}
                                                    placeholder="#f25a30"
                                                    className="font-mono text-sm uppercase"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Color Secundario (Hex)</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="color"
                                                    name="color_secundario"
                                                    className="w-12 h-10 p-1"
                                                    value={editingTaller.color_secundario || '#000000'}
                                                    onChange={handleChange}
                                                />
                                                <Input
                                                    name="color_secundario"
                                                    value={editingTaller.color_secundario || ''}
                                                    onChange={handleChange}
                                                    placeholder="#03adef"
                                                    className="font-mono text-sm uppercase"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Mensaje Informe (PDF)</Label>
                                        <textarea
                                            name="mensaje_informe"
                                            className="w-full min-h-[80px] p-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={editingTaller.mensaje_informe || ''}
                                            onChange={handleChange as any}
                                            placeholder="Gracias por confiar en nosotros."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Política de Pago (PDF)</Label>
                                        <textarea
                                            name="politica_pago"
                                            className="w-full min-h-[80px] p-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={editingTaller.politica_pago || ''}
                                            onChange={handleChange as any}
                                            placeholder="MANO DE OBRA SOLO EFECTIVO O TRANSFERENCIA"
                                        />
                                    </div>

                                    {/* Webhook ERP URL */}
                                    <div className="space-y-2">
                                        <Label htmlFor="webhook_erp_url">Webhook ERP URL</Label>
                                        <p className="text-xs text-muted-foreground -mt-1">
                                            URL del endpoint ERP para sincronización. Solo se aceptan URLs HTTPS.
                                        </p>
                                        <Input
                                            id="webhook_erp_url"
                                            name="webhook_erp_url"
                                            value={webhookErpUrl}
                                            onChange={(e) => {
                                                setWebhookErpUrl(e.target.value);
                                                if (webhookErpUrlError) setWebhookErpUrlError(null);
                                            }}
                                            placeholder="https://erp.example.com/webhook/ingest"
                                            className={`font-mono text-sm ${webhookErpUrlError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                            disabled={loadingWebhook}
                                        />
                                        {webhookErpUrlError && (
                                            <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium">
                                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                                {webhookErpUrlError}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="servicios" className="flex-1 flex flex-col overflow-hidden mt-4 space-y-4">
                                <Card className="shrink-0 border-dashed bg-muted/20">
                                    <CardHeader className="py-3 px-4">
                                        <CardTitle className="text-sm">Agregar Nuevo Servicio</CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4">
                                        <div className="flex gap-2 items-end">
                                            <div className="flex-1 space-y-1">
                                                <Label className="text-xs">Nombre</Label>
                                                <Input
                                                    className="h-8 text-sm"
                                                    value={nuevoServicio.nombre}
                                                    onChange={e => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
                                                    placeholder="Ej: Cambio de Aceite"
                                                />
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <Label className="text-xs">
                                                    Descripción {editingTaller?.plan_actual !== 'Sport' ? '(Rich Text)' : '(Texto Plano)'}
                                                    {editingTaller?.plan_actual === 'Sport' && (
                                                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Plan Sport</span>
                                                    )}
                                                </Label>
                                                {editingTaller?.plan_actual === 'Pro' || editingTaller?.plan_actual === 'Expert' ? (
                                                    <RichTextEditor
                                                        value={nuevoServicio.descripcion}
                                                        onChange={(html) => setNuevoServicio({ ...nuevoServicio, descripcion: html })}
                                                        placeholder="Incluye: limpieza, lubricación..."
                                                        minHeight="80px"
                                                    />
                                                ) : (
                                                    <textarea
                                                        className="w-full min-h-[80px] p-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                        value={nuevoServicio.descripcion}
                                                        onChange={(e) => setNuevoServicio({ ...nuevoServicio, descripcion: e.target.value })}
                                                        placeholder="Incluye: limpieza, lubricación..."
                                                    />
                                                )}
                                            </div>
                                            <div className="w-28 space-y-1">
                                                <Label className="text-xs">Precio ($)</Label>
                                                <Input
                                                    className="h-8 text-sm font-mono"
                                                    type="number"
                                                    value={nuevoServicio.precio}
                                                    onChange={e => setNuevoServicio({ ...nuevoServicio, precio: e.target.value })}
                                                    placeholder="0.00"
                                                    min="0"
                                                    step="0.01"
                                                />
                                            </div>
                                            <Button
                                                size="sm"
                                                className="h-8 px-3"
                                                onClick={handleAddServicio}
                                                disabled={loadingServicios || !nuevoServicio.nombre || !nuevoServicio.precio}
                                            >
                                                <Plus className="h-4 w-4 mr-1" /> Add
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="flex-1 overflow-y-auto border rounded-md">
                                    <Table>
                                        <TableHeader className="bg-muted/50 sticky top-0 z-10 hidden sm:table-header-group">
                                            <TableRow>
                                                <TableHead>Servicio</TableHead>
                                                <TableHead>Descripción</TableHead>
                                                <TableHead className="text-right">Precio</TableHead>
                                                <TableHead className="w-12"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {loadingServicios ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="h-32 text-center">
                                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
                                                        <span className="text-sm text-muted-foreground">Cargando servicios...</span>
                                                    </TableCell>
                                                </TableRow>
                                            ) : servicios.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                                        <div className="flex flex-col items-center">
                                                            <Loader2 className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                                            <span>No hay servicios catalogados para este taller.</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                servicios.map((servicio) => (
                                                    <TableRow key={servicio.id}>
                                                        {editingServiceId === servicio.id ? (
                                                            <>
                                                                <TableCell>
                                                                    <Input
                                                                        value={editForm.nombre}
                                                                        onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                                                                        className="h-8 shadow-none"
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="align-top">
                                                                    {editingTaller?.plan_actual === 'Pro' || editingTaller?.plan_actual === 'Expert' ? (
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
                                                                <TableCell className="whitespace-nowrap flex items-center justify-end gap-1">
                                                                    <Button
                                                                        variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:bg-green-50"
                                                                        onClick={() => handleUpdateService(servicio.id)}
                                                                        disabled={loadingServicios}
                                                                    >
                                                                        <Check size={16} />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-slate-50"
                                                                        onClick={() => setEditingServiceId(null)}
                                                                        disabled={loadingServicios}
                                                                    >
                                                                        <X size={16} />
                                                                    </Button>
                                                                </TableCell>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <TableCell className="font-medium">{servicio.nombre}</TableCell>
                                                                <TableCell className="text-muted-foreground text-sm max-w-xs">
                                                                    {servicio.descripcion
                                                                        ? <span dangerouslySetInnerHTML={{ __html: servicio.descripcion }} className="prose prose-xs max-w-none" />
                                                                        : '-'
                                                                    }
                                                                </TableCell>
                                                                <TableCell className="text-right font-mono">${Number(servicio.precio).toFixed(2)}</TableCell>
                                                                <TableCell className="whitespace-nowrap flex items-center justify-end gap-1">
                                                                    <Button
                                                                        variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/10"
                                                                        onClick={() => {
                                                                            setEditingServiceId(servicio.id);
                                                                            setEditForm({ nombre: servicio.nombre, descripcion: servicio.descripcion || '', precio: servicio.precio.toString() });
                                                                        }}
                                                                        disabled={loadingServicios}
                                                                    >
                                                                        <Edit2 size={16} />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                        onClick={() => handleDeleteServicio(servicio.id)}
                                                                        disabled={loadingServicios}
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </Button>
                                                                </TableCell>
                                                            </>
                                                        )}
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TabsContent>
                        </Tabs>
                    )}
                    <DialogFooter className="mt-4 shrink-0 border-t pt-4">
                        <Button variant="outline" onClick={() => setEditingTaller(null)} disabled={saving || isUploading}>
                            Cerrar
                        </Button>
                        {activeTab === 'general' && (
                            <Button onClick={handleSave} disabled={saving || isUploading}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Guardar Cambios
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

