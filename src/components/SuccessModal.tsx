import type { ReactNode } from "react";
import { CheckCircle } from "lucide-react";

interface SuccessModalProps {
    message: string;
    onClose: () => void;
    /** Lo que se puede hacer ANTES de aceptar: hoy, imprimir el comprobante de ingreso. */
    extra?: ReactNode;
}

export function SuccessModal({ message, onClose, extra }: SuccessModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                /* Marca para el candado: sin esto, contar botones "en pantalla" cuenta
                   también los de la tabla que quedó atrás y la medición se escribe sola. */
                data-exito="1"
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-center mb-5">
                    <div className="bg-orange-50 rounded-full p-4">
                        <CheckCircle className="w-12 h-12 text-primary" strokeWidth={1.5} />
                    </div>
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-2">
                    ¡Operación Exitosa!
                </h3>

                <p className="text-slate-500 text-sm mb-6">
                    {message}
                </p>

                {extra && <div className="mb-3 flex flex-col gap-2">{extra}</div>}

                <button
                    onClick={onClose}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-colors duration-200"
                >
                    Aceptar
                </button>
            </div>
        </div>
    );
}
