// ─────────────────────────────────────────────────────────────
// Cómo se ve lo que contesta "Preguntale a tu taller".
//
// POR QUÉ EXISTE (18-sep-2026, pedido de Iara: "no me parece muy estética,
// me gustaría que sea más minimalista"): la respuesta se pintaba con un
// `whitespace-pre-wrap` sobre el texto crudo. Todo lo que el modelo escribía
// para dar jerarquía —los `**` de la negrita, los guiones de las listas—
// llegaba a la pantalla tal cual. El prompt intentaba tapar eso prohibiéndole
// el markdown, y el modelo igual lo usaba (dos de las nueve respuestas que
// recibió Leira Bikes tienen `**` crudos). Prohibir algo que el modelo va a
// hacer igual no es una regla: es un defecto esperando.
//
// La salida es al revés: la pantalla aprende a leerlo. Así el modelo puede
// marcar el dato que contesta la pregunta y la respuesta se escanea de un
// vistazo, que es como se lee un taller a las 8 de la mañana.
//
// POR QUÉ SIN LIBRERÍA: el markdown que produce el modelo está medido sobre
// sus respuestas reales y es un subconjunto chico y cerrado — negrita, listas
// con "- ", párrafos. Sumar un `react-markdown` (y su árbol de remark) para
// eso es 200 KB para el taller y una superficie nueva que auditar. Nada de
// `dangerouslySetInnerHTML`: acá no se construye HTML, se arman nodos de React.
// ─────────────────────────────────────────────────────────────

import { Fragment, type ReactNode } from 'react';

/**
 * Los pedacitos de una línea: **negrita** y los números de orden (#17).
 *
 * El `#17` se resalta solo porque es el dato con el que el mecánico habla:
 * busca la orden por número en el tablero, no por el nombre del cliente.
 */
function trozos(linea: string, clave: string): ReactNode[] {
    const salida: ReactNode[] = [];
    // Un solo recorrido con las dos formas: si se hicieran en dos pasadas, la
    // segunda tendría que volver a caminar nodos ya partidos.
    const re = /\*\*(.+?)\*\*|(#\d+)/g;
    let ultimo = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(linea)) !== null) {
        if (m.index > ultimo) salida.push(linea.slice(ultimo, m.index));
        if (m[1] !== undefined) {
            salida.push(<strong key={`${clave}-b${i++}`} className="font-semibold text-foreground">{m[1]}</strong>);
        } else {
            salida.push(
                <span key={`${clave}-o${i++}`}
                    className="font-mono text-[0.92em] tracking-tight text-foreground/80">
                    {m[2]}
                </span>,
            );
        }
        ultimo = m.index + m[0].length;
    }
    if (ultimo < linea.length) salida.push(linea.slice(ultimo));
    return salida;
}

/** Una línea es un ítem de lista si arranca con "- " o "1. " (con o sin sangría). */
const ES_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Convierte el texto del modelo en bloques: párrafos y listas.
 * Las líneas en blanco separan bloques; las de lista se agrupan entre ellas.
 */
export default function RespuestaIA({ texto }: { texto: string }) {
    const lineas = texto.replace(/\r/g, '').split('\n');
    const bloques: { tipo: 'p' | 'ul'; lineas: string[] }[] = [];

    for (const cruda of lineas) {
        const linea = cruda.trimEnd();
        if (!linea.trim()) { bloques.push({ tipo: 'p', lineas: [] }); continue; } // corta el bloque
        const tipo = ES_ITEM.test(linea) ? 'ul' : 'p';
        const ultimo = bloques[bloques.length - 1];
        // Un párrafo de varias líneas sigue siendo UN párrafo (el modelo corta
        // renglones donde quiere); una lista junta sus ítems.
        if (ultimo && ultimo.tipo === tipo && ultimo.lineas.length) ultimo.lineas.push(linea);
        else bloques.push({ tipo, lineas: [linea] });
    }

    return (
        <div className="space-y-3 text-[0.9375rem] leading-relaxed text-foreground/75">
            {bloques.filter(b => b.lineas.length).map((b, bi) =>
                b.tipo === 'ul' ? (
                    <ul key={bi} className="space-y-1.5">
                        {b.lineas.map((l, li) => (
                            <li key={li} className="flex gap-2.5">
                                {/* El punto: un bullet dibujado, no el guión que escribió el modelo. */}
                                <span aria-hidden className="mt-[0.72em] h-[3px] w-[3px] shrink-0 rounded-full bg-foreground/35" />
                                <span className="min-w-0">{trozos(l.replace(ES_ITEM, ''), `${bi}-${li}`)}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p key={bi}>
                        {b.lineas.map((l, li) => (
                            <Fragment key={li}>
                                {li > 0 && ' '}
                                {trozos(l, `${bi}-${li}`)}
                            </Fragment>
                        ))}
                    </p>
                ),
            )}
        </div>
    );
}
