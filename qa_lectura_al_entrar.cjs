/**
 * ¿Cuánto hay para LEER apenas entrás a cada pantalla?
 *
 * Origen (Iara, 9-sep-2026): «hay demasiadas cosas para leer cuando vas
 * navegando (…) no quiero que haya lectura en el instante en el que el
 * mecánico entra a las pestañas».
 *
 * Mide la prosa VISIBLE al entrar (lo plegado detrás de «Cómo funciona» no
 * cuenta, que es justamente la idea) y falla si una pantalla se pasa del techo.
 *
 *   npm run dev  (en otra terminal)
 *   DEMO_PASS=… node qa_lectura_al_entrar.cjs
 *   DEMO_PASS=… node qa_lectura_al_entrar.cjs --control-negativo
 *
 * 🔴 getBoundingClientRect() NO sirve para saber si algo se ve: dentro de un
 * <details> CERRADO el elemento sigue midiendo 1264x18 y offsetParent sigue
 * existiendo. El único que dice la verdad es checkVisibility(). Con el chequeo
 * equivocado este script daba «no cambió nada» sobre una pantalla que había
 * cambiado por completo.
 */
const { chromium } = require('/Users/iaraaguilar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const EXEC = process.env.PW_CHROME
    || '/Users/iaraaguilar/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const CONTROL = process.argv.includes('--control-negativo');

// El techo por pantalla. No es cero: un subtítulo de una línea y los datos de
// cada fila (que NO son prosa de ayuda) entran acá. Los números salen de la
// medición del 9-sep-2026 con todo ya plegado, más un poco de aire.
const TECHO = {
    'Taller Activo': 150,
    'Clientes': 150,
    'Historial': 150,
    'Retención': 700,      // las tarjetas dicen «venía cada 4 semanas…»: es dato
    'Métricas': 250,
    'Bicis paradas': 250,
    'Configuración': 350,
    'Config › Mi Taller': 350,
    'Config › Menú de Services': 200,
    'Config › WhatsApp': 350,
    'Config › Mensajes automáticos': 400,
    'Config › Preferencias': 400,
    'Orden abierta': 850,   // lo más largo de acá es el mensaje que se le manda al cliente: es el contenido, no ayuda
};
// Preguntale queda afuera a propósito: lo que se ve ahí es la conversación con
// el taller, o sea el contenido de la pantalla, no texto de ayuda.

const SNIFF = () => {
    const salta = (n) => n.parentElement && n.parentElement.closest(
        'button, a, th, td, input, textarea, select, [role="tab"], nav, aside, script, style, svg');
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const out = []; let n;
    while ((n = w.nextNode())) {
        const t = (n.textContent || '').trim().replace(/\s+/g, ' ');
        if (t.length < 40 || !/\s/.test(t)) continue;
        if (salta(n)) continue;
        const e = n.parentElement;
        if (!e || !e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
        out.push(t);
    }
    const u = [...new Set(out)];
    return { chars: u.reduce((a, t) => a + t.length, 0), textos: u };
};

(async () => {
    if (!process.env.DEMO_PASS) { console.error('Falta DEMO_PASS'); process.exit(2); }
    const b = await chromium.launch({ executablePath: EXEC });
    const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', process.env.DEMO_MAIL || 'demo@mechanicpro.com.ar');
    await page.fill('input[type=password]', process.env.DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 45000 });
    await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
    await page.waitForTimeout(3500);
    const ov = page.locator('div.fixed.inset-0 button').last();
    if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch {} }
    await page.waitForTimeout(1200);

    // Control negativo: se inyecta un párrafo de ayuda como los que se plegaron.
    // Si el candado no lo caza, el candado no mide nada.
    if (CONTROL) {
        await page.addInitScript(() => {
            const meter = () => {
                if (document.querySelector('[data-control-negativo]')) return;
                const p = document.createElement('p');
                p.setAttribute('data-control-negativo', '1');
                p.textContent = 'Este párrafo es el control negativo del candado de lectura: '
                    + 'explica en detalle cómo funciona la pantalla, exactamente como los que se '
                    + 'plegaron detrás de «Cómo funciona» el 9 de septiembre de 2026.';
                document.body.appendChild(p);
            };
            setInterval(meter, 400);
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(6000);
    }

    const filas = [];
    for (const nombre of Object.keys(TECHO)) {
        if (nombre.startsWith('Config › ')) continue;
        const link = page.locator('nav a, aside a').filter({ hasText: nombre }).first();
        if (!(await link.count())) { console.log(`  (sin pestaña ${nombre}, se saltea)`); continue; }
        await link.click({ force: true });
        await page.waitForTimeout(3200);
        filas.push([nombre, await page.evaluate(SNIFF)]);
    }
    // La orden abierta: es donde el mecánico pasa el día.
    await page.locator('nav a, aside a').filter({ hasText: 'Taller Activo' }).first().click({ force: true });
    await page.waitForTimeout(2500);
    await page.locator('tbody tr').first().click();
    await page.waitForTimeout(3800);
    filas.push(['Orden abierta', await page.evaluate(SNIFF)]);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    await page.locator('nav a, aside a').filter({ hasText: 'Configuración' }).first().click({ force: true });
    await page.waitForTimeout(3000);
    for (const t of await page.locator('[role="tab"]').allInnerTexts()) {
        const clave = 'Config › ' + t;
        if (!(clave in TECHO)) continue;
        await page.locator('[role="tab"]').filter({ hasText: t }).first().click({ force: true });
        await page.waitForTimeout(2200);
        filas.push([clave, await page.evaluate(SNIFF)]);
    }

    // La otra mitad del chequeo: el texto NO se borró, se corrió de lugar. Si
    // «Cómo funciona» no abre nada, esto dejó de ser un pliegue y pasó a ser
    // una pérdida de información.
    await page.locator('[role="tab"]').filter({ hasText: 'Preferencias' }).first().click({ force: true });
    await page.waitForTimeout(2500);
    const plegados = await page.locator('[data-como-funciona]').count();
    const antes = (await page.evaluate(SNIFF)).chars;
    await page.evaluate(() => document.querySelectorAll('[data-como-funciona]').forEach(d => { d.open = true; }));
    await page.waitForTimeout(900);
    const despues = (await page.evaluate(SNIFF)).chars;
    const recupera = despues > antes + 500;
    console.log(`\n${recupera ? '✅' : '🚩'} el texto sigue estando: ${plegados} pliegues, ${antes} car cerrados → ${despues} car abiertos`);

    let mal = recupera ? 0 : 1;
    for (const [nombre, m] of filas) {
        const techo = TECHO[nombre];
        const ok = m.chars <= techo;
        if (!ok) mal++;
        console.log(`${ok ? '✅' : '🚩'} ${nombre.padEnd(32)} ${String(m.chars).padStart(5)} / ${techo}`);
        if (!ok) m.textos.filter(t => t.length > 60).sort((a, c) => c.length - a.length).slice(0, 5)
            .forEach(t => console.log(`      ${String(t.length).padStart(4)}  ${t.slice(0, 120)}`));
    }
    await b.close();

    if (CONTROL) {
        console.log(mal > 0
            ? `\n✅ CONTROL NEGATIVO OK: el candado cazó el párrafo inyectado en ${mal} pantallas.`
            : '\n🚩 CONTROL NEGATIVO FALLIDO: se inyectó prosa y el candado no la vio. No mide nada.');
        process.exit(mal > 0 ? 0 : 1);
    }
    console.log(mal === 0
        ? '\n✅ Ninguna pantalla obliga a leer al entrar.'
        : `\n🚩 ${mal} pantallas se pasan del techo: plegá esos textos detrás de <ComoFunciona>.`);
    process.exit(mal === 0 ? 0 : 1);
})().catch(e => { console.error('ROTO:', e.message); process.exit(2); });
