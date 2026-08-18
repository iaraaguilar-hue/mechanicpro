// Tests del detector de bici completa. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/biciDeCatalogo.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
// Los casos NO son inventados: salen del catálogo real de Probikes (agosto 2026).
import { biciDeCatalogo, talleDeBici, disciplinaDeBici } from './biciDeCatalogo';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

// ── El talle, en los dos formatos que usa el ERP ────────────────────────────
eq('ruta: talle al final', talleDeBici('ALLEZ E5 BRA SKYBLU/TARBLK 52'), '52');
eq('ruta: 49', talleDeBici('TARMAC SL8 COMP AXS REDTNT/SILDST 49'), '49');
eq('mtb: letra al final', talleDeBici('CHISEL BASE PST/WHT M'), 'M');
eq('mtb: talle ANTES del rodado', talleDeBici('ROCKHOPPER EXPERT EMDMET/SHDWSIL S - 29'), 'S');
eq('mtb: L antes del rodado', talleDeBici('ROCKHOPPER SPORT SMK/CLGRY L - 29'), 'L');
eq('sin talle', talleDeBici('HGR REV. 2 MTN. DERAILLEUR HANGER (DH-036) (SINGLE)'), null);
// El rodado NO es un talle: 27.5 no puede leerse como talle 27.
eq('rodado no es talle', talleDeBici('P.4 REDTNT/FRYRED/WHT 27.5'), null);
eq('rodado 20 de niños no es talle', talleDeBici('RIPROCK 20 SKYBLU/OIS/DSRTRS 20'), null);

// ── La disciplina ───────────────────────────────────────────────────────────
eq('tarmac = ruta', disciplinaDeBici('TARMAC SL8 EXPERT BRA SMK/OBSD 54'), 'ruta');
eq('diverge = gravel', disciplinaDeBici('DIVERGE E5 COMP SHDWSIL/FJDMET 52'), 'gravel');
eq('epic = mtb', disciplinaDeBici('EPIC WC EXPERT BDXMET/WHT/PRL S'), 'mtb');
eq('riprock = niños', disciplinaDeBici('RIPROCK 20 FLORED/CALSUN/ORGZST 20'), 'niños');
eq('desconocido', disciplinaDeBici('RIM DT-R470, 700C, FRONT & REAR'), null);

// ── Bici completa vs repuesto: el corazón del detector ───────────────────────
eq('bici de ruta', biciDeCatalogo({ nombre: 'TARMAC SL8 COMP DI2 CARB/WHT 54', stock: 1 }),
    { disciplina: 'ruta', talle: '54' });
eq('bici mtb con rodado', biciDeCatalogo({ nombre: 'ROCKHOPPER SPORT MRN/DPORG M - 29', stock: 1 }),
    { disciplina: 'mtb', talle: 'M' });
eq('bici sin talle legible igual es bici', biciDeCatalogo({ nombre: 'P.4 REDTNT/FRYRED/WHT 27.5', stock: 1 }),
    { disciplina: 'mtb', talle: null });

// Repuestos que el ERP archiva en el rubro "Bike" — ninguno es una bici.
for (const r of [
    'HGR MY18 ROAD DISC, ROAD THRU-AXLE 2.0 DERAILLEUR HANGER, W/ BOLT',
    'RIM STOUT XC, 29, REAR, ALLOY, 28H, DISC, 25MM INTERNAL',
    'STC 34.9MM SEATPOST CLAMP, BOLT-ON COLLAR, W/ STEEL BOLT',
    'SUB ROCKSHOX, MY18 EPIC BRAIN SHOCK, SERVICE KIT, 200HR DAMPER SERVICE KIT',
    'TOL PRAXIS BOTTOM BRACKET TOOL FOR M30 BB CUPS (TP-3028)',
    'AXL REAR, ROAD THRU-AXLE, 12X142MM, BOLT-ON',
    'HDS SUB, TARMAC SL7 COMPRESSION RING, W/ SHIM',
    'STM SUB, TARMAC SL7 STEM, CABLE BAT GUIDE & BOLT',
    'BAR SUB, SW AEROFLY II HANDLEBAR, CABLE TRANSITION KIT',
    'FORK WITH BRAIN 150 HR SERVICE',
]) eq(`repuesto descartado: ${r.slice(0, 34)}…`, biciDeCatalogo({ nombre: r, stock: 2 }), null);

// El cuadro suelto tampoco es una bici que se le pueda vender a un ciclista.
eq('frameset no es bici', biciDeCatalogo({ nombre: 'TARMAC SL8 SW FRMSET CARB/CYNBLUCMLN 52', stock: 1 }), null);

// Basura de ERP.
eq('PRUEBA 1', biciDeCatalogo({ nombre: 'PRUEBA 1', stock: 100000 }), null);
eq('PRUEBA 3', biciDeCatalogo({ nombre: 'PRUEBA 3', stock: 599985 }), null);
eq('XXX', biciDeCatalogo({ nombre: 'XXX', stock: 100 }), null);
eq('stock absurdo de un modelo real igual se descarta',
    biciDeCatalogo({ nombre: 'TARMAC SL8 COMP AXS CARB/WHT 52', stock: 5000 }), null);

console.log(`\n${fail === 0 ? '✅' : '❌'} biciDeCatalogo: ${ok} ok, ${fail} fallaron`);
if (fail) process.exit(1);
