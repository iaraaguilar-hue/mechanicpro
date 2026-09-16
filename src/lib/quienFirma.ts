// ─────────────────────────────────────────────────────────────
// QUIÉN FIRMA CADA SERVICE (16-sep-2026).
//
// Iara: "sigue sin estar lo de quién firma el service. No veo bien cómo ponerlo."
// Estaba desde el 3-sep, pero la lista de gente salía sola de `usuarios`: solo
// los que tienen login. En un taller de tres, dos no lo tienen y el taller no los
// puede crear, así que el ajuste se prendía y el select mostraba una sola persona.
//
// Ahora hay DOS clases de firmante y una sola caja para elegirlos:
//   · `u:<uuid>` — tiene usuario en el sistema  → `servicios.mecanico_id`
//   · `n:<nombre>` — no lo tiene, el taller lo cargó en Configuración
//                    (`talleres.config_mecanicos.gente`) → `servicios.mecanico_nombre`
//
// 🔴 El prefijo no es decoración: sin él, un nombre y un id conviven en el mismo
// `value` del select y no hay forma de saber en qué columna se guarda.
// ─────────────────────────────────────────────────────────────

/** La opción "Otro…" del selector: escribir un nombre en el momento. */
export const OTRO_FIRMANTE = '__otro__';

/** Un nombre escrito a mano, sin espacios de más y sin novelas. */
export function limpiarNombreFirmante(texto: string): string {
    return texto.trim().replace(/\s+/g, ' ').slice(0, 40);
}

/**
 * Lo que se escribe en la orden según quién quedó elegido. Vacío = no se toca
 * nada: "sin registrar" no pisa con null un dato que ya estaba.
 *
 * Las dos columnas son EXCLUYENTES: al elegir una se limpia la otra, para que la
 * orden no quede con dos respuestas a la misma pregunta.
 */
export function quienFirmaPatch(valor: string, otro = ''): { mecanico_id?: string | null; mecanico_nombre?: string | null } {
    if (valor.startsWith('u:')) return { mecanico_id: valor.slice(2), mecanico_nombre: null };
    if (valor.startsWith('n:')) return { mecanico_id: null, mecanico_nombre: valor.slice(2) };
    if (valor === OTRO_FIRMANTE) {
        const nombre = limpiarNombreFirmante(otro);
        // "Otro…" sin escribir nada no es una persona: queda sin registrar y la
        // pantalla lo avisa antes de guardar.
        return nombre ? { mecanico_id: null, mecanico_nombre: nombre } : {};
    }
    return {};
}

/**
 * La llave con la que se agrupa en Métricas. Un usuario y un nombre suelto nunca
 * se mezclan, aunque la persona se llame igual: son dos filas distintas y eso es
 * honesto (el que tiene login firma desde su cuenta).
 */
export function llaveDelFirmante(s: { mecanico_id?: string | null; mecanico_nombre?: string | null }): string | null {
    if (s.mecanico_id) return `u:${s.mecanico_id}`;
    if (s.mecanico_nombre?.trim()) return `n:${s.mecanico_nombre.trim()}`;
    return null;
}

/** Cómo se muestra esa llave. `gente` son los nombres de los usuarios, por id. */
export function nombreDelFirmante(llave: string, gente: Record<string, string>): string {
    if (llave.startsWith('n:')) return llave.slice(2);
    return gente[llave.slice(2)] ?? 'Alguien que ya no está';
}
