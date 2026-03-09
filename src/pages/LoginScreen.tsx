import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Wrench, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { exportBackupToZip } from "@/lib/exportBackup";

export default function LoginScreen() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Feature States
    const [isResetting, setIsResetting] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [resetSuccess, setResetSuccess] = useState(false);

    // Escape hatch: backup para usuarios no autenticados
    const [isLoadingBackup, setIsLoadingBackup] = useState(false);

    const navigate = useNavigate();
    const setAuth = useAuthStore((state) => state.setAuth);

    // Allow standard Supabase Auth persistence by default
    useEffect(() => {
        // Any extra mount logic can go here
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            // FORGOT PASSWORD FLOW
            if (isResetting) {
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/update-password`
                });
                if (resetError) {
                    throw resetError;
                }
                setResetSuccess(true);
                return;
            }

            console.log("PASO 1: Iniciando Auth en Supabase...");
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
            if (authError) throw authError;
            if (!authData.user) throw new Error("No se pudo obtener el usuario.");

            console.log("PASO 2: Auth exitoso. ID del usuario:", authData.user?.id);
            console.log("PASO 3: Consultando tabla 'usuarios' para obtener el rol...");
            const { data: userData, error: userError } = await supabase.from('usuarios').select('*').eq('id', authData.user?.id).single();
            if (userError) throw userError;

            console.log("PASO 4: Datos del usuario obtenidos:", userData);
            console.log("PASO 5: Actualizando estado global (Zustand)...");

            // Setear estado global y navegar
            setAuth(authData.session, userData.taller_id, userData.rol, userData.nombre);

            console.log("PASO 6: Navegando al Dashboard...");
            navigate('/');
        } catch (err: any) {
            console.error("ERROR CAPTURADO EN CATCH:", err);
            // Mostrar error visual
            setError(err.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : "Error al iniciar sesión.");
            if (!isResetting) {
                setPassword("");
            }
        } finally {
            console.log("PASO 7: Ejecutando finally y liberando el botón");
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // ESCAPE HATCH: Descarga de backup sin autenticación
    // taller_id = null aquí; exportBackupToZip lo resuelve desde
    // localStorage o el UUID de producción de ProBikes.
    // ─────────────────────────────────────────────────────────────
    const handleDownloadBackup = async () => {
        const rawData = localStorage.getItem('mechanicPro_db');
        if (!rawData) {
            alert("No se encontraron datos locales para exportar.");
            return;
        }
        setIsLoadingBackup(true);
        try {
            const result = await exportBackupToZip(null); // null = no autenticado
            const cascadeMsg = result.skippedTotal > 0
                ? `\n\n⚠️ ${result.skippedTotal} filas descartadas (clientes eliminados y sus dependencias).`
                : '';
            alert(
                `✅ Backup descargado exitosamente.\n\n` +
                `📊 Resumen:\n` +
                `• ${result.clients} Clientes\n` +
                `• ${result.bikes} Bicicletas\n` +
                `• ${result.services} Servicios\n` +
                `• ${result.items} Items\n` +
                `• ${result.reminders} Recordatorios` +
                cascadeMsg
            );
        } catch (err: any) {
            console.error("❌ Error generando backup:", err);
            alert(`Error al generar el backup:\n\n${err.message}`);
        } finally {
            setIsLoadingBackup(false);
        }
    };

    return (
        <div
            className="min-h-screen relative flex flex-col justify-center items-end p-8 md:p-12 bg-[url('/image_10.png')] bg-cover bg-center before:content-[''] before:absolute before:inset-0 before:bg-black/40 before:backdrop-blur-sm before:-z-10"
        >
            <div className="bg-white max-w-md w-full p-12 rounded-lg shadow-lg relative">

                {/* Encabezado y Textos */}
                <div className="text-center mb-8">
                    <div className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
                        <Wrench className="h-6 w-6 text-orange-500" />
                        Mechanic Pro
                    </div>
                    <h2 className="text-2xl font-semibold text-gray-900 mt-4 tracking-tight">
                        {isResetting ? "Recuperar contraseña" : "CRM de talleres especializados"}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {isResetting ? "Te enviaremos un enlace para restablecer tu acceso." : "Inicia sesión para continuar."}
                    </p>

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-md font-medium text-left">
                            {error}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Campos de Entrada (Minimalistas) */}
                    <div className="space-y-6">
                        <div className="relative">
                            <input
                                type="email"
                                placeholder="Email"
                                className={`w-full bg-transparent border-0 border-b-2 ${error ? 'border-red-500' : 'border-gray-200'} focus:ring-0 focus:border-orange-500 px-1 py-2 text-gray-900 placeholder-gray-400 focus:outline-none transition-colors`}
                                value={email}
                                onChange={(e) => {
                                    setEmail(e.target.value);
                                    setError("");
                                    setResetSuccess(false);
                                }}
                                autoFocus
                                required
                            />
                        </div>

                        {!isResetting && (
                            <div className="relative">
                                <input
                                    type="password"
                                    placeholder="Contraseña"
                                    className={`w-full bg-transparent border-0 border-b-2 ${error ? 'border-red-500' : 'border-gray-200'} focus:ring-0 focus:border-orange-500 px-1 py-2 text-gray-900 placeholder-gray-400 focus:outline-none transition-colors`}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setError("");
                                    }}
                                    required
                                />
                            </div>
                        )}
                    </div>

                    {resetSuccess && (
                        <p className="text-sm text-green-600 font-medium text-center bg-green-50 p-3 rounded">
                            Revisa tu bandeja de entrada. Te hemos enviado un enlace de recuperación.
                        </p>
                    )}

                    {error && isResetting && (
                        <p className="text-sm text-red-500 font-medium text-center animate-pulse">
                            Ocurrió un error. Inténtalo de nuevo.
                        </p>
                    )}

                    {/* Extras */}
                    {!isResetting && (
                        <div className="flex justify-between items-center text-sm mt-6 mb-6 text-gray-600">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                />
                                <span className="group-hover:text-gray-900 transition-colors">Recuérdame</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => { setIsResetting(true); setError(""); }}
                                className="hover:text-orange-600 transition-colors bg-transparent border-none p-0 cursor-pointer"
                            >
                                ¿Olvidaste tu contraseña?
                            </button>
                        </div>
                    )}

                    {/* Botón Principal */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white uppercase tracking-wider font-semibold py-3 rounded-md transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 disabled:opacity-70"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin" />
                                {isResetting ? "ENVIANDO..." : "INGRESANDO..."}
                            </>
                        ) : (
                            isResetting ? "ENVIAR ENLACE DE RECUPERACIÓN" : "INICIAR SESIÓN"
                        )}
                    </button>

                    {/* Botón Volver (Solo en Reset) */}
                    {isResetting && (
                        <div className="text-center mt-4">
                            <button
                                type="button"
                                onClick={() => { setIsResetting(false); setError(""); setResetSuccess(false); }}
                                className="text-sm text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none p-0 cursor-pointer"
                            >
                                Volver al inicio de sesión
                            </button>
                        </div>
                    )}
                </form>
            </div>

            {/* ─────────────────────────────────────────────────────────
                ESCAPE HATCH: Rescate de datos locales sin autenticación
            ───────────────────────────────────────────────────────── */}
            <div className="max-w-md w-full mt-4 text-center">
                <button
                    type="button"
                    onClick={handleDownloadBackup}
                    disabled={isLoadingBackup}
                    className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border-none cursor-pointer"
                >
                    {isLoadingBackup ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Generando backup...
                        </>
                    ) : (
                        <>
                            <Download className="h-4 w-4" />
                            ¿Necesitas rescatar tus datos locales? Descargar Backup CSV
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
