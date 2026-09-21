/**
 * ¿DÓNDE ESTÁ EL COMPROBANTE DE INGRESO? (21-sep-2026)
 *
 * 🔴 POR QUÉ EXISTE: Alejo (11 a Fondo) pidió la hoja el 10-sep, se construyó, y el 21 avisó
 * que no sabía dónde verla para imprimirla. Tenía razón: el único botón estaba en el diálogo
 * de FINALIZAR —el que se abre para CERRAR la orden, no para recibir la bici— y el tutorial
 * encima decía que estaba adentro de la fila, donde no estaba. Un botón que existe y no se
 * encuentra es un botón que no existe.
 *
 * QUÉ MIDE, recorriendo la app como el mecánico (nada de leer el código):
 *   1. al confirmar el ingreso de una orden nueva, el botón está en la pantalla de "listo";
 *   2. en la fila del Taller Activo, sin abrir nada;
 *   3. adentro de la orden abierta (que es lo que promete el tutorial);
 *   4. en el historial, con la bici ya entregada;
 *   y que al tocarlo baja un PDF de verdad (no solo que el botón esté dibujado).
 *
 * CONTROL NEGATIVO: apaga `config_ticket_ingreso.habilitado` del Taller Demo y exige que el
 * botón NO esté en ninguno de los cuatro lugares. Si con el ajuste apagado siguiera apareciendo,
 * este candado no estaría mirando el botón que cree. El ajuste se restaura en un `finally`.
 *
 * LIMPIEZA: la orden que crea el paso 1 se borra por su id (no "todo lo del Demo"), y se
 * imprime cuál se borró.
 *
 *   npm run dev  (en otra terminal)
 *   MP_DEMO_PASSWORD=… node qa_comprobante_de_ingreso.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('/Users/iaraaguilar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');

const EXEC = process.env.PW_CHROME
    || '/Users/iaraaguilar/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const DEMO_PASS = process.env.DEMO_PASS || process.env.MP_DEMO_PASSWORD;
const DEMO = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const ETIQUETA = 'Imprimir el comprobante de ingreso';   // el aria-label, uno solo para los 4 lugares

const S = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8'));
const cab = { apikey: S.service_role_key, Authorization: `Bearer ${S.service_role_key}`, 'Content-Type': 'application/json' };
const api = (ruta, opts = {}) => fetch(`${S.project_url.replace(/\/$/, '')}/rest/v1/${ruta}`, { ...opts, headers: { ...cab, ...(opts.headers || {}) } });

const fallos = [];
const ok = (t) => console.log('  ✅ ' + t);
const mal = (t) => { console.log('  ❌ ' + t); fallos.push(t); };

// checkVisibility y no getBoundingClientRect: adentro de un <details> cerrado el
// elemento sigue midiendo (memoria del arnés).
// 🔴 Y se cuenta DENTRO del contenedor de cada momento: la tabla del Taller Activo queda
// atrás del diálogo con su botón en cada fila, así que un conteo global daba 24 y habría
// dado verde con la pantalla de "listo" vacía. Una medición que no puede fallar no mide.
const cuantosVisibles = (page, etiqueta, dentroDe) => page.evaluate(([et, cont]) => {
    const raiz = cont ? document.querySelector(cont) : document;
    if (!raiz) return 0;
    return [...raiz.querySelectorAll(`[aria-label="${et}"]`)]
        .filter(el => el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }))
        .length;
}, [etiqueta, dentroDe || null]);

async function entrar() {
    const b = await chromium.launch({ executablePath: EXEC });
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') console.log('    [consola] ' + m.text().slice(0, 200)); });
    page.on('pageerror', e => console.log('    [pageerror] ' + String(e).slice(0, 200)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', process.env.DEMO_MAIL || 'demo@mechanicpro.com.ar');
    await page.fill('input[type=password]', DEMO_PASS);
    await page.click('button[type=submit]');
    // Los DOS: solo "INGRESANDO" también da verde cuando el login ni arrancó.
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 45000 });
    await page.waitForFunction(() => !document.querySelector('input[type=password]'), { timeout: 45000 });
    await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
    await page.waitForTimeout(3500);
    const ov = page.locator('div.fixed.inset-0 button').last();
    if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch { } }
    await page.waitForTimeout(1200);
    return { b, page };
}

const irA = async (page, nombre) => {
    await page.locator('nav a, aside a').filter({ hasText: nombre }).first().click({ force: true });
    await page.waitForTimeout(3000);
};

// Los cuatro lugares. Devuelve {lugar: visibles}.
async function recorrer(page, { conDescarga }) {
    const visto = {};

    // ── 1. Alta: "Recibir Bici" → cliente → bici → CONFIRMAR INGRESO → pantalla de listo.
    //    Es la MISMA pantalla de "listo" que cierra el alta de cliente nuevo desde Clientes
    //    (las dos terminan en ServiceDefinitionStep), así que probarla acá las cubre a las dos.
    await irA(page, 'Taller Activo');
    await page.getByRole('button', { name: /Recibir Bici/i }).first().click();
    await page.waitForTimeout(1800);
    await page.locator('div[role=dialog] [class*=cursor-pointer]').first().click();   // primer cliente
    await page.waitForTimeout(1500);
    await page.locator('div[role=dialog] [class*=cursor-pointer]').first().click();   // primera bici
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /CONFIRMAR INGRESO/i }).first().click();
    await page.waitForTimeout(5000);
    visto['al confirmar el ingreso'] = await cuantosVisibles(page, ETIQUETA, '[data-exito]');
    if (conDescarga && visto['al confirmar el ingreso'] > 0) {
        const esperaPdf = page.waitForEvent('download', { timeout: 40000 }).catch(() => null);
        await page.locator(`[data-exito] [aria-label="${ETIQUETA}"]`).click();
        const d = await esperaPdf;
        visto['_archivo'] = d ? d.suggestedFilename() : null;
        if (d) {
            // 🔴 Que baje un PDF no alcanza: el de una orden RECIÉN creada salía sin el
            // checklist, porque `descripcion_catalogo` no es una columna y la fila que
            // quedaba en memoria no la tenía (se arregló el 21-sep en el store). Se lee
            // el texto del PDF, no se confía en que el botón "anduvo".
            const destino = path.join(os.tmpdir(), 'qa_ingreso.pdf');
            await d.saveAs(destino);
            visto['_texto'] = execFileSync('pdftotext', ['-layout', destino, '-'], { encoding: 'utf8' });
        }
    }
    await page.getByRole('button', { name: /^Aceptar$/ }).first().click().catch(() => { });
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    // ── 2. La fila del Taller Activo, sin abrir nada.
    await irA(page, 'Taller Activo');
    visto['en la fila'] = await cuantosVisibles(page, ETIQUETA, 'tbody');

    // ── 3. Adentro de la orden abierta (lo que promete el tutorial).
    await page.locator('tbody tr').first().click();
    await page.waitForTimeout(3800);
    visto['adentro de la orden'] = await cuantosVisibles(page, ETIQUETA, 'div[role=dialog]');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    // ── 4. El historial, con la bici ya entregada.
    await irA(page, 'Historial');
    const verDetalle = page.locator('tbody tr').first();
    if (await verDetalle.count()) { await verDetalle.click(); await page.waitForTimeout(3000); }
    visto['en el historial'] = await cuantosVisibles(page, ETIQUETA);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);

    return visto;
}

(async () => {
    if (!DEMO_PASS) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }

    const antes = await (await api(`servicios?select=id&taller_id=eq.${DEMO}`)).json();
    const idsAntes = new Set(antes.map(s => s.id));
    console.log(`el Demo tiene ${idsAntes.size} services antes de empezar\n`);

    let creados = [];
    try {
        console.log('── CON el ajuste prendido: el botón tiene que estar en los 4 lugares');
        let { b, page } = await entrar();
        const visto = await recorrer(page, { conDescarga: true });
        await b.close();

        for (const lugar of ['al confirmar el ingreso', 'en la fila', 'adentro de la orden', 'en el historial']) {
            if (visto[lugar] > 0) ok(`${lugar}  (${visto[lugar]} botón/es)`);
            else mal(`${lugar}: NO está el botón`);
        }
        if (/ingreso/i.test(visto._archivo || '')) ok(`baja el PDF de verdad: "${visto._archivo}"`);
        else mal(`el clic no bajó un PDF de ingreso (bajó: ${visto._archivo || 'nada'})`);

        // Los títulos del PDF van con letter-spacing: pdftotext los devuelve como
        // "C H E C K L I S T D E L TA L L E R". Se compara sin espacios.
        const txt = visto._texto || '';
        const pegado = txt.replace(/\s+/g, '').toLowerCase();
        if (pegado.includes('comprobantedeingreso')) ok('el PDF es el comprobante de ingreso');
        else mal('el PDF no dice "Comprobante de ingreso"');
        // Todos los services del catálogo del Demo empiezan por el lavado: si el checklist
        // salió vacío, esta palabra no está.
        if (/lavado/i.test(txt)) ok('trae el checklist del service del catálogo');
        else mal('el PDF salió SIN el checklist del catálogo (descripcion_catalogo perdida)');
        if (pegado.includes('checklistdeltaller')) ok('trae la mitad de abajo, la del taller');
        else mal('no aparece la mitad del taller');

        // ── CONTROL NEGATIVO ─────────────────────────────────────────────
        console.log('\n── CONTROL NEGATIVO: con el ajuste APAGADO no tiene que estar en ninguno');
        await api(`talleres?id=eq.${DEMO}`, {
            method: 'PATCH',
            body: JSON.stringify({ config_ticket_ingreso: { habilitado: false, notas_internas: true } }),
        });
        ({ b, page } = await entrar());
        const apagado = await recorrer(page, { conDescarga: false });
        await b.close();
        const asomados = Object.entries(apagado).filter(([k, v]) => !k.startsWith('_') && v > 0);
        if (asomados.length === 0) ok('con el ajuste apagado el botón no aparece en ningún lado');
        else mal(`el botón sigue apareciendo con el ajuste apagado: ${asomados.map(([k, v]) => `${k} (${v})`).join(', ')}`);
    } finally {
        // El ajuste del Demo vuelve como estaba, pase lo que pase.
        await api(`talleres?id=eq.${DEMO}`, {
            method: 'PATCH',
            body: JSON.stringify({ config_ticket_ingreso: { habilitado: true, notas_internas: true } }),
        });
        console.log('\n🔒 config_ticket_ingreso del Demo restaurado (habilitado)');

        // Se borra POR ID lo que creó esta corrida, nunca "todo lo del taller".
        const ahora = await (await api(`servicios?select=id,numero_orden&taller_id=eq.${DEMO}`)).json();
        creados = ahora.filter(s => !idsAntes.has(s.id));
        for (const s of creados) {
            await api(`servicio_items?servicio_id=eq.${s.id}`, { method: 'DELETE' });
            await api(`servicios?id=eq.${s.id}`, { method: 'DELETE' });
            console.log(`🧹 borrada la orden de prueba #${s.numero_orden} (${s.id})`);
        }
        if (!creados.length) console.log('🧹 no quedó ninguna orden de prueba para borrar');
    }

    console.log(fallos.length
        ? `\n❌ ${fallos.length} problema(s): el comprobante de ingreso no está donde tiene que estar.`
        : '\n✅ El comprobante de ingreso está en los 4 momentos y se puede bajar.');
    process.exit(fallos.length ? 1 : 0);
})();
