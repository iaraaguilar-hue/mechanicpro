/**
 * "El precio que no baja" (14-oct-2026, Pro Bike Salta): la pantalla avisa ANTES de guardar.
 *
 * El candado real es de la base y se prueba con `tools/probar_precio_que_no_baja.cjs`. Este chequeo
 * mira lo que ve la persona en la orden, SIN escribir nada en la base: el ajuste y el rol se simulan
 * interceptando las lecturas (`talleres`, `usuarios`) y toda escritura de la orden se frena.
 *
 *   0. control negativo: ajuste APAGADO + mecánico con precio 1 → no aparece ningún aviso;
 *   1. ajuste prendido + MECÁNICO: repuesto del catálogo por debajo de la lista → aviso rojo con el
 *      texto exacto; por encima → se va; con el precio bajo, GUARDAR no escribe nada y dice cuál es;
 *      renglón a mano → pasa y el mecánico NO ve «sin precio de lista»;
 *   2. ajuste prendido + ADMIN: precio 1 sin aviso; el renglón a mano sí lleva «sin precio de lista»,
 *      el del catálogo con precio no.
 *
 *   npm run dev  (en otra terminal)
 *   MP_DEMO_PASSWORD=… node qa_precio_que_no_baja.cjs
 */
const fs = require('fs');
const { chromium, navegador } = require('./qa_playwright.cjs');
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const S = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8'));
const cab = { apikey: S.service_role_key, Authorization: `Bearer ${S.service_role_key}`, 'Content-Type': 'application/json' };
const api = (r) => fetch(`${S.project_url.replace(/\/$/, '')}/rest/v1/${r}`, { headers: cab });
const fallos = [];
const ok = (t) => console.log('  ✅ ' + t);
const mal = (t) => { console.log('  ❌ ' + t); fallos.push(t); };
const chk = (c, t) => (c ? ok(t) : mal(t));

(async () => {
    if (!process.env.MP_DEMO_PASSWORD) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }
    const prods = await (await api(`productos_taller?taller_id=eq.${DEMO}&activo=eq.true&categoria=eq.part&precio=gte.5000&select=nombre,precio&order=veces_usado.desc&limit=1`)).json();
    const prod = prods[0];
    const abiertas = await (await api(`servicios?taller_id=eq.${DEMO}&estado=eq.in_progress&eliminado_en=is.null&select=id,numero_orden&order=numero_orden.desc&limit=1`)).json();
    const orden = abiertas[0];
    if (!prod || !orden) { console.error('Al Demo le falta un repuesto con precio o una orden en curso'); process.exit(2); }
    const lista = Math.round(Number(prod.precio));
    const textoEsperado = `El precio de lista es $${lista.toLocaleString('es-AR')}. Podés cobrar más, no menos. Un descuento lo hace el administrador.`;
    console.log(`repuesto "${prod.nombre}" lista ${lista} · orden #${orden.numero_orden}`);

    const b = await chromium.launch({ executablePath: navegador });
    let escrituras = 0;
    const corrida = async (nombre, { flag, rol }, fn) => {
        console.log(`\n${nombre}`);
        const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await ctx.newPage();
        const errores = [];
        page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
        const dialogos = [];
        page.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
        await page.route('**/rest/v1/talleres*', async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            const resp = await route.fetch();
            let body = await resp.text();
            try { const j = JSON.parse(body); const f = (t) => ({ ...t, mecanico_no_baja_repuestos: flag }); body = JSON.stringify(Array.isArray(j) ? j.map(f) : f(j)); } catch { }
            await route.fulfill({ response: resp, body });
        });
        if (rol) await page.route('**/rest/v1/usuarios*', async (route) => {
            if (route.request().method() !== 'GET') return route.continue();
            const resp = await route.fetch();
            let body = await resp.text();
            try { const j = JSON.parse(body); const f = (u) => ({ ...u, rol }); body = JSON.stringify(Array.isArray(j) ? j.map(f) : f(j)); } catch { }
            await route.fulfill({ response: resp, body });
        });
        // Nada de esta prueba escribe en la base: toda escritura de la orden se frena y se cuenta.
        await page.route(/\/rest\/v1\/(servicios|servicio_items|productos_taller)(\?|$)/, async (route) => {
            const m = route.request().method();
            if (m === 'GET' || m === 'HEAD') return route.continue();
            escrituras++;
            return route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"qa: escritura frenada"}' });
        });
        await page.route('**/rest/v1/rpc/registrar_productos_usados*', (r) => { escrituras++; return r.fulfill({ status: 200, contentType: 'application/json', body: '0' }); });
        try {
            await page.goto(BASE, { waitUntil: 'domcontentloaded' });
            await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
            await page.fill('input[type=password]', process.env.MP_DEMO_PASSWORD);
            await page.click('button[type=submit]');
            await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO') && !document.querySelector('input[type=password]'), { timeout: 60000 });
            await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
            await page.waitForTimeout(4000);
            const ov = page.locator('div.fixed.inset-0 button').last();
            if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch { } }
            const fila = page.locator('tr').filter({ hasText: '#' + String(orden.numero_orden).padStart(4, '0') }).first();
            await fila.scrollIntoViewIfNeeded();
            await fila.getByRole('button', { name: 'Editar la orden' }).click();
            const dlg = page.getByRole('dialog').first();
            await dlg.getByRole('button', { name: '+ Agregar' }).waitFor({ timeout: 30000 });
            await fn({ page, dlg, dialogos });
            chk(errores.length === 0, 'sin errores de consola' + (errores.length ? ': ' + errores.join(' | ') : ''));
        } catch (e) { mal('se rompió la corrida: ' + String(e).slice(0, 300)); }
        finally { await ctx.close(); }
    };
    // Agrega un renglón de repuesto: lo escribe, (opcional) elige del catálogo, y pone el precio.
    const agregar = async (dlg, page, texto, { elegir, precio }) => {
        await dlg.getByRole('button', { name: '+ Agregar' }).click();
        const buscador = dlg.getByPlaceholder(/Buscá el repuesto/).last();
        await buscador.fill(texto);
        if (elegir) {
            const op = page.getByRole('option').filter({ hasText: texto }).first();
            await op.waitFor({ timeout: 10000 });
            await op.click();
        } else await buscador.press('Escape');
        const importe = dlg.getByPlaceholder('$ 0').last();
        await importe.fill(String(precio));
        await page.waitForTimeout(300);
    };
    const aviso = (dlg) => dlg.locator('[data-aviso="precio-bajo"]');
    const sinLista = (dlg) => dlg.locator('[data-aviso="sin-precio-de-lista"]');

    await corrida('0. control negativo: ajuste APAGADO, mecánico, precio 1', { flag: false, rol: 'mecanico' }, async ({ page, dlg }) => {
        await agregar(dlg, page, prod.nombre, { elegir: true, precio: 1 });
        chk((await aviso(dlg).count()) === 0, 'apagado: no aparece ningún aviso de precio');
        chk((await sinLista(dlg).count()) === 0, 'apagado: tampoco la marca «sin precio de lista»');
    });

    await corrida('1. ajuste PRENDIDO, mecánico', { flag: true, rol: 'mecanico' }, async ({ page, dlg, dialogos }) => {
        await agregar(dlg, page, prod.nombre, { elegir: true, precio: 1 });
        await aviso(dlg).first().waitFor({ timeout: 5000 }).catch(() => { });
        const txt = (await aviso(dlg).count()) ? (await aviso(dlg).first().innerText()).trim() : '';
        chk(txt === textoEsperado, `precio 1 con lista ${lista}: avisa «${txt}»`);
        const importe = dlg.getByPlaceholder('$ 0').last();
        await importe.fill(String(lista + 1000)); await page.waitForTimeout(300);
        chk((await aviso(dlg).count()) === 0, 'por encima de la lista: el aviso se va');
        await importe.fill(String(lista)); await page.waitForTimeout(300);
        chk((await aviso(dlg).count()) === 0, 'igual a la lista: el aviso se va');
        await importe.fill('1'); await page.waitForTimeout(300);
        escrituras = 0;
        await dlg.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
        await page.waitForTimeout(1500);
        chk(escrituras === 0, `con el precio bajo, GUARDAR no escribe nada en la base (escrituras: ${escrituras})`);
        chk(dialogos.some(d => d.includes('Revisá el precio') && d.includes(textoEsperado)), 'y le dice cuál es el precio de lista: ' + JSON.stringify(dialogos));
        await agregar(dlg, page, 'QA repuesto escrito a mano', { elegir: false, precio: 1 });
        chk((await aviso(dlg).count()) === 1, 'el renglón a mano no suma aviso (sigue solo el del repuesto de lista)');
        chk((await sinLista(dlg).count()) === 0, 'el mecánico NO ve «sin precio de lista» (es del administrador)');
    });

    await corrida('2. ajuste PRENDIDO, administrador', { flag: true, rol: null }, async ({ page, dlg }) => {
        await agregar(dlg, page, prod.nombre, { elegir: true, precio: 1 });
        chk((await aviso(dlg).count()) === 0, 'el administrador cobra 1 peso sin aviso');
        chk((await sinLista(dlg).count()) === 0, 'el repuesto con precio de lista no lleva la marca');
        await agregar(dlg, page, 'QA repuesto escrito a mano', { elegir: false, precio: 1 });
        chk((await sinLista(dlg).count()) === 1, 'el renglón a mano lleva «sin precio de lista»');
    });

    await b.close();
    console.log(fallos.length ? `\n❌ ${fallos.length} fallo(s)` : '\n🟢 todo verde');
    process.exit(fallos.length ? 1 : 0);
})();
