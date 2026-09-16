// Tests de quién firma cada service (el que tiene login y el que no).
//   ./node_modules/.bin/esbuild src/lib/quienFirma.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t2.cjs && node /tmp/t2.cjs
import { quienFirmaPatch, llaveDelFirmante, nombreDelFirmante, limpiarNombreFirmante, OTRO_FIRMANTE } from './quienFirma';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const UUID = '11111111-2222-3333-4444-555555555555';

eq('el que tiene usuario escribe mecanico_id y limpia el nombre',
    quienFirmaPatch(`u:${UUID}`), { mecanico_id: UUID, mecanico_nombre: null });
eq('el que no tiene usuario escribe el nombre y limpia el id',
    quienFirmaPatch('n:Leandro'), { mecanico_id: null, mecanico_nombre: 'Leandro' });
// Vacío = "sin registrar": no se pisa lo que ya estaba guardado con null.
eq('sin elegir a nadie no se toca ninguna columna', quienFirmaPatch(''), {});

eq('"Otro…" con un nombre escrito lo guarda como nombre suelto',
    quienFirmaPatch(OTRO_FIRMANTE, '  Juan   Carlos '), { mecanico_id: null, mecanico_nombre: 'Juan Carlos' });
eq('"Otro…" sin escribir nada no registra a nadie', quienFirmaPatch(OTRO_FIRMANTE, '   '), {});
eq('un nombre larguísimo se corta en 40', limpiarNombreFirmante('a'.repeat(60)).length, 40);

eq('agrupa por usuario', llaveDelFirmante({ mecanico_id: UUID }), `u:${UUID}`);
eq('agrupa por nombre', llaveDelFirmante({ mecanico_nombre: 'Leandro' }), 'n:Leandro');
eq('el id le gana al nombre si por algo estuvieran los dos',
    llaveDelFirmante({ mecanico_id: UUID, mecanico_nombre: 'Leandro' }), `u:${UUID}`);
eq('una orden sin firmar no entra en el reparto', llaveDelFirmante({}), null);
eq('un nombre en blanco no es una persona', llaveDelFirmante({ mecanico_nombre: '   ' }), null);

eq('muestra el nombre del usuario', nombreDelFirmante(`u:${UUID}`, { [UUID]: 'Ariel' }), 'Ariel');
eq('un usuario borrado no rompe la tabla', nombreDelFirmante(`u:${UUID}`, {}), 'Alguien que ya no está');
eq('muestra el nombre suelto tal cual', nombreDelFirmante('n:Leandro', {}), 'Leandro');

console.log(fail ? `\n❌ ${fail} fallaron, ${ok} pasaron` : `\n✅ ${ok} tests OK`);
process.exit(fail ? 1 : 0);
