/**
 * El calendario de turnos, recorrido como lo usaría el mecánico (25-sep-2026).
 *
 * Origen: Juan Otero (Private Garage Workshop) lleva los turnos en un cuaderno y
 * se los pasamos a la app. Lo que se prueba:
 *  1. Anotar un turno de un cliente cargado, con bici y hora → cae en SU día.
 *     🔴 Control negativo: NO aparece en el día de antes. Es la trampa de siempre
 *     de esta app: un día de calendario convertido de zona se corre un día entero.
 *  2. Anotar uno de alguien que no está cargado (nombre y celular) → "S/H".
 *  3. Reservar un día entero → la cabecera del día dice "Reservado".
 *  4. No vino → se ve; volver a dejarlo en pie → se va.
 *  5. Llegó → se abre la orden con el cliente y la bici ya elegidos (no se guarda).
 *  6. Cancelar el turno y liberar la reserva → salen del calendario.
 *  7. En el celular (390 px): nada desborda.
 *  + cero errores de consola.
 *
 * Escribe en el Taller Demo y borra SOLO lo que creó (por id), en un finally.
 *
 *   npm run dev  (en otra terminal)
 *   set -a && . ../../Documents/estudio_iara/.secrets/mp_demo_meta_review.env && set +a
 *   node qa_turnos.cjs
 */
const fs = require('fs');
const { chromium } = require('/Users/iaraaguilar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const EXEC = process.env.PW_CHROME
    || '/Users/iaraaguilar/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp';
const DEMO = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const secretos = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8'));
const SB = secretos.project_url.replace(/\/$/, '');
const KEY = secretos.service_role_key;

const rest = async (path, init = {}) => {
    const r = await fetch(`${SB}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${t}`);
    return t ? JSON.parse(t) : null;
};

// La cuenta de días igual que la app (UTC puro sobre YYYY-MM-DD).
const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sumar = (d, n) => { const [a, m, dd] = d.split('-').map(Number); const f = new Date(Date.UTC(a, m - 1, dd + n)); return f.toISOString().slice(0, 10); };
const lunesDe = d => { const [a, m, dd] = d.split('-').map(Number); const dow = new Date(Date.UTC(a, m - 1, dd)).getUTCDay(); return sumar(d, dow === 0 ? -6 : 1 - dow); };

let ok = 0, fail = 0;
const check = (nombre, cond, detalle = '') => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}`); } else { fail++; console.log(`  ✗ ${nombre} ${detalle}`); }
};

(async () => {
    const PASS = process.env.MP_DEMO_PASSWORD || process.env.DEMO_PASS;
    if (!PASS) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }

    const inicio = new Date().toISOString();
    const lunesProximo = sumar(lunesDe(hoyAR()), 7);
    const MIE = sumar(lunesProximo, 2);
    const MAR = sumar(lunesProximo, 1);
    const JUE = sumar(lunesProximo, 3);

    const antes = (await rest(`talleres?id=eq.${DEMO}&select=config_turnos`))[0].config_turnos;
    await rest(`talleres?id=eq.${DEMO}`, { method: 'PATCH', body: JSON.stringify({ config_turnos: { ...antes, habilitado: true } }) });

    const browser = await chromium.launch({ executablePath: EXEC });
    // En español y en la zona de Argentina: es donde un día convertido se corre al de antes.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
    const errores = [];
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    page.on('pageerror', e => errores.push(String(e)));

    const dia = d => page.locator(`section[data-dia="${d}"]`);
    const cerrarVelos = async () => {
        for (const sel of ['button:has-text("Cerrar")', 'button:has-text("Omitir")', 'button:has-text("Entendido")']) {
            const b = page.locator(`div.fixed.inset-0 ${sel}`).first();
            if (await b.isVisible().catch(() => false)) await b.click({ force: true }).catch(() => {});
        }
    };

    try {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
        await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
        await page.fill('input[type=password]', PASS);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !document.querySelector('input[type=password]') && !document.body.innerText.includes('INGRESANDO'), null, { timeout: 45000 });
        await page.waitForTimeout(1500);
        await cerrarVelos();

        // El menú: entra por el lateral (goto a otra ruta pierde la sesión).
        const nav = page.locator('nav a[href="/turnos"]').first();
        check('Turnos está en el menú con el calendario prendido', await nav.isVisible());
        await nav.click();
        await page.waitForSelector('h1:has-text("Turnos")', { timeout: 15000 });
        await page.click('button[aria-label="Semana siguiente"]');
        await page.waitForSelector(`section[data-dia="${MIE}"]`);
        check('la semana arranca el lunes y tiene 6 días sin domingo', await page.locator('section[data-dia]').count() === 6
            && await page.locator(`section[data-dia="${lunesProximo}"]`).count() === 1);

        // ── 1. Turno de un cliente cargado ──
        await page.click('button:has-text("Nuevo turno")');
        const dlg = page.locator('[role=dialog]');
        await dlg.locator('input[type=date]').fill(MIE);
        await dlg.locator('input[type=time]').fill('10:30');
        await dlg.locator('input[placeholder^="Buscar por nombre"]').fill('Nicol');
        await dlg.locator('button:has-text("Nicolás Torres")').first().click();
        const chipBici = dlg.locator('button.rounded-full').first();
        const hayBici = await chipBici.isVisible().catch(() => false);
        const nombreBici = hayBici ? (await chipBici.innerText()).trim() : null;
        if (hayBici) await chipBici.click();
        await dlg.locator('input[placeholder^="Service de horquilla"]').fill('Service de horquilla QA');
        await dlg.locator('button:has-text("Anotar el turno")').click();
        await page.waitForSelector(`section[data-dia="${MIE}"] button[data-turno]`, { timeout: 10000 });
        const txtMie = await dia(MIE).innerText();
        check('el turno cae en su día (miércoles)', txtMie.includes('10:30') && txtMie.includes('Nicolás Torres'), JSON.stringify(txtMie));
        check('🔴 control negativo: NO cae el día de antes', !(await dia(MAR).innerText()).includes('Nicolás Torres'));
        check('la cabecera cuenta 1 turno', txtMie.includes('1 turno'));
        if (nombreBici) check('muestra la bici elegida', txtMie.includes(nombreBici.split(' ')[0]));

        // ── 2. Alguien que no está cargado ──
        await page.click('button:has-text("Nuevo turno")');
        await dlg.locator('input[type=date]').fill(MIE);
        await dlg.locator('button:has-text("No está cargado")').click();
        await dlg.locator('input[placeholder="Nombre"]').fill('Prueba QA Turnos');
        await dlg.locator('input[placeholder^="Celular"]').fill('1155559999');
        await dlg.locator('button:has-text("Anotar el turno")').click();
        await page.waitForFunction(d => document.querySelector(`section[data-dia="${d}"]`)?.innerText.includes('Prueba QA Turnos'), MIE, { timeout: 10000 });
        const txt2 = await dia(MIE).innerText();
        check('el que no está cargado queda anotado, sin hora', txt2.includes('Prueba QA Turnos') && txt2.includes('S/H'));
        check('la cabecera cuenta 2 turnos', txt2.includes('2 turnos'));
        const orden = txt2.indexOf('10:30') < txt2.indexOf('S/H');
        check('el que tiene hora va antes que el que no', orden);

        // ── 3. Día reservado ──
        await page.click('button:has-text("Reservar tiempo")');
        await dlg.locator('input[type=date]').fill(JUE);
        await dlg.locator('input[placeholder^="Armar el pedido"]').fill('Armar pedido Scott QA');
        await dlg.locator('button:has-text("Reservar")').last().click();
        await page.waitForFunction(d => document.querySelector(`section[data-dia="${d}"]`)?.innerText.includes('Armar pedido Scott QA'), JUE, { timeout: 10000 });
        check('el día reservado lo dice en la cabecera', (await dia(JUE).locator('header').innerText()).includes('Reservado'));

        await page.waitForSelector('[role=dialog]', { state: 'detached', timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/turnos_compu.png`, fullPage: true });

        // ── 4. No vino y volver ──
        await dia(MIE).locator('button[data-turno]:has-text("Nicolás Torres")').click();
        await dlg.locator('button:has-text("No vino")').click();
        await page.waitForFunction(d => document.querySelector(`section[data-dia="${d}"]`)?.innerText.includes('No vino'), MIE, { timeout: 10000 });
        check('No vino queda a la vista', true);
        await dia(MIE).locator('button[data-turno]:has-text("Nicolás Torres")').click();
        await dlg.locator('button:has-text("Volver a dejarlo en pie")').click();
        await page.waitForFunction(d => !document.querySelector(`section[data-dia="${d}"]`)?.innerText.includes('No vino'), MIE, { timeout: 10000 });
        check('vuelve a quedar en pie', true);

        // ── 5. Llegó → la orden abre con el cliente (y la bici) ──
        await dia(MIE).locator('button[data-turno]:has-text("Nicolás Torres")').click();
        await dlg.locator('button:has-text("Llegó")').click();
        await page.waitForTimeout(1500);
        const txtOrden = await page.locator('[role=dialog]').last().innerText();
        check('Llegó abre la orden con el cliente', txtOrden.includes('Nicolás'), JSON.stringify(txtOrden.slice(0, 200)));
        if (nombreBici) check('…y con la bici ya elegida (paso de definir el service)', !/Seleccion|Elegí la bici|SELECCION/i.test(txtOrden.slice(0, 120)));
        await page.screenshot({ path: `${OUT}/turnos_llego.png` });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        const fila = (await rest(`turnos?taller_id=eq.${DEMO}&creado_at=gte.${encodeURIComponent(inicio)}&nombre=is.null&tipo=eq.turno&select=estado`))[0];
        check('cerrar la orden sin guardar NO marca el turno como que vino', fila?.estado === 'confirmado', JSON.stringify(fila));

        // ── 6. Cancelar y liberar ──
        await dia(MIE).locator('button[data-turno]:has-text("Prueba QA Turnos")').click();
        await dlg.locator('button:has-text("Cancelar")').last().click();
        await page.locator('[role=dialog] button:has-text("Cancelar el turno")').click();
        await page.waitForFunction(d => !document.querySelector(`section[data-dia="${d}"]`)?.innerText.includes('Prueba QA Turnos'), MIE, { timeout: 10000 });
        check('cancelado sale del calendario', true);
        await dia(JUE).locator('button[data-turno]').first().click();
        await dlg.locator('button:has-text("Liberar")').first().click();
        await page.locator('[role=dialog] button:has-text("Liberar")').last().click();
        await page.waitForFunction(d => !document.querySelector(`section[data-dia="${d}"]`)?.innerText.includes('Armar pedido'), JUE, { timeout: 10000 });
        check('liberado sale del calendario', (await dia(JUE).locator('header').innerText()).includes('Libre'));

        // ── 7. Celular ──
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(600);
        const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check('en el celular nada desborda', desborde <= 0, `sobran ${desborde}px`);
        await page.screenshot({ path: `${OUT}/turnos_celu.png`, fullPage: true });

        const reales = errores.filter(e => !/Download the React DevTools|favicon/.test(e));
        check('cero errores de consola', reales.length === 0, JSON.stringify(reales.slice(0, 3)));
    } catch (e) {
        fail++;
        console.log('  ✗ el recorrido se cortó:', e.message);
        await page.screenshot({ path: `${OUT}/turnos_error.png`, fullPage: true }).catch(() => {});
    } finally {
        // Solo lo que creó esta corrida, por id.
        const creados = await rest(`turnos?taller_id=eq.${DEMO}&creado_at=gte.${encodeURIComponent(inicio)}&select=id,nombre,cliente_id`);
        for (const t of creados) await rest(`turnos?id=eq.${t.id}`, { method: 'DELETE' });
        const qa = await rest(`clientes?taller_id=eq.${DEMO}&nombre=eq.${encodeURIComponent('Prueba QA Turnos')}&select=id`);
        for (const c of qa) await rest(`clientes?id=eq.${c.id}`, { method: 'DELETE' });
        await rest(`talleres?id=eq.${DEMO}`, { method: 'PATCH', body: JSON.stringify({ config_turnos: antes }) });
        console.log(`  (limpieza: ${creados.length} turnos, ${qa.length} clientes de prueba; config del Demo restaurada)`);
        await browser.close();
        console.log(`\nqa_turnos: ${ok} ok, ${fail} fallaron`);
        process.exit(fail ? 1 : 0);
    }
})();
