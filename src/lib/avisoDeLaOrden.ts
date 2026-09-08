// ─────────────────────────────────────────────────────────────
// EL AVISO QUE SALE DESDE ADENTRO DE LA ORDEN.
//
// POR QUÉ (Ariel Leira, contado por Iara el 8-sep-2026): el mecánico abre la
// bici, ve algo que no estaba en la orden, y ahí se le para el trabajo. Llama y
// no atienden. La bici queda en el banco. Y en el peor caso —el que Leira contó
// textual— el cliente se entera de todo lo que le falta el día que viene a
// buscarla, que es el peor momento posible para escuchar un presupuesto.
//
// Son DOS clases de aviso y no una, porque son dos conversaciones distintas:
//   · CONSULTA → pide una decisión. Deja la orden esperando y arranca el reloj.
//   · AVANCE   → no pide nada, le cuenta cómo va la bici. Es la otra mitad del
//                pedido de Iara: que el cliente sepa qué le están haciendo EN EL
//                MOMENTO, sin tener que preguntar.
// Mandarle "decime si lo hacemos" a alguien al que no le estamos preguntando
// nada es la forma más rápida de que deje de leer los mensajes del taller.
//
// 🚩 Las frases de abajo son un PUNTO DE PARTIDA, no un formulario: se tocan
// antes de mandar. Están escritas como las diría un mecánico en el mostrador
// justamente para que se puedan mandar tal cual sin que suenen a máquina.
// ─────────────────────────────────────────────────────────────

export type ClaseDeAviso = 'consulta' | 'avance';

/**
 * Lo que un mecánico encuentra con la bici abierta, en el orden en que aparece.
 *
 * Salen del vocabulario real del taller y no de una lista de piezas: "las
 * pastillas están gastadas" es lo que se dice, "reemplazo de pastillas de freno"
 * es lo que se factura. Al cliente le llega lo primero.
 */
export const HALLAZGOS: string[] = [
    'las pastillas de freno están gastadas, hay que cambiarlas',
    'la cadena está estirada y si no la cambio ahora se empieza a comer el cassette',
    'el cassette está gastado, conviene cambiarlo junto con la cadena',
    'la cubierta de atrás está pelada, no le queda otra salida',
    'la horquilla está perdiendo aceite por los retenes, pide service',
    'el Brain está perdiendo aceite y pide service',
    'los cables y fundas están duros, por eso los cambios no entran bien',
    'los discos de freno están por debajo del mínimo',
    'la caja pedalera tiene juego, hay que cambiarle los rulemanes',
    'las cintas del manubrio están para cambiar',
];

/** Lo que se cuenta cuando no se pregunta nada: en qué anda la bici hoy. */
export const AVANCES: string[] = [
    'ya la desarmé y por ahora está todo bien, sigo con el armado',
    'ya le hice la transmisión, me falta el freno y la dejo lista',
    'está armada, mañana la pruebo y te aviso cómo quedó',
    'está lista, la estoy dejando limpia y te aviso cuando la podés pasar a buscar',
    'me está faltando un repuesto, apenas me llega sigo y te cuento',
];

/**
 * El texto EXACTO que le va a llegar al cliente, para que el mecánico lo lea
 * antes de mandarlo.
 *
 * 🚩 Espejo del cuerpo de las plantillas de
 * `supabase/functions/_shared/plantillas.ts` (`consulta_durante_service` y
 * `avance_del_service`). Si allá se edita el texto, acá también: si no, la
 * pantalla le muestra al mecánico un mensaje que no es el que sale, que es
 * exactamente lo que este panel viene a evitar.
 */
export function comoLeVaALlegar(clase: ClaseDeAviso, p: {
    cliente: string;
    firma: string;
    taller: string;
    bici: string;
    detalle: string;
}): string {
    const detalle = p.detalle.trim();
    if (clase === 'consulta') {
        return `Hola ${p.cliente}! Soy ${p.firma}, de ${p.taller}. Estoy con tu ${p.bici} y encontré algo antes de seguir: ${detalle} Decime si lo hacemos y sigo.`;
    }
    return `Hola ${p.cliente}! Soy ${p.firma}, de ${p.taller}. Te cuento cómo va tu ${p.bici}: ${detalle} Cualquier cosa escribime por acá.`;
}

/**
 * Meta rechaza el envío entero si un parámetro trae saltos de línea o corridas
 * de espacios, y el mecánico escribe en un textarea. Se limpia acá además del
 * servidor: si el aviso se muestra distinto de como sale, el preview miente.
 */
export function limpiarDetalle(texto: string): string {
    return texto.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 700);
}

export interface EstadoDeEspera {
    /** La orden está esperando una respuesta que todavía no llegó. */
    esperando: boolean;
    /** Hace cuántas horas salió la consulta (redondeado hacia abajo). */
    horas: number;
    /** Ya pasó el plazo que fijó el taller: toca levantar el teléfono. */
    hayQueLlamar: boolean;
    /** Qué se le preguntó, para que lo pueda leer cualquiera del taller. */
    que: string | null;
    /** Cómo se lee en un badge: "esperando hace 2 h". */
    etiqueta: string;
}

const SIN_ESPERA: EstadoDeEspera = {
    esperando: false, horas: 0, hayQueLlamar: false, que: null, etiqueta: '',
};

/**
 * ¿Esta orden está frenada esperando al cliente, y hace cuánto?
 *
 * `respondio_at` gana sobre `esperando_desde`: cuando el cliente contesta se
 * marca la respuesta y NO se borra el arranque, para poder medir después cuánto
 * tarda cada cliente en destrabar un service.
 */
export function estadoDeEspera(
    servicio?: { esperando_desde?: string | null; esperando_que?: string | null; respondio_at?: string | null } | null,
    horasParaLlamar = 3,
    ahora: number = Date.now(),
): EstadoDeEspera {
    if (!servicio?.esperando_desde || servicio.respondio_at) return SIN_ESPERA;
    const desde = Date.parse(servicio.esperando_desde);
    if (Number.isNaN(desde)) return SIN_ESPERA;
    const horas = Math.max(0, Math.floor((ahora - desde) / 3_600_000));
    // El plazo lo elige el taller. Un mínimo de 1 hora evita que un taller que
    // ponga 0 vea "llamalo" en el segundo siguiente a mandar el mensaje: nadie
    // contesta un WhatsApp en cero minutos, y un aviso que salta siempre no lo
    // lee nadie.
    const plazo = Math.max(1, horasParaLlamar || 3);
    return {
        esperando: true,
        horas,
        hayQueLlamar: horas >= plazo,
        que: servicio.esperando_que ?? null,
        etiqueta: horas < 1 ? 'esperando respuesta' : `esperando hace ${horas} h`,
    };
}

/** Cómo se lee el resultado de una llamada en la línea de tiempo. */
export const RESULTADO_DE_LLAMADA: Record<string, string> = {
    atendio: 'Atendió',
    no_atendio: 'No atendió',
    buzon: 'Cayó el buzón',
    quedo_en_avisar: 'Quedó en avisar',
};
