import { useState } from "react";
import { QrCode, Trash2, CheckCircle2, AlertCircle, Smartphone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function WhatsAppSettings() {
    const [status, setStatus] = useState<"DISCONNECTED" | "CONNECTING" | "CONNECTED">("DISCONNECTED");
    const [qrVisible, setQrVisible] = useState(false);

    const handleConnectClick = () => {
        setStatus("CONNECTING");
        setQrVisible(true);
        // Simulate waiting for QR from external service (Evolution API)
        setTimeout(() => {
            // Once the real API is connected, this would switch to CONNECTED after scanning
        }, 2000);
    };

    const handleDisconnect = () => {
        setStatus("DISCONNECTED");
        setQrVisible(false);
    };

    const handleSimulateScan = () => {
        setStatus("CONNECTED");
        setQrVisible(false);
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <MessageCircle className="h-8 w-8 text-green-500" />
                        Configuración de WhatsApp
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Vincula tu celular para enviar notificaciones automáticas a los clientes.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="bg-slate-50 border-b">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Smartphone className="h-5 w-5 text-slate-600" />
                                Estado de la Conexión
                            </CardTitle>

                            {status === "DISCONNECTED" && <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100">Desconectado</Badge>}
                            {status === "CONNECTING" && <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200 animate-pulse">Conectando...</Badge>}
                            {status === "CONNECTED" && <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Conectado
                            </Badge>}
                        </div>
                    </CardHeader>

                    <CardContent className="pt-6 space-y-6">
                        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 min-h-[250px]">
                            {status === "DISCONNECTED" && (
                                <div className="text-center space-y-4">
                                    <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-2">
                                        <QrCode size={32} />
                                    </div>
                                    <h3 className="font-semibold text-slate-800">Ningún dispositivo vinculado</h3>
                                    <p className="text-sm text-slate-500 max-w-[250px]">
                                        Necesitas escanear el código QR con tu WhatsApp para habilitar las notificaciones.
                                    </p>
                                    <Button onClick={handleConnectClick} className="mt-4 bg-green-600 hover:bg-green-700 text-white">
                                        Vincular WhatsApp
                                    </Button>
                                </div>
                            )}

                            {status === "CONNECTING" && qrVisible && (
                                <div className="text-center space-y-4 flex flex-col items-center">
                                    <p className="text-sm font-medium text-slate-600 mb-2">Escanea este código con tu WhatsApp</p>
                                    {/* Placeholder QR */}
                                    <div
                                        className="w-48 h-48 bg-white p-2 rounded-lg border-2 border-slate-200 shadow-sm flex items-center justify-center cursor-pointer hover:border-green-400 transition-colors"
                                        onClick={handleSimulateScan}
                                        title="Click para simular escaneo (Dev Only)"
                                    >
                                        <QrCode className="w-full h-full text-slate-800" strokeWidth={1} />
                                    </div>
                                    <p className="text-xs text-slate-400 max-w-[200px]">Abre WhatsApp en tu teléfono {'>'} Dispositivos vinculados {'>'} Vincular un dispositivo</p>
                                </div>
                            )}

                            {status === "CONNECTED" && (
                                <div className="text-center space-y-4">
                                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-2">
                                        <CheckCircle2 size={32} />
                                    </div>
                                    <h3 className="font-semibold text-slate-800">Dispositivo vinculado activo</h3>
                                    <p className="text-sm text-slate-500">
                                        Tu taller ya puede enviar notificaciones automáticas a los clientes.
                                    </p>
                                    <Button variant="outline" className="mt-4 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={handleDisconnect}>
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Desconectar
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm h-fit">
                    <CardHeader className="bg-slate-50 border-b">
                        <CardTitle className="text-lg">Instrucciones</CardTitle>
                        <CardDescription>Cómo vincular tu línea oficial del taller</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <ol className="list-decimal list-inside space-y-3 text-sm text-slate-600">
                            <li>Asegúrate de tener buena conexión a internet en tu teléfono celular.</li>
                            <li>Abre la aplicación de WhatsApp en tu teléfono.</li>
                            <li>Toca en el menú (tres puntos) o en Configuración y selecciona <strong>Dispositivos vinculados</strong>.</li>
                            <li>Toca en <strong>Vincular un dispositivo</strong>.</li>
                            <li>Apunta la cámara de tu teléfono a la pantalla para escanear el código QR.</li>
                        </ol>

                        <div className="mt-6 p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-100 flex gap-3 items-start text-sm">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
                            <div>
                                <p className="font-semibold mb-1">Nota importante sobre el servicio</p>
                                <p>Este método es exclusivo para la instancia tuya asociada a Mechanic Pro (Evolution API). Evita desconectar tu celular frecuentemente para no perder mensajes.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

