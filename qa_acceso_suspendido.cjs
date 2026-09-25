/**
 * Candado del acceso suspendido (25-sep-2026, Leira al terminar la prueba).
 *
 * Suspende UN RATO el Taller Demo y prueba, contra la base real:
 *   1. Control positivo: sin suspensión, la app entra normal.
 *   2. Con la app ABIERTA, se suspende → al volver a la pestaña aparece el cartel
 *      y desaparece la app (la compu del taller no se recarga en todo el día).
 *   3. Entrando de cero con la suspensión puesta → solo el cartel (compu y celular).
 *   4. El admin del taller NO puede sacarse la suspensión por su cuenta (trigger).
 *   5. «Cerrar sesión» vuelve al login.
 * Y SIEMPRE, en un finally, deja el Demo como estaba: es el de las demos comerciales.
 *
 * Uso: npm run dev (otra terminal) y
 *   set -a && . ~/Documents/estudio_iara/.secrets/mp_demo_meta_review.env && set +a
 *   node qa_acceso_suspendido.cjs            (con el sandbox apagado: el navegador sale a supabase.co)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/iaraaguilar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const EXEC = process.env.PW_CHROME
    || '/Users/iaraaguilar/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp';
const DEMO_ID = '2e58d4b0-23c6-46a5-a127-72979613ac79';

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()]));
const URL_SB = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8')).service_role_key;
const DEMO_PASS = process.env.DEMO_PASS || process.env.MP_DEMO_PASSWORD;
const DEMO_MAIL = process.env.DEMO_MAIL || 'demo@mechanicpro.com.ar';

const fallas = [];
const ok = (cond, que) => { console.log(`${cond ? '✅' : '❌'} ${que}`); if (!cond) fallas.push(que); };

async function rest(metodo, ruta, { clave = SERVICE, jwt = SERVICE, body } = {}) {
    const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, {
        method: metodo,
        headers: { apikey: clave, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => null) };
}
const estadoDemo = async () => (await rest('GET', `talleres?id=eq.${DEMO_ID}&select=nombre,horas_para_llamar,acceso_suspendido_at,acceso_suspendido_motivo`)).data[0];
const suspender = () => rest('PATCH', `talleres?id=eq.${DEMO_ID}`, { body: { acceso_suspendido_at: new Date().toISOString(), acceso_suspendido_motivo: 'prueba_finalizada' } });
const restaurar = () => rest('PATCH', `talleres?id=eq.${DEMO_ID}`, { body: { acceso_suspendido_at: null, acceso_suspendido_motivo: null } });

async function entrar(b, viewport) {
    const page = await b.newPage({ viewport });
    await page.addInitScript(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', DEMO_MAIL);
    await page.fill('input[type=password]', DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO')
        && !document.querySelector('input[type=password]'), { timeout: 45000 });
    await page.waitForTimeout(3500);
    return page;
}
const seVe = (page, texto) => page.evaluate((t) => [...document.querySelectorAll('h1,h2,a,button,p,span,div')]
    .some(e => e.childElementCount === 0 && (e.textContent || '').trim().toLowerCase() === t.toLowerCase()
        && e.checkVisibility({ opacityProperty: true, visibilityProperty: true })), texto);
const cartel = (page) => seVe(page, 'Período de prueba finalizado');
const app = (page) => seVe(page, 'Taller Activo');

(async () => {
    if (!DEMO_PASS) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }
    const antes = await estadoDemo();
    if (antes.nombre !== 'Taller Demo') { console.error('El id no es el Taller Demo, no toco nada'); process.exit(2); }
    if (antes.acceso_suspendido_at) { console.error('El Demo ya estaba suspendido: lo dejo como está y no pruebo'); process.exit(2); }

    const b = await chromium.launch({ executablePath: EXEC });
    try {
        // 1 + 2: entra normal, y con la app abierta se suspende.
        const p1 = await entrar(b, { width: 1440, height: 900 });
        ok(await app(p1), '1. sin suspensión se ve la app (Taller Activo)');
        ok(!(await cartel(p1)), '1. sin suspensión NO aparece el cartel');
        await suspender();
        await p1.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await p1.waitForTimeout(3000);
        ok(await cartel(p1), '2. con la app abierta: al volver a la pestaña aparece el cartel');
        ok(!(await app(p1)), '2. con la app abierta: la app desaparece');
        await p1.screenshot({ path: `${OUT}/acceso_suspendido_compu.png` });
        await p1.close();

        // 3: entrando de cero, compu y celular.
        for (const [nombre, vp] of [['compu', { width: 1440, height: 900 }], ['celu', { width: 390, height: 844 }]]) {
            const p = await entrar(b, vp);
            ok(await cartel(p), `3. entrando de cero (${nombre}): se ve el cartel`);
            ok(!(await app(p)), `3. entrando de cero (${nombre}): no se ve la app`);
            const desborda = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
            ok(!desborda, `3. (${nombre}) nada desborda a lo ancho`);
            await p.screenshot({ path: `${OUT}/acceso_suspendido_${nombre}_entrada.png`, fullPage: true });
            if (nombre === 'celu') {
                // 5: cerrar sesión vuelve al login.
                await p.click('text=Cerrar sesión');
                await p.waitForTimeout(2500);
                ok(await p.locator('input[type=password]').count() > 0, '5. «Cerrar sesión» vuelve al login');
            }
            await p.close();
        }

        // 4: el admin del taller no se puede sacar la suspensión.
        const tk = await (await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
            method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: DEMO_MAIL, password: DEMO_PASS }),
        })).json();
        const intento = await rest('PATCH', `talleres?id=eq.${DEMO_ID}`, { clave: ANON, jwt: tk.access_token, body: { acceso_suspendido_at: null } });
        const sigue = await estadoDemo();
        ok(intento.status >= 400 && !!sigue.acceso_suspendido_at,
            `4. el usuario del taller no puede sacarse la suspensión (HTTP ${intento.status}: ${JSON.stringify(intento.data).slice(0, 90)})`);
        // Control positivo del trigger: el mismo usuario SÍ puede tocar otra columna suya.
        const otra = await rest('PATCH', `talleres?id=eq.${DEMO_ID}`, { clave: ANON, jwt: tk.access_token, body: { horas_para_llamar: antes.horas_para_llamar } });
        ok(otra.status < 400, `4. control positivo: el mismo usuario sí guarda su configuración (HTTP ${otra.status})`);
    } finally {
        await restaurar();
        const despues = await estadoDemo();
        ok(!despues.acceso_suspendido_at && !despues.acceso_suspendido_motivo, 'FINAL: el Taller Demo quedó sin suspensión, como estaba');
        await b.close();
    }
    console.log(fallas.length ? `\n❌ ${fallas.length} falla(s)` : '\n✅ todo verde');
    process.exit(fallas.length ? 1 : 0);
})();
