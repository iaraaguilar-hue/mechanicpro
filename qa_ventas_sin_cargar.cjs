/**
 * «BICIS VENDIDAS PARA CARGAR» EN CLIENTES: ¿SE PUEDE USAR? (2-oct-2026)
 *
 * 🔴 POR QUÉ EXISTE: Iara entró a Clientes y vio el panel así: «se ve demasiado, es
 * horrible, no puedo subir el menú desplegable, y cuando dice pendiente de confirmación no
 * puedo apretar». Ocupaba la pantalla entera, no se plegaba (con una venta para confirmar
 * quedaba abierto a la fuerza) y la venta para confirmar no tenía botón.
 *
 * QUÉ MIDE, en una compu chica (1280×720), con las ventas de Probikes del 2-oct (nombres
 * inventados, `qa_ventas_sin_cargar.fixture.json`) inyectadas en el Demo por `page.route`:
 *   1. que la lista de clientes («Tus clientes y sus bicis») se vea SIN bajar: el panel no
 *      puede comerse la pantalla;
 *   2. que la flecha PLIEGUE (control negativo: la versión vieja no plegaba con ventas para
 *      confirmar, así que este punto daba rojo) y que siga plegado al volver a la pantalla;
 *   3. que cada venta para confirmar tenga su «Cargar al dueño» a la vista;
 *   4. que el botón abra el formulario con la bici, el talle y la fecha de la venta puestos;
 *   5. que al guardar, la venta se marque como resuelta (se llama a
 *      `resolver_venta_sin_cargar` con el cliente y la bici recién creados) y salga de la lista.
 *
 * El RPC se intercepta (las ventas inyectadas no existen en la base). El cliente, la bici y
 * los avisos que crea el paso 5 en el Demo se borran por id en el `finally`.
 *
 *   npm run dev  (en otra terminal)
 *   MP_DEMO_PASSWORD=… node qa_ventas_sin_cargar.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium, navegador } = require('./qa_playwright.cjs');

const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const VENTAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa_ventas_sin_cargar.fixture.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8'));
const cab = { apikey: S.service_role_key, Authorization: `Bearer ${S.service_role_key}`, 'Content-Type': 'application/json' };
const api = (r, o = {}) => fetch(`${S.project_url.replace(/\/$/, '')}/rest/v1/${r}`, { ...o, headers: { ...cab, ...(o.headers || {}) } });
const NOMBRE_QA = 'QA Dueño Venta Empresa';

const fallos = [];
const ok = (t) => console.log('  ✅ ' + t);
const mal = (t) => { console.log('  ❌ ' + t); fallos.push(t); };

(async () => {
    if (!process.env.MP_DEMO_PASSWORD) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }
    const b = await chromium.launch({ executablePath: navegador });
    const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', e => mal('error en la página: ' + String(e).slice(0, 160)));
    let rpc = null;
    await page.route('**/rest/v1/altas_desde_erp*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VENTAS) }));
    await page.route('**/rest/v1/rpc/resolver_venta_sin_cargar*', r => { rpc = JSON.parse(r.request().postData() || '{}'); return r.fulfill({ status: 204, body: '' }); });

    const ir = async (nombre) => {
        await page.locator('nav[data-tour="nav"] a').filter({ hasText: nombre }).first().click({ force: true });
        await page.waitForTimeout(2500);
    };
    const panel = page.locator('[data-ventas-sin-cargar]');
    try {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => { try { localStorage.removeItem('mp_ventas_sin_cargar_plegado'); } catch { } });
        await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
        await page.fill('input[type=password]', process.env.MP_DEMO_PASSWORD);
        await page.click('button[type=submit]');
        await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 60000 });
        await page.waitForFunction(() => !document.querySelector('input[type=password]'), { timeout: 60000 });
        await page.evaluate(() => { localStorage.setItem('mechanicpro_tour_v3', 'visto'); localStorage.removeItem('mp_ventas_sin_cargar_plegado'); });
        await page.waitForTimeout(3500);
        const ov = page.locator('div.fixed.inset-0 button').last();
        if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch { } }
        await ir('Clientes');
        await panel.waitFor({ timeout: 20000 });

        // 1. la lista de clientes a la vista sin bajar
        const yLista = await page.getByText('Tus clientes y sus bicis').evaluate(el => el.getBoundingClientRect().top);
        const alto = Math.round((await panel.boundingBox()).height);
        yLista < 720 ? ok(`la lista de clientes se ve sin bajar (empieza en ${Math.round(yLista)} px; el panel mide ${alto} px)`)
            : mal(`la lista de clientes empieza en ${Math.round(yLista)} px: hay que bajar para verla (el panel mide ${alto} px)`);

        // 3. un «Cargar al dueño» por venta para confirmar
        const aConfirmar = VENTAS.filter(v => v.resultado === 'a_revisar').length;
        const botones = await panel.getByRole('button', { name: /Cargar al dueño/ }).count();
        botones === aConfirmar ? ok(`${botones} ventas para confirmar, ${botones} botones «Cargar al dueño»`) : mal(`${aConfirmar} ventas para confirmar y ${botones} botones`);

        // 2. pliega, y se acuerda. 🔴 Se mide la ALTURA del panel, no si desaparecen los
        // botones: la primera versión de este punto contaba «Cargar al dueño» y daba verde
        // sobre el panel viejo, que nunca tuvo ese botón (control del 2-oct).
        const PLEGADO_MAX = 70;
        await panel.locator('button[aria-expanded]').first().click();
        await page.waitForTimeout(600);
        const altoPlegado = Math.round((await panel.boundingBox()).height);
        altoPlegado <= PLEGADO_MAX ? ok(`la flecha pliega el panel (de ${alto} a ${altoPlegado} px)`) : mal(`la flecha NO pliega el panel (sigue midiendo ${altoPlegado} px)`);
        await ir('Historial'); await ir('Clientes');
        await panel.waitFor({ timeout: 20000 });
        const altoAlVolver = Math.round((await panel.boundingBox()).height);
        altoAlVolver <= PLEGADO_MAX ? ok('al volver a Clientes sigue plegado') : mal(`al volver a Clientes se desplegó solo (${altoAlVolver} px)`);
        await panel.locator('button[aria-expanded]').first().click();
        await page.waitForTimeout(600);

        // 4. el formulario viene completado
        if (!botones) throw new Error('no hay ningún «Cargar al dueño» para seguir probando');
        await panel.getByRole('button', { name: /Cargar al dueño/ }).first().click();
        const dlg = page.locator('[role=dialog]').filter({ hasText: 'Cargar al dueño de la bici' });
        await dlg.waitFor({ timeout: 10000 });
        const valores = await dlg.locator('input').evaluateAll(xs => xs.map(x => x.value));
        const v0 = VENTAS[0];
        const tiene = (x) => valores.includes(x);
        tiene(v0.bici_modelo) && tiene(v0.bici_talle) && tiene(v0.fecha_venta)
            ? ok(`el formulario viene con ${v0.bici_modelo}, talle ${v0.bici_talle} y la fecha ${v0.fecha_venta}`)
            : mal(`el formulario no vino completado (tiene: ${valores.filter(Boolean).join(' | ')})`);

        // 5. guardar → se resuelve y sale de la lista
        await dlg.getByRole('button', { name: /Es un cliente nuevo/ }).click();
        await dlg.getByPlaceholder('Nombre y apellido').fill(NOMBRE_QA);
        const marca = dlg.getByPlaceholder('Marca');
        if (await marca.count() && !(await marca.inputValue())) await marca.fill('Specialized');
        await dlg.getByRole('button', { name: /^Guardar|Cargar la venta|Guardar venta/ }).last().click();
        await page.waitForTimeout(4000);
        rpc && rpc.p_resultado === 'confirmado' && rpc.p_id === v0.id && rpc.p_cliente_id && rpc.p_bicicleta_id
            ? ok('al guardar, la venta se marca como resuelta con el cliente y la bici nuevos')
            : mal('al guardar, NO se marcó la venta como resuelta: ' + JSON.stringify(rpc));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
        const quedan = await panel.getByRole('button', { name: /Cargar al dueño/ }).count();
        quedan === aConfirmar - 1 ? ok('y sale de la lista') : mal(`la lista sigue con ${quedan} para confirmar`);
    } finally {
        await b.close();
        // Limpieza por id: solo lo que creó esta corrida.
        const cli = await (await api(`clientes?taller_id=eq.${DEMO}&nombre=eq.${encodeURIComponent(NOMBRE_QA)}&select=id`)).json();
        for (const c of cli) {
            const bicis = await (await api(`bicicletas?taller_id=eq.${DEMO}&cliente_id=eq.${c.id}&select=id`)).json();
            for (const bi of bicis) {
                await api(`avisos_postventa?taller_id=eq.${DEMO}&bicicleta_id=eq.${bi.id}`, { method: 'DELETE' });
                await api(`bicicletas?id=eq.${bi.id}&taller_id=eq.${DEMO}`, { method: 'DELETE' });
            }
            await api(`clientes?id=eq.${c.id}&taller_id=eq.${DEMO}`, { method: 'DELETE' });
            console.log(`  limpieza: borrado el cliente de prueba ${c.id} y sus ${bicis.length} bici(s)`);
        }
    }
    console.log(fallos.length ? `\n🔴 ${fallos.length} problema(s)` : '\n🟢 el panel se pliega, no tapa la lista y cada venta se carga con un botón');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
