// AUDITORÍA DE USABILIDAD (14-sep-2026): recorre toda la app logueado como Taller Demo, en compu y
// celular, y deja captura de página entera + inventario de botones/pestañas por pantalla.
// La auditoría se hace sobre lo que se VE, no sobre el código.
//   npm run dev   ·   DEMO_PASS=… OUT=/ruta/capturas node qa_recorrido_capturas.cjs
const { chromium } = require('/Users/iaraaguilar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs = require('fs');
const EXEC = '/Users/iaraaguilar/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = process.env.MP_URL || 'http://localhost:5173/';
// El .env del Demo la llama MP_DEMO_PASSWORD; aca se pedia DEMO_PASS. Acepta los dos.
const DEMO_PASS = process.env.DEMO_PASS || process.env.MP_DEMO_PASSWORD;
if (!DEMO_PASS) { console.error('Falta DEMO_PASS (o MP_DEMO_PASSWORD)'); process.exit(2); }
const OUT = process.env.OUT || require('os').tmpdir() + '/mp_capturas';
fs.mkdirSync(OUT, { recursive: true });

const INVENTARIO = () => {
    const vis = (e) => e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
    const txt = (e) => (e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
    const main = document.querySelector('main') || document.body;
    return {
        titulos: [...main.querySelectorAll('h1,h2,h3,[class*="CardTitle"],.text-lg.font-semibold')].filter(vis).map(txt).filter(Boolean).slice(0, 60),
        botones: [...main.querySelectorAll('button, a[href]')].filter(vis).map(e => txt(e) + (e.disabled ? ' [deshab]' : '')).filter(Boolean).slice(0, 120),
        tabs: [...main.querySelectorAll('[role="tab"]')].map(txt),
        alto: document.documentElement.scrollHeight,
    };
};

async function login(page) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
    await page.fill('input[type=password]', DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 45000 });
    await page.evaluate(() => { localStorage.setItem('mechanicpro_tour_v3', 'visto'); });
    await page.waitForTimeout(3500);
    for (let i = 0; i < 3; i++) {
        const ov = page.locator('div.fixed.inset-0 button').last();
        if (await ov.count()) { try { await ov.click({ force: true, timeout: 1500 }); } catch {} }
        await page.waitForTimeout(600);
    }
}

async function shot(page, nombre, inv) {
    await page.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: true });
    inv[nombre] = await page.evaluate(INVENTARIO);
}

(async () => {
    const b = await chromium.launch({ executablePath: EXEC });
    const inv = {};
    const errores = [];

    for (const [modo, vp] of [['pc', { width: 1440, height: 900 }], ['cel', { width: 390, height: 844 }]]) {
        const page = await b.newPage({ viewport: vp });
        page.on('console', m => { if (m.type() === 'error') errores.push(`${modo}: ${m.text().slice(0, 160)}`); });
        await login(page);
        const irA = async (label) => {
            if (modo === 'cel') {
                await page.locator('button[aria-label="Abrir menú"]').click({ force: true });
                await page.waitForTimeout(700);
                const l = page.locator('div[role="dialog"] nav a').filter({ hasText: label }).first();
                if (!(await l.count())) { await page.keyboard.press('Escape'); return false; }
                await l.click({ force: true });
            } else {
                const l = page.locator('nav a').filter({ hasText: label }).first();
                if (!(await l.count())) return false;
                await l.click({ force: true });
            }
            await page.waitForTimeout(3200);
            return true;
        };
        const secciones = ['Taller Activo', 'Clientes', 'Historial', 'Retención', 'Métricas', 'Bicis paradas', 'Preguntale', 'Auditoría'];
        if (modo === 'cel') {
            await page.screenshot({ path: `${OUT}/cel_00_inicio.png` });
            await page.locator('button[aria-label="Abrir menú"]').click({ force: true });
            await page.waitForTimeout(700);
            await page.screenshot({ path: `${OUT}/cel_00_menu.png` });
            await page.keyboard.press('Escape');
            await page.locator('div.fixed.inset-0 .absolute.inset-0').first().click({ force: true }).catch(() => {});
            await page.waitForTimeout(500);
            await page.locator('button[aria-label="Perfil"]').click({ force: true });
            await page.waitForTimeout(500);
            await page.screenshot({ path: `${OUT}/cel_00_perfil.png` });
            await page.locator('button[aria-label="Perfil"]').click({ force: true });
        }
        let i = 1;
        for (const s of secciones) {
            if (await irA(s)) await shot(page, `${modo}_${String(i).padStart(2, '0')}_${s.replace(/\s+/g, '_')}`, inv);
            i++;
        }
        // Retención: sus pestañas internas
        if (await irA('Retención')) {
            const tabs = await page.locator('main [role="tab"]').allInnerTexts();
            for (const t of tabs) {
                await page.locator('main [role="tab"]').filter({ hasText: t }).first().click({ force: true });
                await page.waitForTimeout(2200);
                await shot(page, `${modo}_04_Retencion_${t.replace(/[^\wáéíóúñ]+/gi, '_').slice(0, 30)}`, inv);
            }
        }
        // Orden abierta
        if (await irA('Taller Activo')) {
            const fila = page.locator('main tbody tr:visible, main .cursor-pointer:visible').first();
            try {
                await fila.click({ timeout: 6000 });
                await page.waitForTimeout(3500);
                await shot(page, `${modo}_20_orden_abierta`, inv);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1200);
            } catch (e) { inv[`${modo}_20_orden`] = 'no se pudo abrir: ' + e.message.slice(0, 80); }
        }
        // Configuración, cada pestaña
        if (await irA('Configuración')) {
            const tabs = await page.locator('main [role="tab"]').allInnerTexts();
            for (const t of tabs) {
                await page.locator('main [role="tab"]').filter({ hasText: t }).first().click({ force: true });
                await page.waitForTimeout(2600);
                await shot(page, `${modo}_30_Config_${t.replace(/\s+/g, '_')}`, inv);
                if (t.startsWith('Mensajes')) {
                    const nuevo = page.locator('button').filter({ hasText: 'Pedir una plantilla nueva' }).first();
                    if (await nuevo.count() && await nuevo.isEnabled()) {
                        await nuevo.click();
                        await page.waitForTimeout(1200);
                        await shot(page, `${modo}_31_Config_plantilla_nueva`, inv);
                    } else inv[`${modo}_31_plantilla_boton`] = 'deshabilitado o ausente';
                }
            }
        }
        await page.close();
    }
    fs.writeFileSync(`${OUT}/inventario.json`, JSON.stringify({ inv, errores }, null, 1));
    console.log('OK', Object.keys(inv).length, 'pantallas,', errores.length, 'errores de consola');
    await b.close();
})().catch(e => { console.error('ROTO:', e.message); process.exit(2); });
