// Tests del aviso desde la orden. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/avisoDeLaOrden.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { estadoDeEspera, comoLeVaALlegar, limpiarDetalle } from './avisoDeLaOrden';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const AHORA = Date.parse('2026-09-08T18:00:00Z');
const haceHoras = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();

// ── El reloj ────────────────────────────────────────────────────────────────
eq('sin consulta, no espera', estadoDeEspera(null, 3, AHORA).esperando, false);
eq('orden sin marca, no espera', estadoDeEspera({ esperando_desde: null }, 3, AHORA).esperando, false);

{
    const e = estadoDeEspera({ esperando_desde: haceHoras(2), esperando_que: 'las pastillas' }, 3, AHORA);
    eq('2 h con plazo 3: espera', e.esperando, true);
    eq('2 h con plazo 3: todavia no se llama', e.hayQueLlamar, false);
    eq('2 h: lo dice en horas', e.etiqueta, 'esperando hace 2 h');
    eq('2 h: se acuerda de que se pregunto', e.que, 'las pastillas');
}

{
    const e = estadoDeEspera({ esperando_desde: haceHoras(4) }, 3, AHORA);
    eq('4 h con plazo 3: hay que llamar', e.hayQueLlamar, true);
    eq('4 h: cuenta las horas', e.horas, 4);
}

// 🔴 El caso que hace que el aviso deje de leerse: el cliente YA contestó.
// Si `respondio_at` no ganara, la mesa de trabajo seguiría diciendo "no
// contesta" sobre una orden destrabada, y un cartel que miente una vez deja de
// mirarse siempre.
eq('contesto: deja de esperar', estadoDeEspera({
    esperando_desde: haceHoras(9), respondio_at: haceHoras(1),
}, 3, AHORA).esperando, false);

// Un taller que ponga 0 no puede ver "llamalo" en el segundo siguiente a mandar
// el mensaje: nadie contesta un WhatsApp en cero minutos.
eq('plazo 0 se trata como 1 h', estadoDeEspera({ esperando_desde: haceHoras(0.5) }, 0, AHORA).hayQueLlamar, false);

// Menos de una hora no dice "hace 0 h", que se lee como un error.
eq('menos de 1 h no cuenta horas', estadoDeEspera({ esperando_desde: haceHoras(0.3) }, 3, AHORA).etiqueta, 'esperando respuesta');

// Una fecha rota no puede tirar la pantalla de la mesa de trabajo.
eq('fecha invalida no rompe', estadoDeEspera({ esperando_desde: 'ayer' }, 3, AHORA).esperando, false);

// ── El texto ────────────────────────────────────────────────────────────────
// 🚩 Es el ESPEJO del cuerpo de las plantillas de Meta
// (supabase/functions/_shared/plantillas.ts). Si allá se edita el texto y acá
// no, la pantalla le muestra al mecánico un mensaje que no es el que sale.
const p = { cliente: 'Martín', firma: 'Leandro', taller: 'Probikes', bici: 'Tarmac', detalle: 'las pastillas están gastadas.' };
eq('consulta: texto exacto', comoLeVaALlegar('consulta', p),
    'Hola Martín! Soy Leandro, de Probikes. Estoy con tu Tarmac y encontré algo antes de seguir: las pastillas están gastadas. Decime si lo hacemos y sigo.');
eq('avance: texto exacto', comoLeVaALlegar('avance', p),
    'Hola Martín! Soy Leandro, de Probikes. Te cuento cómo va tu Tarmac: las pastillas están gastadas. Cualquier cosa escribime por acá.');

// Meta rechaza el envío entero si un parámetro trae saltos de línea o corridas
// de espacios, y el mecánico escribe en un textarea.
eq('limpia saltos y espacios', limpiarDetalle('  las pastillas\n\nestán   gastadas  '), 'las pastillas están gastadas');

console.log(`\n${fail === 0 ? '✅' : '❌'} avisoDeLaOrden: ${ok} ok, ${fail} fallaron`);
if (fail > 0) process.exit(1);
