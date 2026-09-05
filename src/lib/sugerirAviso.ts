// ─────────────────────────────────────────────────────────────
// CUÁNTO ESPERAR ANTES DE ESCRIBIRLE A ESTE CLIENTE.
//
// La sugerencia que le aparece a Leandro al finalizar el service, para que no
// tenga que decidirlo de cero cada vez.
//
// 🔴 SALE DEL RITMO REAL DE ESA PERSONA, NO DE UN MODELO ADIVINANDO.
// Iara pidió "que tenga IA". La forma útil de eso acá no es preguntarle a un
// modelo cuántos meses le parece: es mirar cada cuánto viene ESTE cliente de
// verdad, que es un dato que ya tenemos y que ningún modelo puede mejorar. Es la
// misma cabeza del Motor con cabeza (`motorConCabeza.ts`), cuya primera regla
// dice, textual: *"nunca una predicción sin base"*.
//
// Y por eso, cuando no hay base, NO SE SUGIERE NADA. Medido sobre los datos
// reales: `tipo_servicio` no sirve para deducir un plazo —el valor más común es
// "OTRO" (167 de ~500 órdenes) y el resto son los tramos del catálogo del taller
// (SPORT, EXPERT, PRO), que hablan de precio y no de cuánto dura—. Inventar "3
// meses porque sí" y ponerlo con cara de recomendación es peor que dejar el menú
// vacío: la primera vez que el mecánico lo siga y salga mal, no vuelve a mirarlo.
// ─────────────────────────────────────────────────────────────

const MS_DIA = 86400000;

/** Los plazos del menú. Se eligieron en meses porque es como lo dice un taller. */
export const PLAZOS = [
    { dias: 0, etiqueta: 'No avisar' },
    { dias: 30, etiqueta: 'En 1 mes' },
    { dias: 60, etiqueta: 'En 2 meses' },
    { dias: 90, etiqueta: 'En 3 meses' },
    { dias: 180, etiqueta: 'En 6 meses' },
    { dias: 365, etiqueta: 'En 1 año' },
] as const;

const mediana = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** El plazo del menú más cercano a los días medidos. */
function alPlazoMasCercano(dias: number): number {
    const reales = PLAZOS.filter((p) => p.dias > 0);
    return reales.reduce((mejor, p) =>
        Math.abs(p.dias - dias) < Math.abs(mejor - dias) ? p.dias : mejor, reales[0].dias);
}

export type Sugerencia = {
    /** Días sugeridos, o null si no hay base para sugerir. */
    dias: number | null;
    /** Por qué. Se muestra al lado, para que el mecánico decida y no obedezca. */
    razon: string | null;
};

/**
 * Cada cuánto viene este cliente, leído de sus visitas de los últimos dos años.
 *
 * Pide 3 visitas como mínimo: con dos hay UN intervalo y un intervalo no es un
 * ritmo, es una coincidencia. Es el mismo umbral que usa `clientesEnFuga`, y por
 * la misma razón.
 */
export function sugerirAviso(input: {
    /** Las fechas de ingreso de los services de ESTE cliente, en cualquier orden. */
    visitas: (string | Date | null | undefined)[];
    /** El plazo que el taller dejó configurado como regla general, si tiene. */
    plazoDelTaller?: number | null;
}): Sugerencia {
    const ahora = Date.now();
    const hace24m = ahora - 730 * MS_DIA;
    const ts = (input.visitas ?? [])
        .map((v) => (v ? new Date(v).getTime() : NaN))
        .filter((t) => Number.isFinite(t) && t >= hace24m)
        .sort((a, b) => a - b);

    if (ts.length >= 3) {
        const intervalos: number[] = [];
        for (let i = 1; i < ts.length; i++) {
            const d = Math.round((ts[i] - ts[i - 1]) / MS_DIA);
            if (d >= 1) intervalos.push(d);
        }
        if (intervalos.length) {
            const cada = mediana(intervalos);
            const semanas = Math.round(cada / 7);
            return {
                dias: alPlazoMasCercano(cada),
                razon: semanas >= 8
                    ? `Viene cada ${Math.round(cada / 30)} meses, más o menos.`
                    : `Viene cada ${semanas} semanas, más o menos.`,
            };
        }
    }

    // Sin ritmo que leer. Si el taller tiene una regla general, esa es la mejor
    // respuesta disponible y se dice DE DÓNDE sale, para que no parezca que la
    // sacamos de la nada.
    if (input.plazoDelTaller && input.plazoDelTaller > 0) {
        return {
            dias: alPlazoMasCercano(input.plazoDelTaller),
            razon: `Todavía no le conocemos el ritmo, así que va el plazo que pusiste para todos.`,
        };
    }

    return {
        dias: null,
        razon: ts.length
            ? 'Todavía no le conocemos el ritmo: hacen falta tres visitas para leerlo.'
            : 'Es su primera vez acá, así que no hay ritmo que leer.',
    };
}

/** El día de calendario argentino dentro de N días, como YYYY-MM-DD. */
export function diaARDentroDe(dias: number): string {
    // Se trabaja en UTC-3 y se corta a la fecha: es un DÍA, no un instante. Pasarlo
    // por una conversión de zona lo corre un día entero.
    const ar = new Date(Date.now() - 3 * 3600_000 + dias * MS_DIA);
    return ar.toISOString().slice(0, 10);
}

/** "el 5 de noviembre", para confirmarle al mecánico qué eligió. */
export function comoSeLeeElDia(iso: string): string {
    const [a, m, d] = iso.split('-').map(Number);
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `el ${d} de ${meses[m - 1]}${a !== new Date().getFullYear() ? ' de ' + a : ''}`;
}
