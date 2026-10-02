/**
 * Candado de la prueba gratuita (2-oct-2026): 15 días desde la PRIMERA CARGA, corte automático.
 *
 * Contra la base real, con el Taller Demo, y SIEMPRE lo deja como estaba (finally):
 *   1. Poner en prueba a un taller con datos completa el inicio con su dato más viejo.
 *   2. Sin reloj (inicio NULL), el primer cliente que carga el USUARIO del taller lo arranca
 *      (el trigger pasa la guardia con el JWT del taller). Control: un taller que paga no arranca nada.
 *   3. Corriendo (empezó ayer): la app entra normal.
 *   4. Vencida (empezó hace 16 días) y sin marcar en la base: la app ya muestra el aviso
 *      automático, antes de que pase el cron.
 *   5. vencer_pruebas() (lo que corre pg_cron) marca el corte con el instante del vencimiento
 *      y el motivo prueba_finalizada, y corta SOLO al Demo.
 *
 * Uso: npm run dev (otra terminal) y
 *   set -a && . ~/Documents/estudio_iara/.secrets/mp_demo_meta_review.env && set +a
 *   node qa_prueba_gratuita.cjs            (con el sandbox apagado: el navegador sale a supabase.co)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('./qa_playwright.cjs');
const EXEC = process.env.PW_CHROME
    || require('./qa_playwright.cjs').navegador;
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
const estadoDemo = async () => (await rest('GET', `talleres?id=eq.${DEMO_ID}&select=nombre,horas_para_llamar,acceso_suspendido_at,acceso_suspendido_motivo,prueba_dias,prueba_inicio_at`)).data[0];
const suspender = () => rest('PATCH', `talleres?id=eq.${DEMO_ID}`, { body: { acceso_suspendido_at: new Date().toISOString(), acceso_suspendido_motivo: 'prueba_finalizada' } });
const restaurar = (antes) => rest('PATCH', `talleres?id=eq.${DEMO_ID}`, { body: {
    acceso_suspendido_at: null, acceso_suspendido_motivo: null,
    prueba_dias: antes.prueba_dias ?? null, prueba_inicio_at: antes.prueba_inicio_at ?? null,
} });

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
// El título cambió el 2-oct-2026 (cartel impersonal, Rami): con motivo prueba_finalizada
// es 'Terminó el período de prueba'; sin motivo, 'El acceso a esta cuenta está pausado'.
const cartel = async (page) => (await seVe(page, 'Terminó el período de prueba'))
    || (await seVe(page, 'El acceso a esta cuenta está pausado'));
const app = (page) => seVe(page, 'Taller Activo');


const DIA = 86_400_000;
const parchar = (body) => rest('PATCH', `talleres?id=eq.${DEMO_ID}`, { body });
const avisoAutomatico = async (page) => (await seVe(page, 'Terminó el período de prueba'))
    && (await seVe(page, 'Aviso automático del sistema'));

(async () => {
    if (!DEMO_PASS) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }
    const antes = await estadoDemo();
    if (antes.nombre !== 'Taller Demo') { console.error('El id no es el Taller Demo, no toco nada'); process.exit(2); }
    if (antes.acceso_suspendido_at || antes.prueba_dias != null) {
        console.error('El Demo ya tenía suspensión o prueba: lo dejo como está y no pruebo'); process.exit(2);
    }
    const creados = [];
    const b = await chromium.launch({ executablePath: EXEC });
    try {
        // 1: poner en prueba a un taller con datos → el inicio es su dato más viejo.
        await parchar({ prueba_dias: 15 });
        const e1 = await estadoDemo();
        const cli = (await rest('GET', `clientes?taller_id=eq.${DEMO_ID}&fecha_registro=not.is.null&select=fecha_registro&order=fecha_registro.asc&limit=1`)).data?.[0]?.fecha_registro;
        const srv = (await rest('GET', `servicios?taller_id=eq.${DEMO_ID}&fecha_ingreso=not.is.null&select=fecha_ingreso&order=fecha_ingreso.asc&limit=1`)).data?.[0]?.fecha_ingreso;
        const viejo = Math.min(...[cli, srv].filter(Boolean).map(Date.parse));
        ok(!!e1.prueba_inicio_at && Date.parse(e1.prueba_inicio_at) === viejo,
            `1. en prueba con datos: el inicio es el dato más viejo (${e1.prueba_inicio_at} = ${new Date(viejo).toISOString()})`);

        // 2: sin reloj, el primer cliente que carga el usuario del taller lo arranca.
        const tk = await (await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
            method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: DEMO_MAIL, password: DEMO_PASS }),
        })).json();
        const cargar = async (nombre) => {
            const r = await rest('POST', 'clientes', { clave: ANON, jwt: tk.access_token, body: { taller_id: DEMO_ID, nombre } });
            if (r.data?.[0]?.id) creados.push(r.data[0].id);
            return r;
        };
        // Control: pagando (prueba_dias NULL) cargar un cliente NO arranca nada y el INSERT anda.
        await parchar({ prueba_dias: null, prueba_inicio_at: null });
        const c0 = await cargar('QA prueba gratuita (control)');
        const e2a = await estadoDemo();
        ok(c0.status < 300 && e2a.prueba_inicio_at === null, `2. control: un taller que paga carga normal y no arranca reloj (HTTP ${c0.status})`);
        await parchar({ prueba_dias: 15, prueba_inicio_at: null });
        const sinReloj = await estadoDemo();
        // El trigger de completar pone el más viejo al pasar a prueba: se vuelve a NULL para simular un taller nuevo.
        if (sinReloj.prueba_inicio_at) await parchar({ prueba_inicio_at: null });
        const t0 = Date.now();
        const c1 = await cargar('QA prueba gratuita');
        const e2 = await estadoDemo();
        const arranco = e2.prueba_inicio_at ? Date.parse(e2.prueba_inicio_at) : NaN;
        ok(c1.status < 300 && Math.abs(arranco - t0) < 60_000,
            `2. el primer cliente del usuario arranca el reloj (HTTP ${c1.status}, inicio ${e2.prueba_inicio_at})`);

        // 3: corriendo (empezó ayer) → la app entra normal.
        await parchar({ prueba_inicio_at: new Date(Date.now() - DIA).toISOString() });
        const p3 = await entrar(b, { width: 1440, height: 900 });
        ok(await app(p3), '3. corriendo: se ve la app');
        ok(!(await avisoAutomatico(p3)), '3. corriendo: no aparece el aviso');
        await p3.close();

        // 4: vencida y la base todavía sin marcar → la app ya muestra el aviso automático.
        const inicioVencido = new Date(Date.now() - 16 * DIA).toISOString();
        await parchar({ prueba_inicio_at: inicioVencido });
        for (const [nombre, vp] of [['compu', { width: 1440, height: 900 }], ['celu', { width: 390, height: 844 }]]) {
            const p = await entrar(b, vp);
            ok(await avisoAutomatico(p), `4. vencida sin marcar (${nombre}): aparece el aviso automático`);
            ok(!(await app(p)), `4. vencida sin marcar (${nombre}): no se ve la app`);
            await p.screenshot({ path: `${OUT}/prueba_vencida_${nombre}.png`, fullPage: true });
            await p.close();
        }

        // 5: lo que corre el cron marca el corte con la fecha del vencimiento, y solo al Demo.
        const v = await rest('POST', 'rpc/vencer_pruebas', { body: {} });
        const e5 = await estadoDemo();
        const esperado = Date.parse(inicioVencido) + 15 * DIA;
        ok(v.status < 300 && v.data === 1, `5. vencer_pruebas cortó exactamente 1 taller (HTTP ${v.status}, ${JSON.stringify(v.data)})`);
        ok(Date.parse(e5.acceso_suspendido_at) === esperado && e5.acceso_suspendido_motivo === 'prueba_finalizada',
            `5. el corte quedó con el instante del vencimiento y motivo prueba_finalizada (${e5.acceso_suspendido_at})`);
        // Y desde afuera nadie puede dispararlo.
        const anon = await rest('POST', 'rpc/vencer_pruebas', { clave: ANON, jwt: tk.access_token, body: {} });
        ok(anon.status >= 400, `5. un usuario logueado no puede correr vencer_pruebas (HTTP ${anon.status})`);
    } finally {
        for (const id of creados) await rest('DELETE', `clientes?id=eq.${id}&taller_id=eq.${DEMO_ID}`);
        await restaurar(antes);
        const despues = await estadoDemo();
        const quedan = (await rest('GET', `clientes?taller_id=eq.${DEMO_ID}&nombre=like.QA%20prueba%20gratuita*&select=id`)).data ?? [];
        ok(!despues.acceso_suspendido_at && despues.prueba_dias == null && despues.prueba_inicio_at == null && quedan.length === 0,
            `FINAL: el Taller Demo quedó como estaba (sin prueba, sin corte, ${creados.length} clientes de prueba borrados)`);
        await b.close();
    }
    console.log(fallas.length ? `\n❌ ${fallas.length} falla(s)` : '\n✅ todo verde');
    process.exit(fallas.length ? 1 : 0);
})();
