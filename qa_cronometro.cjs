/**
 * El cronómetro de trabajo (14-oct-2026, Pro Bike Salta): lo que ve y toca la gente.
 *
 * La base (RPC, RLS, trigger del admin) se prueba con `tools/probar_cronometro.cjs`. Este candado
 * recorre las PANTALLAS contra el Taller Demo con dos mecánicos temporales (Lean y Juli) y órdenes
 * temporales, en escritorio y en celular (390x844):
 *   0. ajuste APAGADO: no aparece nada (ni columna, ni botón, ni «Otro trabajo», ni barra);
 *   1. prendido: Empezar en A (el tiempo anterior suma), Empezar en B (A se pausa sola, en la base),
 *      armado con detalle, la barra fija dice con qué estás y Pausar la apaga;
 *   2. otro mecánico ve «Lean está con esta bici» solo en la orden de Lean;
 *   3. reabrir la app con un reloj andando lo lee de la base;
 *   4. finalizar la orden corta el reloj y la barra se va;
 *   5. el admin ve los tramos de la orden (se cortó solo, corregido) y el mecánico no;
 *   6. el mecánico ve el ajuste deshabilitado; el admin lo prende y lo apaga desde Configuración;
 *   7. celular: nada se va de ancho, la barra no tapa lo último ni el botón es chico.
 * Al final borra SOLO lo que creó, por id, y deja `config_cronometro` del Demo como estaba.
 *
 *   MP_DEMO_PASSWORD=… node qa_cronometro.cjs      (con `npm run dev` andando)
 *   CAPTURAS=<carpeta> para guardar las capturas.
 */
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { chromium, navegador } = require('./qa_playwright.cjs');

const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const EMAIL_ADMIN = 'demo@mechanicpro.com.ar';
const CAP = process.env.CAPTURAS || '';
const SEC = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8'));
const U = SEC.project_url.replace(/\/$/, '');
const envLocal = fs.readFileSync(__dirname + '/.env.local', 'utf8');
const ANON = (envLocal.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
const sr = createClient(U, SEC.service_role_key, { auth: { persistSession: false } });

const fallos = [];
const ok = (t) => console.log('  ✅ ' + t);
const mal = (t) => { console.log('  ❌ ' + t); fallos.push(t); };
const chk = (c, t) => (c ? ok(t) : mal(t));
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const creados = { usuarios: [], servicios: [], tramos: [] };

(async () => {
    const PASS = process.env.MP_DEMO_PASSWORD;
    if (!PASS) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }
    if (CAP) fs.mkdirSync(CAP, { recursive: true });
    const cfgOriginal = (await sr.from('talleres').select('config_cronometro').eq('id', DEMO).single()).data.config_cronometro;
    console.log('Demo antes:', JSON.stringify(cfgOriginal));
    const admin = createClient(U, ANON, { auth: { persistSession: false } });
    const b = await chromium.launch({ executablePath: navegador });
    try {
        const { error: eA } = await admin.auth.signInWithPassword({ email: EMAIL_ADMIN, password: PASS });
        if (eA) throw new Error('login admin: ' + eA.message);
        const poner = async (activo, hora = '20:00') => {
            const r = await admin.from('talleres').update({ config_cronometro: { activo, hora_cierre: hora } }).eq('id', DEMO).select();
            if (r.error) throw new Error('config: ' + r.error.message);
        };
        await poner(false);

        // ── Siembra: dos mecánicos, dos órdenes, un tramo viejo de 42 min de Lean en A ──
        const mec = {};
        for (const n of ['Lean', 'Juli']) {
            const email = `qa-crono-ui-${n.toLowerCase()}-${Date.now()}@example.com`, pass = crypto.randomBytes(18).toString('base64url');
            const { data: c, error } = await sr.auth.admin.createUser({ email, password: pass, email_confirm: true });
            if (error) throw new Error('createUser ' + error.message);
            creados.usuarios.push(c.user.id);
            const { error: eU } = await sr.from('usuarios').upsert({ id: c.user.id, taller_id: DEMO, nombre: n, rol: 'mecanico' });
            if (eU) throw new Error('usuarios ' + eU.message);
            const cli = createClient(U, ANON, { auth: { persistSession: false } });
            await cli.auth.signInWithPassword({ email, password: pass });
            mec[n] = { id: c.user.id, email, pass, cli };
        }
        const bici = (await sr.from('bicicletas').select('id').eq('taller_id', DEMO).limit(1).single()).data.id;
        const orden = [];
        for (let i = 0; i < 2; i++) {
            const { data, error } = await sr.from('servicios').insert({ taller_id: DEMO, bicicleta_id: bici, estado: 'in_progress', tipo_servicio: 'QA cronometro UI (borrar)', precio_base: 0, precio_total: 0 }).select('id, numero_orden').single();
            if (error) throw new Error('servicio ' + error.message);
            creados.servicios.push(data.id); orden.push(data);
        }
        const [A, B] = orden;
        const numero = (o) => '#' + String(o.numero_orden).padStart(4, '0');
        const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
        const sembrar = async (fila) => {
            const { data, error } = await sr.from('tiempos_trabajo').insert({ taller_id: DEMO, ...fila }).select('id').single();
            if (error) throw new Error('tramo ' + error.message);
            creados.tramos.push(data.id); return data.id;
        };
        const sembrarLean = () => sembrar({ usuario_id: mec.Lean.id, usuario_nombre: 'Lean', servicio_id: A.id, tipo: 'orden', inicio: hace(300), fin: hace(258) });
        const tramosAbiertos = async (uid) => (await sr.from('tiempos_trabajo').select('*').eq('usuario_id', uid).is('fin', null)).data;
        const tramosDe = async (uid) => (await sr.from('tiempos_trabajo').select('*').eq('usuario_id', uid).order('inicio')).data;

        const entrar = async (browser, { email, pass, viewport, nombre }) => {
            const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
            await ctx.addInitScript(() => { try { localStorage.setItem('mechanicpro_tour_v3', 'visto'); } catch { } });
            const page = await ctx.newPage();
            const errores = [];
            page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
            await page.goto(BASE, { waitUntil: 'domcontentloaded' });
            await page.fill('input[type=email]', email);
            await page.fill('input[type=password]', pass);
            await page.click('button[type=submit]');
            await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO') && !document.querySelector('input[type=password]'), { timeout: 60000 });
            await page.locator('h1', { hasText: 'Taller Activo' }).first().waitFor({ timeout: 30000 });
            await page.waitForTimeout(2500);
            for (let i = 0; i < 3; i++) {
                const ov = page.locator('div.fixed.inset-0 button').last();
                if (await ov.count()) { try { await ov.click({ force: true, timeout: 1500 }); } catch { } } else break;
                await page.waitForTimeout(400);
            }
            return { ctx, page, errores, nombre };
        };
        const foto = async (page, nombre) => { if (CAP) await page.screenshot({ path: `${CAP}/${nombre}.png`, fullPage: false }); };
        const btn = (page, o) => page.locator(`[data-cronometro="${o.id}"]:visible button`).first();
        const textoBtn = async (page, o) => (await btn(page, o).innerText()).trim();
        const esperarBtn = async (page, o, re) => page.waitForFunction(([id, src]) => {
            const el = [...document.querySelectorAll(`[data-cronometro="${id}"] button`)].find(e => e.offsetParent !== null);
            return !!el && new RegExp(src, 'i').test(el.innerText);
        }, [o.id, re.source], { timeout: 15000 });
        const indicador = (page) => page.locator('[data-indicador-cronometro]');
        const hayAlgoDelCronometro = (page) => page.evaluate(() => ({
            botones: document.querySelectorAll('[data-cronometro]').length,
            otro: document.querySelectorAll('[data-otro-trabajo]').length,
            barra: document.querySelectorAll('[data-indicador-cronometro]').length,
            reloj: [...document.querySelectorAll('th')].some(t => /^Reloj$/.test(t.innerText.trim())),
        }));

        for (const [modo, vp] of [['pc', { width: 1366, height: 850 }], ['cel', { width: 390, height: 844 }]]) {
            console.log(`\n══ ${modo.toUpperCase()} ══`);
            // limpiar relojes entre pasadas
            for (const n of ['Lean', 'Juli']) await mec[n].cli.rpc('pausar_trabajo');
            await sr.from('servicios').update({ estado: 'in_progress', fecha_finalizacion: null }).in('id', creados.servicios);
            // cada pasada arranca igual: sin tramos de los dos mecánicos, y Lean con sus 42 min en A
            const previos = await sr.from('tiempos_trabajo').select('id').in('usuario_id', [mec.Lean.id, mec.Juli.id]);
            if ((previos.data || []).length) await sr.from('tiempos_trabajo').delete().in('id', previos.data.map(x => x.id));
            await sembrarLean();

            // ── 0. apagado ──
            await poner(false);
            let L = await entrar(b, { email: mec.Lean.email, pass: mec.Lean.pass, viewport: vp });
            let h = await hayAlgoDelCronometro(L.page);
            chk(h.botones === 0 && h.otro === 0 && h.barra === 0 && !h.reloj, `0. apagado: no aparece nada (${JSON.stringify(h)})`);
            await foto(L.page, `${modo}_0_apagado`);
            await L.ctx.close();

            // ── 1. prendido, Lean ──
            await poner(true, '20:00');
            L = await entrar(b, { email: mec.Lean.email, pass: mec.Lean.pass, viewport: vp });
            chk((await L.page.locator('[data-otro-trabajo]').count()) === 1, '1. prendido: aparece «Otro trabajo»');
            await esperarBtn(L.page, A, /seguir/).catch(() => { });
            chk(/seguir/i.test(await textoBtn(L.page, A)) && /empezar/i.test(await textoBtn(L.page, B)), `1. A dice «Seguir» (ya tiene 42 min míos) y B «Empezar» (dicen: ${await textoBtn(L.page, A)} / ${await textoBtn(L.page, B)})`);
            chk(/00:42/.test(await L.page.locator(`[data-cronometro="${A.id}"]:visible [data-cronometro-tiempo]`).first().innerText()), '1. A muestra los 42 min que ya llevaba (00:42)');
            await foto(L.page, `${modo}_1_antes_de_empezar`);

            await btn(L.page, A).click();
            await esperarBtn(L.page, A, /pausar/);
            let ab = await tramosAbiertos(mec.Lean.id);
            chk(ab.length === 1 && ab[0].servicio_id === A.id, '1. Seguir en A: un solo reloj abierto, en A (base)');
            chk(await indicador(L.page).count() === 1 && (await indicador(L.page).innerText()).includes(numero(A)), `1. la barra dice «Estás con: Orden ${numero(A)}»`);
            const tiempoA = await L.page.locator(`[data-cronometro="${A.id}"]:visible [data-cronometro-tiempo]`).first().innerText();
            chk(/^\s*0[0-9]:[0-5][0-9]\s*$/.test(tiempoA) && tiempoA.trim() >= '00:42', `1. el tiempo de A sigue desde 00:42 (${tiempoA.trim()})`);
            await foto(L.page, `${modo}_2_andando_en_A`);

            await btn(L.page, B).click();
            await esperarBtn(L.page, B, /pausar/);
            let tr = (await tramosDe(mec.Lean.id)).filter(t => t.servicio_id === A.id);
            ab = await tramosAbiertos(mec.Lean.id);
            chk(ab.length === 1 && ab[0].servicio_id === B.id && tr.every(t => t.fin), '1. Empezar en B: A se pausó sola y B anda (base)');
            chk(/seguir/i.test(await textoBtn(L.page, A)), '1. y A pasó a «Seguir»');
            chk((await indicador(L.page).innerText()).includes(numero(B)), '1. la barra ahora dice la orden B');

            await L.page.locator('[data-otro-trabajo] button').click();
            const dlg = L.page.getByRole('dialog');
            await dlg.getByRole('radio', { name: /Armado/ }).click();
            await dlg.getByPlaceholder(/Allez/).fill('Allez QA');
            await foto(L.page, `${modo}_3_otro_trabajo`);
            await dlg.getByRole('button', { name: 'Empezar' }).click();
            await L.page.waitForFunction(() => /Armado: Allez QA/.test(document.querySelector('[data-indicador-cronometro]')?.innerText || ''), null, { timeout: 15000 });
            ab = await tramosAbiertos(mec.Lean.id);
            chk(ab.length === 1 && ab[0].tipo === 'armado' && ab[0].servicio_id === null && ab[0].detalle === 'Allez QA', '1. Armado con detalle: B se pausó sola y el armado anda (base)');
            chk(/empezar|seguir/i.test(await textoBtn(L.page, B)), '1. y B ya no dice «Pausar»');
            await foto(L.page, `${modo}_4_armado`);

            // ── 3. reabrir la app con un reloj andando: se lee de la base ──
            await L.page.reload({ waitUntil: 'domcontentloaded' });
            await L.page.locator('h1', { hasText: 'Taller Activo' }).first().waitFor({ timeout: 30000 });
            await L.page.waitForFunction(() => /Armado: Allez QA/.test(document.querySelector('[data-indicador-cronometro]')?.innerText || ''), null, { timeout: 20000 })
                .then(() => ok('3. reabrir con el armado andando: la barra vuelve (se leyó de la base)'), () => mal('3. al reabrir la app la barra no volvió'));

            // ── 7. celular: la barra no tapa lo último; desktop: no tapa nada ──
            const medida = await L.page.evaluate(() => {
                window.scrollTo(0, document.documentElement.scrollHeight);
                const bar = document.querySelector('[data-indicador-cronometro]');
                const r = bar.getBoundingClientRect();
                const botones = [...document.querySelectorAll('[data-cronometro] button')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect());
                const todo = [...document.querySelectorAll('main *')].filter(e => e.offsetParent !== null && e.children.length === 0 && e.getBoundingClientRect().height > 0);
                const ultimo = Math.max(...todo.map(e => e.getBoundingClientRect().bottom + scrollY));
                const alto = document.documentElement.scrollHeight;
                return { barTop: r.top, barH: r.height, alto, barBottom: r.bottom, vh: innerHeight, ultimo, botonMin: botones.length ? Math.min(...botones.map(x => x.height)) : null, ancho: document.documentElement.scrollWidth, vw: innerWidth };
            });
            await L.page.waitForTimeout(300);
            chk(medida.ultimo + medida.barH <= medida.alto + 1, `7. la barra no tapa lo último: queda lugar para ella al final (último ${Math.round(medida.ultimo)} + barra ${Math.round(medida.barH)} ≤ alto ${medida.alto})`);
            chk(medida.ancho <= medida.vw + 1, `7. nada se va de ancho (${medida.ancho} ≤ ${medida.vw})`);
            if (modo === 'cel') chk(medida.botonMin >= 44, `7. el botón mide ≥44 px de alto en el celular (${Math.round(medida.botonMin)} px)`);
            await foto(L.page, `${modo}_5_final_de_pagina`);

            // ── pausar desde la barra ──
            await indicador(L.page).getByRole('button', { name: 'Pausar' }).click();
            await L.page.waitForFunction(() => !document.querySelector('[data-indicador-cronometro]'), null, { timeout: 15000 });
            chk((await tramosAbiertos(mec.Lean.id)).length === 0, '1. Pausar desde la barra: ningún reloj abierto y la barra se va');

            // ── 2. otro mecánico ve «Lean está con esta bici» ──
            await mec.Lean.cli.rpc('arrancar_trabajo', { p_servicio_id: A.id, p_tipo: 'orden', p_detalle: null });
            const J = await entrar(b, { email: mec.Juli.email, pass: mec.Juli.pass, viewport: vp });
            await J.page.waitForFunction((id) => !!document.querySelector(`[data-cronometro="${id}"] [data-cronometro-otros]`), A.id, { timeout: 20000 }).catch(() => { });
            const otrosA = await J.page.locator(`[data-cronometro="${A.id}"]:visible [data-cronometro-otros]`).allInnerTexts();
            const otrosB = await J.page.locator(`[data-cronometro="${B.id}"]:visible [data-cronometro-otros]`).count();
            chk(otrosA.length === 1 && otrosA[0].trim() === 'Lean está con esta bici', `2. Juli ve «${otrosA[0] || ''}» en A`);
            chk(otrosB === 0, '2. y no lo ve en B');
            chk((await J.page.locator('[data-indicador-cronometro]').count()) === 0, '2. Juli no tiene barra (no tiene reloj propio)');
            await foto(J.page, `${modo}_6_juli_ve_a_lean`);
            await J.ctx.close();

            // ── 4. finalizar la orden corta el reloj ──
            await sr.from('servicios').update({ estado: 'ready', fecha_finalizacion: new Date().toISOString() }).eq('id', A.id);
            await L.page.reload({ waitUntil: 'domcontentloaded' });
            await L.page.locator('h1', { hasText: 'Taller Activo' }).first().waitFor({ timeout: 30000 });
            await L.page.waitForTimeout(3000);
            chk((await tramosAbiertos(mec.Lean.id)).length === 0, '4. finalizar la orden cortó el reloj de Lean (base)');
            chk((await indicador(L.page).count()) === 0, '4. y la barra ya no está');
            await sr.from('servicios').update({ estado: 'in_progress', fecha_finalizacion: null }).eq('id', A.id);

            // ── 5. el mecánico no ve los tramos dentro de la orden; el admin sí ──
            if (modo === 'pc') {
                await L.page.reload({ waitUntil: 'domcontentloaded' });
                await L.page.locator('h1', { hasText: 'Taller Activo' }).first().waitFor({ timeout: 30000 });
                const filaL = L.page.locator('tr').filter({ hasText: numero(A) }).first();
                await filaL.getByRole('button', { name: 'Editar la orden' }).click();
                await L.page.getByRole('dialog').first().getByRole('button', { name: /GUARDAR CAMBIOS/ }).waitFor({ timeout: 30000 });
                chk((await L.page.locator('[data-tramos-orden]').count()) === 0, '5. el mecánico NO ve la lista de tiempos');
                chk((await L.page.getByRole('dialog').first().locator('[data-cronometro]').count()) === 1, '5. pero sí el botón del reloj dentro de la orden');
                await foto(L.page, `${modo}_7_orden_del_mecanico`);
            }
            await L.ctx.close();

            // tramo cortado solo + corregido, para ver las marcas
            const idMarcado = modo === 'pc' ? await sembrar({ usuario_id: mec.Juli.id, usuario_nombre: 'Juli', servicio_id: A.id, tipo: 'orden', inicio: hace(120), fin: hace(30), cerrado_solo: true, corregido_at: new Date().toISOString(), inicio_original: hace(150), fin_original: hace(30) }) : null;
            const AD = await entrar(b, { email: EMAIL_ADMIN, pass: PASS, viewport: vp });
            const filaA = modo === 'pc' ? AD.page.locator('tr').filter({ hasText: numero(A) }).first() : AD.page.locator('div.bg-white.rounded-xl').filter({ hasText: numero(A) }).first();
            await filaA.scrollIntoViewIfNeeded();
            if (modo === 'pc') await filaA.getByRole('button', { name: 'Editar la orden' }).click(); else await filaA.locator('h3').first().click();
            await AD.page.locator('[data-tramos-orden]').waitFor({ timeout: 30000 });
            await AD.page.waitForFunction(() => document.querySelectorAll('[data-tramo]').length > 0, null, { timeout: 15000 }).catch(() => { });
            const txt = await AD.page.locator('[data-tramos-orden]').innerText();
            chk(await AD.page.locator('[data-tramo]').count() >= 2, `5. el admin ve los tramos de la orden (${await AD.page.locator('[data-tramo]').count()})`);
            chk(/Lean/.test(txt) && /\d{2}:\d{2} a \d{2}:\d{2}/.test(txt) && /Total/.test(txt), '5. con quién, de qué hora a qué hora y el total');
            if (modo === 'pc') chk(/se cortó solo/.test(txt) && /corregido/.test(txt), '5. con las marcas «se cortó solo» y «corregido»');
            await foto(AD.page, `${modo}_8_admin_ve_los_tramos`);
            await AD.page.keyboard.press('Escape');
            void idMarcado;

            // ── 6. Configuración ──
            if (modo === 'pc') {
                await AD.page.getByRole('link', { name: /Configuración/ }).first().click().catch(async () => { await AD.page.goto(BASE + 'configuracion'); });
                await AD.page.getByRole('tab', { name: /Preferencias/ }).click().catch(() => { });
                const fila = AD.page.locator('[data-ajuste="cronometro"]');
                await fila.waitFor({ timeout: 20000 });
                await fila.scrollIntoViewIfNeeded();
                chk(/Cronómetro de trabajo/.test(await fila.innerText()) && /Hora de cierre/.test(await fila.innerText()), '6. el admin ve «Cronómetro de trabajo» y la hora de cierre');
                const sw = fila.getByRole('switch').first();
                chk((await sw.getAttribute('aria-checked')) === 'true', '6. el ajuste aparece prendido (lo prendió el admin)');
                await foto(AD.page, `${modo}_9_config_admin`);
                await sw.click();
                await AD.page.waitForTimeout(2000);
                const cfg1 = (await sr.from('talleres').select('config_cronometro').eq('id', DEMO).single()).data.config_cronometro;
                chk(cfg1.activo === false, '6. el admin lo apaga desde Configuración (base: activo=false)');
                await sw.click();
                await AD.page.waitForTimeout(2000);
                const hora = fila.locator('input[type=time]');
                await hora.fill('19:30'); await hora.blur();
                await AD.page.waitForTimeout(2000);
                const cfg2 = (await sr.from('talleres').select('config_cronometro').eq('id', DEMO).single()).data.config_cronometro;
                chk(cfg2.activo === true && cfg2.hora_cierre === '19:30', `6. lo prende y cambia la hora de cierre (base: ${JSON.stringify(cfg2)})`);
                await poner(true, '20:00');

                const M = await entrar(b, { email: mec.Lean.email, pass: mec.Lean.pass, viewport: vp });
                await M.page.goto(BASE + 'configuracion').catch(() => { });
                await M.page.getByRole('link', { name: /Configuración/ }).first().click().catch(() => { });
                await M.page.getByRole('tab', { name: /Preferencias/ }).click().catch(() => { });
                const filaM = M.page.locator('[data-ajuste="cronometro"]');
                await filaM.waitFor({ timeout: 20000 }).catch(() => { });
                await filaM.scrollIntoViewIfNeeded().catch(() => { });
                const swM = filaM.getByRole('switch').first();
                chk((await filaM.count()) === 1 && (await swM.isDisabled()), '6. el mecánico ve el ajuste DESHABILITADO');
                chk(/Lo cambia el administrador/.test(await filaM.innerText()), '6. con el cartel «Lo cambia el administrador»');
                chk(await filaM.locator('input[type=time]').isDisabled(), '6. y la hora de cierre también deshabilitada');
                await foto(M.page, `${modo}_10_config_mecanico`);
                await M.ctx.close();
            }
            await AD.ctx.close();
            chk(L.errores.length === 0, 'sin errores de consola' + (L.errores.length ? ': ' + L.errores.join(' | ') : ''));
        }
    } catch (e) {
        mal('se rompió la corrida: ' + String(e.stack || e).slice(0, 600));
    } finally {
        // Limpieza: SOLO lo creado, por id.
        try {
            const sus = await sr.from('tiempos_trabajo').select('id').in('usuario_id', creados.usuarios);
            const ids = [...new Set([...(sus.data || []).map(x => x.id), ...creados.tramos])];
            if (ids.length) await sr.from('tiempos_trabajo').delete().in('id', ids);
            if (creados.servicios.length) await sr.from('servicios').delete().in('id', creados.servicios);
            for (const id of creados.usuarios) { await sr.from('usuarios').delete().eq('id', id); await sr.auth.admin.deleteUser(id); }
            await sr.from('talleres').update({ config_cronometro: cfgOriginal ?? { activo: false, hora_cierre: '20:00' } }).eq('id', DEMO);
            const cfgFinal = (await sr.from('talleres').select('config_cronometro').eq('id', DEMO).single()).data.config_cronometro;
            console.log('\nDemo después:', JSON.stringify(cfgFinal), '· borrado:', creados.usuarios.length, 'usuarios,', creados.servicios.length, 'órdenes,', ids.length, 'tramos');
            if (cfgFinal.activo !== false) mal('el Demo quedó con el cronómetro PRENDIDO');
        } catch (e) { mal('la limpieza falló: ' + e); }
        await b.close();
    }
    console.log(fallos.length ? `\n❌ ${fallos.length} fallo(s)` : '\n🟢 todo verde');
    process.exit(fallos.length ? 1 : 0);
})();
