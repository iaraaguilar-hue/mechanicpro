// ─────────────────────────────────────────────────────────────
// EL MOTOR CON CABEZA (ideas 5 y 6 del roadmap de IA).
//
// Idea 5 — predecir en vez de contar días: cuánto le dura a ESE ciclista
// cada componente, aprendido de SU historial real (los intervalos entre
// reemplazos del mismo componente en la misma bici). Regla dura: si el
// historial no alcanza (menos de 2 eventos), se cae al plazo fijo de
// siempre Y SE DICE. Nunca una predicción sin base.
//
// Idea 6 — el que se está yendo, por COMPORTAMIENTO: venía cada X
// semanas y hace k·X que no aparece. Devuelve pocos nombres ordenados
// por (atraso × valor del cliente), no doscientos. Los clientes sin
// historial suficiente para leerles el ritmo se cuentan y se declaran,
// no se adivinan.
//
// Todo es determinístico y auditable: estadística sobre los datos del
// taller, cada número citable. La IA de acá es la cabeza, no una API.
// ─────────────────────────────────────────────────────────────

const MS_DIA = 86400000;

// Componente del recordatorio → qué buscar en los items del historial.
// Los nombres salen de los datos REALES (recordatorios de producción:
// Cadena, Piñón/Cassette, Líquido Tubeless, Pastillas de Freno, Service
// Horquilla, Cubiertas — con mayúsculas variables).
const COMPONENTE_KEYWORDS: [RegExp, RegExp][] = [
    [/cadena/i, /cadena/i],
    [/pi[nñ][oó]n|cassette|casete/i, /pi[nñ][oó]n|cassette|casete/i],
    [/tubeless|sellador/i, /tubeless|sellador/i],
    [/pastilla/i, /pastilla/i],
    [/horquilla/i, /horquilla|fork/i],
    [/cubierta/i, /cubierta/i],
];

function keywordDe(componente: string): RegExp | null {
    for (const [comp, kw] of COMPONENTE_KEYWORDS) if (comp.test(componente)) return kw;
    return null;
}

const mediana = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export interface Prediccion {
    /** Fecha estimada del próximo vencimiento según SU historial. */
    fecha: string;
    /** Cada cuántos días le dura a ESTE ciclista, mediana de sus intervalos. */
    cadaDias: number;
    /** Con cuántos intervalos reales se calculó (≥1 = al menos 2 eventos). */
    intervalos: number;
    /** Fecha del último evento del componente en el historial. */
    ultimoEvento: string;
}

interface ServicioLiviano {
    bicicleta_id?: string;
    fecha_ingreso?: string;
    tipo_servicio?: string;
    items_extra?: { descripcion: string }[];
}

/**
 * Predicción para UN componente de UNA bici, desde sus services reales.
 * null = no hay base suficiente (menos de 2 eventos del componente):
 * el que llama cae al plazo fijo de siempre y LO DICE.
 */
export function prediccionComponente(
    serviciosDeBici: ServicioLiviano[],
    componente: string,
): Prediccion | null {
    const kw = keywordDe(componente);
    if (!kw) return null;
    const eventos = serviciosDeBici
        .filter(s => s.fecha_ingreso && (
            (s.items_extra ?? []).some(i => kw.test(i?.descripcion ?? '')) ||
            kw.test(s.tipo_servicio ?? '')
        ))
        .map(s => new Date(s.fecha_ingreso!).getTime())
        .sort((a, b) => a - b);
    if (eventos.length < 2) return null;

    const intervalos: number[] = [];
    for (let i = 1; i < eventos.length; i++) {
        const d = Math.round((eventos[i] - eventos[i - 1]) / MS_DIA);
        // Dos items del mismo componente en la misma semana no son dos
        // reemplazos: son la misma visita contada dos veces.
        if (d >= 7) intervalos.push(d);
    }
    if (!intervalos.length) return null;

    const cadaDias = mediana(intervalos);
    const ultimo = eventos[eventos.length - 1];
    return {
        fecha: new Date(ultimo + cadaDias * MS_DIA).toISOString().slice(0, 10),
        cadaDias,
        intervalos: intervalos.length,
        ultimoEvento: new Date(ultimo).toISOString().slice(0, 10),
    };
}

// ─────────────────────────────────────────────────────────────
// Idea 6 — el detector de fuga.
// ─────────────────────────────────────────────────────────────

export interface ClienteEnFuga {
    clienteId: string;
    nombre: string;
    telefono: string | null;
    bicicletaId: string | null;
    /** Cada cuántos días venía (mediana de sus intervalos reales). */
    veniaCadaDias: number;
    /** Hace cuántos días que no aparece. */
    diasSinVenir: number;
    /** diasSinVenir / veniaCadaDias — 1.0 = en fecha, 2.0 = tardó el doble. */
    atraso: number;
    visitas12m: number;
    gasto12m: number;
    /** El argumento, citando los datos (no lo escribe una IA: es el dato). */
    argumento: string;
}

export interface ResultadoFuga {
    enRiesgo: ClienteEnFuga[];
    /** Con historial suficiente para leerles el ritmo (3+ visitas en 24 meses). */
    conBase: number;
    /** Sin base: se declaran, no se adivinan. */
    sinBase: number;
}

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

const semanas = (dias: number): string => {
    if (dias >= 60) {
        const m = Math.round(dias / 30);
        return m === 1 ? 'un mes' : `${m} meses`;
    }
    const s = Math.max(1, Math.round(dias / 7));
    return s === 1 ? 'una semana' : `${s} semanas`;
};

export function clientesEnFuga(input: {
    clientes: { id: string; nombre: string; telefono?: string | null; eliminado_en?: string | null }[];
    bicicletas: { id: string; cliente_id: string }[];
    servicios: { bicicleta_id?: string; fecha_ingreso?: string; precio_base?: number; items_extra?: { precio?: number }[] }[];
    limite?: number;
}): ResultadoFuga {
    const ahora = Date.now();
    const hace24m = ahora - 730 * MS_DIA;
    const hace12m = ahora - 365 * MS_DIA;

    const duenoDe = new Map(input.bicicletas.map(b => [b.id, b.cliente_id]));
    const ultimaBici = new Map<string, string>();
    const visitas = new Map<string, number[]>();
    const gasto12 = new Map<string, number>();
    const visitas12 = new Map<string, number>();

    for (const s of input.servicios) {
        const c = s.bicicleta_id ? duenoDe.get(s.bicicleta_id) : null;
        if (!c || !s.fecha_ingreso) continue;
        const t = new Date(s.fecha_ingreso).getTime();
        if (t < hace24m) continue;
        if (!visitas.has(c)) visitas.set(c, []);
        visitas.get(c)!.push(t);
        ultimaBici.set(c, s.bicicleta_id!);
        if (t >= hace12m) {
            let total = Number(s.precio_base) || 0;
            for (const i of s.items_extra ?? []) total += Number(i?.precio) || 0;
            gasto12.set(c, (gasto12.get(c) ?? 0) + total);
            visitas12.set(c, (visitas12.get(c) ?? 0) + 1);
        }
    }

    let conBase = 0, sinBase = 0;
    const candidatos: ClienteEnFuga[] = [];
    for (const cli of input.clientes) {
        if (cli.eliminado_en) continue;
        const ts = (visitas.get(cli.id) ?? []).sort((a, b) => a - b);
        if (ts.length < 3) { sinBase++; continue; }
        conBase++;
        const intervalos: number[] = [];
        for (let i = 1; i < ts.length; i++) {
            const d = Math.round((ts[i] - ts[i - 1]) / MS_DIA);
            if (d >= 1) intervalos.push(d);
        }
        if (!intervalos.length) { continue; }
        const cada = mediana(intervalos);
        const diasSin = Math.round((ahora - ts[ts.length - 1]) / MS_DIA);
        const atraso = diasSin / Math.max(cada, 1);
        // 1.5× su propio ritmo = se está yendo. Menos que eso es ruido.
        if (atraso < 1.5) continue;
        const g = gasto12.get(cli.id) ?? 0;
        candidatos.push({
            clienteId: cli.id,
            nombre: cli.nombre,
            telefono: cli.telefono ?? null,
            bicicletaId: ultimaBici.get(cli.id) ?? null,
            veniaCadaDias: cada,
            diasSinVenir: diasSin,
            atraso: Math.round(atraso * 10) / 10,
            visitas12m: visitas12.get(cli.id) ?? 0,
            gasto12m: g,
            argumento: `Venía cada ${semanas(cada)} y hace ${semanas(diasSin)} que no aparece.` +
                (g > 0 ? ` Gastó ${plata(g)} en 12 meses.` : ' Sin gasto en los últimos 12 meses.'),
        });
    }

    // Orden: atraso × valor. El que más plata deja y más se atrasó, primero.
    candidatos.sort((a, b) => (b.atraso * Math.max(b.gasto12m, 1)) - (a.atraso * Math.max(a.gasto12m, 1)));
    return {
        enRiesgo: candidatos.slice(0, input.limite ?? 5),
        conBase,
        sinBase,
    };
}
