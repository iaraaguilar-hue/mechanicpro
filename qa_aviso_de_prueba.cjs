/**
 * Candado del AVISO DE PRUEBA del Taller Activo (8-oct-2026).
 *
 * Iara: «no quiero mandar más mensajes yo misma. quiero que todo le aparezca al mecánico
 * directamente en la app». El aviso reemplaza los WhatsApp de ayuda y de cierre que ella
 * mandaba a mano a cada taller en prueba (`src/components/AvisoDePrueba.tsx`).
 *
 * NO escribe NADA en la base: el Demo paga, y para verlo como un taller en prueba se
 * intercepta la respuesta de `talleres` (y la de `servicios`, para la costumbre del OTRO).
 *   A. En prueba extendida (como Bike Pro el 8-oct), sin WhatsApp, sin turnos y con las
 *      órdenes en OTRO → el aviso y sus 3 ítems se VEN (checkVisibility) en 1280 y 390 px,
 *      nada se sale del ancho, cada botón lleva al ajuste exacto de Configuración.
 *   B. Últimos 2 días y todo prendido → aparece con quién hablar (WhatsApp y correo) y no
 *      queda ningún ítem: solo la cuenta regresiva.
 *   C. Control negativo: el Demo tal cual (paga) → no hay aviso.
 *   D. Control del instrumento: se le mete al aviso "Plan Pro $1000", un texto blanco y
 *      un pedazo con el color del taller, y cada chequeo tiene que cazar el suyo (si no,
 *      el candado no mide nada).
 *   En A y B, el texto visible del aviso no tiene "$" ni nombres de plan. En A, con los
 *   colores de Leira (rojo y blanco) metidos en el viaje: todo se lee a 4,5:1 y el aviso
 *   no usa el color del taller (va en una sola cosa por pantalla: Recibir Bici).
 *
 * Uso: npm run dev (otra terminal) y
 *   set -a && . ~/Documents/estudio_iara/.secrets/mp_demo_meta_review.env && set +a
 *   node qa_aviso_de_prueba.cjs            (con el sandbox apagado: el navegador sale a supabase.co)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('./qa_playwright.cjs');
const EXEC = process.env.PW_CHROME || require('./qa_playwright.cjs').navegador;
const BASE = process.env.MP_URL || 'http://localhost:5173/';
const OUT = process.env.OUT || '/tmp';
const DEMO_ID = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const DEMO_PASS = process.env.DEMO_PASS || process.env.MP_DEMO_PASSWORD;
const DEMO_MAIL = process.env.DEMO_MAIL || 'demo@mechanicpro.com.ar';
const DIA = 86_400_000;

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()]));
const SERVICE = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8')).service_role_key;

const fallas = [];
const ok = (cond, que) => { console.log(`${cond ? '✅' : '❌'} ${que}`); if (!cond) fallas.push(que); };

// Solo LECTURA: el estado real del Demo, para que el control negativo signifique algo.
async function demoReal() {
    const r = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/talleres?id=eq.${DEMO_ID}&select=nombre,prueba_dias,acceso_suspendido_at`,
        { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    return (await r.json())[0];
}

/** Abre el Taller Activo del Demo, con `talleres` (y opcionalmente `servicios`) cambiados en el viaje. */
async function entrar(b, viewport, { taller, todoOtro } = {}) {
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
    if (todoOtro) await parchar('**/rest/v1/servicios?*', (o) => (o && o.taller_id === DEMO_ID ? { ...o, tipo_servicio: 'OTRO' } : o));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type=email]', DEMO_MAIL);
    await page.fill('input[type=password]', DEMO_PASS);
    await page.click('button[type=submit]');
    await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO')
        && !document.querySelector('input[type=password]'), { timeout: 45000 });
    await page.waitForFunction(() => /taller activo/i.test(document.body.innerText), { timeout: 30000 });
    await page.waitForTimeout(3500);
    for (let i = 0; i < 3; i++) {
        const ov = page.locator('div.fixed.inset-0 button').last();
        if (await ov.count()) { try { await ov.click({ force: true, timeout: 1500 }); } catch { } }
    }
    await page.waitForTimeout(400);
    return { page, errores };
}

const VIS = { contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true };
/** Lo que se ve del aviso: si está, sus ítems visibles, el contacto, y si algo se sale del ancho. */
const medir = (page) => page.evaluate((VIS) => {
    const aviso = document.querySelector('[data-aviso-prueba]');
    if (!aviso || !aviso.checkVisibility(VIS)) return { hay: false };
    const ancho = window.innerWidth;
    const pendientes = [...aviso.querySelectorAll('[data-pendiente]')]
        .filter(li => li.checkVisibility(VIS))
        .map(li => {
            const btn = li.querySelector('button');
            const r = btn ? btn.getBoundingClientRect() : null;
            return {
                id: li.getAttribute('data-pendiente'),
                boton: !!btn && btn.checkVisibility(VIS) && r.width > 0 && r.right <= ancho + 0.5 && r.left >= -0.5,
                textoBoton: btn ? btn.innerText.trim() : '',
            };
        });
    const contacto = aviso.querySelector('[data-aviso-contacto]');
    const links = contacto ? [...contacto.querySelectorAll('a')].filter(a => a.checkVisibility(VIS)).map(a => a.getAttribute('href')) : [];
    const ra = aviso.getBoundingClientRect();
    return {
        hay: true,
        texto: aviso.innerText,
        pendientes,
        contacto: !!contacto && contacto.checkVisibility(VIS),
        links,
        dentroDelAncho: ra.right <= ancho + 0.5 && document.documentElement.scrollWidth <= ancho + 0.5,
        // Contraste de cada texto contra el fondo que tiene detrás (la cuenta de qa_contraste.cjs).
        poco: (() => {
            const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
                return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
            const rgb = (x) => { const m = x.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
            const alfa = (x) => { const m = x.match(/[\d.]+/g); return m && m.length > 3 ? Number(m[3]) : 1; };
            const fondoDe = (e) => { for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
                const st = getComputedStyle(n); if (alfa(st.backgroundColor) > 0.85) return rgb(st.backgroundColor); } return [255, 255, 255]; };
            const malos = [];
            const w = document.createTreeWalker(aviso, NodeFilter.SHOW_TEXT); let n;
            while ((n = w.nextNode())) {
                const t = (n.textContent || '').trim(); if (t.length < 2) continue;
                const e = n.parentElement; if (!e.checkVisibility(VIS)) continue;
                const fg = rgb(getComputedStyle(e).color), bg = fondoDe(e);
                const la = lum(fg), lb = lum(bg); const r = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
                if (r < 4.5) malos.push(`${t.slice(0, 30)} (${r.toFixed(2)}:1)`);
            }
            return malos;
        })(),
        // El color del taller va en UNA cosa por pantalla (el botón Recibir Bici): en el aviso, nada.
        conColorDelTaller: (() => {
            const btn = [...document.querySelectorAll('button')].find(x => /recibir bici/i.test(x.innerText));
            const primario = btn ? getComputedStyle(btn).backgroundColor : null;
            if (!primario) return ['no encontré el botón Recibir Bici para leer el color'];
            return [aviso, ...aviso.querySelectorAll('*')].filter(e => {
                const st = getComputedStyle(e);
                return [st.color, st.backgroundColor, st.borderTopColor, st.borderLeftColor, st.fill, st.stroke].includes(primario);
            }).map(e => (e.textContent || e.tagName).trim().slice(0, 30));
        })(),
        // La misma regla que qa_lectura_al_entrar: textos de 40+ caracteres fuera de botones y links.
        prosa: (() => {
            const w = document.createTreeWalker(aviso, NodeFilter.SHOW_TEXT); let n, c = 0;
            while ((n = w.nextNode())) {
                const t = (n.textContent || '').trim().replace(/\s+/g, ' ');
                if (t.length < 40 || !/\s/.test(t) || n.parentElement.closest('button, a')) continue;
                c += t.length;
            }
            return c;
        })(),
    };
}, VIS);

// Sin planes ni precios: "Mechanic Pro" es el nombre del producto, no un plan.
const planOPrecio = (texto) => {
    const t = (texto || '').replace(/Mechanic Pro/g, '');
    const m = t.match(/\$|\b(sport|pro|expert)\b|[«»]/i);
    return m ? m[0] : null;
};

(async () => {
    if (!DEMO_PASS) { console.error('Falta MP_DEMO_PASSWORD'); process.exit(2); }
    const real = await demoReal();
    if (real?.nombre !== 'Taller Demo') { console.error('El id no es el Taller Demo'); process.exit(2); }
    if (real.prueba_dias != null || real.acceso_suspendido_at) {
        console.error('El Demo está en prueba o cortado: el control negativo no significaría nada. No pruebo.'); process.exit(2);
    }
    const ahora = Date.now();
    // A: como Bike Pro el 8-oct (21 días, le quedan 6), sin WhatsApp ni turnos.
    const enPrueba = {
        prueba_dias: 21, prueba_inicio_at: new Date(ahora - 15 * DIA).toISOString(),
        wa_activo: false, wa_phone_number_id: null, config_turnos: {},
        // Los colores de Leira (rojo puro y blanco): el aviso tiene que seguir neutro y legible.
        color_primario: '#e90c0c', color_secundario: '#FFFFFF',
    };
    // B: 15 días que vencen en 12 horas (último o anteúltimo día), con todo prendido.
    const alFinal = {
        prueba_dias: 15, prueba_inicio_at: new Date(ahora - 15 * DIA + 12 * 3_600_000).toISOString(),
        wa_activo: true, wa_phone_number_id: 'qa-numero', config_turnos: { habilitado: true },
    };

    const b = await chromium.launch({ executablePath: EXEC });
    try {
        for (const [nombre, vp] of [['compu', { width: 1280, height: 800 }], ['celu', { width: 390, height: 844 }]]) {
            // ── A ──
            const { page, errores } = await entrar(b, vp, { taller: enPrueba, todoOtro: true });
            const a = await medir(page);
            ok(a.hay, `A (${nombre}): taller en prueba → se ve el aviso`);
            if (a.hay) {
                ok(/Te quedan \d+ días de prueba/.test(a.texto), `A (${nombre}): la cuenta regresiva ("${a.texto.split('\n')[0]}")`);
                ok(a.texto.includes('Extendimos tu prueba gratuita hasta el') && a.texto.includes('inclusive'),
                    `A (${nombre}): prueba extendida conserva el "Extendimos… inclusive"`);
                const ids = a.pendientes.map(p => p.id).join(',');
                ok(ids === 'whatsapp,menu,turnos', `A (${nombre}): se ven los 3 ítems (${ids || 'ninguno'})`);
                ok(a.pendientes.every(p => p.boton), `A (${nombre}): cada ítem tiene su botón a la vista y dentro del ancho`);
                ok(a.dentroDelAncho, `A (${nombre}): el aviso no se sale del ancho ni corre la página de costado`);
                ok(!a.contacto, `A (${nombre}): a una semana del final todavía no aparece el contacto`);
                ok(!planOPrecio(a.texto), `A (${nombre}): sin "$" ni nombres de plan (${planOPrecio(a.texto) || 'limpio'})`);
                ok(a.poco.length === 0, `A (${nombre}): todo el texto del aviso se lee (4,5:1 o más) con los colores de Leira${a.poco.length ? ': ' + a.poco.join(' · ') : ''}`);
                ok(a.conColorDelTaller.length === 0, `A (${nombre}): el aviso no usa el color del taller${a.conColorDelTaller.length ? ': ' + a.conColorDelTaller.join(' · ') : ''}`);
                // Techo PROPIO del aviso: 400 caracteres de prosa. No entra en el de Taller Activo
                // de qa_lectura_al_entrar (150), que se mide con el Demo, que paga y no lo ve. Es lo
                // que antes Iara mandaba por WhatsApp: la cuenta regresiva (con el texto de prueba
                // extendida del 7-oct, 135 caracteres, que se conserva) y lo que falta, con el dato
                // de cada uno. Medido el 8-oct-2026: 340 con los 3 ítems.
                ok(a.prosa <= 400, `A (${nombre}): prosa del aviso ${a.prosa} / 400 caracteres`);
            }
            ok(errores.length === 0, `A (${nombre}): 0 errores de página${errores.length ? ': ' + errores[0] : ''}`);
            await page.screenshot({ path: `${OUT}/aviso_prueba_${nombre}.png` });

            // ── A: cada botón lleva al ajuste exacto (en la compu alcanza: es el mismo componente) ──
            if (nombre === 'compu' && a.hay) {
                for (const p of a.pendientes) {
                    await page.locator(`[data-pendiente="${p.id}"] button`).click();
                    await page.waitForTimeout(1500);
                    const llego = await page.evaluate(({ id, VIS }) => {
                        const el = document.querySelector(`[data-ajuste="${id}"]`);
                        return location.pathname === '/configuracion' && !!el && el.checkVisibility(VIS);
                    }, { id: p.id, VIS });
                    ok(llego, `A: "${p.textoBoton}" lleva a Configuración, al ajuste ${p.id}, y se ve`);
                    await page.locator('nav a, aside a').filter({ hasText: 'Taller Activo' }).first().click({ force: true });
                    await page.waitForSelector('[data-aviso-prueba]', { timeout: 15000 });
                }

                // ── D: control del instrumento ──
                await page.evaluate(() => {
                    const s = document.createElement('span'); s.textContent = ' Plan Pro $1000';
                    document.querySelector('[data-aviso-prueba] p').appendChild(s);
                });
                await page.evaluate(() => {
                    const ilegible = document.createElement('span'); ilegible.textContent = ' texto blanco';
                    ilegible.style.color = '#ffffff';
                    document.querySelector('[data-aviso-prueba] p').appendChild(ilegible);
                    const rojo = document.createElement('span'); rojo.textContent = 'rojo';
                    rojo.style.backgroundColor = getComputedStyle([...document.querySelectorAll('button')]
                        .find(x => /recibir bici/i.test(x.innerText))).backgroundColor;
                    document.querySelector('[data-aviso-prueba] p').appendChild(rojo);
                });
                const d = await medir(page);
                ok(!!planOPrecio(d.texto), `D: el chequeo caza un plan o un precio metido a mano (cazó "${planOPrecio(d.texto)}")`);
                ok(d.poco.some(x => x.startsWith('texto blanco')), `D: el chequeo de contraste caza texto blanco sobre blanco (${d.poco[0] || 'no cazó nada'})`);
                ok(d.conColorDelTaller.includes('rojo'), `D: el chequeo de color caza el color del taller metido en el aviso`);
            }
            await page.close();

            // ── B ──
            const pb = await entrar(b, vp, { taller: alFinal });
            const m = await medir(pb.page);
            ok(m.hay, `B (${nombre}): últimos días → se ve el aviso`);
            if (m.hay) {
                ok(/Te quedan 2 días de prueba|Hoy es el último día de prueba/.test(m.texto), `B (${nombre}): "${m.texto.split('\n')[0]}"`);
                ok(m.contacto, `B (${nombre}): aparece con quién hablar para seguir`);
                ok(m.links.some(h => h.startsWith('https://wa.me/5491125677858')) && m.links.includes('mailto:iara@mechanicpro.com.ar'),
                    `B (${nombre}): el WhatsApp y el correo se ven y son links`);
                ok(m.pendientes.length === 0, `B (${nombre}): todo prendido → no queda ningún ítem (${m.pendientes.map(p => p.id).join(',') || 'ninguno'})`);
                ok(m.dentroDelAncho, `B (${nombre}): nada se sale del ancho`);
                ok(!planOPrecio(m.texto), `B (${nombre}): sin "$" ni nombres de plan (${planOPrecio(m.texto) || 'limpio'})`);
            }
            ok(pb.errores.length === 0, `B (${nombre}): 0 errores de página`);
            await pb.page.screenshot({ path: `${OUT}/aviso_prueba_final_${nombre}.png` });
            await pb.page.close();

            // ── C: control negativo, el Demo tal cual (paga) ──
            const pc = await entrar(b, vp);
            const c = await medir(pc.page);
            const tablero = await pc.page.evaluate(() => /taller activo/i.test(document.body.innerText));
            ok(tablero && !c.hay, `C (${nombre}): taller que paga → Taller Activo sin aviso de prueba`);
            await pc.page.close();
        }
    } finally {
        await b.close();
    }
    console.log(fallas.length ? `\n❌ ${fallas.length} falla(s)` : '\n✅ todo verde');
    process.exit(fallas.length ? 1 : 0);
})();
