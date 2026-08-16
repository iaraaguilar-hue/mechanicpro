import { useState } from "react";
import {
    MessageCircle, CheckCircle2, AlertTriangle, ShieldCheck,
    Smartphone, Clock, ArrowLeft, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { TallerData } from "@/store/authStore";

/**
 * Configuración → Conectar el WhatsApp del taller (Coexistencia).
 *
 * Spec: outputs/mechanic_pro/whatsapp_automatico/CONFIGURACION_CONECTAR_WHATSAPP.md
 *
 * El principio de esta pantalla: el taller NO se puede enterar de una limitación
 * después de haber conectado. Por eso lo que se desactiva va ANTES del botón, no
 * en una letra chica después. Acá estamos tocando la herramienta con la que atiende
 * todos los días: si algo deja de andar sin aviso, la conclusión no va a ser "me
 * faltó leer", va a ser "este sistema me rompió el WhatsApp".
 */

/** Cuántos días sin sincronizar antes de gritar. Meta corta la sesión a los 14. */
const DIAS_SIN_SYNC_PARA_ALERTAR = 3;

type Paso = "info" | "historial";

const OPCIONES_HISTORIAL = [
    { meses: 6, label: "6 meses", nota: "Recomendado" },
    { meses: 3, label: "3 meses" },
    { meses: 1, label: "1 mes" },
    { meses: 0, label: "No traer nada" },
] as const;

function diasDesde(iso?: string | null): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86_400_000);
}

function formatearFecha(iso?: string | null): string | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return new Date(t).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
}

function hace(iso?: string | null): string {
    const t = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(t)) return "sin datos";
    const min = Math.floor((Date.now() - t) / 60_000);
    if (min < 2) return "recién";
    if (min < 60) return `hace ${min} minutos`;
    const hs = Math.floor(min / 60);
    if (hs < 24) return `hace ${hs} ${hs === 1 ? "hora" : "horas"}`;
    const d = Math.floor(hs / 24);
    return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

export default function ConectarWhatsApp({ taller, avisar }: {
    taller: TallerData | null;
    avisar: (tipo: "ok" | "error", msg: string) => void;
}) {
    const conectado = Boolean(taller?.wa_activo && taller?.wa_phone_number_id);

    if (conectado) return <EstadoConectado taller={taller!} />;
    return <FlujoDeConexion avisar={avisar} />;
}

// ═════════════════════════════════════════════════════════════
// DESCONECTADO — pantallas 1 y 2 del spec
// ═════════════════════════════════════════════════════════════

function FlujoDeConexion({ avisar }: { avisar: (tipo: "ok" | "error", msg: string) => void }) {
    const [paso, setPaso] = useState<Paso>("info");
    const [entendido, setEntendido] = useState(false);
    const [meses, setMeses] = useState<number>(6);
    const [lanzando, setLanzando] = useState(false);

    /**
     * El diálogo de Embedded Signup lo abre Meta, no nosotros: obliga al dueño a
     * loguearse con SU cuenta de Facebook. Necesita el Configuration ID que se crea
     * en el panel de la app, y ese sólo existe cuando Meta aprueba el acceso avanzado
     * a whatsapp_business_management.
     *
     * Mientras no esté, esto NO simula una conexión: avisa la verdad. Un botón que
     * finge que conectó es peor que un botón que no anda.
     */
    const configId = import.meta.env.VITE_META_CONFIG_ID as string | undefined;

    const conectar = async () => {
        if (!configId) {
            avisar(
                "error",
                "Todavía no podemos conectar: Meta está revisando la solicitud de Mechanic Pro. Te avisamos apenas se habilite.",
            );
            return;
        }
        setLanzando(true);
        try {
            // TODO(embedded-signup): abrir el diálogo de Meta con configId y, con el
            // code que devuelve, llamar a la Edge Function que lo canjea por el token
            // del taller, registra el número y le crea sus plantillas. No se puede
            // escribir a ciegas: el shape del callback se fija recién con el acceso
            // avanzado aprobado.
            avisar("error", "La conexión con Meta todavía no está implementada.");
        } finally {
            setLanzando(false);
        }
    };

    if (paso === "historial") {
        return (
            <Card>
                <CardHeader>
                    <button
                        onClick={() => setPaso("info")}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-slate-900 mb-2 w-fit"
                    >
                        <ArrowLeft className="h-4 w-4" /> Volver
                    </button>
                    <CardTitle>¿Cuánto de tu historial querés traer?</CardTitle>
                    <CardDescription>
                        Podés traer hasta 6 meses de conversaciones para que Mechanic Pro entienda
                        con qué clientes ya venías hablando.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900">
                        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600" />
                        <div className="text-sm">
                            <p className="font-semibold">Esta elección no se puede cambiar después.</p>
                            <p>Traer el historial no borra nada de tu celular.</p>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        {OPCIONES_HISTORIAL.map(op => (
                            <button
                                key={op.meses}
                                onClick={() => setMeses(op.meses)}
                                className={`flex items-center justify-between p-4 rounded-lg border text-left transition-colors ${
                                    meses === op.meses
                                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                                        : "border-slate-200 hover:border-slate-300"
                                }`}
                            >
                                <span className="font-medium text-slate-900">{op.label}</span>
                                {"nota" in op && op.nota && <Badge variant="secondary">{op.nota}</Badge>}
                            </button>
                        ))}
                    </div>

                    <Button onClick={conectar} disabled={lanzando} className="w-full" size="lg">
                        {lanzando
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Abriendo…</>
                            : "Conectar mi WhatsApp"}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-primary" />
                    Conectar el WhatsApp de tu taller
                </CardTitle>
                <CardDescription>
                    Para que los recordatorios de mantenimiento salgan solos, desde tu propio número.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* Bloque 1 — lo que NO cambia. Va primero: es lo que más les preocupa. */}
                <section className="p-4 rounded-lg border border-emerald-200 bg-emerald-50">
                    <h3 className="font-semibold text-emerald-900 flex items-center gap-2 mb-2">
                        <ShieldCheck className="h-4 w-4" /> Lo que no cambia
                    </h3>
                    <ul className="text-sm text-emerald-900 space-y-1.5 list-disc pl-5">
                        <li>Seguís usando WhatsApp en el celular del taller, igual que hoy.</li>
                        <li>Tu número, tus chats y tus contactos quedan como están.</li>
                        <li>Cuando un cliente conteste un recordatorio, el mensaje te llega al celu y le contestás vos.</li>
                        <li>Lo que mandás a mano desde el celular no tiene ningún costo.</li>
                    </ul>
                </section>

                {/* Bloque 2 — requisitos */}
                <section className="p-4 rounded-lg border border-slate-200">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-2">
                        <Smartphone className="h-4 w-4" /> Lo que necesitás
                    </h3>
                    <ul className="text-sm text-slate-700 space-y-1.5 list-disc pl-5">
                        <li>El celular del taller con la app <strong>WhatsApp Business</strong> (no el WhatsApp común)</li>
                        <li>La app actualizada</li>
                        <li>El número con el que atendés a tus clientes</li>
                        <li>La cuenta de Facebook de tu negocio a mano</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-3">
                        <strong>¿Usás el WhatsApp común?</strong> Se puede pasar a WhatsApp Business gratis
                        y no perdés ni el número ni los chats. Escribinos y lo hacemos juntos.
                    </p>
                </section>

                {/* Bloque 3 — lo que se desactiva. Sin suavizar. */}
                <section className="p-4 rounded-lg border border-amber-200 bg-amber-50">
                    <h3 className="font-semibold text-amber-900 flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4" /> Lo que se desactiva
                    </h3>
                    <p className="text-sm text-amber-900 mb-2">
                        Al conectar, en los chats de a uno dejan de funcionar:
                    </p>
                    <ul className="text-sm text-amber-900 space-y-1.5 list-disc pl-5">
                        <li>Listas de difusión</li>
                        <li>Mensajes temporales</li>
                        <li>Mensajes de «ver una vez»</li>
                        <li>Ubicación en tiempo real</li>
                    </ul>
                    <p className="text-sm text-amber-900 mt-2">
                        Los grupos siguen andando en tu celular, pero desde Mechanic Pro no los vamos a ver.
                    </p>
                </section>

                {/* El candado: sin tildar esto, el botón no se puede apretar. */}
                <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <Checkbox
                        checked={entendido}
                        onCheckedChange={v => setEntendido(v === true)}
                        className="mt-0.5"
                    />
                    <span className="text-sm text-slate-900">
                        Leí lo que se desactiva y estoy de acuerdo.
                    </span>
                </label>

                <Button
                    onClick={() => setPaso("historial")}
                    disabled={!entendido}
                    className="w-full"
                    size="lg"
                >
                    Conectar mi WhatsApp
                </Button>
            </CardContent>
        </Card>
    );
}

// ═════════════════════════════════════════════════════════════
// CONECTADO — pantalla 3 del spec
// ═════════════════════════════════════════════════════════════

function EstadoConectado({ taller }: { taller: TallerData }) {
    const ultimaSync: string | null = taller.wa_ultima_sync ?? null;
    const dias = diasDesde(ultimaSync);
    const cortada = dias !== null && dias >= DIAS_SIN_SYNC_PARA_ALERTAR;
    const desde = formatearFecha(taller.wa_conectado_at);

    return (
        <div className="space-y-4">
            {/*
              La alerta de conexión caída no es un extra. Ya nos pasó con el webhook de
              Crono, que estaba apagado y la app fallaba en silencio en cada entrega: un
              motor de retención que dejó de mandar y no avisa es PEOR que no tenerlo,
              porque el taller cree que sus clientes están siendo contactados.
            */}
            {cortada && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-red-300 bg-red-50 text-red-900">
                    <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
                    <div className="text-sm">
                        <p className="font-semibold">
                            Se cortó la conexión con WhatsApp. Los recordatorios no se están mandando.
                        </p>
                        <p>Abrí WhatsApp en el celular del taller para reconectar.</p>
                    </div>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {cortada
                            ? <AlertTriangle className="h-5 w-5 text-red-600" />
                            : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                        {cortada ? "Conexión interrumpida" : "Conectado"}
                    </CardTitle>
                    <CardDescription>
                        {taller.wa_numero_display ?? "Número conectado"}
                        {desde && ` · desde el ${desde}`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/*
                      Si todavía no llegó ningún evento de Meta no se escribe "sin
                      datos" a secas, que se lee como que algo se rompió: se dice qué
                      significa. La marca la pone el webhook con cada evento que
                      manda Meta, así que aparece con el primer mensaje.
                    */}
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {ultimaSync
                            ? `Última sincronización: ${hace(ultimaSync)}`
                            : "Todavía no hubo movimiento. Aparece acá con el primer mensaje."}
                    </p>

                    <div className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
                        <Smartphone className="h-5 w-5 mt-0.5 shrink-0 text-slate-500" />
                        <p className="text-sm text-slate-700">
                            Abrí WhatsApp en el celular del taller al menos una vez cada 14 días.
                            Si el celu queda sin abrir, la conexión se corta sola.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
