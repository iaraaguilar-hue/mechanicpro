/**
 * ¿SE PUEDE FINALIZAR UNA ORDEN SIN QUE SE ABRAN VENTANAS DE MÁS? (2-oct-2026)
 *
 * 🔴 POR QUÉ EXISTE: Leandro (Probikes) avisó que al finalizar "se le abren muchas ventanas"
 * y no puede terminar. Medido: Probikes tiene prendido el candado de tareas y TODAS sus
 * órdenes abiertas llegaban con algo sin tildar, así que cada cierre abría "Faltan N
 * tareas" encima de la ventana de finalizar, y su botón ("Ir a la lista de tareas")
 * cerraba todo sin llevar a ninguna lista. Ahora lo que falta se tilda adentro de la misma
 * ventana (`TildarAntesDeCerrar`).
 *
 * QUÉ MIDE, como lo hace el mecánico, con la configuración de PROBIKES puesta sobre el Demo
 * (por `page.route`, sin tocar la base), en una pantalla de compu vieja (1280×720) y con el
 * procesador 6 veces más lento:
 *   1. al abrir Finalizar, lo que falta tildar está ARRIBA de la ventana;
 *   2. CONTROL NEGATIVO: con algo sin tildar, el botón verde está APAGADO y dice por qué a
 *      la vista (si estuviera prendido, el candado no estaría mirando lo que creo);
 *   3. se tilda ahí mismo, el botón se prende, y al cerrar NUNCA hay más de una ventana
 *      encima de otra ni aparece "Faltan N tareas";
 *   4. DOBLE CLIC en el botón verde = UN solo cierre: se cuentan los pedidos de mensaje
 *      automático al cliente, tiene que haber exactamente 1;
 *   5. ninguna pestaña nueva del navegador.
 *
 * No manda ningún WhatsApp ni sube PDF (se interceptan). La orden se restaura completa en
 * un `finally` y se borran por id los recordatorios que haya creado la corrida.
 *
 *   npm run dev  (en otra terminal)
 *   MP_DEMO_PASSWORD=… node qa_finalizar.cjs
 */
const fs = require('fs');
const { chromium, navegador } = require('./qa_playwright.cjs');

const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const S = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8'));
const cab = { apikey: S.service_role_key, Authorization: `Bearer ${S.service_role_key}`, 'Content-Type': 'application/json' };
const api = (r, o = {}) => fetch(`${S.project_url.replace(/\/$/, '')}/rest/v1/${r}`, { ...o, headers: { ...cab, ...(o.headers || {}) } });
const CPU = Number(process.env.CPU || 6);

const fallos = [];
const ok = (t) => console.log('  ✅ ' + t);
const mal = (t) => { console.log('  ❌ ' + t); fallos.push(t); };

(async () => {
    if (!process.env.MP_DEMO_PASSWORD) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }
    // Una orden en curso del Demo con tareas sin tildar. Se elige sola: no se ata a un número
    // que mañana puede estar cerrado.
    const abiertas = await (await api(`servicios?taller_id=eq.${DEMO}&estado=eq.in_progress&eliminado_en=is.null&select=*&order=numero_orden.desc`)).json();
    const srv = abiertas.find(s => (s.tareas_extra || []).some(t => !t.hecha)) || abiertas[0];
    if (!srv) { console.error('El Demo no tiene órdenes en curso'); process.exit(2); }
    const inicio = new Date().toISOString();
    console.log(`orden #${srv.numero_orden} (${srv.id})`);

    const b = await chromium.launch({ executablePath: navegador });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    // Después de abrir la propia: si no, la primera pestaña cuenta como "nueva".
    let pestañas = 0;
    ctx.on('page', () => { pestañas++; });
    const cdp = await ctx.newCDPSession(page);
    page.on('pageerror', e => mal('error en la página: ' + String(e).slice(0, 160)));

    await page.route('**/rest/v1/talleres*', async (route) => {
        const resp = await route.fetch();
        let body = await resp.text();
        try {
            const j = JSON.parse(body);
            const f = (t) => ({ ...t, config_avances: { habilitado: true },
                config_notificaciones: { ...(t.config_notificaciones || {}), tareas_habilitado: true, bloquear_finalizacion: true, momento_diagnostico: 'final' },
                config_mecanicos: { habilitado: true, nombres: ['Lean', 'Luchi'] } });
            body = JSON.stringify(Array.isArray(j) ? j.map(f) : f(j));
        } catch { }
        await route.fulfill({ response: resp, body });
    });
    // Como en Probikes: el taller TIENE orden de venta al ERP, y leer su catálogo tarda.
    // Ese rato (acá 3 s) es el hueco donde entra el segundo clic de una compu lenta: sin
    // ERP la cadena no espera nada y el doble clic no puede hacer daño, así que el Demo
    // pelado daba verde con la protección sacada (control del 2-oct). El webhook va a una
    // URL que no existe y se intercepta: no sale nada.
    const ERP = 'https://qa-erp.invalid/orden';
    let ordenesAlERP = 0;
    await page.route('**/rest/v1/taller_configuraciones*', async (route) => {
        const resp = await route.fetch();
        let body = await resp.text();
        try { const j = JSON.parse(body); const f = (t) => ({ ...t, webhook_orden_url: ERP }); body = JSON.stringify(Array.isArray(j) ? (j.length ? j.map(f) : [{ webhook_orden_url: ERP, webhook_entregado_url: null }]) : f(j)); } catch { }
        await route.fulfill({ response: resp, body });
    });
    // Y el catálogo tarda 3 s y NO contesta. Así la cadena no muestra el aviso de repuestos
    // (un candado que no pudo medir no avisa) y va derecho al cierre: es el caso del 75% de
    // las órdenes de Probikes y el único donde el segundo clic hace daño. Con el aviso de por
    // medio, las dos cadenas caen en la MISMA ventana y el doble clic no se nota: medido el
    // 2-oct, ese armado daba verde con la protección sacada.
    await page.route('**/rest/v1/productos_taller*', async (route) => {
        await new Promise(r => setTimeout(r, 3000));
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"qa: catálogo lento"}' });
    });
    await page.route(ERP + '*', r => { ordenesAlERP++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    let mensajes = 0;
    await page.route('**/functions/v1/automatizaciones-wa*', r => { mensajes++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enviados":0}' }); });
    await page.route('**/storage/v1/object/ordenes_trabajo/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"x"}' }));
    await page.addInitScript(() => {
        window.__maxApiladas = 0; window.__titulos = [];
        window.open = function () { window.__titulos.push('window.open'); return null; };
        new MutationObserver(() => {
            const vs = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')];
            window.__maxApiladas = Math.max(window.__maxApiladas, vs.length);
            for (const d of vs) {
                const t = (d.querySelector('h2,h3')?.innerText || '').trim();
                if (t && !window.__titulos.includes(t)) window.__titulos.push(t);
            }
        }).observe(document, { childList: true, subtree: true });
    });

    try {
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
        await page.fill('input[type=password]', process.env.MP_DEMO_PASSWORD);
        await page.click('button[type=submit]');
        await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 60000 });
        await page.waitForFunction(() => !document.querySelector('input[type=password]'), { timeout: 60000 });
        await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
        await page.waitForTimeout(4000);
        const ov = page.locator('div.fixed.inset-0 button').last();
        if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch { } }
        await page.waitForTimeout(1000);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

        // La fila se abre con SU botón Finalizar (la fila entera no abre nada).
        const fila = page.locator('tr').filter({ hasText: '#' + String(srv.numero_orden).padStart(4, '0') }).first();
        await fila.scrollIntoViewIfNeeded();
        await fila.getByRole('button', { name: /^Finalizar$/ }).click();
        const verde = page.getByRole('button', { name: /Finalizar Service \(Confirmar\)/ });
        await verde.waitFor({ timeout: 60000 });
        await page.waitForTimeout(1500);

        // 1. lo que falta, arriba
        const bloque = page.locator('[data-tildar-al-cerrar="pendiente"]');
        if (await bloque.count()) {
            const y = await bloque.evaluate(el => el.getBoundingClientRect().top - el.closest('[role=dialog]').getBoundingClientRect().top);
            y < 200 ? ok(`lo que falta tildar está arriba de la ventana (a ${Math.round(y)} px del borde)`) : mal(`lo que falta tildar quedó abajo (a ${Math.round(y)} px)`);
        } else mal('no aparece lo que falta tildar adentro de la ventana de finalizar');

        // 2. control negativo: apagado y con el motivo a la vista
        (await verde.isDisabled()) ? ok('con algo sin tildar, el botón verde está apagado') : mal('con algo sin tildar, el botón verde está PRENDIDO (el candado no frena)');
        const motivo = page.locator('[data-motivo-apagado]');
        (await motivo.count() && await motivo.isVisible()) ? ok(`dice por qué: "${(await motivo.innerText()).trim()}"`) : mal('el botón apagado no dice por qué a la vista');

        // 3. tildar ahí mismo
        for (let i = 0; i < 20; i++) {
            const caja = bloque.locator('button[role=checkbox][data-state=unchecked]').first();
            if (!(await caja.count())) break;
            await caja.click();
            await page.waitForTimeout(1200);
        }
        await page.locator('[data-tildar-al-cerrar="completo"]').waitFor({ timeout: 20000 }).catch(() => { });
        (await verde.isEnabled()) ? ok('tildado todo, el botón verde se prende') : mal('tildado todo, el botón verde sigue apagado');

        // 4. doble clic, como el que no ve reaccionar a una compu lenta
        await verde.dblclick();
        // Se espera a que pase UNA de dos cosas: que aparezca un aviso que hay que confirmar
        // (repuestos del ERP, orden en $0) o que la ventana de finalizar se cierre. Con el ERP
        // lento y la compu lenta el aviso tarda más de 2 s: mirar una sola vez y seguir
        // daba la orden por "no cerrada" con el cierre andando.
        for (let paso = 0; paso < 4; paso++) {
            const seguir = page.getByRole('button', { name: /Finalizar igual|Cerrar en \$0 igual/ }).last();
            let hay = false;
            for (let i = 0; i < 30; i++) {
                if (await seguir.count() && await seguir.isVisible()) { hay = true; break; }
                if (!(await page.getByRole('button', { name: /Finalizar Service \(Confirmar\)/ }).count())) break;
                await page.waitForTimeout(1000);
            }
            if (!hay) break;
            await seguir.click();
            await page.waitForTimeout(1500);
        }
        // El aviso al cliente sale DESPUÉS de cerrar la ventana (genera el PDF primero), y en
        // una compu lenta tarda: se espera a que llegue el primero y unos segundos más por
        // si viene un segundo. Cortar antes contaba 0 con el cierre bien hecho.
        for (let i = 0; i < 40 && mensajes === 0; i++) await page.waitForTimeout(1000);
        await page.waitForTimeout(6000);
        const r = await page.evaluate(() => ({ max: window.__maxApiladas, titulos: window.__titulos }));
        r.titulos.some(t => /Faltan .* tarea/.test(t)) ? mal('apareció la ventana "Faltan N tareas"') : ok('no apareció la ventana "Faltan N tareas"');
        r.max <= 2 ? ok(`nunca hubo más de ${r.max} ventana(s) una encima de otra`) : mal(`llegó a haber ${r.max} ventanas una encima de otra`);
        mensajes === 1 ? ok('doble clic = un solo cierre (1 aviso al cliente)') : mal(`doble clic = ${mensajes} avisos al cliente (tiene que ser 1)`);
        ordenesAlERP <= 1 ? ok(`doble clic = ${ordenesAlERP} orden de venta al ERP (como mucho 1)`) : mal(`doble clic = ${ordenesAlERP} órdenes de venta al ERP`);
        pestañas === 0 && !r.titulos.includes('window.open') ? ok('ninguna pestaña nueva del navegador') : mal(`se abrieron pestañas nuevas (${pestañas})`);
        const [despues] = await (await api(`servicios?id=eq.${srv.id}&select=estado`)).json();
        despues?.estado === 'ready' ? ok('la orden quedó finalizada') : mal(`la orden quedó en "${despues?.estado}"`);
        console.log('  ventanas que se vieron: ' + r.titulos.join(' · '));
    } finally {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => { });
        await b.close();
        const campos = ['estado', 'fecha_finalizacion', 'notas_mecanico', 'notas_internas', 'checklist_data', 'avisar_el', 'avisar_motivo',
            'mecanico_id', 'mecanico_nombre', 'webhook_erp_disparado', 'webhook_erp_ok', 'webhook_erp_detalle', 'webhook_erp_at', 'etapas_data', 'tareas_extra'];
        const patch = Object.fromEntries(campos.filter(c => c in srv).map(c => [c, srv[c]]));
        const rr = await api(`servicios?id=eq.${srv.id}&taller_id=eq.${DEMO}`, { method: 'PATCH', body: JSON.stringify(patch) });
        console.log(`  limpieza: orden #${srv.numero_orden} restaurada (${rr.status})`);
        const rec = await (await api(`recordatorios?taller_id=eq.${DEMO}&bicicleta_id=eq.${srv.bicicleta_id}&fecha_asignacion=gte.${inicio}&select=id,componente`)).json();
        for (const x of rec) await api(`recordatorios?id=eq.${x.id}&taller_id=eq.${DEMO}`, { method: 'DELETE' });
        if (rec.length) console.log('  limpieza: recordatorios borrados: ' + rec.map(x => x.componente).join(', '));
    }
    console.log(fallos.length ? `\n🔴 ${fallos.length} problema(s)` : '\n🟢 se finaliza en una sola ventana, con el candado andando');
    process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
