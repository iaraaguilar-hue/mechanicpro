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
 * QUÉ MIDE, en 6 anchos de pantalla (800 → 1920; el menú aparece desde 768) y en TODAS las pantallas del menú:
 *   1. que la barra mida 112 px, ni uno menos (con 1 px de tolerancia por redondeo);
 *   2. que la página no se corra de costado (scroll horizontal del documento): si el ancho
 *      sobrante no se lo come el menú, se lo tiene que comer la tabla con su propio scroll,
 *      no la página entera;
 *   3. que NADA se salga del área de contenido (un buscador, un filtro, un botón). 🔴 Lo
 *      agregó el revisor del 2-oct: con el menú arreglado, la fila de filtros del Historial
 *      —que era la que lo aplastaba— pasó a salirse de su caja a 1280, y los puntos 1 y 2
 *      daban verde. Lo que no entra no desaparece: se va a otro lado. Solo se permite pasarse
 *      adentro de algo con scroll propio (las tablas).
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
const ANCHOS = (process.env.ANCHOS || '800,1024,1280,1366,1440,1920').split(',').map(Number);
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
                    const main = document.querySelector('main');
                    const limite = main.getBoundingClientRect().right - parseFloat(getComputedStyle(main).paddingRight) + 1;
                    const fuera = new Set();
                    for (const el of main.querySelectorAll('input,button,select,a,[role=combobox],h1,h2,h3,p,label')) {
                        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
                        if (getComputedStyle(el).position === 'fixed') continue;
                        const r = el.getBoundingClientRect();
                        if (!r.width) continue;
                        // 🔴 Contra el área de contenido NO alcanza: el buscador del Historial se
                        // salía de la TARJETA de filtros (más angosta) y este punto daba verde sobre
                        // el código viejo (control del 2-oct). Se mide contra cada caja que se VE
                        // (con borde o fondo) entre el elemento y el <main>, y contra el <main>.
                        let a = el.parentElement, sale = r.right > limite ? r.right - limite : 0;
                        while (a && a !== main) {
                            const cs = getComputedStyle(a);
                            if (/auto|scroll/.test(cs.overflowX)) { sale = 0; break; }   // la tabla tiene su scroll: permitido
                            const caja = parseFloat(cs.borderRightWidth) > 0 || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent');
                            if (caja) {
                                const ar = a.getBoundingClientRect();
                                if (r.right > ar.right + 1) sale = Math.max(sale, r.right - ar.right);
                            }
                            a = a.parentElement;
                        }
                        if (sale > 1) fuera.add((el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.innerText || el.tagName).trim().split('\n')[0].slice(0, 40) + ` (+${Math.round(sale)} px)`);
                    }
                    return {
                        barra: nav ? Math.round(nav.getBoundingClientRect().width) : -1,
                        sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                        fuera: [...fuera].slice(0, 4),
                    };
                });
                const problemas = [];
                if (m.barra < BARRA - 1) problemas.push(`la barra mide ${m.barra} px (tiene que medir ${BARRA})`);
                if (m.sobra > 1) problemas.push(`la página se corre ${m.sobra} px de costado`);
                if (m.fuera.length) problemas.push(`se sale del contenido: ${m.fuera.join(' · ')}`);
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
