import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDataStore, type SupabaseClient } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Plus } from "lucide-react";



interface AddClientDialogProps {
    onClientCreated: (client: SupabaseClient) => void;
    variant?: "default" | "outline" | "secondary";
    trigger?: React.ReactNode;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    isRapidIntake?: boolean;
    initialData?: SupabaseClient | null;
}

export function AddClientDialog({ onClientCreated, variant = "default", trigger, isOpen, onOpenChange, isRapidIntake = false, initialData }: AddClientDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = isOpen !== undefined;
    const open = isControlled ? isOpen : internalOpen;
    const setOpen = isControlled ? (onOpenChange || (() => { })) : setInternalOpen;

    const [formData, setFormData] = useState({
        nombre: initialData?.nombre || "",
        dni: initialData?.dni || "",
        telefono: initialData?.telefono || "",
        tipo_ciclista: initialData?.tipo_ciclista || "Casual",
    });

    // Sync form whenever a different client is passed as initialData (e.g., re-opening edit dialog)
    useEffect(() => {
        setFormData({
            nombre: initialData?.nombre || "",
            dni: initialData?.dni || "",
            telefono: initialData?.telefono || "",
            tipo_ciclista: initialData?.tipo_ciclista || "Casual",
        });
    }, [initialData?.id]);
    const [isSaving, setIsSaving] = useState(false);

    const navigate = useNavigate();
    const createCliente = useDataStore(s => s.createCliente);
    const updateCliente = useDataStore(s => s.updateCliente);
    const taller_id = useAuthStore(s => s.taller_id);

    const handleSubmit = async () => {
        if (!formData.nombre || !formData.telefono) return alert("Nombre y Teléfono son obligatorios");
        if (!taller_id) return alert("Error: no taller_id");
        setIsSaving(true);
        try {
            let created: SupabaseClient;
            if (initialData?.id) {
                // updateCliente throws on any Supabase error (incl. RLS) — no false positives
                await updateCliente(initialData.id, {
                    nombre: formData.nombre,
                    dni: formData.dni || undefined,
                    telefono: formData.telefono,
                    tipo_ciclista: formData.tipo_ciclista,
                });
                // Source the updated record from the store (DB-confirmed), not a local merge
                const { clientes } = useDataStore.getState();
                created = clientes.find(c => c.id === initialData.id) as SupabaseClient;
            } else {
                created = await createCliente({
                    taller_id,
                    nombre: formData.nombre,
                    dni: formData.dni || undefined,
                    telefono: formData.telefono,
                    tipo_ciclista: formData.tipo_ciclista,
                });
            }

            setOpen(false);
            if (!initialData) setFormData({ nombre: "", dni: "", telefono: "", tipo_ciclista: "Casual" });
            onClientCreated(created);
            if (!isRapidIntake && !initialData?.id) {
                navigate(`/clients/${created.id}`);
            }
        } catch (e: any) {
            console.error('[AddClientDialog] Error al guardar cliente:', e);
            alert(`Error al guardar: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ? trigger : (
                    <Button variant={variant} size="default" className={variant === 'default' ? "h-12 w-12 p-0 rounded-full" : "w-full"}>
                        {variant === 'default' ? <UserPlus className="h-6 w-6" /> : <><Plus className="mr-2 h-4 w-4" /> Crear Nuevo Cliente</>}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nuevo Cliente</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Nombre Completo</Label>
                        <Input value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} placeholder="Ej: Juan Perez" />
                    </div>
                    <div className="space-y-2">
                        <Label>DNI / Documento</Label>
                        <Input value={formData.dni} onChange={e => setFormData({ ...formData, dni: e.target.value })} placeholder="Ej: 12345678" />
                    </div>
                    <div className="space-y-2">
                        <Label>Teléfono / WhatsApp</Label>
                        <Input value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} placeholder="Ej: 11 1234 5678" />
                    </div>
                    <div className="space-y-2">
                        <Label>Tipo de Ciclista (Tier)</Label>
                        <Select onValueChange={(v) => setFormData({ ...formData, tipo_ciclista: v })} value={formData.tipo_ciclista}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Casual">Casual (Uso Urbano/Paseo)</SelectItem>
                                <SelectItem value="Sport">Sport (Entrenamiento/Ruta)</SelectItem>
                                <SelectItem value="Pro/Heavy">PRO / Heavy (Competencia)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? "Guardando..." : "Guardar Cliente"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
