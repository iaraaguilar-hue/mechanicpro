/**
 * ¿El buscador de Configuración lleva a TODOS los ajustes, y los encuentra con
 * las palabras de un mecánico?
 *
 * Origen (Iara, 14-sep-2026): «que todos los botones y todas las opciones de
 * configuración estén en el lugar indicado y sean fáciles de buscar (…) que
 * cualquier persona pueda usarlo sin explicación».
 *
 * Dos chequeos:
 *  1. CADA ajuste de `src/components/BuscadorDeAjustes.tsx` (se leen del archivo,
 *     no se copian acá: una lista copiada deja de vigilar el día que alguien suma
 *     uno) se busca por su título, se toca el resultado, y tiene que aparecer en
 *     pantalla un `[data-ajuste=<id>]` VISIBLE. Si alguien renombra una tarjeta o
 *     la muda de pestaña sin tocar el índice, el buscador lleva a la nada.
 *  2. Las PALABRAS DE UN MECÁNICO encuentran lo que buscan en el primer lugar
 *     («comision» → Quién hizo cada service).
 *
 *   npm run dev  (en otra terminal)
 *   DEMO_PASS=… node qa_buscador_ajustes.cjs
 *
 * Control negativo incluido: el mismo verificador se corre contra un id que no
 * existe y tiene que decir que no está. Si dijera que sí, no verifica nada.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/iaraaguilar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const EXEC = process.env.PW_CHROME
    || '/Users/iaraaguilar/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = process.env.MP_URL || 'http://localhost:5173/';

const fuente = fs.readFileSync(path.join(__dirname, 'src/components/BuscadorDeAjustes.tsx'), 'utf8');
const AJUSTES = [...fuente.matchAll(/\{ id: '([a-z_]+)', titulo: '([^']+)', tab: '([a-z]+)'/g)]
    .map(m => ({ id: m[1], titulo: m[2], tab: m[3] }));

// Cómo lo diría alguien que no sabe cómo se llama. El primero de la lista tiene
// que ser el esperado.
const PALABRAS_DE_MECANICO = [
    ['comision', 'mecanico'],
    ['candado', 'tareas'],
    ['precios', 'menu'],
    ['firma', 'firma'],
    ['forma de pago', 'textos_pdf'],
    ['logo', 'logo'],
    ['tutorial', 'recorrido'],
    ['plantilla', 'plantillas'],
    ['contabilium', 'altas_erp'],
    ['no contesta', 'horas'],
];

const visible = async (page, id) => page.evaluate((i) => {
    const el = document.querySelector(`[data-ajuste="${i}"]`);
    return !!el && el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
}, id);

(async () => {
    if (!process.env.DEMO_PASS) { console.error('Falta DEMO_PASS'); process.exit(2); }
    if (AJUSTES.length < 15) { console.error(`ROTO: solo leí ${AJUSTES.length} ajustes del archivo, el patrón no matchea`); process.exit(2); }
    const b = await chromium.launch({ executablePath: EXEC });
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', process.env.DEMO_MAIL || 'demo@mechanicpro.com.ar');
    await page.fill('input[type=password]', process.env.DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 45000 });
    await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
    await page.waitForTimeout(3500);
    const ov = page.locator('div.fixed.inset-0 button').last();
    if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch {} }
    await page.locator('nav a').filter({ hasText: 'Configuración' }).first().click({ force: true });
    await page.waitForTimeout(3000);

    const input = page.locator('[data-buscador-ajustes]');
    let mal = 0;

    console.log(`1. Cada ajuste lleva a algo visible (${AJUSTES.length})`);
    for (const a of AJUSTES) {
        await input.fill(a.titulo);
        await page.waitForTimeout(250);
        const opcion = page.locator('[role="option"]').filter({ hasText: a.titulo }).first();
        if (!(await opcion.count())) { mal++; console.log(`  🚩 ${a.id}: buscando su propio título no aparece`); continue; }
        await opcion.click();
        await page.waitForTimeout(1100);
        const ok = await visible(page, a.id);
        if (!ok) mal++;
        console.log(`  ${ok ? '✅' : '🚩'} ${a.id.padEnd(24)} → ${a.tab}${ok ? '' : '  (no hay [data-ajuste] visible)'}`);
    }

    console.log('\n2. Las palabras de un mecánico');
    for (const [q, esperado] of PALABRAS_DE_MECANICO) {
        await input.fill(q);
        await page.waitForTimeout(250);
        const primero = (await page.locator('[role="option"]').first().innerText().catch(() => '')).split('\n')[0];
        const titulo = AJUSTES.find(a => a.id === esperado)?.titulo;
        const ok = primero === titulo;
        if (!ok) mal++;
        console.log(`  ${ok ? '✅' : '🚩'} «${q}» → ${primero || '(nada)'}${ok ? '' : `   (esperaba «${titulo}»)`}`);
    }
    await input.fill('');

    // Control negativo: el verificador tiene que poder decir que NO.
    const fantasma = await visible(page, 'no_existe_control_negativo');
    console.log(`\n${fantasma ? '🚩 CONTROL NEGATIVO FALLIDO: dice que ve un ajuste que no existe' : '✅ control negativo: un id inexistente da «no está»'}`);
    if (fantasma) mal++;

    await b.close();
    console.log(mal === 0 ? '\n✅ El buscador lleva a todos los ajustes.' : `\n🚩 ${mal} fallas.`);
    process.exit(mal === 0 ? 0 : 1);
})().catch(e => { console.error('ROTO:', e.message); process.exit(2); });
