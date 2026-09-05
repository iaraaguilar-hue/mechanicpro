// ─────────────────────────────────────────────────────────────
// EL TELÉFONO, AVISADO EN EL MOMENTO EN QUE SE CARGA MAL.
//
// Pedido de Iara, 5-sep-2026, textual: *"en cuanto el mecánico haga un cliente
// nuevo y el teléfono está mal, que por favor le aparezca un recordatorio de:
// che, este número no existe o algo así"*.
//
// POR QUÉ EN LA CARGA Y NO EN EL ENVÍO: el motor ya frena los números que no son
// celulares argentinos (`_shared/motor_wa.ts`), pero ahí es tarde. El mensaje no
// sale, queda un renglón en el registro que nadie lee, y el cliente simplemente
// nunca contesta. El único momento en que alguien puede ARREGLARLO es cuando
// tiene a la persona enfrente cargándole la bici.
//
// MEDIDO el 5-sep sobre las agendas reales: 7 de 203 clientes de Probikes (3,4%)
// y 1 de 79 de 11 a fondo. Dos extranjeros, uno sin código de área, dos de
// prueba. Poco, pero cada uno es un cliente que no va a recibir ni un aviso.
//
// 🔴 AVISA, NO BLOQUEA. Un cliente extranjero es un caso real y legítimo, y un
// taller que no puede guardar la ficha porque el número es de Alemania deja de
// cargar clientes. Se dice lo que va a pasar y se deja seguir.
//
// 🚩 `aFormatoMeta` es ESPEJO de supabase/functions/_shared/motor_wa.ts.
// Deno no comparte módulos con Vite, así que vive dos veces. La paridad la prueba
// `node tools/probar_motor_wa.cjs`, que corre las DOS contra los mismos casos y
// falla si dan distinto. Si tocás una, tocá la otra y corré eso.
// ─────────────────────────────────────────────────────────────

/** Solo dígitos. Los documentos y teléfonos vienen cargados a mano. */
export const soloNumeros = (t?: string | null) => (t ?? '').replace(/[^0-9]/g, '');

/**
 * Normaliza un teléfono argentino a lo que espera Meta, o null si no lo es.
 *
 * Un celular argentino son exactamente 13 dígitos: 54 + 9 + diez, porque el
 * código de área (2, 3 o 4) y el abonado (8, 7 o 6) siempre suman diez.
 */
export function aFormatoMeta(tel: string): string | null {
    let n = soloNumeros(tel);
    if (!n) return null;
    if (n.startsWith('54')) n = n.slice(2);
    if (n.startsWith('9')) n = n.slice(1);
    n = n.replace(/^0/, '');
    // El 15 va pegado al código de área y no forma parte del número internacional.
    n = n.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
    const completo = `549${n}`;
    if (completo.length !== 13) return null;
    return completo;
}

/** El número como lo leería una persona: +54 9 11 4940-6109. */
export function comoSeLee(e164: string): string {
    // 549 + area(2-4) + resto. El área no se puede deducir sin una tabla, así que
    // se parte en 549 / 2 / 4 / 4, que es como se ve un celular de AMBA y se lee
    // bien igual para el resto del país.
    const n = e164.replace(/^549/, '');
    return `+54 9 ${n.slice(0, 2)} ${n.slice(2, 6)}-${n.slice(6)}`;
}

export type DiagnosticoTelefono = {
    /** true = le van a poder llegar los avisos por WhatsApp. */
    sirve: boolean;
    /** Qué decirle al mecánico. null = no hay nada que decir. */
    aviso: string | null;
    /** Cómo va a quedar, para mostrarlo cuando está bien. */
    comoQueda: string | null;
};

/**
 * Qué le decimos al mecánico mientras escribe.
 *
 * Los textos NO dicen "este número no existe": no lo sabemos, y afirmarlo sería
 * inventar. Dicen la consecuencia, que es lo que a él le importa y lo que sí
 * podemos afirmar — que así no le van a llegar los avisos.
 */
export function diagnosticoDeTelefono(texto: string): DiagnosticoTelefono {
    const crudo = (texto ?? '').trim();
    // Vacío no es un error: el teléfono se puede completar después, y de hecho las
    // fichas que entran solas desde el ERP nacen sin él.
    if (!crudo) return { sirve: false, aviso: null, comoQueda: null };

    const digitos = soloNumeros(crudo);
    if (!digitos) {
        return { sirve: false, aviso: 'Eso no tiene ningún número.', comoQueda: null };
    }

    const e164 = aFormatoMeta(crudo);
    if (e164) return { sirve: true, aviso: null, comoQueda: comoSeLee(e164) };

    // A partir de acá no sirve, y conviene decir POR QUÉ: "está mal" manda a
    // adivinar; "le falta el código de área" se arregla en cinco segundos.
    const sinPais = digitos.replace(/^54/, '').replace(/^9/, '').replace(/^0/, '');
    if (sinPais.length < 10) {
        return {
            sirve: false,
            aviso: 'Le falta el código de área. Va con el 11 adelante (11 4940-6109), sin el 15.',
            comoQueda: null,
        };
    }
    return {
        sirve: false,
        aviso: 'Este número no parece un celular argentino, así que los avisos por WhatsApp no le van a llegar. Si es del exterior está bien, guardalo igual.',
        comoQueda: null,
    };
}
