/**
 * Los recordatorios que salen solos, vistos en la pantalla (27-sep-2026).
 *
 * Origen (Iara): "que el mecánico ... sepa que los mensajes se envían solos. Como que
 * pueda decidir si lo quiere auditar o no". Y el agujero que había: con el WhatsApp
 * conectado, "Escribir recordatorio" mandaba sin mostrar el texto.
 *
 * Qué mira, con el Taller Demo y SIN mandar ni escribir nada (todo lo que escribiría o
 * mandaría se intercepta y se contesta acá):
 *   1. "Salen solos": la franja arriba, la tarjeta que salió dice "Salió solo el …" en
 *      vez del botón, la que no salió dice por qué y conserva el botón.
 *   2. "Los mando yo" con WhatsApp: el botón abre el texto EXACTO antes de mandar; no sale
 *      nada hasta "Mandar"; "Copiar mensaje" copia ese texto; lo que se manda es eso.
 *      Con la IA: la línea de la IA está en el texto que se ve. La tabla de próximos igual.
 *   3. Sin WhatsApp: wa.me como siempre, sin ¡ ni ¿.
 *   4. Configuración → Mensajes: la fila, guardar "Salen solos", la línea de cómo salen;
 *      sin WhatsApp la opción apagada con el motivo y el botón; el mecánico no la cambia;
 *      en Sport no aparece.
 * Control negativo: con "Los mando yo" la misma tarjeta NO dice "Salió solo" (si lo dijera,
 * el chequeo 1 no distingue nada).
 *
 *   npm run dev  (en otra terminal)
 *   MP_DEMO_PASSWORD=… node qa_recordatorios_solos.cjs
 *
 * Lee (solo lee) las alertas del Demo con la service_role del estudio para saber qué
 * tarjetas hay y con qué fecha: la misma cuenta que el panel (paridad probada en
 * `tools/paridad_motor_retencion.cjs`).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { chromium } = require('./qa_playwright.cjs');
const EXEC = process.env.PW_CHROME
    || require('./qa_playwright.cjs').navegador;
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO_ID = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const SECRETOS = '/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json';

function cargar(archivo) {
    const js = execFileSync(path.join(__dirname, 'node_modules/.bin/esbuild'), [
        archivo, '--bundle', '--platform=node', '--format=cjs', '--log-level=error', `--tsconfig=${path.join(__dirname, 'tsconfig.app.json')}`,
    ], { encoding: 'utf8', cwd: __dirname });
    const ctx = { module: { exports: {} }, console, Intl, Date, Math, JSON, Map, Set };
    ctx.exports = ctx.module.exports;
    vm.createContext(ctx);
    vm.runInContext(js, ctx);
    return ctx.module.exports;
}
const MOTOR = cargar(path.join(__dirname, '../supabase/functions/_shared/motor_retencion.ts'));
let BICIS_DEMO = [];
const PLANT = cargar(path.join(__dirname, 'src/lib/plantillasDelSistema.ts'));
const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

let mal = 0;
// SECCIONES=6,7 corre solo esas (para las pruebas de mutación); sin nada, todas.
const SECC = (process.env.SECCIONES || '').split(',').filter(Boolean);
const corre = (n) => !SECC.length || SECC.includes(String(n));
const ok = (cond, msg, det) => { console.log(`  ${cond ? '✅' : '🚩'} ${msg}`); if (!cond) { mal++; if (det !== undefined) console.log('     ', JSON.stringify(det).slice(0, 600)); } };

async function alertasDelDemo() {
    const { project_url: U, service_role_key: K } = JSON.parse(fs.readFileSync(SECRETOS, 'utf8'));
    const get = async (q) => (await fetch(`${U}/rest/v1/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })).json();
    const f = `taller_id=eq.${DEMO_ID}`;
    const [c, b, s, r] = await Promise.all([
        get(`clientes?select=*&${f}&eliminado_en=is.null`), get(`bicicletas?select=*&${f}`),
        get(`servicios?select=*,servicio_items(*)&${f}&eliminado_en=is.null`), get(`recordatorios?select=*&${f}`),
    ]);
    BICIS_DEMO = b;
    const al = MOTOR.alertasDeComponentes({ recordatorios: r, bicicletas: b, clientes: c, servicios: s.map(x => ({ ...x, items_extra: x.servicio_items || [] })), predictivo: true, hoy: hoyAR() });
    return al.filter(a => a.daysRemaining <= 0).sort((x, y) => x.id.localeCompare(y.id));
}

/** Un navegador logueado como el Demo, con el taller "como si" y todo lo que escribe interceptado. */
async function entrar(b, { envio = 'a_mano', wa = true, ia = false, plan = null, rol = null, filasAuto = [] } = {}) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const capturado = { enviar: [], contactos: [], patch: [], ia: 0, wame: [] };
    await ctx.route('**/rest/v1/talleres*', async (route) => {
        const req = route.request();
        if (req.method() === 'PATCH') { capturado.patch.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ status: 204, body: '' }); }
        const resp = await route.fetch();
        let body = await resp.json();
        const tocar = (t) => ({ ...t, recordatorios_envio: envio, wa_activo: wa, ia_mensajes_activa: ia, ...(plan ? { plan_actual: plan } : {}) });
        body = Array.isArray(body) ? body.map(tocar) : tocar(body);
        return route.fulfill({ response: resp, body: JSON.stringify(body) });
    });
    if (rol) await ctx.route('**/rest/v1/usuarios*', async (route) => {
        const resp = await route.fetch(); let body = await resp.json();
        const tocar = (u) => ({ ...u, rol });
        body = Array.isArray(body) ? body.map(tocar) : tocar(body);
        return route.fulfill({ response: resp, body: JSON.stringify(body) });
    });
    // `filasAuto` puede ser una función: así una prueba cambia lo que "hay en la base"
    // con la pestaña abierta (la corrida pasó mientras el mecánico miraba la pantalla).
    capturado.lecturasAuto = 0;
    await ctx.route('**/rest/v1/recordatorios_auto*', (route) => {
        capturado.lecturasAuto++;
        const u = new URL(route.request().url());
        const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
        let filas = typeof filasAuto === 'function' ? filasAuto() : filasAuto;
        if (u.searchParams.get('recordatorio_id')) filas = filas.filter(f => f.recordatorio_id === eq('recordatorio_id') && f.vence_el === eq('vence_el'));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filas) });
    });
    await ctx.route('**/rest/v1/contactos_retencion*', (route) => {
        if (route.request().method() === 'POST') { capturado.contactos.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ status: 201, body: '' }); }
        return route.continue();
    });
    // 🔴 Nada sale: el envío y la IA se contestan acá.
    await ctx.route('**/functions/v1/whatsapp-enviar', (route) => {
        capturado.enviar.push(JSON.parse(route.request().postData() || '{}'));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mensaje_id: '00000000-0000-0000-0000-000000000000' }) });
    });
    await ctx.route('**/functions/v1/mensaje-ia', (route) => {
        capturado.ia++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, linea: 'La cadena que le pusimos en junio ya hizo sus kilómetros.', firma: 'Luis', variante: 'ia_retencion' }) });
    });
    await ctx.route('https://wa.me/**', (route) => { capturado.wame.push(route.request().url()); return route.abort(); });
    ctx.on('page', (p) => { if (p.url().includes('wa.me')) capturado.wame.push(p.url()); });

    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
    await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
    await page.fill('input[type=password]', process.env.MP_DEMO_PASSWORD || process.env.DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO') && !document.querySelector('input[type=password]'), { timeout: 45000 });
    await page.waitForTimeout(3000);
    const ov = page.locator('div.fixed.inset-0 button').last();
    if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch { /* sin overlay */ } }
    return { ctx, page, capturado, errores };
}
const irA = async (page, nombre) => { await page.locator('nav a').filter({ hasText: nombre }).first().click({ force: true }); await page.waitForTimeout(2500); };
const tarjeta = (page, a) => page.locator('[data-tour="retencion-urgentes"] .grid > div').filter({ hasText: a.clientName }).filter({ hasText: a.component }).first();

(async () => {
    if (!(process.env.MP_DEMO_PASSWORD || process.env.DEMO_PASS)) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }
    const urg = await alertasDelDemo();
    if (urg.length < 3) { console.error(`ROTO: el Demo tiene ${urg.length} vencidos y hacen falta 3`); process.exit(2); }
    const [A, B, C] = urg;
    const hoy = hoyAR();
    const ahora = new Date().toISOString();
    const filasAuto = [
        { recordatorio_id: A.id, vence_el: A.dueDate.slice(0, 10), estado: 'enviado', motivo: null, dia: hoy, actualizado_at: ahora, mensajes_whatsapp: { estado: 'delivered', enviado_at: ahora } },
        { recordatorio_id: B.id, vence_el: B.dueDate.slice(0, 10), estado: 'omitido', motivo: 'le escribieron el 21/09 y entre recordatorios pasan 7 días', dia: hoy, actualizado_at: ahora, mensajes_whatsapp: null },
    ];
    const b = await chromium.launch({ executablePath: EXEC });

    if (corre(1)) {
    console.log('1. "Salen solos": la franja y cada tarjeta');
    {
        const { ctx, page, errores } = await entrar(b, { envio: 'solo', filasAuto });
        await irA(page, 'Retención');
        const franja = await page.locator('[data-franja-auto]').innerText().catch(() => '');
        ok(/salen solos a las 10 y media/i.test(franja) && /hoy salió 1/.test(franja), `franja arriba: "${franja.replace(/\s+/g, ' ').trim()}"`);
        const tA = tarjeta(page, A);
        ok(/Salió solo el \d\d\/\d\d\/\d\d/.test(await tA.innerText()), `${A.clientName}: dice "Salió solo el …"`);
        ok(await tA.getByRole('button', { name: /Escribir/ }).count() === 0, `${A.clientName}: sin el botón de escribir`);
        const tB = tarjeta(page, B);
        ok(/Hoy no salió solo: le escribieron el 21\/09/.test(await tB.innerText()), `${B.clientName}: dice por qué no salió`);
        ok(await tB.getByRole('button', { name: /Escribir recordatorio/ }).count() === 1, `${B.clientName}: conserva el botón`);
        ok(await tarjeta(page, C).getByRole('button', { name: /Escribir recordatorio/ }).count() === 1, `${C.clientName}: botón normal`);
        ok(errores.length === 0, 'sin errores de consola', errores);
        await ctx.close();
    }

    console.log('\n   control negativo: "Los mando yo" con las mismas filas');
    {
        const { ctx, page } = await entrar(b, { envio: 'a_mano', filasAuto: [] });
        await irA(page, 'Retención');
        ok(await page.locator('[data-franja-auto]').count() === 0, 'sin franja');
        ok(!/Salió solo/.test(await tarjeta(page, A).innerText()), `${A.clientName}: NO dice "Salió solo" (el chequeo distingue)`);
        await ctx.close();
    }

    }
    if (corre(2)) {
    console.log('\n2. "Los mando yo" con WhatsApp: se ve el texto antes de mandar');
    {
        const { ctx, page, capturado, errores } = await entrar(b, { envio: 'a_mano', wa: true, ia: false });
        await irA(page, 'Retención');
        await tarjeta(page, C).getByRole('button', { name: /Escribir recordatorio/ }).click();
        await page.waitForSelector('[data-mensaje-previo]', { timeout: 10000 });
        const texto = (await page.locator('[data-mensaje-previo]').innerText()).trim();
        ok(capturado.enviar.length === 0, 'al tocar "Escribir recordatorio" NO sale nada todavía');
        ok(/^Hola .+! Te escribo de Taller Demo para recordarte que toca revisar .+ en tu .+\. Querés que coordinemos un turno\?$/.test(texto), `se ve el texto: "${texto}"`);
        await page.getByRole('button', { name: /Copiar mensaje/ }).click();
        await page.waitForTimeout(300);
        const copiado = await page.evaluate(() => navigator.clipboard.readText());
        ok(copiado === texto, '"Copiar mensaje" copia ESE texto', { copiado });
        await page.getByRole('button', { name: /^Mandar$/ }).click();
        await page.waitForTimeout(1500);
        const env = capturado.enviar[0];
        ok(env && env.plantilla === 'recordatorio_mantenimiento', 'recién con "Mandar" sale, con la plantilla fija', env);
        ok(env && PLANT.componerPlantilla(env.plantilla, env.parametros) === texto, 'lo que se manda es exactamente lo que se vio', env && PLANT.componerPlantilla(env.plantilla, env.parametros));
        ok(capturado.contactos.length === 1 && capturado.contactos[0].canal === 'whatsapp_auto' && capturado.contactos[0].variante === 'fijo_recordatorio_mantenimiento', 'queda anotado el contacto (interceptado)', capturado.contactos);
        ok(await tarjeta(page, C).getByRole('button', { name: /Mensaje enviado/ }).count() === 1, 'la tarjeta pasa a "Mensaje enviado"');
        ok(await tarjeta(page, B).getByRole('button', { name: /Copiar Mensaje/ }).count() === 0, 'con WhatsApp, el "Copiar" suelto (que copiaba otro texto) ya no está en la tarjeta');

        // La tabla de próximos también pasa por el texto.
        const fila = page.locator('[data-tour="retencion-proximos"] tbody tr').first();
        if (await fila.count()) {
            const antes = capturado.enviar.length;
            await fila.locator('button[title*="Ver el recordatorio"]').click();
            await page.waitForSelector('[data-mensaje-previo]', { timeout: 10000 });
            ok(capturado.enviar.length === antes, 'tabla de próximos: abre el texto y no manda');
            await page.keyboard.press('Escape');
        } else console.log('  (el Demo no tiene próximos: la tabla no se probó)');
        ok(errores.length === 0, 'sin errores de consola', errores);
        await ctx.close();
    }

    console.log('\n   con la IA prendida: la línea de la IA está en el texto que se ve');
    {
        const { ctx, page, capturado } = await entrar(b, { envio: 'a_mano', wa: true, ia: true });
        await irA(page, 'Retención');
        await tarjeta(page, C).getByRole('button', { name: /Escribir recordatorio/ }).click();
        await page.waitForSelector('[data-mensaje-previo]', { timeout: 10000 });
        const texto = (await page.locator('[data-mensaje-previo]').innerText()).trim();
        ok(texto.includes('La cadena que le pusimos en junio ya hizo sus kilómetros.') && texto.startsWith('Hola ') && texto.includes('Te escribo yo, Luis de Taller Demo'), `se ve: "${texto}"`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await tarjeta(page, C).getByRole('button', { name: /Escribir recordatorio/ }).click();
        await page.waitForSelector('[data-mensaje-previo]', { timeout: 10000 });
        ok(capturado.ia === 1, 'cerrar y volver a abrir muestra el mismo texto sin pedirle otro a la IA', capturado.ia);
        await page.getByRole('button', { name: /^Mandar$/ }).click();
        await page.waitForTimeout(1500);
        const env = capturado.enviar[0];
        ok(env && env.plantilla === 'recontacto_personal' && PLANT.componerPlantilla(env.plantilla, env.parametros) === texto, 'sale recontacto_personal con ese mismo texto', env);
        await ctx.close();
    }

    }
    if (corre(3)) {
    console.log('\n3. Sin WhatsApp: wa.me como siempre, sin ¡ ni ¿');
    {
        const { ctx, page, capturado } = await entrar(b, { envio: 'a_mano', wa: false, ia: false });
        await irA(page, 'Retención');
        await tarjeta(page, C).getByRole('button', { name: /Escribir por WhatsApp/ }).click();
        await page.waitForTimeout(2000);
        const url = capturado.wame[0] || '';
        const texto = decodeURIComponent((url.split('text=')[1] || '').replace(/\+/g, ' '));
        ok(url.startsWith('https://wa.me/') && texto.startsWith('Hola ') && !/[¡¿]/.test(texto), `abre wa.me: "${texto}"`);
        ok(await page.locator('[data-mensaje-previo]').count() === 0, 'sin diálogo (el texto lo ve en WhatsApp)');
        await ctx.close();
    }

    }
    if (corre(4)) {
    console.log('\n4. Configuración → Mensajes');
    {
        const { ctx, page, capturado, errores } = await entrar(b, { envio: 'a_mano', wa: true });
        await irA(page, 'Configuración');
        await page.getByRole('tab', { name: 'Mensajes' }).click();
        await page.waitForTimeout(800);
        const fila = page.locator('[data-ajuste="recordatorios_auto"]');
        ok(await fila.isVisible(), 'la fila "Recordatorios de desgaste" está');
        const resumen = (await fila.locator('p').nth(1).innerText()).trim();
        ok(resumen.length < 40, `resumen corto (${resumen.length}): "${resumen}"`);
        await fila.locator('select').selectOption('solo');
        await page.waitForTimeout(1200);
        ok(capturado.patch.some(p => p.recordatorios_envio === 'solo'), 'guarda recordatorios_envio = solo (interceptado)', capturado.patch);
        ok(/Salen a las 10 y media, de lunes a sábado/.test(await fila.innerText()), 'cuenta en una línea cómo salen');
        ok(errores.length === 0, 'sin errores de consola', errores);
        await ctx.close();
    }
    {
        const { ctx, page } = await entrar(b, { envio: 'a_mano', wa: false });
        await irA(page, 'Configuración');
        await page.getByRole('tab', { name: 'Mensajes' }).click();
        await page.waitForTimeout(800);
        const fila = page.locator('[data-ajuste="recordatorios_auto"]');
        ok(await fila.locator('option[value="solo"]').isDisabled(), 'sin WhatsApp: "Salen solos" apagada');
        ok(/falta conectar el WhatsApp/.test(await fila.innerText()), 'y el motivo escrito al lado');
        await fila.getByRole('button', { name: 'Conectar WhatsApp' }).click();
        await page.waitForTimeout(800);
        ok(await page.locator('[data-ajuste="whatsapp"]').isVisible(), 'el botón lleva a conectar el WhatsApp');
        await ctx.close();
    }
    {
        const { ctx, page } = await entrar(b, { envio: 'a_mano', wa: true, rol: 'mecanico' });
        await irA(page, 'Configuración');
        await page.getByRole('tab', { name: 'Mensajes' }).click();
        await page.waitForTimeout(800);
        const fila = page.locator('[data-ajuste="recordatorios_auto"]');
        ok(await fila.locator('select').isDisabled() && /Lo cambia el administrador/.test(await fila.innerText()), 'el mecánico la ve pero no la cambia');
        await ctx.close();
    }
    {
        const { ctx, page } = await entrar(b, { envio: 'solo', wa: true, plan: 'Sport' });
        await irA(page, 'Configuración');
        await page.getByRole('tab', { name: 'Mensajes' }).click();
        await page.waitForTimeout(800);
        ok(await page.locator('[data-ajuste="recordatorios_auto"]').count() === 0, 'en Sport la fila no aparece');
        await irA(page, 'Retención');
        ok(await page.locator('[data-franja-auto]').count() === 0, 'en Sport tampoco la franja (aunque la columna diga "solo")');
        await ctx.close();
    }

    }
    if (corre(5)) {
    console.log('\n5. En el celular (390 px): nada desborda; capturas para mirar');
    {
        const OUT = process.env.OUT || path.join(require('os').tmpdir(), 'mp_recordatorios_solos');
        fs.mkdirSync(OUT, { recursive: true });
        const { ctx, page } = await entrar(b, { envio: 'solo', wa: true, filasAuto });
        await page.setViewportSize({ width: 390, height: 844 });
        const desborda = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        await page.locator('button[aria-label="Abrir menú"]').click().catch(() => {});
        await page.waitForTimeout(500);
        await page.locator('a').filter({ hasText: 'Retención' }).first().click({ force: true });
        await page.waitForTimeout(2500);
        ok(!(await desborda()), 'Retención con la franja y los estados: sin scroll horizontal');
        await page.screenshot({ path: path.join(OUT, 'retencion_cel.png'), fullPage: true });
        await tarjeta(page, B).getByRole('button', { name: /Escribir recordatorio/ }).click();
        await page.waitForSelector('[data-mensaje-previo]', { timeout: 10000 });
        await page.waitForTimeout(600);   // la animación de entrada del diálogo
        const caja = await page.locator('[role="dialog"]').boundingBox();
        ok(caja && caja.x >= 0 && caja.x + caja.width <= 391, 'el diálogo del texto entra en la pantalla', caja);
        await page.screenshot({ path: path.join(OUT, 'dialogo_cel.png') });
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1440, height: 900 });
        await irA(page, 'Configuración');
        await page.getByRole('tab', { name: 'Mensajes' }).click();
        await page.waitForTimeout(800);
        await page.locator('[data-ajuste="recordatorios_auto"]').screenshot({ path: path.join(OUT, 'config_fila_pc.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(500);
        ok(!(await desborda()), 'Configuración › Mensajes en el celular: sin scroll horizontal');
        await page.locator('[data-ajuste="recordatorios_auto"]').screenshot({ path: path.join(OUT, 'config_fila_cel.png') });
        console.log(`  capturas en ${OUT}`);
        await ctx.close();
    }

    }
    if (corre(6)) {
    console.log('\n6. La campana: no cuenta ni ofrece los que ya salieron solos');
    {
        const pendientes = async (page) => {
            // La campana cuenta del store: se espera a que esté hidratado (las tarjetas
            // de Retención a la vista), si no cuenta 0 y el chequeo no mide nada.
            await irA(page, 'Retención');
            await page.waitForSelector('[data-tour="retencion-urgentes"]', { timeout: 30000 });
            await page.locator('button[title="Alertas"]').click();
            await page.waitForTimeout(600);
            const t = await page.locator('button').filter({ hasText: /^Pendientes/ }).first().innerText();
            return Number((t.match(/\d+/) || ['0'])[0]);
        };
        const con = await entrar(b, { envio: 'solo', filasAuto });
        const nCon = await pendientes(con.page);
        ok(await con.page.locator(`[data-campana-vencido="${A.id}"]`).count() === 0, `${A.clientName} (salió solo) NO está en la campana`);
        ok(await con.page.locator(`[data-campana-vencido="${C.id}"]`).count() === 1, `${C.clientName} (no salió) sí está`);
        const href = await con.page.locator(`[data-campana-vencido="${C.id}"] [data-campana-wame]`).getAttribute('href');
        const textoCampana = decodeURIComponent((href.split('text=')[1] || ''));
        const esperado = PLANT.mensajeFijo(C, MOTOR.nombreBiciParaMensaje(BICIS_DEMO, C.bikeId, C.bikeModel));
        ok(textoCampana === esperado && !/[¡¿]/.test(textoCampana) && !/\p{Extended_Pictographic}/u.test(textoCampana),
            `el WhatsApp de la campana es el mismo texto de Retención, sin ¡¿ ni emoji: "${textoCampana}"`, { esperado });
        await con.ctx.close();
        const sin = await entrar(b, { envio: 'solo', filasAuto: [] });
        const nSin = await pendientes(sin.page);
        ok(await sin.page.locator(`[data-campana-vencido="${A.id}"]`).count() === 1, `control: sin la fila, ${A.clientName} SÍ está en la campana`);
        ok(nSin === nCon + 1, `el contador de pendientes baja en 1 (${nSin} → ${nCon})`);
        await sin.ctx.close();
    }

    }
    if (corre(7)) {
    console.log('\n7. La pestaña quedó abierta desde antes de la corrida');
    {
        let enLaBase = [];
        const vieja = { recordatorio_id: '', vence_el: '', estado: 'enviado', motivo: null, dia: hoy, actualizado_at: ahora, mensajes_whatsapp: { estado: 'sent', enviado_at: ahora } };
        const { ctx, page, capturado } = await entrar(b, { envio: 'solo', wa: true, filasAuto: () => enLaBase });
        await irA(page, 'Retención');
        ok(await tarjeta(page, C).getByRole('button', { name: /Escribir recordatorio/ }).count() === 1, `al abrir, ${C.clientName} tiene el botón (todavía no salió)`);
        // La corrida lo manda mientras la pantalla está abierta.
        enLaBase = [{ ...vieja, recordatorio_id: C.id, vence_el: C.dueDate.slice(0, 10) }];
        await tarjeta(page, C).getByRole('button', { name: /Escribir recordatorio/ }).click();
        await page.waitForTimeout(1500);
        ok(await page.locator('[data-mensaje-previo]').count() === 0 && capturado.enviar.length === 0, 'tocar "Escribir" NO abre el texto ni manda nada');
        ok(/Salió solo el/.test(await tarjeta(page, C).innerText()), `la tarjeta de ${C.clientName} pasa a decir "Salió solo"`);
        // Control: el que no salió abre el texto como siempre…
        await tarjeta(page, B).getByRole('button', { name: /Escribir recordatorio/ }).click();
        await page.waitForSelector('[data-mensaje-previo]', { timeout: 10000 });
        ok(true, `control: ${B.clientName} (sin fila) abre el texto`);
        // …y si sale solo con el texto abierto, "Mandar" no manda.
        enLaBase.push({ ...vieja, recordatorio_id: B.id, vence_el: B.dueDate.slice(0, 10) });
        await page.getByRole('button', { name: /^Mandar$/ }).click();
        await page.waitForTimeout(1500);
        ok(capturado.enviar.length === 0 && await page.locator('[data-mensaje-previo]').count() === 0, 'salió solo con el texto abierto: "Mandar" no manda y cierra');
        ok(/Salió solo el/.test(await tarjeta(page, B).innerText()), `la tarjeta de ${B.clientName} pasa a decir "Salió solo"`);
        // Volver a la pestaña relee la base sin tocar nada.
        enLaBase.push({ ...vieja, recordatorio_id: A.id, vence_el: A.dueDate.slice(0, 10) });
        ok(!/Salió solo el/.test(await tarjeta(page, A).innerText()), `control: antes de volver a la pestaña, ${A.clientName} todavía no lo dice`);
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(1500);
        ok(/Salió solo el/.test(await tarjeta(page, A).innerText()), `al volver a la pestaña, ${A.clientName} dice "Salió solo" sin tocar nada`);
        await ctx.close();
    }

    }
    await b.close();
    console.log(mal === 0 ? '\n✅ Los recordatorios que salen solos se ven y se eligen bien.' : `\n🚩 ${mal} fallas.`);
    process.exit(mal === 0 ? 0 : 1);
})().catch((e) => { console.error('ROTO:', e.message); process.exit(2); });
