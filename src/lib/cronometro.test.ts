// Tests de las cuentas y los textos del cronómetro. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/cronometro.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { hhmm, duracionLarga, acumuladoPorOrden, totalDelReloj, acumuladoLibreDeHoy, claveLibre, inicioDelDiaAR, accionDeLaOrden, fraseOtrosConLaBici, otrosConLaBici, fraseDeError, descripcionDelTrabajo } from './cronometro';
import { cronometroActivo } from './planFeatures';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

eq('hhmm 42 min', hhmm(42 * 60000), '00:42');
eq('hhmm 3 h 7 min', hhmm((3 * 60 + 7) * 60000), '03:07');
eq('hhmm negativo no explota', hhmm(-5000), '00:00');
eq('hhmm 59 s sigue en 00:00', hhmm(59000), '00:00');
eq('duración larga', [duracionLarga(0), duracionLarga(42 * 60000), duracionLarga(60 * 60000), duracionLarga(75 * 60000)], ['menos de 1 min', '42 min', '1 h', '1 h 15 min']);

const t = (s: string | null, a: string, b: string | null) => ({ servicio_id: s, inicio: a, fin: b });
eq('acumulado suma tramos cerrados por orden y salta los abiertos y los sin orden',
    acumuladoPorOrden([
        t('A', '2026-10-14T10:00:00Z', '2026-10-14T10:30:00Z'),
        t('A', '2026-10-14T11:00:00Z', '2026-10-14T11:12:00Z'),
        t('B', '2026-10-14T12:00:00Z', null),
        t(null, '2026-10-14T13:00:00Z', '2026-10-14T14:00:00Z'),
    ]), { A: 42 * 60000 });

eq('botón: andando = Pausar', accionDeLaOrden(true, 5), 'Pausar');
eq('botón: con tiempo y pausado = Seguir', accionDeLaOrden(false, 5), 'Seguir');
eq('botón: sin tiempo = Empezar', accionDeLaOrden(false, 0), 'Empezar');

const andando = [
    { tramo_id: '1', usuario_id: 'yo', usuario_nombre: 'Yo', servicio_id: 'A', tipo: 'orden' as const, detalle: null, inicio: '' },
    { tramo_id: '2', usuario_id: 'u2', usuario_nombre: 'Lean', servicio_id: 'A', tipo: 'orden' as const, detalle: null, inicio: '' },
    { tramo_id: '3', usuario_id: 'u3', usuario_nombre: 'Juli', servicio_id: 'A', tipo: 'orden' as const, detalle: null, inicio: '' },
    { tramo_id: '4', usuario_id: 'u4', usuario_nombre: 'Ana', servicio_id: 'B', tipo: 'orden' as const, detalle: null, inicio: '' },
];
eq('otros: no me cuenta y solo los de esa orden', otrosConLaBici(andando, 'A', 'yo'), ['Lean', 'Juli']);
eq('frase de uno', fraseOtrosConLaBici(['Lean']), 'Lean está con esta bici');
eq('frase de dos', fraseOtrosConLaBici(['Lean', 'Juli']), 'Lean y Juli están con esta bici');
eq('frase de tres', fraseOtrosConLaBici(['Lean', 'Juli', 'Ana']), 'Lean, Juli y Ana están con esta bici');
eq('frase de nadie', fraseOtrosConLaBici([]), '');

eq('error con código', fraseDeError({ message: 'x', details: 'orden_finalizada' }), 'Esa orden ya está finalizada: no se puede cronometrar.');
eq('error sin código: frase humana, no el crudo', fraseDeError({ message: 'FetchError: boom' }), 'No se pudo hacer. Probá de nuevo en un momento.');
eq('descripción de armado con modelo', descripcionDelTrabajo({ tipo: 'armado', detalle: ' Allez ' }), 'Armado: Allez');
eq('descripción de mostrador sin detalle', descripcionDelTrabajo({ tipo: 'mostrador', detalle: null }), 'Mostrador');
eq('descripción de orden', descripcionDelTrabajo({ tipo: 'orden', detalle: null }, { numero: '#0123', bici: 'Trek' }), 'Orden #0123 · Trek');

// La barra fija muestra el MISMO número que el chip de la orden (todo mi tiempo en ella), no el tramo
const T0 = Date.parse('2026-10-14T15:00:00Z');
const inicioAndando = new Date(T0 - 5 * 60000).toISOString(); // anda hace 5 min
eq('orden: tramos cerrados (42 min) + el que anda (5) = 47', hhmm(totalDelReloj({ servicio_id: 'A', tipo: 'orden', detalle: null, inicio: inicioAndando }, { A: 42 * 60000 }, {}, T0)), '00:47');
eq('orden sin tiempo previo: solo el tramo que anda', hhmm(totalDelReloj({ servicio_id: 'B', tipo: 'orden', detalle: null, inicio: inicioAndando }, { A: 42 * 60000 }, {}, T0)), '00:05');
eq('recién arrancado con 42 min previos: 00:42, no 00:00', hhmm(totalDelReloj({ servicio_id: 'A', tipo: 'orden', detalle: null, inicio: new Date(T0).toISOString() }, { A: 42 * 60000 }, {}, T0)), '00:42');
// Sin orden: el total de ese trabajo HOY (cerrados de hoy + el que anda)
const desde = inicioDelDiaAR(T0);
eq('el día AR arranca a las 03:00 UTC', new Date(desde).toISOString(), '2026-10-14T03:00:00.000Z');
const libre = acumuladoLibreDeHoy([
    { tipo: 'armado', detalle: 'Allez', servicio_id: null, inicio: '2026-10-14T12:00:00Z', fin: '2026-10-14T12:30:00Z' },
    { tipo: 'armado', detalle: ' allez ', servicio_id: null, inicio: '2026-10-14T13:00:00Z', fin: '2026-10-14T13:10:00Z' },
    { tipo: 'armado', detalle: 'Allez', servicio_id: null, inicio: '2026-10-13T12:00:00Z', fin: '2026-10-13T15:00:00Z' }, // ayer: no cuenta
    { tipo: 'mostrador', detalle: null, servicio_id: null, inicio: '2026-10-14T12:00:00Z', fin: '2026-10-14T12:20:00Z' },
    { tipo: 'armado', detalle: 'Allez', servicio_id: 'A', inicio: '2026-10-14T12:00:00Z', fin: '2026-10-14T12:50:00Z' }, // con orden: no es libre
], desde);
eq('libre de hoy: armado Allez = 40 min, ayer y con-orden afuera', libre[claveLibre('armado', 'Allez')], 40 * 60000);
eq('armado andando hace 5 min con 40 de hoy = 00:45', hhmm(totalDelReloj({ servicio_id: null, tipo: 'armado', detalle: 'Allez', inicio: inicioAndando }, {}, libre, T0)), '00:45');
eq('mostrador sin detalle andando', hhmm(totalDelReloj({ servicio_id: null, tipo: 'mostrador', detalle: null, inicio: inicioAndando }, {}, libre, T0)), '00:25');

// El gate: Pro y Expert con el ajuste prendido. Sport o apagado, no.
eq('Pro prendido', cronometroActivo({ plan_actual: 'Pro', config_cronometro: { activo: true } }), true);
eq('Expert prendido', cronometroActivo({ plan_actual: 'Expert', config_cronometro: { activo: true } }), true);
eq('Sport prendido NO', cronometroActivo({ plan_actual: 'Sport', config_cronometro: { activo: true } }), false);
eq('Pro apagado NO', cronometroActivo({ plan_actual: 'Pro', config_cronometro: { activo: false } }), false);
eq('sin config NO', cronometroActivo({ plan_actual: 'Expert' }), false);

console.log(`cronometro: ${ok} bien, ${fail} mal`);
if (fail) process.exit(1);
