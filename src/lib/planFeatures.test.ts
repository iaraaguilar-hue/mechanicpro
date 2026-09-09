// Tests de las claves del checklist de trabajos. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/planFeatures.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { trabajosDe, trabajosPendientes } from './planFeatures';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const item = (descripcion: string, categoria: 'part' | 'labor' = 'part') => ({ descripcion, categoria });

// ── El caso que rompía: dos renglones con el mismo nombre ────────────────────
// Apareció en el QA del recorrido, sobre una orden real del Taller Demo: React
// tiraba «two children with the same key, part:cadena». No era cosmético — las
// dos filas compartían la MISMA tilde.
{
    const t = trabajosDe({ tipo_servicio: 'OTRO', items_extra: [item('Cadena'), item('Cadena')] });
    eq('dos ítems iguales dan dos trabajos', t.length, 2);
    eq('y sus claves son DISTINTAS', t[0].clave !== t[1].clave, true);
    eq('la primera conserva la clave de siempre', t[0].clave, 'part:cadena');
    eq('la segunda desempata', t[1].clave, 'part:cadena#2');
    eq('las dos se siguen llamando igual en pantalla', [t[0].etiqueta, t[1].etiqueta], ['Cadena', 'Cadena']);
}

// Tildar UNA no puede tildar la otra: es lo que hacía que el contador dijera
// «2 de 2» con un trabajo sin hacer, y que el candado de finalización dejara
// cerrar la orden antes de tiempo.
{
    const servicio = {
        tipo_servicio: 'OTRO',
        items_extra: [item('Cadena'), item('Cadena')],
        etapas_data: { 'part:cadena': true },
    };
    const pend = trabajosPendientes(servicio);
    eq('con una tildada, queda UNA pendiente', pend.length, 1);
    eq('y es la segunda', pend[0].clave, 'part:cadena#2');
}

// ── Y lo que NO se puede haber roto: las claves de siempre ───────────────────
// Si el desempate se le pusiera a TODAS, cambiarían todas las claves y las
// órdenes en curso perderían las tildes que ya tenían.
{
    const t = trabajosDe({
        tipo_servicio: 'Service Completo',
        items_extra: [item('Cadena'), item('Pastillas'), item('Ajuste de cambios', 'labor')],
    });
    eq('sin repetidos, las claves quedan como antes',
        t.map(x => x.clave), ['base', 'part:cadena', 'part:pastillas', 'labor:ajuste de cambios']);
}

// Mismo nombre pero distinta categoría NO es un choque: son dos trabajos reales.
{
    const t = trabajosDe({ tipo_servicio: 'OTRO', items_extra: [item('Cadena'), item('Cadena', 'labor')] });
    eq('repuesto y mano de obra con el mismo nombre no chocan',
        t.map(x => x.clave), ['part:cadena', 'labor:cadena']);
}

// Tres iguales: el desempate sigue contando.
{
    const t = trabajosDe({ tipo_servicio: 'OTRO', items_extra: [item('Rulemán'), item('Rulemán'), item('Rulemán')] });
    eq('tres iguales dan tres claves distintas', new Set(t.map(x => x.clave)).size, 3);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} planFeatures: ${ok} ok, ${fail} fallaron`);
if (fail > 0) process.exit(1);
