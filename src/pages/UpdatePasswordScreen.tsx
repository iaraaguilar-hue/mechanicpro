import { useState } from "react";
import { Wrench, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function UpdatePasswordScreen() {
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(false);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) {
                console.error("Update Error:", updateError.message);
                throw new Error("No se pudo actualizar la contraseña");
            }

            // Password updated successfully. We force a window reload to `/`
            // to ensure any pending session state is fully re-evaluated by App.tsx
            // and the missing 'usuarios' profile logic checks are re-triggered properly if needed.
            window.location.href = "/";

        } catch (err) {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full p-8 md:p-10 rounded-lg shadow-2xl shadow-gray-200/50">
                <div className="text-center mb-8">
                    <div className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
                        <Wrench className="h-6 w-6 text-orange-500" />
                        Mechanic Pro
                    </div>
                    <h2 className="text-lg font-medium text-gray-800 mt-4">
                        Actualizar contraseña
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Ingresa tu nueva contraseña para continuar.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-6">
                        <div className="relative">
                            <input
                                type="password"
                                placeholder="Nueva Contraseña"
                                className={`w-full bg-transparent border-0 border-b-2 ${error ? 'border-red-500' : 'border-gray-200'} focus:ring-0 focus:border-orange-500 px-1 py-2 text-gray-900 placeholder-gray-400 focus:outline-none transition-colors`}
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError(false);
                                }}
                                autoFocus
                                required
                            />
                            {error && (
                                <p className="absolute -bottom-5 left-0 text-xs text-red-500 font-medium animate-pulse">
                                    Error al intentar actualizar
                                </p>
                            )}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white uppercase tracking-wider font-semibold py-3 rounded-md transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 disabled:opacity-70"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                ACTUALIZANDO...
                            </>
                        ) : (
                            "ACTUALIZAR CONTRASEÑA"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
