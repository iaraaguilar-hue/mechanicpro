/**
 * ¿EL MENÚ DE LA IZQUIERDA MIDE LO MISMO EN TODAS LAS PANTALLAS? (2-oct-2026)
 *
 * 🔴 POR QUÉ EXISTE: Leandro (Probikes) avisó que al apretar Historial "se le achica la barra
 * de opciones". Tiene una compu vieja, con pantalla chica. La barra mide w-28 (112 px), pero
 * no decía `shrink-0`: en un contenedor flex eso la deja encogerse. Cuando la pantalla que
 * se abre al lado trae algo más ancho que el lugar que queda (la tabla del Historial, los
 * filtros), el navegador le saca ancho al menú en vez de achicar la tabla. En una pantalla
 * grande no pasa, y por eso nadie lo vio: el que arregla mira en la suya.
 *
 * QUÉ MIDE, en 5 anchos de pantalla (1024 → 1920) y en TODAS las pantallas del menú:
 *   1. que la barra mida 112 px, ni uno menos (con 1 px de tolerancia por redondeo);
 *   2. que la página no se corra de costado (scroll horizontal del documento): si el ancho
 *      sobrante no se lo come el menú, se lo tiene que comer la tabla con su propio scroll,
 *      no la página entera.
 *
 * CONTROL: corrido sobre el código anterior al arreglo, tiene que dar ROJO en Historial con
 * 1024/1280. Si da verde ahí, no está mirando la barra que cree (ver el progress del 2-oct).
 *
 *   npm run dev  (en otra terminal)
 *   MP_DEMO_PASSWORD=… node qa_barra_lateral.cjs
 */
const { chromium } = require('./qa_playwright.cjs');

const EXEC = require('./qa_playwright.cjs').navegador;
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO_PASS = process.env.MP_DEMO_PASSWORD;
const ANCHOS = (process.env.ANCHOS || '1024,1280,1366,1440,1920').split(',').map(Number);
const BARRA = 112;   // w-28

const fallos = [];
const ok = (t) => console.log('  ✅ ' + t);
const mal = (t) => { console.log('  ❌ ' + t); fallos.push(t); };

async function entrar(b, ancho) {
    const ctx = await b.newContext({ viewport: { width: ancho, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('    [pageerror] ' + String(e).slice(0, 200)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
    await page.fill('input[type=password]', DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 45000 });
    await page.waitForFunction(() => !document.querySelector('input[type=password]'), { timeout: 45000 });
    await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
    await page.waitForTimeout(3500);
    const ov = page.locator('div.fixed.inset-0 button').last();
    if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch { } }
    await page.waitForTimeout(800);
    return page;
}

(async () => {
    if (!DEMO_PASS) { console.error('Falta MP_DEMO_PASSWORD (.secrets/mp_demo_meta_review.env)'); process.exit(2); }
    const b = await chromium.launch({ executablePath: EXEC });
    try {
        for (const ancho of ANCHOS) {
            console.log(`\n── ${ancho} px`);
            const page = await entrar(b, ancho);
            // Las pantallas salen del menú de verdad, no de una lista escrita acá: una
            // pantalla nueva entra sola al candado el día que se agrega al menú.
            const pantallas = await page.$$eval('nav[data-tour="nav"] a', as => as.map(a => a.innerText.trim()).filter(Boolean));
            for (const nombre of pantallas) {
                // Por el menú y no con page.goto: goto pierde la sesión (memoria del arnés).
                await page.locator('nav[data-tour="nav"] a').filter({ hasText: nombre }).first().click({ force: true });
                await page.waitForTimeout(2500);
                const m = await page.evaluate(() => {
                    const nav = document.querySelector('nav[data-tour="nav"]');
                    return {
                        barra: nav ? Math.round(nav.getBoundingClientRect().width) : -1,
                        sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    };
                });
                const problemas = [];
                if (m.barra < BARRA - 1) problemas.push(`la barra mide ${m.barra} px (tiene que medir ${BARRA})`);
                if (m.sobra > 1) problemas.push(`la página se corre ${m.sobra} px de costado`);
                if (problemas.length) mal(`${ancho} px · ${nombre}: ${problemas.join(' y ')}`);
                else ok(`${ancho} px · ${nombre}: barra ${m.barra} px, sin correrse`);
            }
            await page.context().close();
        }
    } finally {
        await b.close();
    }
    console.log(fallos.length ? `\n🔴 ${fallos.length} problema(s)` : '\n🟢 la barra mide lo mismo en todas las pantallas y anchos');
    process.exit(fallos.length ? 1 : 0);
})();
