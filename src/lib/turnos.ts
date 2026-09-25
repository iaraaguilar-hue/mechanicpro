// ─────────────────────────────────────────────────────────────
// EL CALENDARIO DE TURNOS — la cuenta de los días (25-sep-2026).
//
// Pedido de Juan Otero (Private Garage Workshop, Tandil): hoy lleva los
// turnos en un cuaderno. Los da él por WhatsApp, nunca el cliente solo, y se
// guarda días enteros para lo atrasado o para armar bicis de la bicicletería.
//
// 🔴 Todo acá trabaja con DÍAS DE CALENDARIO (`YYYY-MM-DD`), nunca con
// `new Date(x)` sobre la fecha local: `new Date('2026-09-28')` es la
// medianoche UTC, que en Argentina es el domingo 27 a las 21. La cuenta se
// hace en UTC puro y se vuelve a texto sin pasar por ninguna zona.
// ─────────────────────────────────────────────────────────────

export type TipoTurno = 'turno' | 'reservado';
export type EstadoTurno = 'a_confirmar' | 'confirmado' | 'vino' | 'no_vino' | 'cancelado';

export interface Turno {
    id: string;
    taller_id: string;
    tipo: TipoTurno;
    fecha: string;              // YYYY-MM-DD
    hora: string | null;        // HH:MM:SS (Postgres) o null
    cliente_id: string | null;
    bicicleta_id: string | null;
    nombre: string | null;
    telefono: string | null;
    trabajo: string | null;
    nota: string | null;
    estado: EstadoTurno;
    origen: 'manual' | 'whatsapp';
    evidencia: string | null;
    wa_message_id: string | null;
    servicio_id: string | null;
    creado_at: string;
    actualizado_at: string;
}

const DIA_OK = /^\d{4}-\d{2}-\d{2}$/;

function aUTC(dia: string): Date {
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
}

function aTexto(f: Date): string {
    const a = f.getUTCFullYear();
    const m = String(f.getUTCMonth() + 1).padStart(2, '0');
    const d = String(f.getUTCDate()).padStart(2, '0');
    return `${a}-${m}-${d}`;
}

export function sumarDias(dia: string, n: number): string {
    if (!DIA_OK.test(dia)) return dia;
    const f = aUTC(dia);
    f.setUTCDate(f.getUTCDate() + n);
    return aTexto(f);
}

/** El lunes de la semana de ese día (la semana del taller arranca el lunes). */
export function lunesDe(dia: string): string {
    if (!DIA_OK.test(dia)) return dia;
    const dow = aUTC(dia).getUTCDay();           // 0 = domingo
    return sumarDias(dia, dow === 0 ? -6 : 1 - dow);
}

/** Los 7 días de la semana que arranca en `lunes`. */
export function diasDeLaSemana(lunes: string): string[] {
    return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** `2026-09-28` → { corto: 'LUN', numero: 28, domingo: false } */
export function etiquetaDia(dia: string): { corto: string; numero: number; domingo: boolean } {
    const f = aUTC(dia);
    return { corto: DIAS[f.getUTCDay()], numero: f.getUTCDate(), domingo: f.getUTCDay() === 0 };
}

/** `2026-09-28` → `lunes 28 de septiembre` */
export function diaEnPalabras(dia: string): string {
    if (!DIA_OK.test(dia)) return '';
    const f = aUTC(dia);
    return `${DIAS_LARGOS[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`;
}

/** El título de la semana: `28 de septiembre al 4 de octubre`, o `21 al 27 de septiembre`. */
export function rangoDeLaSemana(lunes: string): string {
    const domingo = sumarDias(lunes, 6);
    const a = aUTC(lunes), b = aUTC(domingo);
    if (a.getUTCMonth() === b.getUTCMonth()) {
        return `${a.getUTCDate()} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`;
    }
    return `${a.getUTCDate()} de ${MESES[a.getUTCMonth()]} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`;
}

/**
 * El orden adentro de un día: primero lo reservado de día entero (define el
 * día), después por hora, y los que no tienen hora al final (el cliente la
 * deja cuando puede). A igual hora, el que se cargó antes.
 */
export function ordenarDelDia(turnos: Turno[]): Turno[] {
    const peso = (t: Turno) => (t.tipo === 'reservado' && !t.hora ? 0 : t.hora ? 1 : 2);
    return [...turnos].sort((x, y) =>
        peso(x) - peso(y)
        || (x.hora ?? '').localeCompare(y.hora ?? '')
        || x.creado_at.localeCompare(y.creado_at));
}

/** ¿Ese día el taller se lo guardó entero? (un reservado sin hora). */
export function diaReservado(turnos: Turno[]): Turno | undefined {
    return turnos.find(t => t.tipo === 'reservado' && !t.hora && t.estado !== 'cancelado');
}

/** Los turnos de clientes que siguen en pie ese día (lo que se cuenta en la cabecera). */
export function turnosEnPie(turnos: Turno[]): Turno[] {
    return turnos.filter(t => t.tipo === 'turno' && t.estado !== 'cancelado');
}

/** `2` → `2 turnos`, `1` → `1 turno`. */
export function cuantosTurnos(n: number): string {
    return n === 1 ? '1 turno' : `${n} turnos`;
}
