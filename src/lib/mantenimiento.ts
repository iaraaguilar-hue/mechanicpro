// ─────────────────────────────────────────────────────────────
// EL MANTENIMIENTO DE CADA TALLER: qué componentes mira el diagnóstico, qué
// plazo sugiere para cada uno, y qué pasa después de vender una bici.
//
// Pedido de Ariel Leira (Leira Bikes), contado por Iara el 14-sep-2026: "algo
// editable para poder calcular mejor el diagnóstico de los componentes y de la
// bicicleta", con sus plazos (ajuste al mes de la compra, service completo a los
// 4 meses, service del drop cada 6) y "que los diagnósticos se puedan editar por
// 1 mes, 2 meses, 3, 4, 5, etc.". Iara: "estos quiero que sean editables para
// cada bicicletería".
//
// Hasta hoy los 7 componentes y los 4 plazos (1, 3, 6 y 12 meses) vivían fijos en
// HealthCheckWidget: el mismo diagnóstico para un taller de ruta y uno de enduro.
// ─────────────────────────────────────────────────────────────

import { ZONA_AR } from '@/lib/fechaAR';
import type { TallerData } from '@/store/authStore';

export interface ComponenteDiagnostico {
    nombre: string;
    /** El plazo que el taller sugiere para este componente. null = sin sugerencia. */
    meses: number | null;
}

export interface ConfigPostventa {
    /** A cuántos meses de la venta se propone el ajuste. */
    ajusteMeses: number;
    /** A cuántos meses de la venta se propone el primer service. */
    primerServiceMeses: number;
    /** Lo que va en "para recordarte que toca revisar ___ en tu bici". */
    textoAjuste: string;
    textoPrimerService: string;
}

export interface ConfigMantenimiento {
    componentes: ComponenteDiagnostico[];
    postventa: ConfigPostventa;
}

export const COMPONENTES_BASE: ComponenteDiagnostico[] = [
    { nombre: 'Cadena', meses: null },
    { nombre: 'Piñón/Cassette', meses: null },
    { nombre: 'Líquido Tubeless', meses: null },
    { nombre: 'Pastillas de Freno', meses: null },
    { nombre: 'Service Horquilla', meses: null },
    // 8-sep-2026, Leira: la suspensión trasera de las Specialized tiene su propio
    // service, distinto del de la horquilla.
    { nombre: 'Service Brain', meses: null },
    // 14-sep-2026, Leira: "el service del drop, que él dice que lo hagan cada 6 meses".
    { nombre: 'Service Drop (tija telescópica)', meses: 6 },
    { nombre: 'Cubiertas', meses: null },
];

// Los plazos son los de Leira. Los textos van en el {{3}} de la plantilla del
// sistema `recordatorio_mantenimiento`.
// 🚩 Espejo de TEXTO_POSTVENTA en `supabase/functions/automatizaciones-cron/index.ts`.
// Si se toca uno, el otro.
export const POSTVENTA_DEFAULT: ConfigPostventa = {
    ajusteMeses: 1,
    primerServiceMeses: 4,
    textoAjuste: 'el ajuste de cables y rayos',
    textoPrimerService: 'el primer service',
};

/**
 * Cómo le llega al cliente. 🚩 Espejo del cuerpo de `recordatorio_mantenimiento`
 * en `supabase/functions/_shared/plantillas.ts`: el texto aprobado por Meta no se
 * puede cambiar desde acá, solo lo que va en el hueco.
 */
export function comoLeLlegaPostventa(que: string, taller: string, cliente = 'Juan', bici = 'Epic 8'): string {
    return `Hola ${cliente}! Te escribo de ${taller || 'tu taller'} para recordarte que toca revisar ${que || '…'} en tu ${bici}. Querés que coordinemos un turno?`;
}

/** Los plazos que ofrece el diagnóstico. Leira: "por 1 mes, 2 meses, 3, 4, 5, etc.". */
export const PLAZOS_MESES = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24];

const mesesValidos = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 60 ? Math.round(n) : null;
};

export function configMantenimiento(taller: TallerData | null | undefined): ConfigMantenimiento {
    const c = (taller as any)?.config_mantenimiento || {};
    const propios = Array.isArray(c.componentes)
        ? c.componentes
            .filter((x: any) => x && typeof x.nombre === 'string' && x.nombre.trim())
            .map((x: any) => ({ nombre: x.nombre.trim(), meses: mesesValidos(x.meses) }))
        : [];
    const p = c.postventa || {};
    return {
        // Una lista vacía guardada por error dejaría el diagnóstico sin nada que
        // tildar: en ese caso vuelve la de siempre.
        componentes: propios.length ? propios : COMPONENTES_BASE,
        postventa: {
            ajusteMeses: mesesValidos(p.ajusteMeses) ?? POSTVENTA_DEFAULT.ajusteMeses,
            primerServiceMeses: mesesValidos(p.primerServiceMeses) ?? POSTVENTA_DEFAULT.primerServiceMeses,
            textoAjuste: String(p.textoAjuste ?? '').trim() || POSTVENTA_DEFAULT.textoAjuste,
            textoPrimerService: String(p.textoPrimerService ?? '').trim() || POSTVENTA_DEFAULT.textoPrimerService,
        },
    };
}

/** Hoy, como día de calendario de Argentina (AAAA-MM-DD). */
export function hoyAR(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_AR, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

/**
 * Un día de calendario + N meses, sin pasar por la hora.
 *
 * 🔴 El diagnóstico hacía `new Date()` + `setMonth` + `toISOString()`: después de
 * las 21 hs de Argentina ya es el día siguiente en UTC, y lo cargado a la noche
 * vencía un día tarde. Y el 31 de enero + 1 mes da el último día de febrero, no
 * el 3 de marzo que devuelve `setMonth`.
 */
export function sumarMeses(dia: string, meses: number): string {
    const [y, m, d] = dia.slice(0, 10).split('-').map(Number);
    const total = (m - 1) + meses;
    const anio = y + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;
    const ultimoDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimoDelMes)).padStart(2, '0')}`;
}

export function mesesEnPalabras(n: number): string {
    if (n === 12) return '1 año';
    if (n === 24) return '2 años';
    return n === 1 ? '1 mes' : `${n} meses`;
}
