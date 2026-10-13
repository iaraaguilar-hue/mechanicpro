// Tests de cuándo se ofrece el débito automático (13-oct-2026). Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/debitoAutomatico.test.ts --bundle --platform=node --format=cjs --alias:@=./src --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { cambiosDelDebito, lugarDelDebito, claveDeAvisoCerrado, LINK_DEBITO } from './debitoAutomatico';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};
const ms = (iso: string) => Date.parse(iso);
const HOY = ms('2026-10-13T15:00:00Z');

const PAGA = { prueba_dias: null, prueba_inicio_at: null };
const EN_PRUEBA = { prueba_dias: 15, prueba_inicio_at: '2026-10-08T15:00:00Z' };
const VENCIDA = { prueba_dias: 15, prueba_inicio_at: '2026-09-20T15:00:00Z' };
const CORTADA_POR_PRUEBA = { prueba_dias: null, acceso_suspendido_at: '2026-10-05T12:00:00Z', acceso_suspendido_motivo: 'prueba_finalizada' };
const CORTADA_A_MANO = { prueba_dias: null, acceso_suspendido_at: '2026-10-05T12:00:00Z', acceso_suspendido_motivo: null };

// Dónde aparece
eq('prueba corriendo: aviso de prueba', lugarDelDebito(EN_PRUEBA, 'admin', HOY), 'prueba');
eq('prueba vencida (el reloj, antes del cron): cartel', lugarDelDebito(VENCIDA, 'admin', HOY), 'corte');
eq('cortada por la prueba: cartel', lugarDelDebito(CORTADA_POR_PRUEBA, 'admin', HOY), 'corte');
eq('ya paga: aviso chico', lugarDelDebito(PAGA, 'admin', HOY), 'paga');

// Dónde NO
eq('cortada a mano: ni cartel ni botón', lugarDelDebito(CORTADA_A_MANO, 'admin', HOY), null);
eq('en prueba sin cargar nada: nada todavía', lugarDelDebito({ prueba_dias: 15, prueba_inicio_at: null }, 'admin', HOY), null);
eq('sin taller: nada', lugarDelDebito(null, 'admin', HOY), null);

// Solo el admin
for (const rol of ['mecanico', 'recepcion', 'super_admin', null, undefined, '']) {
    eq(`rol ${String(rol)}: no ve nada (en prueba)`, lugarDelDebito(EN_PRUEBA, rol, HOY), null);
    eq(`rol ${String(rol)}: no ve nada (paga)`, lugarDelDebito(PAGA, rol, HOY), null);
    eq(`rol ${String(rol)}: no ve nada (cortada)`, lugarDelDebito(CORTADA_POR_PRUEBA, rol, HOY), null);
}

// Desaparece cuando ya lo activó, en los tres lugares
const ACTIVO = { debito_automatico_at: '2026-10-13T12:00:00Z' };
eq('activo + prueba: nada', lugarDelDebito({ ...EN_PRUEBA, ...ACTIVO }, 'admin', HOY), null);
eq('activo + cortada: nada', lugarDelDebito({ ...CORTADA_POR_PRUEBA, ...ACTIVO }, 'admin', HOY), null);
eq('activo + paga: nada', lugarDelDebito({ ...PAGA, ...ACTIVO }, 'admin', HOY), null);

// Sin cobro (Probikes, Demo, canje): no ve nada del débito en ningún lugar
const SIN_COBRO = { sin_cobro: true };
eq('sin cobro + sin reloj: nada', lugarDelDebito({ ...PAGA, ...SIN_COBRO }, 'admin', HOY), null);
eq('sin cobro + prueba: nada', lugarDelDebito({ ...EN_PRUEBA, ...SIN_COBRO }, 'admin', HOY), null);
eq('sin cobro + vencida: nada', lugarDelDebito({ ...VENCIDA, ...SIN_COBRO }, 'admin', HOY), null);
eq('sin cobro + cortada por la prueba: nada', lugarDelDebito({ ...CORTADA_POR_PRUEBA, ...SIN_COBRO }, 'admin', HOY), null);
eq('sin_cobro false: se comporta como siempre', lugarDelDebito({ ...PAGA, sin_cobro: false }, 'admin', HOY), 'paga');
eq('sin_cobro null: se comporta como siempre', lugarDelDebito({ ...PAGA, sin_cobro: null }, 'admin', HOY), 'paga');

// Pasa de un lugar a otro con el reloj
eq('el último milisegundo de la prueba: aviso de prueba', lugarDelDebito(EN_PRUEBA, 'admin', ms('2026-10-23T14:59:59Z')), 'prueba');
eq('el milisegundo siguiente: cartel', lugarDelDebito(EN_PRUEBA, 'admin', ms('2026-10-23T15:00:00Z')), 'corte');

eq('clave por taller', claveDeAvisoCerrado('abc'), 'mechanicpro_debito_cerrado_abc');
eq('el link es el del plan', LINK_DEBITO, 'https://mpago.la/1gWKULV');

// Lo que escribe el SuperAdmin: un solo UPDATE
const AHORA = '2026-10-13T15:00:00.000Z';
eq('activar en prueba: Paga + marca', cambiosDelDebito(EN_PRUEBA, true, AHORA), { debito_automatico_at: AHORA, prueba_dias: null });
eq('activar cortado por la prueba: además devuelve el acceso',
    cambiosDelDebito({ ...VENCIDA, acceso_suspendido_at: '2026-10-05T12:00:00Z', acceso_suspendido_motivo: 'prueba_finalizada' }, true, AHORA),
    { debito_automatico_at: AHORA, prueba_dias: null, acceso_suspendido_at: null, acceso_suspendido_motivo: null });
eq('activar cortado a mano por otra cosa: el corte NO se toca', cambiosDelDebito(CORTADA_A_MANO, true, AHORA), { debito_automatico_at: AHORA, prueba_dias: null });
eq('activar uno que ya paga: solo la marca', cambiosDelDebito(PAGA, true, AHORA), { debito_automatico_at: AHORA, prueba_dias: null });
eq('deshacer: solo saca la marca', cambiosDelDebito({ ...PAGA, ...ACTIVO }, false, AHORA), { debito_automatico_at: null });

console.log(`debitoAutomatico: ${ok} ok, ${fail} mal`);
if (fail) process.exit(1);
