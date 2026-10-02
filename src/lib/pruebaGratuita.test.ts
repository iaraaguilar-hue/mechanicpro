// Tests de la prueba gratuita. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/pruebaGratuita.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// El caso de referencia: un taller que carga su primer cliente el jueves 25-sep-2026
// a las 11:30 de Argentina (14:30 UTC). Con 15 días, vence el viernes 10-oct a las 11:30.
import { accesoCortado, cortePorPrueba, diaYMes, estadoPrueba, etiquetaPrueba, fechaDelCorte } from './pruebaGratuita';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const INICIO = '2026-09-25T14:30:00.000Z';
const VENCE = '2026-10-10T14:30:00.000Z';
const ms = (iso: string) => Date.parse(iso);

// ── Paga: nunca se corta por la prueba ──────────────────────────────────────
eq('paga: sin prueba', estadoPrueba({ prueba_dias: null, prueba_inicio_at: INICIO }).tipo, 'sin_prueba');
eq('paga: no se corta aunque tenga inicio viejo', accesoCortado({ prueba_dias: null, prueba_inicio_at: '2020-01-01T00:00:00Z' }), false);
eq('días en 0 = sin prueba', estadoPrueba({ prueba_dias: 0, prueba_inicio_at: INICIO }).tipo, 'sin_prueba');

// ── En prueba sin cargar nada: el reloj no arrancó, NUNCA se corta ───────────
eq('sin datos: sin empezar', estadoPrueba({ prueba_dias: 15, prueba_inicio_at: null }).tipo, 'sin_empezar');
eq('sin datos: no se corta ni un año después', accesoCortado({ prueba_dias: 15, prueba_inicio_at: null }, ms('2027-10-01T00:00:00Z')), false);

// ── Corriendo ───────────────────────────────────────────────────────────────
const e1 = estadoPrueba({ prueba_dias: 15, prueba_inicio_at: INICIO }, ms('2026-10-02T12:00:00Z'));
eq('corriendo: tipo', e1.tipo, 'corriendo');
eq('corriendo: vence 15 días exactos después', e1.tipo === 'corriendo' ? e1.vence : null, VENCE);
eq('corriendo: quedan 9 días (8,1 redondea para arriba)', e1.tipo === 'corriendo' ? e1.diasRestantes : null, 9);

// ── El borde: un milisegundo antes sigue, en el instante exacto se corta ────
eq('1 ms antes: no se corta', accesoCortado({ prueba_dias: 15, prueba_inicio_at: INICIO }, ms(VENCE) - 1), false);
eq('en el instante: se corta', accesoCortado({ prueba_dias: 15, prueba_inicio_at: INICIO }, ms(VENCE)), true);
eq('vencida: el corte es por la prueba', cortePorPrueba({ prueba_dias: 15, prueba_inicio_at: INICIO }, ms(VENCE)), true);
eq('vencida: la fecha del corte es el vencimiento', fechaDelCorte({ prueba_dias: 15, prueba_inicio_at: INICIO }, ms(VENCE) + 1000), VENCE);

// ── El cron ya marcó el corte (acceso_suspendido_at = el vencimiento) ───────
const marcado = { prueba_dias: 15, prueba_inicio_at: INICIO, acceso_suspendido_at: VENCE, acceso_suspendido_motivo: 'prueba_finalizada' };
eq('marcado: cortado', accesoCortado(marcado), true);
eq('marcado: por la prueba', cortePorPrueba(marcado), true);
eq('marcado: fecha', fechaDelCorte(marcado), VENCE);

// ── Corte a mano (Leira, 25-sep): sin días de prueba, con el motivo ─────────
const aMano = { prueba_dias: null, acceso_suspendido_at: '2026-09-25T18:00:00Z', acceso_suspendido_motivo: 'prueba_finalizada' };
eq('a mano: cortado', accesoCortado(aMano), true);
eq('a mano con motivo prueba: cartel de prueba', cortePorPrueba(aMano), true);
eq('a mano sin motivo: cartel genérico', cortePorPrueba({ acceso_suspendido_at: '2026-09-25T18:00:00Z', acceso_suspendido_motivo: null }), false);

// ── Fechas en hora de Argentina ─────────────────────────────────────────────
eq('día y mes', diaYMes(VENCE), '10 de octubre');
// 01:00 UTC del 11 = 22:00 del 10 en Argentina: el cartel tiene que decir 10.
eq('día y mes en hora AR, no UTC', diaYMes('2026-10-11T01:00:00Z'), '10 de octubre');
eq('día y mes vacío', diaYMes(null), '');

// ── Lo que lee el super admin ───────────────────────────────────────────────
eq('etiqueta paga', etiquetaPrueba({ prueba_dias: null }), 'Paga');
eq('etiqueta sin empezar', etiquetaPrueba({ prueba_dias: 15, prueba_inicio_at: null }), 'En prueba (15 días) · todavía no cargó datos');
eq('etiqueta corriendo', etiquetaPrueba({ prueba_dias: 15, prueba_inicio_at: INICIO }, ms('2026-10-09T15:00:00Z')),
    'En prueba desde el 25 de septiembre · vence el 10 de octubre (queda 1 día)');
eq('etiqueta vencida', etiquetaPrueba({ prueba_dias: 15, prueba_inicio_at: INICIO }, ms('2026-10-11T00:00:00Z')),
    'Prueba vencida el 10 de octubre · acceso cortado');

console.log(`${ok} ok · ${fail} fallas`);
if (fail) process.exit(1);
