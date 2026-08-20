// Tests del candado de las notas. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/notasServicio.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// Lo que estos tests protegen es UNA sola cosa: que una nota interna del taller
// no termine impresa en el comprobante del cliente. Si alguno se pone rojo,
// alguien abrió esa puerta.
import { notasParaElCliente, notasDelTaller, tieneNotasInternas } from './notasServicio';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const ORDEN = {
    notas_mecanico: 'Cambié cadena y cassette. La próxima mirá las pastillas.',
    notas_internas: 'El cuadro vino rayado de antes, le saqué foto. Este cliente discute el precio.',
};

// ── LO QUE NO PUEDE PASAR ───────────────────────────────────────────────────

eq('al cliente NUNCA le llega la nota interna',
    notasParaElCliente(ORDEN).includes('discute el precio'), false);
eq('al cliente le llega la suya',
    notasParaElCliente(ORDEN), ORDEN.notas_mecanico);

// Y si la orden SOLO tiene nota interna, lo que sale al cliente es vacío,
// no la interna "porque era la única que había".
eq('sin nota de cliente no se cae a la interna',
    notasParaElCliente({ notas_internas: 'no mostrar esto jamás' }), '');

// ── Los alias legacy que usan los objetos del generador de PDF ──────────────

eq('alias mechanic_notes', notasParaElCliente({ mechanic_notes: 'hola' }), 'hola');
eq('alias notes', notasParaElCliente({ notes: 'hola' }), 'hola');
eq('notes gana sobre mechanic_notes', notasParaElCliente({ notes: 'a', mechanic_notes: 'b' }), 'a');
// Un objeto legacy al que alguien le agregó la interna sigue sin filtrarla.
eq('el alias legacy tampoco filtra la interna',
    notasParaElCliente({ mechanic_notes: 'visible', notas_internas: 'secreta' } as any), 'visible');

// ── Las internas, del lado del taller ───────────────────────────────────────

eq('las internas se leen enteras', notasDelTaller(ORDEN), ORDEN.notas_internas);
eq('sin internas devuelve vacío', notasDelTaller({ notas_mecanico: 'x' }), '');
eq('tieneNotasInternas', [
    tieneNotasInternas(ORDEN),
    tieneNotasInternas({ notas_internas: '   ' }),   // espacios no son una nota
    tieneNotasInternas({ notas_mecanico: 'x' }),
    tieneNotasInternas(null),
], [true, false, false, false]);

// ── Nada explota con datos incompletos ──────────────────────────────────────

eq('null / undefined', [notasParaElCliente(null), notasParaElCliente(undefined), notasDelTaller(null)], ['', '', '']);
eq('campos en null', notasParaElCliente({ notas_mecanico: null, notas_internas: null }), '');
eq('valor que no es texto', notasParaElCliente({ notas_mecanico: 123 as any }), '');

console.log(`\n${fail === 0 ? '✅' : '❌'} notasServicio: ${ok} ok, ${fail} fallaron`);
if (fail) process.exit(1);
