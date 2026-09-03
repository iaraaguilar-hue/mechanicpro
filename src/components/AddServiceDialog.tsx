import { useState } from "react";
import { useDataStore, type SupabaseBike, type SupabaseService } from "@/store/dataStore";
import { useAuthStore } from "@/store/authStore";
// ⚠️ Componente SIN USO: no lo importa ninguna pantalla (verificado 3-sep-2026).
// Apuntaba a un `ServiceType` que ServiceModal nunca exportó, y el error estaba
// oculto porque el typecheck del proyecto corría sobre un tsconfig con
// "files": [], o sea sobre cero archivos. Se define acá para dejar el chequeo en
// verde sin borrar código que quizá alguien quiera retomar.
const ServiceType = { SPORT: "Sport", PERFORMANCE: "Performance", EXPERT: "Expert" } as const;
type ServiceType = typeof ServiceType[keyof typeof ServiceType];
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface AddServiceDialogProps {
    bike: SupabaseBike;
    isOpen: boolean;
    onClose: () => void;
    onServiceCreated: (service: SupabaseService) => void;
}

export function AddServiceDialog({ bike, isOpen, onClose, onServiceCreated }: AddServiceDialogProps) {
    const [serviceType, setServiceType] = useState<ServiceType>(ServiceType.SPORT);
    const [notes, setNotes] = useState("");
    const [fechaEntrega, setFechaEntrega] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const createServicio = useDataStore(s => s.createServicio);
    const taller_id = useAuthStore(s => s.taller_id);

    const handleSubmit = async () => {
        if (!bike.id || !taller_id) return;
        setIsSaving(true);
        try {
            const created = await createServicio({
                taller_id,
                bicicleta_id: bike.id,
                tipo_servicio: serviceType,
                estado: "in_progress",
                notas_mecanico: notes,
                fecha_ingreso: new Date().toISOString(),
                fecha_entrega: fechaEntrega || null,
            });
            setNotes("");
            setFechaEntrega("");
            onServiceCreated(created);
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Ingresar Servicio: {bike.marca} {bike.modelo}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label>Tipo de Servicio</Label>
                        <Select onValueChange={(v) => setServiceType(v as ServiceType)} defaultValue={ServiceType.SPORT}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar Servicio" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ServiceType.SPORT}>Service Sport (Básico)</SelectItem>
                                <SelectItem value={ServiceType.EXPERT}>Service Expert (Completo)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Fecha Estimada de Entrega (Opcional)</Label>
                        <Input
                            type="date"
                            className="w-full text-lg"
                            value={fechaEntrega}
                            onChange={(e) => setFechaEntrega(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Observaciones de Ingreso</Label>
                        <Textarea
                            placeholder="Ej: Ruidos en caja pedalera..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        {isSaving ? "Ingresando..." : "Confirmar Ingreso"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
