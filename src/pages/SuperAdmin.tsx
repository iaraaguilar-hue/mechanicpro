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
import { Pencil, Loader2, Save } from 'lucide-react';

interface Taller {
    id: string;
    nombre_taller: string;
    logo_url: string;
    color_primario: string;
    color_secundario: string;
    mensaje_informe: string;
    created_at?: string;
}

export default function SuperAdmin() {
    const rol = useAuthStore((state) => state.rol);
    const [talleres, setTalleres] = useState<Taller[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTaller, setEditingTaller] = useState<Taller | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (rol === 'super_admin') {
            fetchTalleres();
        }
    }, [rol]);

    const fetchTalleres = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('talleres').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setTalleres(data || []);
        } catch (error: any) {
            console.error("Error cargando talleres:", error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (taller: Taller) => {
        setEditingTaller({ ...taller });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!editingTaller) return;
        setEditingTaller({
            ...editingTaller,
            [e.target.name]: e.target.value,
        });
    };

    const handleSave = async () => {
        if (!editingTaller) return;
        try {
            setSaving(true);
            const { error } = await supabase
                .from('talleres')
                .update({
                    logo_url: editingTaller.logo_url,
                    color_primario: editingTaller.color_primario,
                    color_secundario: editingTaller.color_secundario,
                    mensaje_informe: editingTaller.mensaje_informe,
                })
                .eq('id', editingTaller.id);

            if (error) throw error;

            // Update local state
            setTalleres(talleres.map(t => t.id === editingTaller.id ? editingTaller : t));
            setEditingTaller(null);
        } catch (error: any) {
            console.error("Error guardando taller:", error.message);
            alert("Error guardando taller: " + error.message);
        } finally {
            setSaving(false);
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
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Editar Taller: {editingTaller?.nombre_taller}</DialogTitle>
                    </DialogHeader>
                    {editingTaller && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Logo URL</Label>
                                <Input
                                    name="logo_url"
                                    value={editingTaller.logo_url || ''}
                                    onChange={handleChange}
                                    placeholder="https://ejemplo.com/logo.png"
                                />
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
                                    className="w-full min-h-[80px] p-2 rounded-md border text-sm"
                                    value={editingTaller.mensaje_informe || ''}
                                    onChange={handleChange as any}
                                    placeholder="Gracias por confiar en nosotros."
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingTaller(null)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Guardar Cambios
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
