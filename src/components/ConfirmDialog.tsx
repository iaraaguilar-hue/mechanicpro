import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Confirmación con estilo Mechanic Pro — reemplaza a window.confirm (el aviso
// nativo del navegador rompe la estética de la app). Ícono en círculo + título
// + descripción + Cancelar/acción, con el color de la acción que confirma.
interface ConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    icon: ReactNode;
    iconClassName?: string;
    title: string;
    description?: ReactNode;
    confirmLabel: string;
    confirmClassName?: string;
    cancelLabel?: string;
}

export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    icon,
    iconClassName,
    title,
    description,
    confirmLabel,
    confirmClassName,
    cancelLabel,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="items-center sm:text-center">
                    <div className={`mx-auto mb-2 h-14 w-14 rounded-full flex items-center justify-center ${iconClassName ?? "bg-primary/10 text-primary"}`}>
                        {icon}
                    </div>
                    <DialogTitle className="text-xl text-center">{title}</DialogTitle>
                </DialogHeader>
                {description && (
                    <div className="text-sm text-muted-foreground text-center px-2">{description}</div>
                )}
                <DialogFooter className="gap-2 sm:gap-2 sm:justify-center pt-2">
                    <Button variant="outline" onClick={onClose}>{cancelLabel ?? "Cancelar"}</Button>
                    <Button className={confirmClassName ?? "bg-primary hover:bg-primary/90 text-primary-foreground"} onClick={onConfirm}>
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
