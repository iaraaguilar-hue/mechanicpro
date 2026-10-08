// Tests del aviso de prueba del Taller Activo (8-oct-2026). Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/avisoDePrueba.test.ts --bundle --platform=node --format=cjs --alias:@=./src --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// Los casos salen de los dos talleres en prueba del 8-oct-2026, con sus datos reales:
//   · Bike Pro Alvear: 21 días desde el 23-sep a las 00:00 AR (extendida), 10 de 10 órdenes en OTRO.
//   · Private Garage Workshop: 15 días desde su primera orden (25-sep 19:20 AR), 4 de 6 en OTRO.
import { avisoDePrueba, loQueFalta, ordenesSinMenu, ordenSinServiceDelMenu } from './avisoDePrueba';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};
const ms = (iso: string) => Date.parse(iso);
const ids = (p: { id: string }[]) => p.map(x => x.id);

const MENU = [{ nombre: 'Service completo', activo: true }, { nombre: 'Service s/caja y dirección', activo: true }];
const ordenes = (tipos: string[], desde = '2026-09-23T13:00:00Z') =>
    tipos.map((t, i) => ({ tipo_servicio: t, fecha_ingreso: new Date(ms(desde) + i * 3_600_000).toISOString() }));

// ── Bike Pro hoy (8-oct-2026, 15:00 AR) ──────────────────────────────────────
const BP = { plan_actual: 'Expert', prueba_dias: 21, prueba_inicio_at: '2026-09-23T03:00:00.000Z', wa_activo: false, wa_phone_number_id: null, config_turnos: {} };
const HOY = ms('2026-10-08T18:00:00Z');
const bp = avisoDePrueba(BP, ordenes(Array(10).fill('OTRO')), MENU, HOY)!;
eq('BP: título con los días que quedan contando hoy (8 al 13)', bp.titulo, 'Te quedan 6 días de prueba');
eq('BP: extendida conserva el texto de siempre', bp.texto.startsWith('Extendimos tu prueba gratuita hasta el martes 13 de octubre inclusive'), true);
eq('BP: falta WhatsApp, menú y turnos', ids(bp.pendientes), ['whatsapp', 'menu', 'turnos']);
eq('BP: el menú dice cuántas quedaron como OTRO', bp.pendientes[1].detalle, 'El precio sale solo. Tus últimas 10 órdenes quedaron como OTRO.');
eq('BP: a 6 días no hay contacto', bp.contacto, false);
// Los últimos 2 días: lunes 12 y martes 13.
eq('BP: domingo 11 todavía no', avisoDePrueba(BP, [], MENU, ms('2026-10-12T02:59:00Z'))!.contacto, false);
const bpLunes = avisoDePrueba(BP, [], MENU, ms('2026-10-12T03:00:00Z'))!;
eq('BP: lunes 12 a las 00:00 aparece el contacto', [bpLunes.contacto, bpLunes.titulo], [true, 'Te quedan 2 días de prueba']);
const bpMartes = avisoDePrueba(BP, [], MENU, ms('2026-10-14T02:59:00Z'))!;
eq('BP: martes 13 a las 23:59 es el último día', [bpMartes.contacto, bpMartes.titulo], [true, 'Hoy es el último día de prueba']);
eq('BP: miércoles 14 vencida, sin aviso (la tapa AccesoSuspendido)', avisoDePrueba(BP, [], MENU, ms('2026-10-14T03:00:00Z')), null);

// ── Private Garage con el reloj puesto: 15 días desde su primera orden ───────
const PG = { plan_actual: 'Expert', prueba_dias: 15, prueba_inicio_at: '2026-09-25T22:20:08.202Z', wa_activo: false, wa_phone_number_id: null, config_turnos: {} };
const pgOrdenes = ordenes(['OTRO', 'OTRO', 'Desarme Manija C/U', 'OTRO', 'OTRO', 'Service Elite - Doble Suspension'], '2026-09-25T22:20:00Z');
const pg = avisoDePrueba(PG, pgOrdenes, [{ nombre: 'Service Elite - Doble Suspension', activo: true }], HOY)!;
eq('PG: jueves 8 → quedan jueves, viernes y sábado', pg.titulo, 'Te quedan 3 días de prueba');
eq('PG: corta a una hora que no es medianoche: se dice la hora', pg.texto, 'Tu prueba gratuita termina el sábado 10 de octubre a las 19:20.');
eq('PG: falta WhatsApp, menú (4 de 6) y turnos', ids(pg.pendientes), ['whatsapp', 'menu', 'turnos']);
eq('PG: el menú dice 4 de 6', pg.pendientes[1].detalle, 'El precio sale solo. 4 de tus últimas 6 órdenes quedaron como OTRO.');
eq('PG: jueves sin contacto', pg.contacto, false);
eq('PG: viernes 9 a las 00:00 aparece el contacto', avisoDePrueba(PG, [], null, ms('2026-10-09T03:00:00Z'))!.contacto, true);
const pgSabado = avisoDePrueba(PG, [], null, ms('2026-10-10T13:00:00Z'))!;
eq('PG: sábado es el último día y dice a qué hora', [pgSabado.titulo, pgSabado.texto], ['Hoy es el último día de prueba', 'Tu prueba gratuita termina hoy a las 19:20.']);
eq('PG: sábado 19:20 en punto, vencida', avisoDePrueba(PG, [], null, ms('2026-10-10T22:20:08.202Z')), null);

// ── 15 días de siempre que cortan a la medianoche ────────────────────────────
const MEDIA = { plan_actual: 'Expert', prueba_dias: 15, prueba_inicio_at: '2026-10-01T03:00:00.000Z' };
eq('medianoche: va hasta el día inclusive', avisoDePrueba(MEDIA, [], null, HOY)!.texto, 'Tu prueba gratuita va hasta el jueves 15 de octubre inclusive.');
eq('medianoche: el último día', avisoDePrueba(MEDIA, [], null, ms('2026-10-15T20:00:00Z'))!.texto, 'Tu prueba gratuita termina hoy a la medianoche.');

// ── Control negativo: quién NO ve el aviso ───────────────────────────────────
eq('paga: sin aviso', avisoDePrueba({ ...BP, prueba_dias: null }, [], MENU, HOY), null);
eq('en prueba sin cargar nada: sin aviso', avisoDePrueba({ ...BP, prueba_inicio_at: null }, [], MENU, HOY), null);
eq('cortado a mano: sin aviso', avisoDePrueba({ ...BP, acceso_suspendido_at: '2026-10-08T12:00:00Z' }, [], MENU, HOY), null);
eq('sin taller: sin aviso', avisoDePrueba(null, [], MENU, HOY), null);

// ── Lo hecho no aparece ──────────────────────────────────────────────────────
const todoHecho = { ...BP, wa_activo: true, wa_phone_number_id: '123', config_turnos: { habilitado: true } };
eq('todo hecho: solo la cuenta regresiva', avisoDePrueba(todoHecho, ordenes(['Service completo', 'Service completo', 'OTRO']), MENU, HOY)!.pendientes, []);
eq('WhatsApp a medias (activo sin número) sigue faltando', ids(loQueFalta({ ...todoHecho, wa_phone_number_id: null }, [], MENU)), ['whatsapp']);
eq('Sport: ni WhatsApp ni turnos (su plan no los muestra)', ids(loQueFalta({ plan_actual: 'Sport' }, [], null)), []);

// ── La señal del menú ────────────────────────────────────────────────────────
eq('OTRO, vacío y OTHER son "sin service del menú"', [ordenSinServiceDelMenu('OTRO'), ordenSinServiceDelMenu(' otro '), ordenSinServiceDelMenu(null), ordenSinServiceDelMenu('OTHER'), ordenSinServiceDelMenu('Service completo')], [true, true, true, true, false]);
eq('menú todavía sin cargar (null): no se aconseja', ordenesSinMenu(ordenes(['OTRO', 'OTRO', 'OTRO']), null), null);
eq('menú vacío: no se aconseja elegir de un menú que no existe', ordenesSinMenu(ordenes(['OTRO', 'OTRO', 'OTRO']), []), null);
eq('menú con solo OTRO o desactivados: tampoco', ordenesSinMenu(ordenes(['OTRO', 'OTRO', 'OTRO']), [{ nombre: 'OTRO', activo: true }, { nombre: 'Service', activo: false }]), null);
eq('menos de 3 órdenes: no hay costumbre que leer', ordenesSinMenu(ordenes(['OTRO', 'OTRO']), MENU), null);
eq('la mitad justa no es la mayoría', ordenesSinMenu(ordenes(['OTRO', 'OTRO', 'Service completo', 'Service completo']), MENU), null);
eq('mira solo las 10 más nuevas', ordenesSinMenu(ordenes([...Array(10).fill('OTRO'), ...Array(10).fill('Service completo')]), MENU), null);
eq('las 10 más nuevas en OTRO', ordenesSinMenu(ordenes([...Array(10).fill('Service completo'), ...Array(10).fill('OTRO')]), MENU), { sinMenu: 10, miradas: 10 });

// ── Sin planes ni precios en nada de lo que se dice ──────────────────────────
const todo = [bp, pg, bpMartes, pgSabado].flatMap(a => [a.titulo, a.texto, ...a.pendientes.flatMap(p => [p.titulo, p.detalle, p.boton])]).join(' | ');
eq('ni "$" ni nombres de plan', /\$|\b(Sport|Pro|Expert)\b/.test(todo.replace(/Mechanic Pro/g, '')), false);
eq('ni comillas latinas', /[\u00AB\u00BB]/.test(todo), false);

console.log(`${ok} ok · ${fail} fallas`);
if (fail) process.exit(1);
