import { useState, useEffect } from "react";
import { useDataStore, type SupabaseBike } from "@/store/dataStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditBikeDialogProps {
    bike: SupabaseBike;
    isOpen: boolean;
    onClose: () => void;
    onBikeUpdated: (bike: SupabaseBike) => void;
}

export function EditBikeDialog({ bike, isOpen, onClose, onBikeUpdated }: EditBikeDialogProps) {
    const [formData, setFormData] = useState({
        marca: "",
        modelo: "",
        transmision: "",
        notas: ""
    });
    const [isSaving, setIsSaving] = useState(false);

    const updateBicicleta = useDataStore(s => s.updateBicicleta);

    useEffect(() => {
        if (bike) {
            setFormData({
                marca: bike.marca || "",
                modelo: bike.modelo || "",
                transmision: bike.transmision || "",
                notas: bike.notas || ""
            });
        }
    }, [bike]);

    const handleSubmit = async () => {
        if (!formData.marca || !formData.modelo) return alert("Marca y Modelo son obligatorios");
        setIsSaving(true);
        try {
            await updateBicicleta(bike.id, {
                marca: formData.marca,
                modelo: formData.modelo,
                transmision: formData.transmision || undefined,
                notas: formData.notas || undefined,
            });
            onBikeUpdated({ ...bike, ...formData });
            onClose();
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
                    <DialogTitle>Editar Bicicleta</DialogTitle>
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
                        {isSaving ? "Guardando..." : "Guardar Cambios"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
