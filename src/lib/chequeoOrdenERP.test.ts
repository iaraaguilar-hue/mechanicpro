// Tests del candado pre-finalización (la orden de venta al ERP). Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/chequeoOrdenERP.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// 🚩 Regla de la casa: un candado nuevo se prueba contra el caso que DICE cazar
// Y contra uno que NO debe cazar. Acá los dos casos que caza son reales
// (órdenes 311 y 319 de Probikes, 20-ago-2026) y los datos del catálogo son los
// que tiene la base de verdad.
import {
    chequearOrdenParaERP,
    clavesAChequear,
    itemsQueVanAlERP,
    estaVinculadoAlERP,
    esItemMercadoLibre,
    sugerirProductoERP,
    vieneComoRepuesto,
    VECES_PART_MINIMO,
    type VinculoProducto,
} from './chequeoOrdenERP';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

// ── El catálogo real de Probikes, en chiquito ───────────────────────────────
// Los tres primeros son productos del ERP (origen contabilium, con SKU e id).
// El cuarto es el huérfano que aprendió el buscador y hundió la orden 319.
const CATALOGO: Record<string, VinculoProducto> = {
    'pv tube 700x20 28 48mm': { nombre: 'PV TUBE 700X20-28 48MM', sku: '030-01305', id_externo: '11527598', origen: 'contabilium' },
    'camara arisun duro 29x1 75 vpresta caja': { nombre: 'CAMARA ARISUN/DURO 29X1.75 VPRESTA CAJA', sku: '01573', id_externo: '21094687', origen: 'contabilium' },
    'pastillas de freno shimano b05s': { nombre: 'PASTILLAS DE FRENO SHIMANO B05S', sku: '00921', id_externo: '11500001', origen: 'contabilium' },
    'camara specialized ruta 20 28 48mm': { nombre: 'Camara Specialized Ruta 20-28 48mm', sku: null, id_externo: null, origen: 'aprendido' },
};
const vinculos = new Map(Object.entries(CATALOGO));

const chequear = (items: any[], opciones: { erpActivo?: boolean; sugerir?: (d: string) => string | null } = {}) =>
    chequearOrdenParaERP({
        items,
        vinculos,
        erpActivo: opciones.erpActivo ?? true,
        sugerir: opciones.sugerir,
    });

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE TIENE QUE CAZAR
// ─────────────────────────────────────────────────────────────────────────────

// ── Orden 311: un renglón de repuesto guardado con la descripción VACÍA ──────
{
    const avisos = chequear([{ descripcion: '', categoria: 'part', precio: 50288 }]);
    eq('311: caza un aviso', avisos.length, 1);
    eq('311: es del tipo sin_nombre', avisos[0].tipo, 'sin_nombre');
    eq('311: nombra el precio del renglón', avisos[0].precio, 50288);
    eq('311: un solo renglón', avisos[0].veces, 1);
}

// Un renglón con solo espacios es lo mismo que uno vacío.
eq('311 bis: espacios cuentan como vacío',
    chequear([{ descripcion: '   ', categoria: 'part', precio: 100 }]).map(a => a.tipo), ['sin_nombre']);

// Y vale también para mano de obra, y en un taller SIN ERP: un renglón sin
// nombre sale en blanco en el comprobante del cliente igual.
eq('sin nombre vale para labor y sin ERP',
    chequear([{ descripcion: '', categoria: 'labor', precio: 30000 }], { erpActivo: false }).map(a => a.tipo),
    ['sin_nombre']);

// ── Orden 319: el producto aprendido, sin SKU ni id del ERP, DOS veces ───────
{
    const avisos = chequear([
        { descripcion: 'Ruleman inferior dirección', categoria: 'labor', precio: 30000 },
        { descripcion: 'Camara Specialized Ruta 20-28 48mm', categoria: 'part', precio: 12500 },
        { descripcion: 'Camara Specialized Ruta 20-28 48mm', categoria: 'part', precio: 12500 },
    ], { sugerir: (d) => (/camara/i.test(d) ? 'PV TUBE 700X20-28 48MM' : null) });

    eq('319: UN aviso, no dos por el mismo repuesto', avisos.length, 1);
    eq('319: es del tipo sin_vinculo', avisos[0].tipo, 'sin_vinculo');
    eq('319: cita el ítem tal cual', avisos[0].descripcion, 'Camara Specialized Ruta 20-28 48mm');
    eq('319: dice que eran dos renglones', avisos[0].veces, 2);
    eq('319: suma los dos precios', avisos[0].precio, 25000);
    eq('319: sugiere el producto del ERP', avisos[0].sugerencia, 'PV TUBE 700X20-28 48MM');
}

// Un repuesto que ni siquiera está en el catálogo del taller: mismo aviso.
eq('repuesto desconocido también avisa',
    chequear([{ descripcion: 'Puños ESI Chunky', categoria: 'part', precio: 50288 }]).map(a => a.tipo),
    ['sin_vinculo']);

// Sin sugerencia disponible el aviso igual sale (no calla por no tener el reemplazo).
{
    const avisos = chequear([{ descripcion: 'Puños ESI Chunky', categoria: 'part', precio: 50288 }], { sugerir: () => null });
    eq('sin sugerencia igual avisa', avisos.length, 1);
    eq('sugerencia queda en null', avisos[0].sugerencia, null);
}

// Los dos defectos juntos en una misma orden salen los dos.
eq('una orden puede tener los dos defectos',
    chequear([
        { descripcion: '', categoria: 'part', precio: 50288 },
        { descripcion: 'Camara Specialized Ruta 20-28 48mm', categoria: 'part', precio: 12500 },
    ]).map(a => a.tipo),
    ['sin_nombre', 'sin_vinculo']);

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE **NO** TIENE QUE CAZAR (si esto falla, el candado grita en cada orden
// sana y en dos semanas el mecánico lo ignora como el ruido que es)
// ─────────────────────────────────────────────────────────────────────────────

// Una orden sana: repuesto del ERP + mano de obra. Cero avisos.
eq('orden sana: ni un aviso',
    chequear([
        { descripcion: 'PV TUBE 700X20-28 48MM', categoria: 'part', precio: 12500 },
        { descripcion: 'Service completo', categoria: 'labor', precio: 90000 },
    ]), []);

// El nombre no tiene que venir clavado: la clave normaliza mayúsculas, tildes y signos.
eq('el mismo producto escrito distinto sigue estando vinculado',
    chequear([{ descripcion: 'pv tube 700x20-28  48mm', categoria: 'part', precio: 12500 }]), []);

eq('tildes y barras no rompen el match',
    chequear([{ descripcion: 'Camara Arisun/Duro 29x1.75 Vpresta Caja', categoria: 'part', precio: 8000 }]), []);

// La mano de obra NO viaja al ERP: no se chequea su vínculo aunque no exista.
eq('la mano de obra no se chequea contra el ERP',
    chequear([{ descripcion: 'Ruleman inferior dirección', categoria: 'labor', precio: 30000 }]), []);

// Los productos de Mercado Libre se facturan por otro lado: tampoco viajan.
eq('Mercado Libre no se chequea',
    chequear([{ descripcion: 'Cubierta Pirelli (ML)', categoria: 'part', precio: 60000 }]), []);
eq('la otra forma de escribirlo tampoco',
    chequear([{ descripcion: 'Cubierta Pirelli (Mercado Libre)', categoria: 'part', precio: 60000 }]), []);

// Un taller SIN webhook al ERP no recibe avisos de vínculo (no tiene ERP que romper).
eq('taller sin ERP: nada de vínculos',
    chequear([{ descripcion: 'Camara Specialized Ruta 20-28 48mm', categoria: 'part', precio: 12500 }], { erpActivo: false }),
    []);

// Una orden sin ítems (solo el service base) no molesta a nadie.
eq('orden sin ítems', chequear([]), []);
eq('items en null', chequearOrdenParaERP({ items: null, vinculos, erpActivo: true }), []);

// ── El filtro que baja el ruido del 54% al 25% ──────────────────────────────
// Si un matcher por texto del otro lado lo encuentra igual, no hay riesgo y no
// se avisa. Medido contra las últimas 120 órdenes reales de Probikes.

// Caso real silenciado: no está vinculado, pero en el ERP existe
// "PINONES A CASSETTE SHIMANO ACERA CS-HG200-9" y el texto lo encuentra.
eq('encontrable por texto: no avisa',
    chequearOrdenParaERP({
        items: [{ descripcion: 'Piñón a cassette Shimano Acera CS-HG200-9', categoria: 'part', precio: 40000 }],
        vinculos, erpActivo: true,
        encontrableEnERP: () => true,
    }), []);

// 🔴 Y el caso 319 SIGUE avisando aunque el filtro esté puesto: no comparte una
// sola palabra con el nombre del ERP, así que ningún matcher por texto lo halla.
eq('319: el filtro NO lo silencia',
    chequearOrdenParaERP({
        items: [{ descripcion: 'Camara Specialized Ruta 20-28 48mm', categoria: 'part', precio: 12500 }],
        vinculos, erpActivo: true,
        encontrableEnERP: (d) => d.includes('PV TUBE'),   // el buscador real no lo encuentra
    }).map(a => a.tipo), ['sin_vinculo']);

// El renglón SIN NOMBRE no se silencia nunca: no hay texto que buscar.
eq('311: el filtro no toca el renglón sin nombre',
    chequearOrdenParaERP({
        items: [{ descripcion: '', categoria: 'part', precio: 50288 }],
        vinculos, erpActivo: true,
        encontrableEnERP: () => true,
    }).map(a => a.tipo), ['sin_nombre']);

// ─────────────────────────────────────────────────────────────────────────────
// Las piezas sueltas
// ─────────────────────────────────────────────────────────────────────────────

eq('vinculado por id_externo', estaVinculadoAlERP({ nombre: 'x', id_externo: '123', sku: null }), true);
eq('vinculado por SKU solo', estaVinculadoAlERP({ nombre: 'x', id_externo: null, sku: '030-01305' }), true);
eq('id vacío no vincula', estaVinculadoAlERP({ nombre: 'x', id_externo: '  ', sku: '' }), false);
eq('sin producto no vincula', estaVinculadoAlERP(undefined), false);

eq('esItemMercadoLibre', [
    esItemMercadoLibre('Cubierta (ML)'),
    esItemMercadoLibre('Cubierta (Mercado Libre)'),
    esItemMercadoLibre('Cubierta ML Continental'),   // "ML" sin paréntesis NO es Mercado Libre
    esItemMercadoLibre(null),
], [true, true, false, false]);

// El filtro del candado es el MISMO que arma el payload del webhook.
eq('itemsQueVanAlERP filtra labor y ML',
    itemsQueVanAlERP([
        { descripcion: 'PV TUBE 700X20-28 48MM', categoria: 'part' },
        { descripcion: 'Service', categoria: 'labor' },
        { descripcion: 'Cubierta (ML)', categoria: 'part' },
    ]).map(i => i.descripcion),
    ['PV TUBE 700X20-28 48MM']);

// Las claves que hay que ir a buscar: sin duplicados y sin vacíos.
// 🔴 Cambió el 28-ago-2026: antes traía SOLO las que viajan al ERP. Ahora también
// las de mano de obra, porque el aviso "esto parece un repuesto" necesita la fila
// del catálogo de ESE ítem. Sin esto el chequeo nuevo no podría disparar nunca.
eq('clavesAChequear: las que viajan Y las de mano de obra',
    clavesAChequear([
        { descripcion: 'Camara Specialized Ruta 20-28 48mm', categoria: 'part' },
        { descripcion: 'Camara Specialized Ruta 20-28 48mm', categoria: 'part' },
        { descripcion: '', categoria: 'part' },
        { descripcion: 'Service', categoria: 'labor' },
        { descripcion: 'PV TUBE 700X20-28 48MM', categoria: 'part' },
    ]),
    ['camara specialized ruta 20 28 48mm', 'pv tube 700x20 28 48mm', 'service']);

// ─────────────────────────────────────────────────────────────────────────────
// El sugeridor ("¿no será este otro?")
// Los casos salen de una corrida contra los 5.634 productos reales de Probikes.
// ─────────────────────────────────────────────────────────────────────────────

const CAT_SUG = [
    { nombre: 'PV TUBE 700X20-28 48MM', sku: '030-01305', id_externo: '11527598' },
    { nombre: 'PV TUBE 700X20-28 60MM', sku: '030-01306', id_externo: '11527599' },
    { nombre: 'DISCO DE FRENO SHIMANO RT-CL900 140MM', sku: '00810', id_externo: '11500810' },
    { nombre: 'DISCO DE FRENO SHIMANO SM-RT64 140MM', sku: '00811', id_externo: '11500811' },
    { nombre: 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S', sku: '00921', id_externo: '11500921' },
    // Sin SKU ni id: es un huérfano, jamás puede ser la sugerencia.
    { nombre: 'Camara Specialized Ruta 20-28 48mm', sku: null, id_externo: null, origen: 'aprendido' },
];

const sug = (d: string) => sugerirProductoERP(d, CAT_SUG);

// El caso 319: no comparten UNA palabra de texto, comparten las medidas.
eq('319: sugiere el tubo del ERP por la medida', sug('Camara Specialized Ruta 20-28 48mm'), 'PV TUBE 700X20-28 48MM');
eq('319: no sugiere el de 60mm', sug('Camara Specialized Ruta 20-28 48mm') === 'PV TUBE 700X20-28 60MM', false);

// El número que NO está manda: CL-900 no es SM-RT64 aunque compartan todo lo demás.
eq('el modelo desempata sobre la medida', sug('Disco de freno Shimano CL-900 140mm'), 'DISCO DE FRENO SHIMANO RT-CL900 140MM');

// Sin medidas no se arriesga a sugerir nada.
eq('sin números no sugiere', sug('Puños ESI Chunky'), null);
eq('mano de obra no sugiere', sug('Ruleman inferior dirección'), null);
eq('descripción vacía no sugiere', sug(''), null);

// Una sola coincidencia numérica no alcanza (si no, "29" sugiere media bicicletería).
eq('un número suelto no alcanza', sug('Rodado 140mm'), null);

// La sugerencia SIEMPRE es un producto del ERP, nunca otro huérfano.
eq('nunca sugiere un huérfano', sug('Camara Specialized Ruta 20-28 48mm') !== 'Camara Specialized Ruta 20-28 48mm', true);

eq('acierta el nombre largo del ERP', sug('Pastillas de freno Shimano B05S'), 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S');

// Y enchufado al chequeo completo: el aviso de la 319 viene con su sugerencia.
{
    const avisos = chequearOrdenParaERP({
        items: [{ descripcion: 'Camara Specialized Ruta 20-28 48mm', categoria: 'part', precio: 12500 }],
        vinculos,
        erpActivo: true,
        sugerir: (d) => sugerirProductoERP(d, CAT_SUG),
    });
    eq('el candado entero sugiere el reemplazo', avisos[0]?.sugerencia, 'PV TUBE 700X20-28 48MM');
}


// ─────────────────────────────────────────────────────────────────────────────
// "ESTO PARECE UN REPUESTO, NO MANO DE OBRA" — la orden 318 (28-ago-2026)
//
// Los números de acá NO son inventados: salen de contar los 586 ítems reales de
// Probikes el 28-ago-2026. Por eso los contraejemplos valen tanto como el caso
// que caza: son los que fijaron el umbral en 2.
// ─────────────────────────────────────────────────────────────────────────────

const CAT_318 = new Map<string, VinculoProducto>(Object.entries({
    // El caso real: 6 veces repuesto, 1 vez mano de obra (esa 1 es la 318).
    'pastillas de freno de resina shimano k05s': {
        nombre: 'Pastillas de freno de resina Shimano K05S', origen: 'aprendido',
        veces_part: 6, veces_labor: 1,
    },
    // 15 y 1: la señal más fuerte del catálogo.
    'recarga tubeless x2': { nombre: 'Recarga tubeless x2', origen: 'aprendido', veces_part: 15, veces_labor: 1 },
    // Justo en el umbral: 2 y 1 avisa.
    'recarga liquido tubeless x2': { nombre: 'Recarga liquido tubeless x2', origen: 'aprendido', veces_part: 2, veces_labor: 1 },
    // CONTRAEJEMPLO 1 — empate 1 a 1: no hay señal, no se molesta a nadie.
    'centrado 1 rueda': { nombre: 'Centrado 1 Rueda', origen: 'aprendido', veces_part: 1, veces_labor: 1 },
    // CONTRAEJEMPLO 2 — el caso inverso: mano de obra que UNA vez se cargó como
    // repuesto. 1 contra 70. Si esto avisara, el aviso saltaría todo el día.
    'm o': { nombre: 'M.O.', origen: 'aprendido', veces_part: 1, veces_labor: 70 },
    // CONTRAEJEMPLO 3 — un repuesto que nunca se cargó mal: no aplica.
    'pastillas de freno shimano b05s': {
        nombre: 'PASTILLAS DE FRENO SHIMANO B05S', sku: '00921', id_externo: '11500001',
        origen: 'contabilium', veces_part: 22, veces_labor: 0,
    },
}));

const chequear318 = (items: any[], erpActivo = true) =>
    chequearOrdenParaERP({ items, vinculos: CAT_318, erpActivo });

// ── La regla suelta ──────────────────────────────────────────────────────────
eq('6 part / 1 labor → parece repuesto', vieneComoRepuesto(CAT_318.get('pastillas de freno de resina shimano k05s')), true);
eq('2 part / 1 labor → parece repuesto (el umbral justo)', vieneComoRepuesto(CAT_318.get('recarga liquido tubeless x2')), true);
eq('1 part / 1 labor → empate, NO avisa', vieneComoRepuesto(CAT_318.get('centrado 1 rueda')), false);
eq('1 part / 70 labor → es mano de obra, NO avisa', vieneComoRepuesto(CAT_318.get('m o')), false);
eq('producto desconocido → NO avisa', vieneComoRepuesto(undefined), false);
eq('sin contadores → NO avisa', vieneComoRepuesto({ nombre: 'X' }), false);
eq('el umbral es 2', VECES_PART_MINIMO, 2);

// ── La orden 318 reconstruida tal cual está en la base ───────────────────────
{
    const avisos = chequear318([
        { descripcion: 'Pastillas de freno de resina Shimano K05S', categoria: 'labor', precio: 18935 },
    ]);
    eq('318: avisa', avisos.length, 1);
    eq('318: el tipo', avisos[0]?.tipo, 'parece_repuesto');
    eq('318: cita el ítem', avisos[0]?.descripcion, 'Pastillas de freno de resina Shimano K05S');
    eq('318: cita el precio', avisos[0]?.precio, 18935);
    eq('318: dice cuántas veces fue repuesto', avisos[0]?.vecesComoRepuesto, 6);
}

// ── Lo que NO tiene que hacer ruido ──────────────────────────────────────────
eq('el mismo ítem como repuesto no avisa',
    chequear318([{ descripcion: 'Pastillas de freno de resina Shimano K05S', categoria: 'part', precio: 18935 }])
        .filter(a => a.tipo === 'parece_repuesto').length, 0);

eq('la mano de obra de verdad no avisa',
    chequear318([{ descripcion: 'M.O.', categoria: 'labor', precio: 30000 }]).length, 0);

eq('el empate no avisa',
    chequear318([{ descripcion: 'Centrado 1 Rueda', categoria: 'labor', precio: 40000 }]).length, 0);

eq('un trabajo que no está en el catálogo no avisa',
    chequear318([{ descripcion: 'Purgado de frenos', categoria: 'labor', precio: 25000 }]).length, 0);

eq('sin ERP no se avisa (no hay orden de venta que perder)',
    chequear318([{ descripcion: 'Recarga tubeless x2', categoria: 'labor', precio: 8000 }], false).length, 0);

// ── Dos renglones iguales = UN aviso (la lección de la 319) ──────────────────
{
    const avisos = chequear318([
        { descripcion: 'Recarga tubeless x2', categoria: 'labor', precio: 8000 },
        { descripcion: 'Recarga tubeless x2', categoria: 'labor', precio: 8000 },
    ]);
    eq('dos renglones iguales dan un solo aviso', avisos.length, 1);
    eq('...con las dos veces contadas', avisos[0]?.veces, 2);
    eq('...y la plata sumada', avisos[0]?.precio, 16000);
}

// ── El renglón sin nombre no se avisa dos veces ──────────────────────────────
{
    const avisos = chequear318([{ descripcion: '   ', categoria: 'labor', precio: 5000 }]);
    eq('sin nombre: un solo aviso', avisos.length, 1);
    eq('sin nombre: gana el aviso de siempre', avisos[0]?.tipo, 'sin_nombre');
}

// ── clavesAChequear tiene que pedir también las de mano de obra ──────────────
// Si no, el lookup no trae la fila del catálogo y el chequeo queda MUDO.
{
    const claves = clavesAChequear([
        { descripcion: 'Pastillas de freno de resina Shimano K05S', categoria: 'labor', precio: 18935 },
    ]);
    eq('pide la clave del ítem de mano de obra', claves.includes('pastillas de freno de resina shimano k05s'), true);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} chequeoOrdenERP: ${ok} ok, ${fail} fallaron`);
if (fail) process.exit(1);
