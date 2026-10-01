/**
 * ¿EL BUSCADOR DE REPUESTOS ENCUENTRA POR SKU? (1-oct-2026)
 *
 * 🔴 POR QUÉ EXISTE: Iara pidió "que encuentre productos por SKU". El buscador ya
 * comparaba el SKU, pero CON el guion: medido sobre los 1.952 SKU de Probikes,
 * escrito sin guion ("210230613" por 21023-0613) encontraba el 0,2%, y por un
 * pedazo del código ("M8100" de EPDM8100, "0613") alrededor del 1%. Los tests de
 * `buscadorProductos.test.ts` miden el motor; este mide lo que VE el mecánico en
 * la orden: que el repuesto aparezca primero en la lista, que el SKU venga
 * marcado, y que el campo diga que se puede buscar por SKU.
 *
 * NO TOCA DATOS DEL DEMO: el Demo solo tiene SKU en bicis, que el buscador de
 * repuestos no muestra. Se intercepta la respuesta de `productos_taller` y se le
 * da a la pantalla un pedazo del catálogo de Probikes con códigos reales (mismo
 * molde que qa_sin_whatsapp: `route.fulfill`). La orden no se confirma.
 *
 * CONTROL NEGATIVO, dos:
 *   · "1290" NO tiene que traer la abrazadera 2812-9050 (sin el guion el código
 *     "contiene" 1290, pero nadie lee así una etiqueta).
 *   · con un catálogo SIN códigos (el taller que no tiene ERP), el campo NO habla
 *     de SKU.
 *
 *   npm run dev  (en otra terminal)
 *   MP_DEMO_PASSWORD=… node qa_buscador_sku.cjs
 */
const fs = require('fs');
const os = require('os');
const { chromium, navegador } = require('./qa_playwright.cjs');
const EXEC = navegador;
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO_PASS = process.env.DEMO_PASS || process.env.MP_DEMO_PASSWORD;
const OUT = process.env.OUT || os.tmpdir();

let n = 0;
const prod = (nombre, sku, extra = {}) => ({
    id: `qa-sku-${++n}`, nombre,
    clave: nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    sku, id_externo: sku ? `9${n}` : null, origen: sku ? 'contabilium' : 'manual', precio: 10000 + n * 1000,
    categoria: 'part', veces_usado: 0, veces_part: 0, veces_labor: 0, ultima_vez: null, ...extra,
});
// Códigos reales del catálogo de Probikes (Contabilium).
const CATALOGO = [
    prod('ROVAL RAPIDE RD COCKPIT CARB/BLK 31.8X38', '21023-0613'),
    prod('ROVAL RAPIDE RD COCKPIT CARB/BLK 31.8X40', '21023-0626'),
    prod('PEDALES AUTOMATICOS SPD MTB SHIMANO PD-M8100', 'EPDM8100'),
    prod('PIÑON SRAM 12V RUTA XG-1290 10-28D XDR', 'SRCS02418087001'),
    prod('SINGLE BOLT CLAMP BLK 7+9MM', '2812-9050', { veces_usado: 20, ultima_vez: new Date().toISOString() }),
    prod('PASTILLAS DE FRENO DE RESINA SHIMANO B05S', 'Y8VJ98010', { veces_usado: 6 }),
    prod('CADENA 11V SHIMANO CN-HG601-11', 'ICNHG60111116', { veces_usado: 3 }),
    prod('CAMARA 29 PRESTA', null, { veces_usado: 2 }),
];
const SIN_CODIGOS = CATALOGO.map(p => ({ ...p, sku: null, id_externo: null, origen: 'manual' }));

const fallos = [];
const ok = (t) => console.log('  ✅ ' + t);
const mal = (t) => { console.log('  ❌ ' + t); fallos.push(t); };

async function abrirOrden(catalogo) {
    const b = await chromium.launch({ executablePath: EXEC });
    const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(String(e).slice(0, 200)));
    await page.route('**/rest/v1/productos_taller*', async route => {
        if (route.request().method() !== 'GET' || !route.request().url().includes('veces_usado')) return route.continue();
        await route.fulfill({
            status: 200,
            headers: { 'content-type': 'application/json', 'content-range': `0-${catalogo.length - 1}/${catalogo.length}` },
            body: JSON.stringify(catalogo),
        });
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', process.env.DEMO_MAIL || 'demo@mechanicpro.com.ar');
    await page.fill('input[type=password]', DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 45000 });
    await page.waitForFunction(() => !document.querySelector('input[type=password]'), { timeout: 45000 });
    await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
    await page.waitForTimeout(3500);
    const ov = page.locator('div.fixed.inset-0 button').last();
    if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch { } }
    await page.waitForTimeout(1200);

    await page.locator('nav a, aside a').filter({ hasText: 'Taller Activo' }).first().click({ force: true });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Recibir Bici/i }).first().click();
    await page.waitForTimeout(1800);
    await page.locator('div[role=dialog] [class*=cursor-pointer]').first().click();   // primer cliente
    await page.waitForTimeout(1500);
    await page.locator('div[role=dialog] [class*=cursor-pointer]').first().click();   // primera bici
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /^\+ Agregar$/ }).first().click();
    await page.waitForTimeout(800);
    return { b, page, errores };
}

// Escribe en el campo del repuesto y devuelve lo que muestra la lista.
async function buscar(page, texto) {
    const campo = page.locator('div[role=dialog] input[role=combobox], div[role=dialog] input[aria-autocomplete]').last();
    await campo.fill('');
    await campo.click();
    await campo.type(texto, { delay: 25 });
    await page.waitForTimeout(500);
    return page.evaluate(() => [...document.querySelectorAll('[role=option]')].map(o => ({
        texto: o.innerText,
        marcado: [...o.querySelectorAll('.font-mono .font-bold')].map(e => e.textContent).join(''),
    })));
}

(async () => {
    if (!DEMO_PASS) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }

    console.log('── Taller CON códigos (catálogo del ERP)');
    let { b, page, errores } = await abrirOrden(CATALOGO);
    try {
        const campo = page.locator('div[role=dialog] input[role=combobox], div[role=dialog] input[aria-autocomplete]').last();
        const ph = await campo.getAttribute('placeholder');
        if (/SKU/.test(ph || '')) ok(`el campo lo dice: "${ph}"`); else mal(`el campo no menciona el SKU: "${ph}"`);

        const CASOS = [
            ['21023-0613', 'ROVAL RAPIDE RD COCKPIT CARB/BLK 31.8X38', '21023-0613', 'tal cual'],
            ['210230613', 'ROVAL RAPIDE RD COCKPIT CARB/BLK 31.8X38', '21023-0613', 'sin el guion'],
            ['0626', 'ROVAL RAPIDE RD COCKPIT CARB/BLK 31.8X40', '0626', 'el último tramo'],
            ['epdm8100', 'PEDALES AUTOMATICOS SPD MTB SHIMANO PD-M8100', 'EPDM8100', 'en minúsculas'],
            ['Y8VJ98010', 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S', 'Y8VJ98010', 'el SKU de un repuesto que el taller usa'],
        ];
        for (const [q, esperado, marca, como] of CASOS) {
            const filas = await buscar(page, q);
            const primera = filas[0];
            if (primera && primera.texto.includes(esperado)) ok(`"${q}" (${como}) → primero ${esperado}`);
            else mal(`"${q}" (${como}): primero salió ${primera ? primera.texto.split('\n')[0] : 'NADA'}`);
            if (primera && primera.marcado.replace(/-/g, '') === marca.replace(/-/g, '')) ok(`   y el SKU viene marcado: ${primera.marcado}`);
            else mal(`   el SKU no viene marcado como "${marca}" (marcado: "${primera ? primera.marcado : ''}")`);
            // Con el SKU entero no se ofrece "usar 21023-0613" como repuesto nuevo.
            if (como === 'tal cual' || como === 'sin el guion') {
                const libre = filas.some(f => /^Usar /.test(f.texto));
                const hayUsar = await page.locator('[id] button').filter({ hasText: /^Usar / }).count();
                if (!libre && !hayUsar) ok('   y no ofrece cargarlo como repuesto nuevo');
                else mal('   ofrece "Usar …" con el SKU entero de un producto');
            }
            // Control positivo del chequeo de arriba: con un PEDAZO del código la
            // fila "Usar …" sí tiene que estar. Si no la encuentra, el chequeo de
            // arriba daba verde porque no sabe ver la fila.
            if (como === 'el último tramo') {
                const hayUsar = await page.locator('[id] button').filter({ hasText: /^Usar / }).count();
                if (hayUsar) ok('   (control) con un pedazo sí ofrece "Usar …": el chequeo ve esa fila');
                else mal('   (control) no encuentra la fila "Usar …": el chequeo del SKU entero no mide');
            }
        }
        await page.screenshot({ path: `${OUT}/qa_buscador_sku.png` });

        // Control negativo 1: la abrazadera 2812-9050 no "contiene" 1290.
        const f1290 = await buscar(page, '1290');
        if (!f1290.some(f => f.texto.includes('SINGLE BOLT CLAMP'))) ok('"1290" no trae la abrazadera 2812-9050 (control negativo)');
        else mal('"1290" trae la abrazadera 2812-9050: se está leyendo el código cruzando el guion');
        if (f1290[0] && f1290[0].texto.includes('XG-1290')) ok('"1290" trae primero el piñón XG-1290 por su nombre');
        else mal(`"1290" trae primero ${f1290[0] ? f1290[0].texto.split('\n')[0] : 'NADA'}`);

        if (errores.length) mal('errores en la página: ' + errores.join(' | ')); else ok('0 errores en la página');
    } finally { await b.close(); }

    console.log('\n── Taller SIN códigos (control negativo: no se le habla de SKU)');
    ({ b, page, errores } = await abrirOrden(SIN_CODIGOS));
    try {
        const campo = page.locator('div[role=dialog] input[role=combobox], div[role=dialog] input[aria-autocomplete]').last();
        const ph = await campo.getAttribute('placeholder');
        if (!/SKU/.test(ph || '')) ok(`el campo no menciona el SKU: "${ph}"`); else mal(`menciona el SKU sin tener códigos: "${ph}"`);
        const filas = await buscar(page, 'pastillas');
        if (filas[0] && filas[0].texto.includes('PASTILLAS')) ok('por nombre sigue andando');
        else mal('por nombre no trae las pastillas');
    } finally { await b.close(); }

    console.log(fallos.length ? `\n❌ ${fallos.length} falla(s)` : '\n✅ todo verde');
    process.exit(fallos.length ? 1 : 0);
})();
