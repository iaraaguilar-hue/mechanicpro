// ─────────────────────────────────────────────────────────────
// «¿Le avisamos para que vuelva?» — al finalizar el service.
//
// Pedido de Iara (5-sep-2026): *"que Leandro, en el diagnóstico de la bici cuando
// finaliza el service, pueda poner: avisar en 30 días para que vuelva a hacer
// otro service, y que eso se vaya haciendo solo"*.
//
// 🔴 VA INLINE EN EL PANEL DE FINALIZAR Y NO COMO UN PASO MÁS DEL DIÁLOGO.
// La cadena de finalizar ya tiene CUATRO eslabones (trabajos sin tildar → precio
// en cero → repuestos del ERP → cerrar). Un quinto, con el cliente esperando en
// el mostrador, es el que se aprieta sin leer. Acá es un campo al lado de las
// notas: un toque, y si no lo tocás no pasa nada.
//
// LA SUGERENCIA SALE DEL RITMO REAL DE ESE CLIENTE (`lib/sugerirAviso.ts`), y
// cuando no hay ritmo que leer no sugiere nada y lo dice. Un plazo inventado con
// cara de recomendación es peor que ninguno.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { CalendarClock, Sparkles } from 'lucide-react';
import { PLAZOS, sugerirAviso, diaARDentroDe, comoSeLeeElDia } from '@/lib/sugerirAviso';

export function AvisoDeVuelta({ visitas, plazoDelTaller, valor, onCambio }: {
    /** Las fechas de ingreso de los services de este cliente. */
    visitas: (string | null | undefined)[];
    /** El plazo de la regla general del taller, si tiene una prendida. */
    plazoDelTaller?: number | null;
    /** El día elegido (YYYY-MM-DD) o null si no se avisa. */
    valor: string | null;
    onCambio: (dia: string | null, motivo: string | null) => void;
}) {
    const [sugerida] = useState(() => sugerirAviso({ visitas, plazoDelTaller }));
    const [tocado, setTocado] = useState(false);

    // La sugerencia se aplica sola la primera vez: si hubiera que elegirla a mano,
    // el menú se quedaría en "No avisar" para siempre y la función no existiría.
    // Una vez que el mecánico toca algo, manda él y no se vuelve a pisar.
    useEffect(() => {
        if (tocado || valor || !sugerida.dias) return;
        onCambio(diaARDentroDe(sugerida.dias), sugerida.razon);
        // Se corre una sola vez a propósito: es un default, no un control.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const diasElegidos = (() => {
        if (!valor) return 0;
        const d = Math.round((new Date(valor).getTime() - new Date(diaARDentroDe(0)).getTime()) / 86400000);
        return PLAZOS.some((p) => p.dias === d) ? d : -1;   // -1 = una fecha suelta
    })();

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" /> ¿Le avisamos para que vuelva?
            </Label>

            <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={diasElegidos}
                onChange={(e) => {
                    setTocado(true);
                    const d = Number(e.target.value);
                    onCambio(d > 0 ? diaARDentroDe(d) : null, d > 0 ? 'Lo eligió el mecánico al finalizar.' : null);
                }}
            >
                {PLAZOS.map((p) => <option key={p.dias} value={p.dias}>{p.etiqueta}</option>)}
                {diasElegidos === -1 && valor && (
                    <option value={-1}>{comoSeLeeElDia(valor)}</option>
                )}
            </select>

            {/* Por qué ese plazo. Se muestra para que el mecánico DECIDA y no
                obedezca: un número sin explicación se acepta o se ignora, uno con
                el motivo al lado se puede discutir. */}
            {sugerida.razon && !tocado && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Sparkles className="h-3 w-3 flex-shrink-0 mt-0.5 text-primary" />
                    <span>{sugerida.razon}</span>
                </p>
            )}

            {valor ? (
                <p className="text-xs text-green-700">
                    Le vamos a escribir solos {comoSeLeeElDia(valor)}.
                </p>
            ) : (
                <p className="text-xs text-muted-foreground">
                    No se le escribe nada por esta orden.
                </p>
            )}
        </div>
    );
}
