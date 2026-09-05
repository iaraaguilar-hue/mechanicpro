// ─────────────────────────────────────────────────────────────
// LAS PLANTILLAS QUE ESCRIBE EL TALLER — validación y traducción a Meta.
//
// 🚩 ESPEJO de supabase/functions/_shared/plantillas_taller.ts. Si se toca uno,
// el otro — y después se corre `node tools/paridad_plantillas.cjs`, que compara
// los dos archivos caso por caso. El frontend no puede importar de una Edge
// Function (Deno no comparte módulos con Vite), así que esto vive dos veces.
//
// Los dos lados NO son redundantes: este es para que el mecánico vea el error
// mientras escribe, el del servidor es el que MANDA — sin él, cualquiera que
// llame a la función con curl mete lo que quiera en la cuenta de Meta del taller.
//
// ─────────────────────────────────────────────────────────────
// POR QUÉ EL TALLER ESCRIBE {{cliente}} Y NO {{1}}
//
// Meta numera las variables: el cuerpo que se manda a aprobar dice
// "Hola {{1}}, tu {{2}}". Pero un mecánico que abre su plantilla seis meses
// después no tiene forma de saber qué era {{2}}, y el motor que la manda tampoco:
// hoy sabe llenar las plantillas del sistema porque están escritas a mano en el
// código, con una lista de parámetros por nombre de plantilla.
//
// Entonces el taller escribe con NOMBRES, y al mandarla a Meta se traduce a
// números guardando el orden en `variables`. Eso es lo que le permite al motor
// llenar una plantilla que nadie programó.
// ─────────────────────────────────────────────────────────────

/**
 * Los campos que el taller puede meter en su mensaje.
 *
 * La lista es CERRADA y corta a propósito: son exactamente los datos que el
 * motor tiene a mano cuando se dispara (el service, su bici, su cliente, la
 * configuración de la regla). Ofrecer un campo que después no se puede llenar
 * sería prometerle al taller un mensaje que el día que se dispare va a salir con
 * un hueco — y Meta rechaza el envío entero si una variable va vacía.
 *
 * `ejemplo` no es decorativo: Meta exige un ejemplo por cada variable o rechaza
 * la creación. Y se eligen ejemplos de taller reales-verosímiles porque un
 * revisor que ve "texto1 texto2" duda, y uno que ve "Martín / Tarmac SL7"
 * entiende para qué sirve la plantilla.
 */
export const CAMPOS = {
    cliente: {
        etiqueta: 'el nombre del cliente',
        ayuda: 'El nombre de pila del dueño de la bici.',
        ejemplo: 'Martín',
        siFalta: null,
    },
    bici: {
        etiqueta: 'la bici',
        ayuda: 'La marca y el modelo, como están cargados en la ficha.',
        ejemplo: 'Tarmac SL7',
        siFalta: null,
    },
    taller: {
        etiqueta: 'el nombre del taller',
        ayuda: 'El nombre de tu negocio.',
        ejemplo: 'Probikes',
        siFalta: null,
    },
    firma: {
        etiqueta: 'quién firma',
        ayuda: 'El nombre del que atiende. Sale de la regla, o del que pusiste en Mi Taller.',
        ejemplo: 'Leandro',
        siFalta: null,
    },
    nota: {
        etiqueta: 'tu línea',
        ayuda: 'La frase que escribís en la regla: cómo se paga, el horario, lo que sea.',
        ejemplo: 'La mano de obra se abona en efectivo o transferencia.',
        siFalta: null,
    },

    // ── LOS QUE SE SUMARON EL 5-SEP-2026 (Iara: "pondría más opciones, todas las
    // que puedan hacer"). Cada uno se MIDIÓ contra las 352 órdenes reales de
    // Probikes antes de ofrecerlo: un campo que en la práctica está vacío no es
    // una opción más, es un aviso que no sale y nadie sabe por qué.
    orden: {
        etiqueta: 'el número de orden',
        ayuda: 'El número con el que figura el trabajo, como #0054.',
        ejemplo: '#0054',
        // Medido: 0 de 352 órdenes de Probikes sin número. Siempre está.
        siFalta: null,
    },
    total: {
        etiqueta: 'lo que salió',
        ayuda: 'El total del service, en pesos.',
        ejemplo: '$85.000',
        // Medido: 18 de 352 (5%) sin precio cargado.
        siFalta: 'Si la orden no tiene el precio cargado, ese aviso no sale.',
    },
    tipo: {
        etiqueta: 'el tipo de service',
        ayuda: 'Lo que figura como tipo de trabajo en la orden.',
        ejemplo: 'Service completo',
        // Medido: 5 de 352 (1,4%).
        siFalta: 'Si la orden no tiene el tipo cargado, ese aviso no sale.',
    },
    trabajo: {
        etiqueta: 'lo que se hizo',
        ayuda: 'Las notas para el cliente que escribiste en la orden. Nunca las internas.',
        ejemplo: 'Cambio de cadena y regulación de cambios',
        // 🔴 Medido: 315 de 352 (89%) SIN notas para el cliente. Es el campo más
        // pedido y el que menos se llena; ofrecerlo callado sería regalar un aviso
        // que falla 9 de cada 10 veces.
        siFalta: 'Ojo: hoy casi ninguna orden tiene estas notas cargadas, y sin ellas el aviso no sale.',
    },
    pago: {
        etiqueta: 'cómo se paga',
        ayuda: 'Lo que pusiste en Mi Taller como formas de pago. Se cambia una vez y vale para todos.',
        ejemplo: 'Efectivo o transferencia',
        siFalta: 'Cargá las formas de pago en Mi Taller, o ese aviso no sale.',
    },
} as const;

export type Campo = keyof typeof CAMPOS;

export const CAMPOS_VALIDOS = Object.keys(CAMPOS) as Campo[];

/** El máximo real de Meta es 1024; se corta antes para dejar aire. */
export const LARGO_MAXIMO = 900;
export const LARGO_MINIMO = 15;
/** Meta acepta más, pero una plantilla con 10 huecos no la llena nadie bien. */
export const MAXIMO_DE_CAMPOS = 10;

const TOKEN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
const HAY_LETRA = /\p{L}/u;

/** Los {{campo}} que aparecen en el texto, en orden de aparición. */
export function camposDelCuerpo(cuerpo: string): string[] {
    return [...cuerpo.matchAll(TOKEN)].map((m) => m[1].trim().toLowerCase());
}

/**
 * Dice si el texto se puede mandar a Meta, y si no, POR QUÉ en castellano.
 *
 * Devuelve el primer problema y no una lista: el que escribe corrige de a uno, y
 * una lista de seis reglas al lado de un textarea no se lee.
 *
 * 🔴 Las reglas raras de Meta están todas acá porque cada una costó un rechazo
 * real (verificadas contra la API el 6-ago-2026):
 *   · una variable no puede quedar al principio NI al final del cuerpo — y
 *     "...gracias por confiar en {{cliente}}!" también rebota, aunque le siga un
 *     signo: lo que Meta mira es si después hay TEXTO, no si hay caracteres.
 *   · dos variables seguidas tampoco — pero OJO con la asimetría, que está MEDIDA
 *     contra la API el 5-sep-2026 y no deducida: entre dos variables alcanza con
 *     un signo ("tu {{bici}}. {{nota}} Gracias") y Meta la aprueba, mientras que
 *     al final NO alcanza. Poner la misma regla en los dos lados parecía prolijo
 *     y rechazaba una frase perfectamente normal: terminar la oración con la bici
 *     y arrancar la siguiente con la línea del taller.
 * Y una que no es de Meta sino de Iara: el signo de apertura (¡ ¿) no se usa.
 * Es correcto en español y por eso nadie lo revisa, pero nadie lo escribe en un
 * WhatsApp: abrir con "¡Hola" es la marca de un texto redactado.
 */
export function validarCuerpo(cuerpo: string): string | null {
    const t = (cuerpo ?? '').replace(/\r/g, '').trim();

    if (t.length < LARGO_MINIMO) return 'El mensaje es muy corto. Escribilo como se lo dirías al cliente.';
    if (t.length > LARGO_MAXIMO) return `El mensaje no puede pasar de ${LARGO_MAXIMO} caracteres. Va ${t.length}.`;
    if (/[¡¿]/.test(t)) return 'Sacá los signos de apertura (¡ y ¿): en un WhatsApp nadie los escribe y hacen que el mensaje se lea armado.';
    if (/\n{3,}/.test(t)) return 'Dejaste muchos renglones vacíos seguidos. Meta rechaza el mensaje por eso.';
    if (/\t/.test(t)) return 'Sacá las tabulaciones: Meta no las acepta.';

    // Un {{1}} numérico es la forma de Meta, no la nuestra. Si el taller la
    // escribe (porque la vio en un tutorial) el motor no sabría qué poner ahí.
    if (/\{\{\s*\d+\s*\}\}/.test(t)) {
        return 'No escribas {{1}} ni {{2}}: usá los botones de abajo para meter el nombre del cliente, la bici y lo demás.';
    }

    // Una llave suelta se convierte en texto literal en el mensaje del cliente.
    const llavesAbren = (t.match(/\{\{/g) ?? []).length;
    const llavesCierran = (t.match(/\}\}/g) ?? []).length;
    const tokens = [...t.matchAll(TOKEN)];
    if (llavesAbren !== llavesCierran || llavesAbren !== tokens.length) {
        return 'Quedó una llave suelta en el texto. Borrá el campo y volvé a insertarlo con el botón.';
    }

    const campos = tokens.map((m) => m[1].trim().toLowerCase());
    const desconocido = campos.find((c) => !CAMPOS_VALIDOS.includes(c as Campo));
    if (desconocido) return `«${desconocido}» no es un campo que podamos completar. Usá los botones de abajo.`;
    if (campos.length > MAXIMO_DE_CAMPOS) return `No metas más de ${MAXIMO_DE_CAMPOS} campos en un mismo mensaje.`;

    if (tokens.length > 0) {
        const primero = tokens[0];
        const ultimo = tokens[tokens.length - 1];
        const antes = t.slice(0, primero.index ?? 0);
        const despues = t.slice((ultimo.index ?? 0) + ultimo[0].length);

        if (!HAY_LETRA.test(antes)) {
            return 'El mensaje no puede EMPEZAR con un campo. Meta lo rechaza. Poné algo antes, por ejemplo «Hola».';
        }
        if (!HAY_LETRA.test(despues)) {
            return 'El mensaje no puede TERMINAR con un campo, ni aunque le pongas un signo después. Meta lo rechaza: movelo al medio y cerrá con una frase tuya.';
        }
        for (let i = 1; i < tokens.length; i++) {
            const fin = (tokens[i - 1].index ?? 0) + tokens[i - 1][0].length;
            const medio = t.slice(fin, tokens[i].index ?? 0);
            // Alcanza con CUALQUIER cosa que no sea espacio: probado contra la API.
            if (!/\S/.test(medio)) {
                return 'No pongas dos campos pegados. Meta los rechaza: escribí algo entre uno y el otro.';
            }
        }
    }

    return null;
}

/**
 * Traduce el texto del taller a lo que espera Meta.
 *
 * `texto` lleva {{1}} {{2}}… y `variables` dice qué campo es cada número. Los dos
 * salen del mismo recorrido para que no puedan desincronizarse: si se calcularan
 * por separado, un día el motor pondría la bici donde va el nombre.
 *
 * Un campo repetido ocupa DOS posiciones (Meta numera apariciones, no campos
 * distintos), y por eso `variables` puede traer el mismo nombre dos veces.
 */
export function aCuerpoDeMeta(cuerpo: string): { texto: string; variables: string[] } {
    const variables: string[] = [];
    const texto = (cuerpo ?? '').replace(/\r/g, '').trim().replace(TOKEN, (_m, campo) => {
        variables.push(String(campo).trim().toLowerCase());
        return `{{${variables.length}}}`;
    });
    return { texto, variables };
}

/** El texto tal cual lo va a leer la persona, con datos de muestra. */
export function vistaPreviaDeCuerpo(
    cuerpo: string,
    valores: Partial<Record<Campo, string>> = {},
): string {
    return (cuerpo ?? '').replace(TOKEN, (_m, campo) => {
        const c = String(campo).trim().toLowerCase() as Campo;
        return valores[c] ?? CAMPOS[c]?.ejemplo ?? `{{${campo}}}`;
    });
}

/**
 * El nombre con el que la plantilla vive en Meta.
 *
 * 🔴 SIEMPRE CON SUFIJO AL AZAR, y esto no es paranoia: borrar una plantilla en
 * Meta deja su nombre bloqueado por semanas (error_subcode 2388023, "language is
 * being deleted"). Verificado el 3-sep-2026 reintentando durante 5 minutos y
 * después a los 10: seguía bloqueado. Si el nombre saliera solo del título, un
 * taller que borra "Aviso de demora" y lo vuelve a crear igual se comería un
 * rechazo imposible de explicar. Como el nombre es interno y no lo ve ningún
 * cliente, el sufijo no cuesta nada.
 */
export function nombreDeMeta(titulo: string): string {
    const base = (titulo ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // sin tildes
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'plantilla';
    const sufijo = Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, '0');
    return `${base}_${sufijo}`;
}

/**
 * Arma los `components` que pide POST /<WABA_ID>/message_templates.
 *
 * `headerHandle` es obligatorio si la plantilla lleva el comprobante: Meta no
 * aprueba un header de tipo DOCUMENT sin un archivo de ejemplo, y el encabezado
 * se declara AL CREAR o no existe nunca — una aprobada sin header no puede llevar
 * el PDF y no hay forma de agregárselo después.
 */
export function componentesDeMeta(
    cuerpoConNumeros: string,
    variables: string[],
    headerHandle?: string | null,
): unknown[] {
    const componentes: unknown[] = [];
    if (headerHandle) {
        componentes.push({
            type: 'HEADER',
            format: 'DOCUMENT',
            example: { header_handle: [headerHandle] },
        });
    }
    const body: Record<string, unknown> = { type: 'BODY', text: cuerpoConNumeros };
    if (variables.length > 0) {
        body.example = {
            body_text: [variables.map((c) => CAMPOS[c as Campo]?.ejemplo ?? 'ejemplo')],
        };
    }
    componentes.push(body);
    return componentes;
}

/** Cómo se lee en castellano lo que contestó Meta. */
export const ESTADO_DE_META: Record<string, string> = {
    APPROVED: 'aprobada',
    PENDING: 'pendiente',
    IN_APPEAL: 'pendiente',
    PENDING_DELETION: 'pendiente',
    REJECTED: 'rechazada',
    PAUSED: 'pausada',
    DISABLED: 'deshabilitada',
    LIMIT_EXCEEDED: 'deshabilitada',
};

/**
 * Por qué la rechazó Meta, en castellano.
 *
 * Meta contesta un código en inglés (`rejected_reason` en la API, `reason` en el
 * webhook) y muchas veces `NONE`, que no significa "sin motivo" sino "no te
 * decimos cuál". Se traduce acá porque el que lo lee es un mecánico: "SCAM" al
 * lado de su plantilla no le dice qué corregir.
 */
export const MOTIVO_DE_META: Record<string, string> = {
    INCORRECT_CATEGORY: 'Meta dice que el mensaje no es del tipo que elegiste. Si ofrece algo que el cliente todavía no pidió, marcalo como «ofrece algo».',
    INVALID_FORMAT: 'A Meta no le gustó el formato: revisá que no haya campos al principio ni al final, ni dos pegados.',
    SCAM: 'Meta lo leyó como un mensaje engañoso. Sacá promesas, premios o urgencias.',
    ABUSIVE_CONTENT: 'Meta lo marcó como contenido abusivo. Reescribilo más neutro.',
    PROMOTIONAL: 'Meta lo leyó como publicidad. Contá algo que ya pasó con la bici, en vez de ofrecer.',
    TAG_CONTENT_MISMATCH: 'El texto no coincide con el tipo de mensaje que elegiste.',
    NONE: 'Meta no dio un motivo. Suele ser el texto: probá con algo más simple y concreto sobre el service.',
};

/** El texto que se le muestra al taller cuando Meta rechaza. */
export function motivoEnCastellano(codigo?: string | null, detalle?: string | null): string | null {
    const c = String(codigo ?? '').toUpperCase();
    if (detalle && detalle.trim() && c !== 'NONE') return detalle.trim();
    return MOTIVO_DE_META[c] ?? (c ? `Meta la rechazó (${c}).` : detalle?.trim() ?? null);
}
