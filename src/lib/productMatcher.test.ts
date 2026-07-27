/**
 * Tests del motor de entity resolution (productMatcher).
 * Se corren transpilando con esbuild a JS y ejecutando en node (no hay vitest en el proyecto).
 * Casos de oro derivados de descripciones REALES de servicio_items de Probikes.
 */
import { normalizeItem, isSameProduct, rankProducts, tokenSetScore, levenshtein } from './productMatcher';

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string) {
    if (cond) passed++;
    else { failed++; fails.push(msg); }
}
const same = (a: string, b: string) => isSameProduct(normalizeItem(a), normalizeItem(b));

// ── A. DEBEN colapsar (mismo producto, escrito distinto) ──
ok(same('Pastillas de freno Shimano', 'pastillas shimano'), 'pastillas: orden/caso');
ok(same('Pastillas de freno Shimano', 'past. freno shimano'), 'pastillas: abreviatura past.');
ok(same('Cadena Shimano HG601', 'Cadena Shimano HG601-11'), 'cadena HG601: sufijo -11');
ok(same('Cadena Shimano HG601', 'Cadena 11v Shimano CN-HG601-11'), 'cadena HG601: prefijo CN + 11v');
ok(same('Cadena Shimano HG601', 'Cadena Shimano HG-601-11'), 'cadena HG601: guiones');
ok(same('cadena sram nx', 'Cadena SRAM NX'), 'cadena NX: caso');
ok(same('cadena sram nx', 'Cadena Sram 12v NX'), 'cadena NX: +12v');
ok(same('Cinta de manubrio MTI STAR', 'Cinta de manillar MTI STAR'), 'cinta: manillar≡manubrio');
ok(same('Centrado rueda trasera', 'Centrado de rueda trasera'), 'centrado: stopword de');

// ── B. NO deben colapsar (productos distintos) ──
ok(!same('Cadena Shimano HG40', 'Cadena Shimano HG54'), 'cadena HG40 ≠ HG54');
ok(!same('Cadena Shimano HG40', 'Cadena Shimano HG601'), 'cadena HG40 ≠ HG601');
ok(!same('cadena sram nx', 'cadena sram gx'), 'cadena NX ≠ GX (tier)');
ok(!same('Pastillas de freno Shimano B05S', 'Pastillas de freno Shimano K05S'), 'pastillas B05S ≠ K05S');
ok(!same('Cadena 11v Shimano', 'Cadena 8v Shimano'), 'cadena 11v ≠ 8v');
ok(!same('Disco de freno Shimano CL-900 160mm', 'Disco de freno Shimano CL-900 140mm'), 'disco 160 ≠ 140mm');
ok(!same('Pastillas de freno Shimano', 'Cadena Shimano HG601'), 'pastilla ≠ cadena (ancla)');
ok(!same('Cámara 29', 'Cubierta 29'), 'camara ≠ cubierta (ancla)');

// ── C. Ranking colapsa variantes y cuenta bien ──
const dirty = [
    { name: 'Pastillas de freno Shimano', qty: 3 },
    { name: 'pastillas shimano', qty: 2 },
    { name: 'past. freno shimano', qty: 1 },
    { name: 'PASTILLAS DE FRENO SHIMANO', qty: 1 },
    { name: 'Cadena Shimano HG601', qty: 2 },
    { name: 'cadena shimano cn-hg601-11', qty: 1 },
    { name: 'Cadena Shimano HG40', qty: 2 },   // distinta → no se mezcla
    { name: 'asdas', qty: 5 },                 // basura → cluster propio, no contamina
];
const rank = rankProducts(dirty, 10);
const pastilla = rank.find(r => /pastilla/i.test(r.name));
const hg601 = rank.find(r => /hg601/i.test(r.name) || /601/.test(r.name));
const hg40 = rank.find(r => /hg40/i.test(r.name));
ok(!!pastilla && pastilla.count === 7, `pastillas colapsan a 7u (got ${pastilla?.count}, variants ${pastilla?.variants})`);
ok(!!pastilla && pastilla.variants === 4, `pastillas = 4 variantes colapsadas (got ${pastilla?.variants})`);
ok(!!hg601 && hg601.count === 3, `HG601 colapsa a 3u (got ${hg601?.count})`);
ok(!!hg40 && hg40.count === 2, `HG40 queda separado en 2u (got ${hg40?.count})`);

// ── C2. Regresiones de auditoría ──
// H1: códigos numéricos cortos idénticos SÍ colapsan (cámaras/cubiertas 29 son top sellers).
ok(same('Cámara 29', 'cámara 29'), 'H1: Cámara 29 idénticas colapsan');
ok(same('Cubierta 29', 'cubierta 29'), 'H1: Cubierta 29 idénticas colapsan');
ok(!same('Cámara 29', 'Cámara 26'), 'H1: Cámara 29 ≠ 26');
// H4: prefijo de código solo con sufijo de velocidad de 2 dígitos (no funde HG50 con HG500).
ok(!same('Piñón Shimano HG50', 'Piñón Shimano HG500'), 'H4: HG50 ≠ HG500');
ok(same('Cadena Shimano HG701', 'Cadena Shimano HG701-11'), 'H4: HG701 = HG701-11 (sufijo velocidad)');
// H5: material de pastilla es discriminante (resina ≠ metálica).
ok(!same('Pastilla de freno de resina', 'Pastilla de freno metalica'), 'H5: resina ≠ metálica');
// H6: plurales en -es no se sobre-recortan (cable/cables, parche/parches).
ok(same('Cable de freno', 'Cables de freno'), 'H6: cable = cables');
ok(same('Parche', 'Parches'), 'H6: parche = parches');
// H3: el ranking es invariante al orden de entrada (mismo multiset → mismo resultado).
const multiset = [
    { name: 'pastilla', qty: 1 },
    { name: 'pastilla freno shimano', qty: 1 },
    { name: 'pastilla metalica', qty: 1 },
];
const r1 = JSON.stringify(rankProducts(multiset, 10));
const r2 = JSON.stringify(rankProducts([multiset[2], multiset[0], multiset[1]], 10));
const r3 = JSON.stringify(rankProducts([multiset[1], multiset[2], multiset[0]], 10));
ok(r1 === r2 && r2 === r3, `H3: ranking invariante al orden (${r1 === r2 && r2 === r3})`);

// ── D. Utilidades ──
ok(levenshtein('kitten', 'sitting') === 3, 'levenshtein kitten/sitting=3');
ok(tokenSetScore(['a', 'b'], ['b', 'a']) === 1, 'tokenSet orden-invariante');

console.log(`\nproductMatcher tests: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FALLARON:\n - ' + fails.join('\n - ')); process.exit(1); }
