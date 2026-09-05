// ─────────────────────────────────────────────────────────────
// El renglón que aparece debajo de un teléfono mal cargado.
//
// Pedido de Iara (5-sep-2026): que el mecánico se entere EN EL MOMENTO en que
// carga el cliente, no el día que el mensaje no sale. El motor ya descarta los
// números que no son celulares argentinos, pero ahí ya es tarde: el aviso no
// sale, queda un renglón que nadie lee, y el cliente simplemente nunca contesta.
// El único momento en que alguien puede arreglarlo es con la persona enfrente.
//
// 🔴 AVISA, NO BLOQUEA, y tampoco dice "este número no existe": no lo sabemos.
// Dice la consecuencia, que sí podemos afirmar y es lo que al taller le importa.
// ─────────────────────────────────────────────────────────────

import { diagnosticoDeTelefono } from '@/lib/telefonoAR';
import { AlertTriangle, Check } from 'lucide-react';

export function AvisoTelefono({ valor }: { valor: string }) {
    const d = diagnosticoDeTelefono(valor);

    if (d.sirve) {
        // Confirmar cuando está bien no es decoración: le enseña al que carga cómo
        // se interpreta lo que escribió, y el "15" y el "0" son justo donde se
        // equivoca todo el mundo.
        return (
            <p className="text-xs text-green-700 flex items-center gap-1.5">
                <Check className="h-3 w-3 flex-shrink-0" /> Le vamos a escribir al {d.comoQueda}
            </p>
        );
    }
    if (!d.aviso) return null;

    return (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" /> <span>{d.aviso}</span>
        </p>
    );
}
