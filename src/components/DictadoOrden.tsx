import { useEffect, useRef, useState } from "react";
import { useDataStore, type OrdenDictada } from "@/store/dataStore";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, CheckCircle2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// LA ORDEN QUE SE CARGA HABLANDO (idea 1).
//
// El mecánico aprieta el micrófono con las manos sucias, dicta veinte
// segundos y el formulario se precarga: tipo de service del catálogo,
// ítems con el precio del buscador, tareas y notas. Repara la causa de
// muerte de Crono (6 ítems tipeados a mano, orden guardada en $0).
//
// Decisiones:
// - La transcripción la hace el NAVEGADOR (Web Speech API): gratis, en
//   vivo, y el audio no sale del taller. Si el navegador no la tiene,
//   el botón directamente no aparece y todo sigue como siempre.
// - El resultado es un BORRADOR editable. La IA no guarda nada sola:
//   el mecánico revisa, corrige y guarda como siempre.
// - Los precios NO los pone la IA: el ítem dictado se busca en el
//   catálogo del taller con el mismo buscador de siempre. Un precio
//   inventado es peor que un campo vacío.
// - El dictado SUMA, no pisa: lo que ya estaba cargado en el
//   formulario queda intacto.
// ─────────────────────────────────────────────────────────────

// El tipo del reconocedor no está en los DOM types de este target.
const Reconocedor: any =
    typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

export default function DictadoOrden({ bici, onAplicar }: {
    /** Cómo describir la bici en el prompt ("Specialized Tarmac SL7"). */
    bici?: string;
    /** Recibe el borrador estructurado y lo vuelca al formulario. */
    onAplicar: (r: OrdenDictada) => void;
}) {
    const estructurar = useDataStore(s => s.estructurarOrdenDictada);
    const [grabando, setGrabando] = useState(false);
    const [armando, setArmando] = useState(false);
    const [listo, setListo] = useState(false);
    const [fallo, setFallo] = useState(false);
    const [transcript, setTranscript] = useState("");
    const recRef = useRef<any>(null);
    const finalRef = useRef("");

    useEffect(() => () => { try { recRef.current?.stop(); } catch { /* ya parado */ } }, []);

    if (!Reconocedor) return null;

    const empezar = () => {
        setListo(false);
        setFallo(false);
        finalRef.current = "";
        setTranscript("");
        const rec = new Reconocedor();
        rec.lang = 'es-AR';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e: any) => {
            let interim = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                if (r.isFinal) finalRef.current += r[0].transcript + " ";
                else interim += r[0].transcript;
            }
            setTranscript((finalRef.current + interim).trim());
        };
        rec.onerror = () => { setGrabando(false); };
        rec.onend = () => { setGrabando(false); };
        recRef.current = rec;
        rec.start();
        setGrabando(true);
    };

    const parar = async () => {
        try { recRef.current?.stop(); } catch { /* ya parado */ }
        setGrabando(false);
        const texto = (finalRef.current || transcript).trim();
        if (texto.length < 8) return; // no se dictó nada usable
        setArmando(true);
        const r = await estructurar(texto, bici);
        setArmando(false);
        if (r.ok) {
            onAplicar(r);
            setListo(true);
        } else {
            setFallo(true);
        }
    };

    return (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                {!grabando ? (
                    <Button
                        type="button"
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={empezar}
                        disabled={armando}
                    >
                        {armando
                            ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Armando la orden…</>
                            : <><Mic className="w-4 h-4 mr-1.5" /> Dictar la orden</>}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={parar}
                    >
                        <Square className="w-3.5 h-3.5 mr-1.5" /> Listo, armala
                    </Button>
                )}
                <span className="text-xs text-muted-foreground">
                    {grabando
                        ? "Escuchando… decí qué le vas a hacer y qué le ponés."
                        : listo
                            ? <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Borrador cargado abajo. Revisalo antes de guardar.</span>
                            : fallo
                                ? "No se pudo armar el borrador. Cargala a mano como siempre."
                                : "Decilo en veinte segundos y el formulario se arma solo. Después lo revisás."}
                </span>
            </div>
            {(grabando || (armando && transcript)) && transcript && (
                <p className="text-sm text-slate-700 bg-white rounded-md border border-primary/15 px-3 py-2">
                    {transcript}
                </p>
            )}
        </div>
    );
}
