/**
 * Tests del buscador de productos.
 * Se corren transpilando con esbuild a JS y ejecutando en node (no hay vitest en el proyecto):
 *   npx esbuild src/lib/buscadorProductos.test.ts --bundle --platform=node --outfile=/tmp/bp.cjs && node /tmp/bp.cjs
 *
 * Los casos salen de productos REALES del catálogo de Probikes (Contabilium) y
 * del historial real de servicio_items. Lo que se verifica no es que "encuentre
 * algo", sino que lo PRIMERO de la lista sea lo que el mecánico iba a elegir:
 * con 5.400 productos, un buscador que acierta en el puesto 7 no sirve.
 */
import { claveProducto, buscarProductos, resaltar, type ProductoTaller } from './buscadorProductos';

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string) {
    if (cond) passed++;
    else { failed++; fails.push(msg); }
}

const AHORA = Date.parse('2026-08-09T12:00:00Z');
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString();

let seq = 0;
function p(
    nombre: string,
    extra: Partial<ProductoTaller> = {}
): ProductoTaller {
    return {
        id: `p${++seq}`,
        nombre,
        clave: claveProducto(nombre),
        sku: null,
        precio: null,
        categoria: 'part',
        origen: 'contabilium',
        veces_usado: 0,
        ultima_vez: null,
        ...extra,
    };
}

const buscar = (cat: ProductoTaller[], q: string, o = {}) =>
    buscarProductos(cat, q, { ahora: AHORA, ...o });
const primero = (cat: ProductoTaller[], q: string, o = {}) => buscar(cat, q, o)[0]?.nombre;

// ─────────────────────────────────────────────────────────────────────────────
// A. La normalización tiene que dar IGUAL que public.clave_producto() en la base
//    (verificado contra la base el 9-ago-2026).
// ─────────────────────────────────────────────────────────────────────────────
ok(claveProducto('Pastillas de FRENO Shimano (B05S) — resina, 11v')
    === 'pastillas de freno shimano b05s resina 11v', 'A1: clave == la de la base');
ok(claveProducto('CÁMARA 29" válvula Presta') === 'camara 29 valvula presta', 'A2: acentos y comillas');
ok(claveProducto('  CN-HG601-11  ') === 'cn hg601 11', 'A3: guiones y espacios de sobra');
ok(claveProducto('///') === '', 'A4: puro símbolo → vacío');
ok(claveProducto('') === '', 'A5: vacío');

// ─────────────────────────────────────────────────────────────────────────────
// B. Búsqueda por prefijo, en cualquier orden (así tipea un mecánico apurado)
// ─────────────────────────────────────────────────────────────────────────────
const CAT_B = [
    p('PASTILLAS DE FRENO DE RESINA SHIMANO B05S', { sku: 'Y8VJ98010' }),
    p('PASTILLAS DE FRENO METALICAS SHIMANO G04S'),
    p('CADENA 11V SHIMANO CN-HG601-11', { sku: 'ICNHG60111116' }),
    p('CADENA 12V SHIMANO CN-M7100'),
    p('CAMARA SPECIALIZED 29 PRESTA'),
    p('2FO ROOST CLIP MTB SHOE BLK/GUM 43'),
];
ok(buscar(CAT_B, 'pastillas').length === 2, 'B1: "pastillas" trae las 2 pastillas');
ok(primero(CAT_B, 'past shim')?.startsWith('PASTILLAS'), 'B2: prefijos sueltos "past shim"');
ok(primero(CAT_B, 'shimano resina') === 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S',
    'B3: términos en orden inverso al del nombre');
ok(primero(CAT_B, 'b05s') === 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S', 'B4: por código de modelo');
ok(primero(CAT_B, 'cn-hg601') === 'CADENA 11V SHIMANO CN-HG601-11', 'B5: la puntuación no molesta');
ok(buscar(CAT_B, 'zzzz').length === 0, 'B6: sin resultados no inventa');
ok(buscar(CAT_B, '   ').length === 0, 'B7: espacios = consulta vacía (y nadie tiene uso acá)');

// El SKU se busca entero: quien lo escribe sabe exactamente qué quiere.
ok(primero(CAT_B, 'Y8VJ98010') === 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S', 'B8: por SKU exacto');
ok(primero(CAT_B, 'ICNHG601') === 'CADENA 11V SHIMANO CN-HG601-11', 'B9: por SKU parcial');

// ─────────────────────────────────────────────────────────────────────────────
// C. 🔴 EL NÚCLEO: lo que ESTE taller más usa va primero.
//    Es lo que hace útil un catálogo de 5.400 productos y lo que hace que el
//    taller sin ERP tenga buscador igual.
// ─────────────────────────────────────────────────────────────────────────────
const CAT_C = [
    p('CADENA 8V KMC Z8'),
    p('CADENA 9V SHIMANO CN-HG53'),
    p('CADENA 10V SHIMANO CN-HG54'),
    p('CADENA 11V SHIMANO CN-HG601-11', { veces_usado: 12, ultima_vez: hace(5), precio: 60022 }),
    p('CADENA 12V SHIMANO CN-M7100'),
    p('CADENA 12V SRAM NX EAGLE'),
];
ok(primero(CAT_C, 'cadena') === 'CADENA 11V SHIMANO CN-HG601-11',
    'C1: entre 6 cadenas gana la que el taller usa');
ok(primero(CAT_C, 'cad') === 'CADENA 11V SHIMANO CN-HG601-11', 'C2: idem con 3 letras');

// ...pero la frecuencia NO puede tapar un pedido explícito.
ok(primero(CAT_C, 'cadena 12v sram') === 'CADENA 12V SRAM NX EAGLE',
    'C3: si el texto es específico, manda el texto y no la costumbre');
ok(primero(CAT_C, 'kmc') === 'CADENA 8V KMC Z8', 'C4: término único gana aunque nunca se haya usado');

// Frecuencia con rendimiento decreciente: 70 usos no puede aplastar todo.
const CAT_C2 = [
    p('M.O.', { categoria: 'labor', veces_usado: 70, ultima_vez: hace(2) }),
    p('M.O. PURGADO DE FRENOS', { categoria: 'labor', veces_usado: 3, ultima_vez: hace(10) }),
];
ok(primero(CAT_C2, 'm.o. purgado', { categoria: 'labor' }) === 'M.O. PURGADO DE FRENOS',
    'C5: 70 usos no tapan un match específico');

// Ante frecuencia pareja, decide la recencia.
const CAT_C3 = [
    p('CUBIERTA SPECIALIZED PATHFINDER 700X38', { veces_usado: 4, ultima_vez: hace(400) }),
    p('CUBIERTA SPECIALIZED TURBO PRO 700X28', { veces_usado: 4, ultima_vez: hace(6) }),
];
ok(primero(CAT_C3, 'cubierta') === 'CUBIERTA SPECIALIZED TURBO PRO 700X28',
    'C6: a igual uso, gana la más reciente');

// ─────────────────────────────────────────────────────────────────────────────
// D. Consulta vacía = "lo que más usás". El caso más valioso: foco en el campo
//    y ya están los repuestos habituales, sin escribir nada.
// ─────────────────────────────────────────────────────────────────────────────
const CAT_D = [
    p('CAMARA 29', { veces_usado: 14, ultima_vez: hace(1) }),
    p('CINTA DE MANILLAR', { veces_usado: 12, ultima_vez: hace(3) }),
    p('PASTILLAS SRAM', { veces_usado: 11, ultima_vez: hace(2) }),
    p('2FO ROOST CLIP MTB SHOE BLK/GUM 39'),
    p('2FO ROOST CLIP MTB SHOE BLK/GUM 40'),
    p('ABSTRACT 5 PANEL PINCH FRONT HAT BLK OSFA'),
];
const sugeridos = buscar(CAT_D, '');
ok(sugeridos.length === 3, 'D1: sugiere solo lo que tiene historial de uso');
ok(sugeridos[0].nombre === 'CAMARA 29', 'D2: primero el más usado');
ok(!sugeridos.some(s => s.nombre.startsWith('2FO')), 'D3: NO lista catálogo frío alfabético');
ok(buscar([p('X'), p('Y')], '').length === 0, 'D4: taller sin historial → sin sugerencias');

// ─────────────────────────────────────────────────────────────────────────────
// E. El taller SIN integración: no hay catálogo importado, solo lo aprendido.
//    El buscador tiene que servirle igual.
// ─────────────────────────────────────────────────────────────────────────────
const CAT_E = [
    p('Pastillas de freno Shimano B05S', { origen: 'aprendido', veces_usado: 5, ultima_vez: hace(4), precio: 17893 }),
    p('Caja pedalera Shimano MT500', { origen: 'aprendido', veces_usado: 2, ultima_vez: hace(20), precio: 32000 }),
    p('Mano de Obra', { origen: 'aprendido', categoria: 'labor', veces_usado: 9, ultima_vez: hace(1), precio: 35000 }),
];
ok(primero(CAT_E, 'past') === 'Pastillas de freno Shimano B05S', 'E1: encuentra lo aprendido');
ok(buscar(CAT_E, 'shimano').length === 2, 'E2: dos aprendidos comparten marca');
ok(buscar(CAT_E, '')[0].nombre === 'Mano de Obra', 'E3: sugiere lo más usado del propio taller');
ok(buscar(CAT_E, '')[0].precio === 35000, 'E4: trae el precio aprendido para autocompletar');

// ─────────────────────────────────────────────────────────────────────────────
// F. Filtro por categoría: el renglón de repuesto no sugiere mano de obra.
// ─────────────────────────────────────────────────────────────────────────────
const CAT_F = [
    p('Regulacion de cambios', { categoria: 'labor', veces_usado: 20, ultima_vez: hace(1) }),
    p('CABLE DE CAMBIO SHIMANO', { categoria: 'part', veces_usado: 6, ultima_vez: hace(2) }),
];
ok(buscar(CAT_F, 'cambio', { categoria: 'part' }).length === 1, 'F1: repuestos no traen mano de obra');
ok(buscar(CAT_F, 'cambio', { categoria: 'part' })[0].nombre === 'CABLE DE CAMBIO SHIMANO', 'F2');
ok(buscar(CAT_F, 'cambio', { categoria: 'labor' })[0].nombre === 'Regulacion de cambios', 'F3: y al revés');
ok(buscar(CAT_F, 'cambio').length === 2, 'F4: sin filtro vienen las dos');

// ─────────────────────────────────────────────────────────────────────────────
// G. Errores de tipeo (segunda pasada). Se activa solo cuando la estricta no
//    encontró casi nada.
// ─────────────────────────────────────────────────────────────────────────────
const CAT_G = [
    p('PASTILLAS DE FRENO DE RESINA SHIMANO B05S'),
    p('CADENA 11V SHIMANO CN-HG601-11'),
];
ok(primero(CAT_G, 'pastila') === 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S', 'G1: "pastila" → pastillas');
ok(buscar(CAT_G, 'shimno').length === 2, 'G2: "shimno" → shimano (los dos productos la tienen)');
ok(primero(CAT_G, 'pastila shimno') === 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S',
    'G2b: dos términos mal tipeados a la vez');
ok(primero(CAT_G, 'cadna') === 'CADENA 11V SHIMANO CN-HG601-11', 'G3: "cadna" → cadena');
// Límite conocido y asumido: un error en la PRIMERA letra no se recupera
// (el bloqueo por primera letra es lo que mantiene la pasada difusa barata).
ok(buscar(CAT_G, 'sastillas').length === 0, 'G4: límite declarado — falla la 1ª letra, no matchea');

// ─────────────────────────────────────────────────────────────────────────────
// H. Resaltado: los tramos tienen que reconstruir el nombre EXACTO (si no, la
//    lista muestra el producto mutilado).
// ─────────────────────────────────────────────────────────────────────────────
const rearmar = (n: string, q: string) => resaltar(n, q).map(t => t.texto).join('');
const marcado = (n: string, q: string) => resaltar(n, q).filter(t => t.match).map(t => t.texto).join('');
const nfc = (s: string) => s.normalize('NFC');
ok(rearmar('PASTILLAS DE FRENO SHIMANO B05S', 'past shim') === 'PASTILLAS DE FRENO SHIMANO B05S',
    'H1: reconstruye el nombre');
ok(rearmar('CÁMARA 29" — válvula', 'camara') === nfc('CÁMARA 29" — válvula'), 'H2: con acentos y símbolos');
ok(rearmar('Cadena', '') === 'Cadena', 'H3: sin consulta');
ok(marcado('PASTILLAS DE FRENO', 'past') === 'PAST', 'H4: marca el prefijo y respeta mayúsculas');
ok(marcado('CÁMARA 29', 'camara') === nfc('CÁMARA'),
    'H5: el acento cuenta como su letra base, sin correr posiciones');
// Mismo nombre escrito en NFD (la «A» y la tilde como dos caracteres separados,
// como lo devuelve macOS): tiene que resaltar igual y no partirse a la mitad.
const enNFD = 'CA\u0301MARA 29';
ok(enNFD.length > nfc(enNFD).length, 'H5b-previo: el caso de prueba es realmente NFD');
ok(marcado(enNFD, 'camara') === nfc('CA\u0301MARA'), 'H5b: idem con el nombre en NFD');
ok(rearmar(enNFD, 'camara') === nfc(enNFD), 'H5c: y reconstruye entero');
ok(resaltar('FRENO DE FRENO', 'freno').filter(t => t.match).length === 2, 'H6: marca todas las apariciones');
// No debe marcar en el medio de una palabra: la búsqueda es por prefijo.
ok(resaltar('DESFRENADO', 'freno').every(t => !t.match), 'H7: no resalta adentro de una palabra');

// ─────────────────────────────────────────────────────────────────────────────
// I. Robustez (esto corre en la pantalla de carga de una orden: no puede tirar)
// ─────────────────────────────────────────────────────────────────────────────
ok(buscar([], 'lo que sea').length === 0, 'I1: catálogo vacío');
ok(buscar([{ ...p('x'), clave: '' }], 'x').length === 0, 'I2: fila con clave vacía se ignora');
ok(buscar(CAT_B, 'pastillas', { limite: 1 }).length === 1, 'I3: respeta el límite');
ok(buscar(CAT_C, 'cadena').every((x, i, a) => i === 0 || a[i - 1] !== x), 'I4: sin repetidos');
const dosVeces = JSON.stringify(buscar(CAT_C, 'cadena').map(x => x.id));
ok(dosVeces === JSON.stringify(buscar(CAT_C, 'cadena').map(x => x.id)), 'I5: determinístico');

console.log(`\nbuscadorProductos tests: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLARON:\n - ' + fails.join('\n - ')); process.exit(1); }
