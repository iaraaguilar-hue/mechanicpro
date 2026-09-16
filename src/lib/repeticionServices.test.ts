// Tests de los avisos propios del taller (un service del menú que se repite).
// Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/repeticionServices.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { repeticionesDeLaOrden, sumarMeses, diaISO } from './repeticionServices';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const REPES = [
    { nombre: 'Lavado y lubricación', meses: 2 },
    { nombre: 'Service Completo', meses: 6 },
];
const DESDE = new Date(2026, 8, 16); // 16-sep-2026, hora local

// ── Sumar meses sin correrse de mes ─────────────────────────────────────────
eq('31-ene + 1 mes cae en febrero, no en marzo', diaISO(sumarMeses(new Date(2026, 0, 31), 1)), '2026-02-28');
eq('31-dic + 2 meses', diaISO(sumarMeses(new Date(2026, 11, 31), 2)), '2027-02-28');
eq('16-sep + 6 meses', diaISO(sumarMeses(DESDE, 6)), '2027-03-16');

// ── El service base de la orden ─────────────────────────────────────────────
eq('el service base que se repite queda agendado',
    repeticionesDeLaOrden({ tipo_servicio: 'Service Completo', items_extra: [] }, REPES, DESDE),
    [{ componente: 'Service Completo', meses: 6, fecha: '2027-03-16' }]);

eq('sin tildes y sin mayúsculas encuentra igual',
    repeticionesDeLaOrden({ tipo_servicio: 'lavado y lubricacion', items_extra: [] }, REPES, DESDE),
    [{ componente: 'Lavado y lubricación', meses: 2, fecha: '2026-11-16' }]);

// ── Las manos de obra sí, los repuestos no ──────────────────────────────────
eq('una mano de obra del menú también agenda',
    repeticionesDeLaOrden({ tipo_servicio: 'OTRO', items_extra: [{ descripcion: 'Lavado y lubricación', categoria: 'labor' }] }, REPES, DESDE),
    [{ componente: 'Lavado y lubricación', meses: 2, fecha: '2026-11-16' }]);

eq('un repuesto que se llama igual NO agenda (es una pieza, no el trabajo)',
    repeticionesDeLaOrden({ tipo_servicio: 'OTRO', items_extra: [{ descripcion: 'Lavado y lubricación', categoria: 'part' }] }, REPES, DESDE),
    []);

// ── Lo que NO tiene que pasar ───────────────────────────────────────────────
eq('un service parecido pero distinto no agenda nada (match exacto, no difuso)',
    repeticionesDeLaOrden({ tipo_servicio: 'Service Completo Premium', items_extra: [] }, REPES, DESDE),
    []);

eq('un service que no se repite no agenda nada',
    repeticionesDeLaOrden({ tipo_servicio: 'Armado de bici', items_extra: [] }, REPES, DESDE),
    []);

eq('el mismo trabajo dos veces en la orden agenda UN solo aviso',
    repeticionesDeLaOrden({
        tipo_servicio: 'Lavado y lubricación',
        items_extra: [{ descripcion: 'Lavado y lubricación', categoria: 'labor' }],
    }, REPES, DESDE).length, 1);

eq('sin services repetibles no toca nada', repeticionesDeLaOrden({ tipo_servicio: 'Service Completo' }, [], DESDE), []);
eq('sin orden no toca nada', repeticionesDeLaOrden(null, REPES, DESDE), []);
eq('meses en 0 no agenda (no es un plazo)',
    repeticionesDeLaOrden({ tipo_servicio: 'X' }, [{ nombre: 'X', meses: 0 }], DESDE), []);

console.log(fail ? `\n❌ ${fail} fallaron, ${ok} pasaron` : `\n✅ ${ok} tests OK`);
process.exit(fail ? 1 : 0);
