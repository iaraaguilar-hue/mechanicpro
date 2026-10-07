// Tests del paso 2 de WhatsApp (la tarjeta en Meta). Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/tarjetaMeta.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { estadoTarjeta } from './tarjetaMeta';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    if (a === b) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${b}\n      recibí   ${a}`); }
};
const p = (estado: string, error_codigo: string | null = null, plantilla: string | null = 'recordatorio_service') =>
    ({ estado, error_codigo, plantilla });

eq('sin envíos: pendiente', estadoTarjeta([]), 'pendiente');
eq('salió uno: lista', estadoTarjeta([p('delivered')]), 'lista');
eq('leído también vale', estadoTarjeta([p('read')]), 'lista');
eq('el último frenado por pago: falta', estadoTarjeta([p('failed', '131042'), p('read')]), 'falta');
// Leira: 12 rechazos el 12 y 13-sep, cargó la tarjeta el 14 y desde ahí salen todos.
eq('cargó la tarjeta después del rechazo: lista', estadoTarjeta([p('read'), p('failed', '131042'), p('failed', '131042')]), 'lista');
eq('otro error no dice nada de la tarjeta', estadoTarjeta([p('failed', '131049'), p('read')]), 'lista');
eq('solo errores que no son de pago: pendiente', estadoTarjeta([p('failed', '131049')]), 'pendiente');
eq('un mensaje libre no prueba la tarjeta', estadoTarjeta([p('read', null, null)]), 'pendiente');
eq('una conversación libre tampoco', estadoTarjeta([p('read', null, 'conversacion')]), 'pendiente');
eq('en cola todavía no dice nada', estadoTarjeta([p('pendiente'), p('failed', '131042')]), 'falta');

console.log(`${ok} ok · ${fail} fallas`);
if (fail) process.exit(1);
