// Tests del formateador de fechas. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/fechaAR.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// Los casos vienen de la ORDEN 311 real de Probikes, que es donde Iara vio el
// "9 vs 10": fecha_entrega 2026-08-10T00:00:00+00:00 (el día que se eligió en
// el formulario) y fecha_entregado 2026-08-18T22:10:56.811Z (el instante en que
// alguien apretó Entregar, que en Argentina son las 19:10 del 18).
import {
    instanteAR, instanteARLargo, instanteARConHora,
    diaCalendario, diaCalendarioLargo, diaParaInput,
    entregaMostrable,
} from './fechaAR';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

// ── INSTANTES: se convierten a hora de Argentina ────────────────────────────

// La orden 311: el botón Entregar se apretó el 18-ago 19:10 AR.
eq('311: fecha_entregado en AR', instanteAR('2026-08-18T22:10:56.811Z'), '18/08/26');
eq('311: con hora', instanteARConHora('2026-08-18T22:10:56.811Z'), '18/08/26 19:10');
eq('311: fecha_finalizacion', instanteAR('2026-08-06T17:46:41.138+00:00'), '06/08/26');

// EL CASO QUE OBLIGA A CONVERTIR: un service cerrado a las 22:30 de un martes.
// En UTC ya es el miércoles; en Argentina sigue siendo martes, y es el día en
// que el mecánico lo cerró.
eq('martes 22:30 AR sigue siendo martes', instanteAR('2026-08-19T01:30:00Z'), '18/08/26');
eq('...y con hora lo muestra', instanteARConHora('2026-08-19T01:30:00Z'), '18/08/26 22:30');

// El borde exacto: 21:00 AR = 00:00 UTC del día siguiente.
eq('las 21:00 AR no saltan de día', instanteAR('2026-08-11T00:00:00Z'), '10/08/26');
eq('las 20:59 AR tampoco', instanteARConHora('2026-08-10T23:59:00Z'), '10/08/26 20:59');
// Y la medianoche de Argentina se dibuja 00:00, no 24:00.
eq('medianoche AR es 00:00', instanteARConHora('2026-08-10T03:00:00Z'), '10/08/26 00:00');

eq('formato largo', instanteARLargo('2026-08-18T22:10:56.811Z'), '18/08/2026');

// ── DÍAS DE CALENDARIO: se muestran tal cual, sin convertir ─────────────────

// 🔴 EL BUG DE LA 311. fecha_entrega la escribe un <input type="date"> como
// "2026-08-10"; Postgres la guarda a las 00:00 UTC. El día que eligió el
// mecánico es el 10. Convertirla a hora argentina devuelve el 9.
eq('311: la fecha PROMETIDA es el 10, no el 9', diaCalendario('2026-08-10T00:00:00+00:00'), '10/08/26');
eq('311: en formato largo', diaCalendarioLargo('2026-08-10T00:00:00+00:00'), '10/08/2026');

// Y el mismo valor pasado por el formateador de instantes daría el 9: por eso
// son dos funciones y no una. (Si este test empieza a fallar, alguien "unificó"
// los dos caminos y toda fecha prometida se corrió un día.)
eq('la prueba de que son distintos', instanteAR('2026-08-10T00:00:00+00:00'), '09/08/26');

// Un YYYY-MM-DD pelado (sin hora) también tiene que andar.
eq('fecha sin hora', diaCalendario('2026-08-10'), '10/08/26');
eq('para el input', diaParaInput('2026-08-10T00:00:00+00:00'), '2026-08-10');
eq('el input tolera el pelado', diaParaInput('2026-12-01'), '2026-12-01');

// ── La columna MIXTA: 45 filas viejas guardan un INSTANTE en fecha_entrega ──
// (feb/mar-2026, cuando esa columna marcaba el cierre del service). Se
// distinguen porque no caen en medianoche UTC exacta.
eq('legacy con hora se trata como instante', diaCalendario('2026-02-04T18:36:03.484+00:00'), '04/02/26');
eq('legacy nocturno NO se corre un día', diaCalendario('2026-03-26T01:30:00.000+00:00'), '25/03/26');
eq('legacy largo', diaCalendarioLargo('2026-02-04T18:36:03.484+00:00'), '04/02/2026');
eq('legacy al input va el día argentino', diaParaInput('2026-03-26T01:30:00.000+00:00'), '2026-03-25');
// Y la medianoche exacta sigue siendo un día de calendario, en sus dos escrituras.
eq('medianoche con +00:00 es día', diaCalendario('2026-08-10T00:00:00+00:00'), '10/08/26');
eq('medianoche con Z también', diaCalendario('2026-08-10T00:00:00.000Z'), '10/08/26');

// ── Nada de "Invalid Date" en pantalla ──────────────────────────────────────

eq('null', [instanteAR(null), diaCalendario(null), instanteARConHora(undefined)], ['-', '-', '-']);
eq('string vacío', [instanteAR(''), diaCalendario('')], ['-', '-']);
eq('basura', [instanteAR('no soy una fecha'), diaCalendario('no soy una fecha')], ['-', '-']);
eq('input con basura', diaParaInput('cualquier cosa'), '');

// ── La fecha de entrega que ve el cliente ───────────────────────────────────

{
    // Ya se entregó: manda el dato duro.
    const e = entregaMostrable('2026-08-18T22:10:56.811Z', '2026-08-10T00:00:00+00:00');
    eq('entregada: usa la real', e?.texto, '18/08/26');
    eq('entregada: lo dice', e?.etiqueta, 'Entregada el');
    eq('entregada: real=true', e?.real, true);
}
{
    // Todavía no se entregó: la prometida, y dice que es estimada.
    const e = entregaMostrable(null, '2026-08-10T00:00:00+00:00');
    eq('sin entregar: usa la prometida', e?.texto, '10/08/26');
    eq('sin entregar: la rotula estimada', e?.etiqueta, 'Entrega estimada');
    eq('sin entregar: real=false', e?.real, false);
}
{
    const e = entregaMostrable('2026-08-18T22:10:56.811Z', null, { largo: true });
    eq('formato largo para el PDF', e?.texto, '18/08/2026');
}
eq('sin ninguna de las dos no inventa nada', entregaMostrable(null, null), null);

console.log(`\n${fail === 0 ? '✅' : '❌'} fechaAR: ${ok} ok, ${fail} fallaron`);
if (fail) process.exit(1);
