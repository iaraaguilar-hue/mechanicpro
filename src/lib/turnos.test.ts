// Tests de la cuenta de días del calendario de turnos. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/turnos.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// Se corren también con TZ=America/Argentina/Buenos_Aires: es la zona donde un
// `new Date('2026-09-28')` cae el domingo 27 y corre la semana entera.
import {
    sumarDias, lunesDe, diasDeLaSemana, etiquetaDia, diaEnPalabras,
    rangoDeLaSemana, ordenarDelDia, diaReservado, cuantosTurnos, type Turno,
} from './turnos';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

// ── La semana arranca el lunes ──────────────────────────────────────────────
eq('lunes de un jueves', lunesDe('2026-09-24'), '2026-09-21');
eq('lunes de un lunes', lunesDe('2026-09-28'), '2026-09-28');
eq('lunes de un domingo (es el de ANTES)', lunesDe('2026-09-27'), '2026-09-21');
eq('lunes que cruza de mes', lunesDe('2026-10-01'), '2026-09-28');
eq('lunes que cruza de año', lunesDe('2027-01-01'), '2026-12-28');

// ── Sumar días sin que el cambio de mes o de año los corra ──────────────────
eq('fin de mes', sumarDias('2026-09-30', 1), '2026-10-01');
eq('bisiesto', sumarDias('2028-02-28', 1), '2028-02-29');
eq('para atrás', sumarDias('2026-10-01', -1), '2026-09-30');
eq('basura no se toca', sumarDias('mañana', 1), 'mañana');

eq('semana de 7', diasDeLaSemana('2026-09-28'),
    ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);

// ── Cómo se lee ─────────────────────────────────────────────────────────────
eq('etiqueta lunes', etiquetaDia('2026-09-28'), { corto: 'LUN', numero: 28, domingo: false });
eq('etiqueta domingo', etiquetaDia('2026-10-04'), { corto: 'DOM', numero: 4, domingo: true });
eq('en palabras', diaEnPalabras('2026-09-26'), 'sábado 26 de septiembre');
eq('rango mismo mes', rangoDeLaSemana('2026-09-21'), '21 al 27 de septiembre');
eq('rango que cruza', rangoDeLaSemana('2026-09-28'), '28 de septiembre al 4 de octubre');
eq('1 turno', cuantosTurnos(1), '1 turno');
eq('3 turnos', cuantosTurnos(3), '3 turnos');

// ── El orden adentro del día ────────────────────────────────────────────────
const t = (id: string, o: Partial<Turno>): Turno => ({
    id, taller_id: 'x', tipo: 'turno', fecha: '2026-09-28', hora: null, cliente_id: null,
    bicicleta_id: null, nombre: id, telefono: null, trabajo: null, nota: null,
    estado: 'confirmado', origen: 'manual', evidencia: null, wa_message_id: null,
    servicio_id: null, creado_at: '2026-09-25T10:00:00Z', actualizado_at: '2026-09-25T10:00:00Z', ...o,
});
const dia = [
    t('sin-hora', {}),
    t('diez', { hora: '10:00:00' }),
    t('reservado', { tipo: 'reservado', nombre: null, trabajo: 'Armar Scott' }),
    t('nueve', { hora: '09:30:00' }),
];
eq('orden: reservado, por hora, sin hora al final',
    ordenarDelDia(dia).map(x => x.id), ['reservado', 'nueve', 'diez', 'sin-hora']);
eq('día reservado', diaReservado(dia)?.id, 'reservado');
eq('un reservado con hora no toma el día',
    diaReservado([t('r', { tipo: 'reservado', hora: '15:00:00' })]), undefined);
eq('un reservado cancelado no toma el día',
    diaReservado([t('r', { tipo: 'reservado', estado: 'cancelado' })]), undefined);

console.log(`turnos: ${ok} ok, ${fail} fallaron`);
if (fail) process.exit(1);
