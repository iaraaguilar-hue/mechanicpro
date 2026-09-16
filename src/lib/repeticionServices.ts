// ─────────────────────────────────────────────────────────────
// CADA CUÁNTO SE REPITE UN SERVICE DEL MENÚ (Iara, 16-sep-2026).
//
//   «no sé si hay directamente poder poner, tipo, si el mecánico quiere, cada
//   cuánto se le tiene que avisar a la persona de que ese service lo tiene que
//   volver a hacer. Tipo, si hace un lavado de lubricación, cada cuánto le tiene
//   que avisar que lo tiene que volver a hacer.»
//
// El diagnóstico ya sabe hacer esto con los COMPONENTES (la cadena a los 6
// meses). Lo que faltaba es lo mismo para el TRABAJO: un lavado y lubricación no
// es un componente que se gasta, es un service que se repite.
//
// 🔴 No inventa un caño nuevo: escribe en `recordatorios`, la misma tabla de los
// vencimientos del diagnóstico. Así el aviso aparece en Retención, entra en la
// campana y lo manda el cron de WhatsApp sin tocar nada de eso. Un carril
// paralelo habría que enseñárselo a las tres cosas.
//
// 🔴 El match es por nombre EXACTO (sin tildes y sin distinguir mayúsculas), no
// por parecido. Un match difuso entre «Service Completo» y «Service Completo
// Premium» le agenda al cliente un aviso que nadie pidió, y eso sale por
// WhatsApp: el costo de errar es mucho más alto que el de no cazar un caso.
// ─────────────────────────────────────────────────────────────

/** Un service del menú que se repite solo. `meses` siempre > 0. */
export interface ServicioRepetible {
    nombre: string;
    meses: number;
}

export interface RepeticionAgendada {
    /** Va a `recordatorios.componente`: es lo que lee el mecánico en Retención. */
    componente: string;
    meses: number;
    /** Día del vencimiento, ISO (yyyy-mm-dd). */
    fecha: string;
}

const normalizar = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Suma meses a una fecha sin correrse de mes.
 * `setMonth` sobre un 31 de enero + 1 mes da 3 de marzo; acá da 28/29 de febrero,
 * que es lo que una persona entiende por «de acá a un mes».
 */
export function sumarMeses(desde: Date, meses: number): Date {
    const d = new Date(desde.getTime());
    const dia = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + meses);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ultimo));
    return d;
}

/** Día de calendario en ISO, en hora local: el vencimiento es un día, no un instante. */
export function diaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Qué avisos deja agendados esta orden, mirando el service base y las manos de
 * obra contra los services del menú que el taller marcó como repetibles.
 *
 * Los repuestos quedan afuera a propósito: «Cadena Shimano 11v» es una pieza, y
 * lo que se repite es el trabajo que la usa.
 */
export function repeticionesDeLaOrden(
    servicio: { tipo_servicio?: string | null; items_extra?: { descripcion?: string; categoria?: string }[] | null } | null | undefined,
    repetibles: ServicioRepetible[],
    desde: Date = new Date(),
): RepeticionAgendada[] {
    if (!servicio || !repetibles.length) return [];

    const porNombre = new Map<string, ServicioRepetible>();
    for (const r of repetibles) {
        if (!r.nombre?.trim() || !(r.meses > 0)) continue;
        porNombre.set(normalizar(r.nombre), r);
    }
    if (!porNombre.size) return [];

    const nombresEnLaOrden: string[] = [];
    if (servicio.tipo_servicio?.trim()) nombresEnLaOrden.push(servicio.tipo_servicio);
    for (const item of servicio.items_extra || []) {
        if (item?.categoria === 'labor' && item.descripcion?.trim()) nombresEnLaOrden.push(item.descripcion);
    }

    const salida = new Map<string, RepeticionAgendada>();
    for (const nombre of nombresEnLaOrden) {
        const rep = porNombre.get(normalizar(nombre));
        if (!rep) continue;
        // Una orden que trae el mismo trabajo dos veces agenda un solo aviso.
        if (salida.has(rep.nombre)) continue;
        salida.set(rep.nombre, {
            componente: rep.nombre,
            meses: rep.meses,
            fecha: diaISO(sumarMeses(desde, rep.meses)),
        });
    }
    return [...salida.values()];
}
