import { useState } from "react";
import { useDataStore, type SupabaseBike } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AddBikeDialogProps {
    clientId: string;
    clientName: string;
    isOpen: boolean;
    onClose: () => void;
    onBikeCreated: (bike: SupabaseBike) => void;
    isRapidIntake?: boolean;
}

export function AddBikeDialog({ clientId, clientName, isOpen, onClose, onBikeCreated, isRapidIntake = false }: AddBikeDialogProps) {
    const [formData, setFormData] = useState({
        marca: "",
        modelo: "",
        transmision: "",
        notas: ""
    });
    const [isSaving, setIsSaving] = useState(false);

    const createBicicleta = useDataStore(s => s.createBicicleta);
    const taller_id = useAuthStore(s => s.taller_id);

    const handleSubmit = async () => {
        if (!formData.marca || !formData.modelo) return alert("Marca y Modelo son obligatorios");
        if (!taller_id) return alert("Error: no taller_id");
        setIsSaving(true);
        try {
            const created = await createBicicleta({
                taller_id,
                cliente_id: clientId,
                marca: formData.marca,
                modelo: formData.modelo,
                transmision: formData.transmision || undefined,
                notas: formData.notas || undefined,
            });
            setFormData({ marca: "", modelo: "", transmision: "", notas: "" });
            onBikeCreated(created);
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nueva Bici para {clientName}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Marca</Label>
                        <Input value={formData.marca} onChange={e => setFormData({ ...formData, marca: e.target.value })} placeholder="Ej: Specialized" />
                    </div>
                    <div className="space-y-2">
                        <Label>Modelo</Label>
                        <Input value={formData.modelo} onChange={e => setFormData({ ...formData, modelo: e.target.value })} placeholder="Ej: Tarmac SL7" />
                    </div>
                    <div className="space-y-2">
                        <Label>Transmisión</Label>
                        <Input value={formData.transmision} onChange={e => setFormData({ ...formData, transmision: e.target.value })} placeholder="Ej: Shimano Ultegra 12s" />
                    </div>
                    <div className="space-y-2">
                        <Label>Notas Generales</Label>
                        <Textarea value={formData.notas} onChange={e => setFormData({ ...formData, notas: e.target.value })} placeholder="Detalles extra..." />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? "Guardando..." : (isRapidIntake ? "Guardar y Nuevo Service" : "Guardar Bici y Seguir")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
