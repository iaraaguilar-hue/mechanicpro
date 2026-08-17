import { useEffect, useRef, useState } from "react";
import { useDataStore, type OrdenDictada } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Square, Loader2, CheckCircle2, Keyboard } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// LA ORDEN QUE SE CARGA HABLANDO (idea 1).
//
// Dos caminos para dictar, porque los celulares mienten:
//
// 1. EL MICRÓFONO DEL TELADO (el camino seguro). Un campo de texto donde
//    el mecánico dicta con el micrófono del teclado del celular, que es
//    el dictado del sistema operativo y anda SIEMPRE. En iPhone/iPad es
//    el único camino: el reconocedor del navegador existe pero arranca
//    sin escuchar nada y sin tirar error (probado el 17-ago en el
//    celular de Iara: "no me escuchó y se trabó").
//
// 2. EL RECONOCEDOR DEL NAVEGADOR (la mejora, donde funciona). Escucha
//    en vivo sin tocar el teclado. Solo se ofrece fuera de iOS, y con
//    dos redes de seguridad que la primera versión no tenía:
//    - todo fallo SE DICE en pantalla (permiso denegado, no escucha):
//      el silencio se percibe como "se trabó la app";
//    - un vigía: si a los 6 segundos no entró ni una palabra, avisa y
//      abre el campo de texto para seguir con el teclado.
//
// Y la llamada al servidor tiene TIMEOUT: un botón que queda girando
// para siempre es una app colgada, aunque técnicamente esté esperando.
//
// El resultado sigue siendo un borrador: la IA nunca guarda sola.
// ─────────────────────────────────────────────────────────────

const Reconocedor: any =
    typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

// En iOS TODOS los navegadores son WebKit y el reconocedor está roto de la
// misma manera. iPad moderno se anuncia como "Macintosh" con touch.
const esIOS = typeof navigator !== 'undefined' && (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

const usarReconocedor = !!Reconocedor && !esIOS;

const TIMEOUT_ARMADO_MS = 30000;
const VIGIA_SIN_AUDIO_MS = 6000;

export default function DictadoOrden({ bici, onAplicar, completo = false }: {
    /** Cómo describir la bici en el prompt ("Specialized Tarmac SL7"). */
    bici?: string;
    /** Recibe el borrador estructurado y lo vuelca al formulario. */
    onAplicar: (r: OrdenDictada) => void;
    /** Modo "dictar todo de una": también el cliente y la bici, desde el paso 1. */
    completo?: boolean;
}) {
    const estructurar = useDataStore(s => s.estructurarOrdenDictada);
    type Modo = 'inicial' | 'grabando' | 'texto' | 'armando' | 'listo';
    const [modo, setModo] = useState<Modo>('inicial');
    const [aviso, setAviso] = useState<string | null>(null);
    const [texto, setTexto] = useState("");
    const recRef = useRef<any>(null);
    const finalRef = useRef("");
    const vigiaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const limpiarVigia = () => { if (vigiaRef.current) { clearTimeout(vigiaRef.current); vigiaRef.current = null; } };
    useEffect(() => () => { limpiarVigia(); try { recRef.current?.stop(); } catch { /* ya parado */ } }, []);

    const aTexto = (mensaje: string | null) => {
        limpiarVigia();
        try { recRef.current?.stop(); } catch { /* ya parado */ }
        setAviso(mensaje);
        setModo('texto');
    };

    const empezarReconocedor = () => {
        setAviso(null);
        finalRef.current = "";
        setTexto("");
        let rec: any;
        try {
            rec = new Reconocedor();
            rec.lang = 'es-AR';
            rec.continuous = true;
            rec.interimResults = true;
        } catch {
            aTexto("El reconocedor de este navegador no arrancó. Dictá con el micrófono del teclado acá abajo.");
            return;
        }
        rec.onresult = (e: any) => {
            limpiarVigia(); // entró audio: el vigía ya no hace falta
            let interim = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                if (r.isFinal) finalRef.current += r[0].transcript + " ";
                else interim += r[0].transcript;
            }
            setTexto((finalRef.current + interim).trim());
        };
        rec.onerror = (e: any) => {
            // El silencio acá es lo que se percibe como "se trabó la app":
            // todo error se dice, y el teclado queda como salida.
            const motivo = e?.error === 'not-allowed' || e?.error === 'service-not-allowed'
                ? "El navegador no tiene permiso para usar el micrófono. Dictá con el micrófono del teclado acá abajo (o dale permiso en el candadito de la barra de dirección)."
                : e?.error === 'no-speech'
                    ? "No se escuchó nada. Probá con el micrófono del teclado acá abajo."
                    : "El micrófono del navegador falló. Dictá con el micrófono del teclado acá abajo.";
            aTexto(motivo);
        };
        rec.onend = () => {
            // Si terminó solo (silencio, permiso, red) y seguíamos "grabando",
            // no dejar la pantalla muda: pasar al teclado con lo que haya.
            setModo(m => {
                if (m !== 'grabando') return m;
                limpiarVigia();
                setAviso("El micrófono se cortó. Seguí con el micrófono del teclado, o tocá Armar si ya está todo dicho.");
                return 'texto';
            });
        };
        recRef.current = rec;
        try {
            rec.start();
        } catch {
            aTexto("El micrófono del navegador no arrancó. Dictá con el micrófono del teclado acá abajo.");
            return;
        }
        setModo('grabando');
        // El vigía: si en 6 segundos no entró ni una palabra, no lo dejamos
        // hablándole a una pantalla que no escucha.
        vigiaRef.current = setTimeout(() => {
            setModo(m => {
                if (m !== 'grabando' || finalRef.current) return m;
                try { recRef.current?.stop(); } catch { /* ya parado */ }
                setAviso("No te estoy escuchando. Dictá con el micrófono del teclado acá abajo, que anda siempre.");
                return 'texto';
            });
        }, VIGIA_SIN_AUDIO_MS);
    };

    const armar = async (dictado: string) => {
        const limpio = dictado.trim();
        if (limpio.length < 8) {
            setAviso("No llegó nada para armar. Contá qué le vas a hacer a la bici y qué le ponés.");
            setModo('texto');
            return;
        }
        limpiarVigia();
        try { recRef.current?.stop(); } catch { /* ya parado */ }
        setModo('armando');
        setAviso(null);
        // Con timeout: un botón girando para siempre es una app colgada.
        const r = await Promise.race([
            estructurar(limpio, bici),
            new Promise<OrdenDictada>(res => setTimeout(() => res({ ok: false, error: 'timeout' }), TIMEOUT_ARMADO_MS)),
        ]);
        if (r.ok) {
            onAplicar(r);
            setModo('listo');
        } else {
            setAviso(r.error === 'timeout'
                ? "Tardó demasiado y lo cortamos. Tu dictado quedó acá abajo: tocá Armar para reintentar, o cargala a mano."
                : "No se pudo armar el borrador. Tu dictado quedó acá abajo: reintentá o cargala a mano.");
            setModo('texto');
        }
    };

    return (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                {modo === 'grabando' ? (
                    <Button type="button" size="sm" variant="destructive" onClick={() => armar(texto)}>
                        <Square className="w-3.5 h-3.5 mr-1.5" /> Listo, armala
                    </Button>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        disabled={modo === 'armando'}
                        onClick={() => (usarReconocedor ? empezarReconocedor() : (setAviso(null), setModo('texto')))}
                    >
                        {modo === 'armando'
                            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Armando la orden…</>
                            : <><Mic className="w-4 h-4 mr-1.5" /> Dictar la orden</>}
                    </Button>
                )}
                {usarReconocedor && modo === 'inicial' && (
                    <button
                        type="button"
                        className="text-xs text-primary underline underline-offset-2"
                        onClick={() => { setAviso(null); setModo('texto'); }}
                    >
                        <Keyboard className="w-3 h-3 inline mr-0.5" /> prefiero escribirla
                    </button>
                )}
                <span className="text-xs text-muted-foreground">
                    {modo === 'grabando'
                        ? (completo ? "Escuchando… decí de quién es la bici y qué le hacés." : "Escuchando… decí qué le vas a hacer y qué le ponés.")
                        : modo === 'listo'
                            ? <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Borrador cargado abajo. Revisalo antes de guardar.</span>
                            : modo === 'inicial'
                                ? (completo
                                    ? "Decí de quién es, qué bici es y qué le hacés: si el cliente ya está cargado, no hace falta ni buscarlo."
                                    : "Decilo en veinte segundos y el formulario se arma solo. Después lo revisás.")
                                : null}
                </span>
            </div>

            {aviso && <p className="text-xs font-medium text-amber-700">{aviso}</p>}

            {modo === 'grabando' && texto && (
                <p className="text-sm text-slate-700 bg-white rounded-md border border-primary/15 px-3 py-2">
                    {texto}
                </p>
            )}

            {modo === 'texto' && (
                <div className="space-y-2">
                    <Textarea
                        autoFocus
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        placeholder={completo
                            ? 'Tocá el micrófono del teclado 🎤 y dictá: "la Tarmac de Martín, cadena estirada, le pongo cadena y pastillas, la mano de obra se la cobro veinticinco mil"'
                            : 'Tocá el micrófono del teclado 🎤 y dictá: "cadena estirada, pastillas al límite, le pongo cadena Ultegra y pastillas"'}
                        className="min-h-[70px] bg-white text-sm"
                    />
                    <div className="flex gap-2">
                        <Button type="button" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => armar(texto)}>
                            Armar la orden
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="text-slate-500"
                            onClick={() => { setModo('inicial'); setAviso(null); setTexto(""); }}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
