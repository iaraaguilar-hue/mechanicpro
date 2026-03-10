import { CheckCircle } from "lucide-react";

interface SuccessModalProps {
    message: string;
    onClose: () => void;
}

export function SuccessModal({ message, onClose }: SuccessModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-center mb-5">
                    <div className="bg-orange-50 rounded-full p-4">
                        <CheckCircle className="w-12 h-12 text-orange-500" strokeWidth={1.5} />
                    </div>
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-2">
                    ¡Operación Exitosa!
                </h3>

                <p className="text-slate-500 text-sm mb-6">
                    {message}
                </p>

                <button
                    onClick={onClose}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors duration-200"
                >
                    Aceptar
                </button>
            </div>
        </div>
    );
}
