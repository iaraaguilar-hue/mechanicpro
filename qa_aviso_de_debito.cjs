/**
 * Candado del DÉBITO AUTOMÁTICO de Mercado Pago (13-oct-2026).
 *
 * El botón "Activar el débito automático" abre el plan de Mercado Pago de Iara. Se ofrece en
 * tres lugares, solo al ADMIN del taller, y desaparece cuando `debito_automatico_at` tiene fecha
 * (`src/lib/debitoAutomatico.ts`, `AvisoDePrueba`, `AccesoSuspendido`, `AvisoDeDebito`).
 * NO escribe NADA en la base: el Demo paga, y para verlo en cada estado se intercepta la
 * respuesta de `talleres` (y la de `usuarios`, para el rol).
 *   A. En prueba, admin → el botón está en el aviso de prueba.
 *   B. Paga, admin → aviso chico con el botón; se cierra y no vuelve al recargar.
 *   C. Cortado por la prueba, admin → el cartel trae la línea y el botón.
 *   D. Controles negativos: con débito activo no hay botón en ninguno de los tres;
 *      un mecánico no lo ve en ninguno de los tres.
 *   En todos: link al plan, pestaña nueva, sin "$" ni nombres de plan, nada se sale del ancho,
 *   0 errores de página.
 *
 * Uso: npm run dev (otra terminal) y
 *   set -a && . ~/Documents/estudio_iara/.secrets/mp_demo_meta_review.env && set +a
 *   node qa_aviso_de_debito.cjs            (con el sandbox apagado: el navegador sale a supabase.co)
 */
const { chromium } = require('./qa_playwright.cjs');
const EXEC = process.env.PW_CHROME || require('./qa_playwright.cjs').navegador;
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp';
const DEMO_ID = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const DEMO_PASS = process.env.DEMO_PASS || process.env.MP_DEMO_PASSWORD;
const DEMO_MAIL = process.env.DEMO_MAIL || 'demo@mechanicpro.com.ar';
const LINK = 'https://mpago.la/1gWKULV';
const DIA = 86_400_000;

const fallas = [];
const ok = (cond, que) => { console.log(`${cond ? '✅' : '❌'} ${que}`); if (!cond) fallas.push(que); };
const planOPrecio = (t) => (t.match(/\$|\b(Sport|Expert)\b|(?<!Mechanic )\bPro\b|¡/) || [])[0] || '';

const PAGA = { prueba_dias: null, prueba_inicio_at: null, acceso_suspendido_at: null, acceso_suspendido_motivo: null, debito_automatico_at: null, sin_cobro: false };
const EN_PRUEBA = { ...PAGA, prueba_dias: 15, prueba_inicio_at: new Date(Date.now() - 3 * DIA).toISOString() };
const CORTADA = { ...PAGA, prueba_dias: 15, prueba_inicio_at: new Date(Date.now() - 20 * DIA).toISOString(),
    acceso_suspendido_at: new Date(Date.now() - 5 * DIA).toISOString(), acceso_suspendido_motivo: 'prueba_finalizada' };
const ACTIVO = { debito_automatico_at: new Date(Date.now() - DIA).toISOString() };

async function entrar(b, viewport, { taller, rol, cartel } = {}) {
    const page = await b.newPage({ viewport });
    const errores = [];
    page.on('pageerror', e => errores.push(String(e)));
    await page.addInitScript(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
    const parchar = (pat, fix) => page.route(pat, async (route) => {
        const r = await route.fetch();
        let body = await r.text();
        try { const j = JSON.parse(body); body = JSON.stringify(Array.isArray(j) ? j.map(fix) : fix(j)); } catch { }
        await route.fulfill({ response: r, body });
    });
    if (taller) await parchar('**/rest/v1/talleres*', (o) => (o && o.id === DEMO_ID ? { ...o, ...taller } : o));
    if (rol) await parchar('**/rest/v1/usuarios*', (o) => (o && o.taller_id === DEMO_ID ? { ...o, rol } : o));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', DEMO_MAIL);
    await page.fill('input[type=password]', DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO')
        && !document.querySelector('input[type=password]'), { timeout: 45000 });
    await page.waitForFunction((c) => (c ? /terminó el período|acceso a esta cuenta/i : /taller activo/i).test(document.body.innerText),
        cartel, { timeout: 30000 });
    await page.waitForTimeout(3500);
    if (!cartel) for (let i = 0; i < 3; i++) {
        const ov = page.locator('div.fixed.inset-0 button').last();
        if (await ov.count()) { try { await ov.click({ force: true, timeout: 1500 }); } catch { } }
    }
    await page.waitForTimeout(400);
    return { page, errores };
}

const VIS = { contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true };
/** Los botones de débito que se VEN, con adónde llevan, y si algo se sale del ancho. */
const medir = (page) => page.evaluate((VIS) => {
    const ancho = window.innerWidth;
    const botones = [...document.querySelectorAll('[data-boton-debito]')].filter(a => a.checkVisibility(VIS));
    const aviso = document.querySelector('[data-aviso-debito]');
    return {
        botones: botones.map(a => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'),
            texto: a.innerText.trim(), dentro: a.getBoundingClientRect().right <= ancho + 0.5 && a.getBoundingClientRect().left >= -0.5 })),
        enPrueba: !!document.querySelector('[data-aviso-debito-prueba]') && document.querySelector('[data-aviso-debito-prueba]').checkVisibility(VIS),
        enCorte: !!document.querySelector('[data-debito-corte]') && document.querySelector('[data-debito-corte]').checkVisibility(VIS),
        avisoPaga: !!aviso && aviso.checkVisibility(VIS),
        textoPaga: aviso ? aviso.innerText : '',
        textoTodo: document.body.innerText,
        textoPrueba: (document.querySelector('[data-aviso-debito-prueba]') || {}).innerText || '',
        textoCorte: (document.querySelector('[data-debito-corte]') || {}).innerText || '',
        dentroDelAncho: document.documentElement.scrollWidth <= ancho + 0.5,
    };
}, VIS);

const bueno = (cuando, bt) => {
    ok(bt.length === 1, `${cuando}: un solo botón a la vista (${bt.length})`);
    if (bt.length !== 1) return;
    const x = bt[0];
    ok(x.href === LINK && x.target === '_blank' && /noopener/.test(x.rel || ''), `${cuando}: abre el plan en pestaña nueva`);
    ok(x.texto === 'Activar el débito automático', `${cuando}: dice "${x.texto}"`);
    ok(x.dentro, `${cuando}: el botón entra en el ancho`);
};

(async () => {
    const b = await chromium.launch({ executablePath: EXEC, headless: true });
    try {
        for (const [nombre, vp] of [['compu', { width: 1280, height: 800 }], ['celular', { width: 390, height: 800 }]]) {
            // ── A: en prueba, admin ──
            let p = await entrar(b, vp, { taller: EN_PRUEBA, rol: 'admin' });
            let m = await medir(p.page);
            ok(m.enPrueba, `A (${nombre}): en prueba → el aviso trae el débito`);
            bueno(`A (${nombre})`, m.botones);
            ok(!planOPrecio(m.textoPrueba), `A (${nombre}): sin "$", planes ni "¡" (${planOPrecio(m.textoPrueba) || 'limpio'})`);
            ok(!m.avisoPaga, `A (${nombre}): el aviso del que paga NO sale en prueba`);
            ok(m.dentroDelAncho, `A (${nombre}): la página no se corre de costado`);
            ok(p.errores.length === 0, `A (${nombre}): 0 errores de página`);
            await p.page.screenshot({ path: `${OUT}/debito_prueba_${nombre}.png` });
            await p.page.close();

            // ── B: paga, admin ──
            p = await entrar(b, vp, { taller: PAGA, rol: 'admin' });
            m = await medir(p.page);
            ok(m.avisoPaga, `B (${nombre}): paga → aviso chico`);
            bueno(`B (${nombre})`, m.botones);
            ok(/el día que toca pagar/.test(m.textoPaga) && /cada mes, el mismo día/.test(m.textoPaga), `B (${nombre}): dice cuándo conviene y cómo se cobra`);
            ok(!planOPrecio(m.textoPaga), `B (${nombre}): sin "$", planes ni "¡" (${planOPrecio(m.textoPaga) || 'limpio'})`);
            ok(m.dentroDelAncho, `B (${nombre}): la página no se corre de costado`);
            await p.page.screenshot({ path: `${OUT}/debito_paga_${nombre}.png` });
            await p.page.click('[data-aviso-debito] button[aria-label="Cerrar el aviso"]');
            await p.page.waitForTimeout(300);
            m = await medir(p.page);
            ok(!m.avisoPaga && m.botones.length === 0, `B (${nombre}): se cierra`);
            await p.page.reload({ waitUntil: 'domcontentloaded' });
            await p.page.waitForFunction(() => /taller activo/i.test(document.body.innerText), { timeout: 30000 });
            await p.page.waitForTimeout(2500);
            m = await medir(p.page);
            ok(!m.avisoPaga, `B (${nombre}): cerrado no vuelve al recargar`);
            ok(p.errores.length === 0, `B (${nombre}): 0 errores de página`);
            await p.page.close();

            // ── C: cortada por la prueba, admin ──
            p = await entrar(b, vp, { taller: CORTADA, rol: 'admin', cartel: true });
            m = await medir(p.page);
            ok(m.enCorte, `C (${nombre}): el cartel del corte trae el débito`);
            bueno(`C (${nombre})`, m.botones);
            ok(/el acceso vuelve apenas se acredita el pago/.test(m.textoCorte), `C (${nombre}): dice que el acceso vuelve al acreditarse el pago`);
            ok(!/\b(usted|vos|tu|te|podés|activá)\b/i.test(m.textoCorte), `C (${nombre}): impersonal (ni "usted" ni "vos")`);
            ok(!planOPrecio(m.textoTodo), `C (${nombre}): el cartel sin "$", planes ni "¡" (${planOPrecio(m.textoTodo) || 'limpio'})`);
            ok(m.dentroDelAncho, `C (${nombre}): la página no se corre de costado`);
            ok(p.errores.length === 0, `C (${nombre}): 0 errores de página`);
            await p.page.screenshot({ path: `${OUT}/debito_corte_${nombre}.png` });
            await p.page.close();

            // ── D: controles negativos ──
            for (const [que, taller, rol, cartel] of [
                ['débito activo + prueba', { ...EN_PRUEBA, ...ACTIVO }, 'admin', false],
                ['débito activo + paga', { ...PAGA, ...ACTIVO }, 'admin', false],
                ['débito activo + cortada', { ...CORTADA, ...ACTIVO }, 'admin', true],
                ['sin cobro + prueba', { ...EN_PRUEBA, sin_cobro: true }, 'admin', false],
                ['sin cobro + paga (sin reloj)', { ...PAGA, sin_cobro: true }, 'admin', false],
                ['sin cobro + cortada', { ...CORTADA, sin_cobro: true }, 'admin', true],
                ['mecánico + prueba', EN_PRUEBA, 'mecanico', false],
                ['mecánico + paga', PAGA, 'mecanico', false],
                ['mecánico + cortada', CORTADA, 'mecanico', true],
            ]) {
                p = await entrar(b, vp, { taller, rol, cartel });
                m = await medir(p.page);
                ok(m.botones.length === 0 && !m.avisoPaga && !m.enPrueba && !m.enCorte, `D (${nombre}): ${que} → no hay botón ni aviso de débito`);
                await p.page.close();
            }
        }
    } finally {
        await b.close();
    }
    console.log(fallas.length ? `\n❌ ${fallas.length} falla(s)` : '\n✅ todo verde');
    process.exit(fallas.length ? 1 : 0);
})();
