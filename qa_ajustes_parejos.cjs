/**
 * ¿ESTÁN PAREJOS LOS AJUSTES DE CONFIGURACIÓN?
 *
 * Origen (Iara, 16-sep-2026, mirando Preferencias de Leira):
 *   «me da mucho toque que no ocupen los mismos espacios todas las opciones. O
 *   sea, está demasiado desordenado. Es como que lo pusiste así nomás.»
 *   «el segundo par de ojos está bien pero tiene mucho espacio en blanco
 *   comparado con lo que tiene a la derecha.»
 *   «en el número de orden, a la derecha no hay ninguna opción para hacer.»
 *
 * Las tres son la misma falla y se puede MEDIR, que es lo único que evita
 * discutirla de vuelta con capturas:
 *   1. RIEL: dentro de un panel, todos los controles terminan en la misma
 *      vertical. Si uno se corre, la pantalla se lee desprolija.
 *   2. HUECO: ninguna tarjeta tiene un vacío grande adentro (lo que pasaba
 *      cuando la grilla estiraba una tarjeta corta para igualar a la de al lado).
 *   3. SOLA: ninguna fila de una grilla de dos columnas queda con una tarjeta
 *      y media pantalla vacía al lado.
 *
 *   npm run dev  ·  MP_DEMO_PASSWORD=… node qa_ajustes_parejos.cjs
 *   …            ·  node qa_ajustes_parejos.cjs --control-negativo
 */
const { chromium } = require('/Users/iaraaguilar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs = require('fs');
const EXEC = process.env.PW_CHROME
    || '/Users/iaraaguilar/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO_PASS = process.env.DEMO_PASS || process.env.MP_DEMO_PASSWORD;
const CONTROL = process.argv.includes('--control-negativo');
const OUT = process.env.OUT || require('os').tmpdir() + '/mp_ajustes';
fs.mkdirSync(OUT, { recursive: true });

// Cuánto se tolera. El riel: 2 px es ruido de redondeo del navegador.
const RIEL_PX = 2;
// El hueco: 56 px es más alto que cualquier separación intencional de la pantalla
// (el gap más grande que usamos es 20 px). Arriba de eso ya se lee como vacío.
const HUECO_PX = 56;

const MEDIR = (LIM) => {
    const { HUECO_PX, RIEL_PX } = LIM;
    const vis = (e) => e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
    const main = document.querySelector('main') || document.body;
    const salida = { rieles: [], huecos: [], solas: [], desborda: [], anchoDoc: document.documentElement.scrollWidth };

    // 1 · El riel de cada panel de filas.
    for (const panel of main.querySelectorAll('[data-panel-ajustes]')) {
        const filas = [...panel.querySelectorAll('[data-ajuste]')].filter(vis);
        const bordes = filas.map(f => {
            const riel = f.querySelector('[data-riel]');
            return riel && vis(riel)
                ? { id: f.getAttribute('data-ajuste'), derecha: Math.round(riel.getBoundingClientRect().right) }
                : null;
        }).filter(Boolean);
        if (bordes.length > 1) {
            const max = Math.max(...bordes.map(b => b.derecha));
            for (const b of bordes) if (max - b.derecha > RIEL_PX) salida.rieles.push({ ...b, max, desvio: max - b.derecha });
        }
    }

    // 2 · El hueco más grande adentro de cada tarjeta.
    for (const card of main.querySelectorAll('[data-ajuste], [data-panel-ajustes]')) {
        if (!vis(card)) continue;
        const caja = card.getBoundingClientRect();
        if (caja.height < 40) continue;
        // Los hijos de verdad: los que pintan algo y se ven.
        const hijos = [...card.querySelectorAll('*')]
            .filter(e => vis(e) && e.getBoundingClientRect().height > 4)
            .map(e => e.getBoundingClientRect())
            .filter(r => r.height > 0);
        if (!hijos.length) continue;
        const ultimo = Math.max(...hijos.map(r => r.bottom));
        const cola = Math.round(caja.bottom - ultimo);
        if (cola > HUECO_PX) {
            salida.huecos.push({
                que: card.getAttribute('data-ajuste') || 'panel',
                cola, alto: Math.round(caja.height),
            });
        }
    }

    // 3 · Tarjetas solas en una fila de grilla de dos o más columnas.
    for (const grilla of main.querySelectorAll('.grid')) {
        if (!vis(grilla)) continue;
        const cols = getComputedStyle(grilla).gridTemplateColumns.split(' ').filter(Boolean).length;
        if (cols < 2) continue;
        const hijos = [...grilla.children].filter(vis);
        if (hijos.length < 2) continue;
        // Agrupa por fila (por el top redondeado) y avisa si la última queda sola.
        // Un hijo que ocupa TODO el ancho (col-span completo) no está «solo»: es
        // una banda. Sin esta excepción, cualquier panel que cierre con una nota
        // a lo ancho se reporta como fila a medias, que es lo contrario del caso.
        // OJO: el ancho de la grilla se mide SIN su padding. Con el borde exterior,
        // un hijo que ocupa las dos columnas mide 48px menos que la tarjeta y parecía
        // media fila. (Costó una corrida, 16-sep-2026.)
        const cs = getComputedStyle(grilla);
        const anchoGrilla = grilla.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
        const filas = new Map();
        for (const h of hijos) {
            const caja = h.getBoundingClientRect();
            if (caja.width >= anchoGrilla - 4) continue;
            const t = Math.round(caja.top / 4) * 4;
            filas.set(t, (filas.get(t) || 0) + 1);
        }
        const conteos = [...filas.values()];
        if (conteos.length > 1 && conteos[conteos.length - 1] === 1 && cols > 1) {
            salida.solas.push({
                cols, filas: conteos,
                anchoGrilla: Math.round(anchoGrilla),
                cajas: hijos.map(h => { const r = h.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.top); }),
                texto: (grilla.innerText || '').slice(0, 60).replace(/\s+/g, ' '),
            });
        }
    }
    // 4 · Qué elemento empuja la pantalla a lo ancho, si es que alguno.
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        for (const e of main.querySelectorAll('*')) {
            if (!vis(e)) continue;
            const r = e.getBoundingClientRect();
            if (r.right > window.innerWidth + 1 && r.width > 0) {
                salida.desborda.push({
                    tag: e.tagName.toLowerCase(),
                    clase: (e.className || '').toString().slice(0, 70),
                    texto: (e.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' '),
                    derecha: Math.round(r.right), ancho: Math.round(r.width),
                });
            }
        }
    }
    return salida;
};

async function login(page) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
    await page.fill('input[type=password]', DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO') && !document.querySelector('input[type=password]'), { timeout: 45000 });
    await page.evaluate(() => { localStorage.setItem('mechanicpro_tour_v3', 'visto'); });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 3; i++) {
        const ov = page.locator('div.fixed.inset-0 button').last();
        if (await ov.count()) { try { await ov.click({ force: true, timeout: 1500 }); } catch {} }
        await page.waitForTimeout(500);
    }
}

(async () => {
    if (!DEMO_PASS) { console.error('Falta DEMO_PASS (o MP_DEMO_PASSWORD)'); process.exit(2); }
    const b = await chromium.launch({ executablePath: EXEC });
    let malas = 0;

    for (const [modo, vp] of [['pc', { width: 1440, height: 950 }], ['ancha', { width: 1920, height: 1080 }], ['cel', { width: 390, height: 844 }]]) {
        const page = await b.newPage({ viewport: vp });
        await login(page);
        if (modo === 'cel') {
            await page.locator('button[aria-label="Abrir menú"]').click({ force: true });
            await page.waitForTimeout(600);
            await page.locator('div[role="dialog"] nav a').filter({ hasText: 'Configuración' }).first().click({ force: true });
        } else {
            await page.locator('nav a').filter({ hasText: 'Configuración' }).first().click({ force: true });
        }
        await page.waitForTimeout(2500);
        await page.locator('main [role="tab"]').filter({ hasText: 'Preferencias' }).first().click({ force: true });
        await page.waitForTimeout(2200);

        if (CONTROL) {
            // Control negativo: mete la falla a mano y el script tiene que cazarla.
            await page.evaluate(() => {
                const fila = document.querySelector('[data-ajuste="orden_grande"] [data-riel]');
                if (fila) fila.style.marginRight = '80px';
                const card = document.querySelector('[data-ajuste="componentes"]');
                if (card) card.style.paddingBottom = '200px';
            });
            await page.waitForTimeout(300);
        }

        const r = await page.evaluate(MEDIR, { HUECO_PX, RIEL_PX });
        await page.screenshot({ path: `${OUT}/${modo}_preferencias.png`, fullPage: true });

        const problemas = [];
        for (const x of r.rieles) problemas.push(`riel: «${x.id}» termina ${x.desvio}px antes que el resto del panel`);
        for (const x of r.huecos) problemas.push(`hueco: «${x.que}» deja ${x.cola}px vacíos abajo (alto ${x.alto}px)`);
        for (const x of r.solas) problemas.push(`sola: grilla de ${x.cols} col (ancho ${x.anchoGrilla}) filas=${JSON.stringify(x.filas)} hijos=${JSON.stringify(x.cajas)} · ${x.texto}`);
        if (modo === 'cel' && r.anchoDoc > 400) {
            problemas.push(`la pantalla se va de ancho: ${r.anchoDoc}px en un celular de 390`);
            for (const d of r.desborda.slice(-4)) problemas.push(`    empuja: <${d.tag}> ${d.ancho}px hasta x=${d.derecha} · ${d.clase} · ${d.texto}`);
        }

        if (problemas.length) {
            malas++;
            console.log(`🚩 ${modo}`);
            for (const p of problemas.slice(0, 12)) console.log('    ' + p);
        } else {
            console.log(`✅ ${modo.padEnd(6)} rieles alineados, sin huecos, sin tarjetas solas`);
        }
        await page.close();
    }
    await b.close();
    console.log(`\ncapturas en ${OUT}`);
    if (CONTROL) {
        if (malas) { console.log('✅ control negativo: la falla inyectada se cazó'); process.exit(0); }
        console.log('❌ control negativo: NO cazó la falla inyectada'); process.exit(2);
    }
    if (malas) { console.log('\n🚩 Preferencias quedó despareja.'); process.exit(1); }
    console.log('\n✅ Los ajustes ocupan el mismo espacio.');
})().catch(e => { console.error('ROTO:', e.message); process.exit(2); });
