/**
 * ¿Hay texto que no se lee, con los colores que eligió el taller?
 *
 * Origen (10-sep-2026): Ariel Leira eligió BLANCO de secundario y quedó texto
 * blanco sobre blanco (1,03:1) en «Entregar Bici», el contador de bicis listas
 * y los íconos de Métricas. Medido después, no era solo él: ProCycling estaba
 * en 1,99:1 y Probikes en 2,50:1.
 *
 * Recorre las pantallas con los colores de un taller real y mide el contraste
 * de cada texto visible contra el fondo que efectivamente tiene detrás.
 *
 *   DEMO_PASS=… node qa_contraste.cjs                 (colores del Demo)
 *   DEMO_PASS=… node qa_contraste.cjs --colores '#e90c0c,#FFFFFF'   (los de Leira)
 *
 * 🔴 El Taller Demo es la cuenta de las demos comerciales: los colores se
 * restauran en un finally pase lo que pase.
 */
const { chromium } = require('/Users/iaraaguilar/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs = require('fs');
const EXEC = process.env.PW_CHROME
    || '/Users/iaraaguilar/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const cfg = JSON.parse(fs.readFileSync('/Users/iaraaguilar/Documents/estudio_iara/.secrets/supabase_mp.json', 'utf8'));
const DEMO = '2e58d4b0-23c6-46a5-a127-72979613ac79';
const PISO = 3;   // el mínimo WCAG para texto grande o en negrita

const i = process.argv.indexOf('--colores');
const COLORES = i > 0 ? process.argv[i + 1].split(',') : null;

async function colores(primario, secundario) {
    const r = await fetch(`${cfg.project_url}/rest/v1/talleres?id=eq.${DEMO}`, {
        method: 'PATCH',
        headers: { apikey: cfg.service_role_key, Authorization: 'Bearer ' + cfg.service_role_key,
                   'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ color_primario: primario, color_secundario: secundario }),
    });
    const d = await r.json();
    if (!Array.isArray(d) || d[0].color_primario !== primario) throw new Error('no se pudieron cambiar los colores: ' + JSON.stringify(d).slice(0, 200));
    return [d[0].color_primario, d[0].color_secundario];
}

const MEDIR = (PISO) => {
    const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const rgb = (s) => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
    const alfa = (s) => { const m = s.match(/[\d.]+/g); return m && m.length > 3 ? Number(m[3]) : 1; };
    const ratio = (a, b) => { const la = lum(a), lb = lum(b); const [c, o] = la > lb ? [la, lb] : [lb, la]; return (c + 0.05) / (o + 0.05); };
    // El fondo real: se sube por los padres hasta el primero que no es transparente.
    // Devuelve null si arriba hay un DEGRADADO o una imagen: ahí el fondo no es
    // un color y no se puede medir así. Marcarlo como defecto sería un falso
    // positivo (pasó con el badge «Expert Plan», blanco sobre un degradado
    // verde que se lee perfecto).
    const fondoDe = (e) => {
        let n = e;
        while (n && n !== document.documentElement) {
            const st = getComputedStyle(n);
            if (st.backgroundImage && st.backgroundImage !== 'none') return null;
            if (alfa(st.backgroundColor) > 0.85) return rgb(st.backgroundColor);
            n = n.parentElement;
        }
        return [255, 255, 255];
    };
    const malos = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
        const t = (n.textContent || '').trim();
        if (t.length < 2) continue;
        const e = n.parentElement;
        if (!e || !e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
        const st = getComputedStyle(e);
        if (Number(st.opacity) < 0.3) continue;
        const fg = rgb(st.color); if (!fg || alfa(st.color) < 0.5) continue;
        const fondo = fondoDe(e);
        if (!fondo) continue;   // degradado o imagen: no se puede medir
        const r = ratio(fg, fondo);
        if (r < PISO) malos.push({ texto: t.slice(0, 60), ratio: Number(r.toFixed(2)), color: st.color, clases: (e.className && e.className.baseVal !== undefined ? e.className.baseVal : String(e.className || '')).slice(0, 110), padre: e.parentElement ? String(e.parentElement.className || '').slice(0, 80) : '' });
    }
    // uno por texto, el peor
    const m = new Map();
    for (const x of malos) if (!m.has(x.texto) || m.get(x.texto).ratio > x.ratio) m.set(x.texto, x);
    return [...m.values()].sort((a, b) => a.ratio - b.ratio);
};

(async () => {
    if (!process.env.DEMO_PASS) { console.error('Falta DEMO_PASS'); process.exit(2); }
    const original = await (async () => {
        const r = await fetch(`${cfg.project_url}/rest/v1/talleres?id=eq.${DEMO}&select=color_primario,color_secundario`,
            { headers: { apikey: cfg.service_role_key, Authorization: 'Bearer ' + cfg.service_role_key } });
        const d = await r.json(); return [d[0].color_primario, d[0].color_secundario];
    })();
    console.log('colores originales del Demo:', original.join(' / '));
    const b = await chromium.launch({ executablePath: EXEC });
    let total = 0;
    try {
        if (COLORES) console.log('probando con:', (await colores(COLORES[0], COLORES[1])).join(' / '));
        const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
        await page.goto(process.env.MP_URL || 'http://localhost:5173/', { waitUntil: 'domcontentloaded' });
        await page.fill('input[type=email]', 'demo@mechanicpro.com.ar');
        await page.fill('input[type=password]', process.env.DEMO_PASS);
        await page.click('button[type=submit]');
        await page.waitForFunction(() => !document.body.innerText.includes('INGRESANDO'), { timeout: 45000 });
        await page.evaluate(() => localStorage.setItem('mechanicpro_tour_v3', 'visto'));
        await page.waitForTimeout(3500);
        const ov = page.locator('div.fixed.inset-0 button').last();
        if (await ov.count()) { try { await ov.click({ force: true, timeout: 2000 }); } catch {} }
        await page.waitForTimeout(1200);

        // Control negativo: se inyecta texto blanco sobre blanco. Si el candado
        // no lo caza, el candado no mide nada — que es exactamente lo que pasó
        // en otro chequeo que daba OK sobre letras a 1,06:1.
        if (process.argv.includes('--control-negativo')) {
            await page.evaluate(() => {
                const p = document.createElement('p');
                p.style.color = '#FFFFFF';
                p.style.backgroundColor = '#FFFFFF';
                p.textContent = 'control negativo: esto no se lee';
                document.body.appendChild(p);
            });
            await page.waitForTimeout(400);
            const malos = await page.evaluate(MEDIR, PISO);
            const cazado = malos.some(m => m.texto.includes('control negativo'));
            console.log(cazado
                ? '✅ CONTROL NEGATIVO OK: cazó el texto blanco sobre blanco.'
                : '🚩 CONTROL NEGATIVO FALLIDO: no lo vio. El candado no mide nada.');
            if (!cazado) { total = 999; }
        }

        for (const p of ['Taller Activo', 'Clientes', 'Historial', 'Retención', 'Métricas', 'Bicis paradas', 'Configuración']) {
            const link = page.locator('nav a, aside a').filter({ hasText: p }).first();
            if (!(await link.count())) continue;
            await link.click({ force: true });
            await page.waitForTimeout(3000);
            const malos = await page.evaluate(MEDIR, PISO);
            total += malos.length;
            console.log(`${malos.length === 0 ? '✅' : '🚩'} ${p.padEnd(16)} ${malos.length} textos por debajo de ${PISO}:1`);
            malos.slice(0, 8).forEach(m => console.log(`      ${String(m.ratio).padStart(5)}:1  «${m.texto}»  ${m.color}\n              clase: ${m.clases}\n              padre: ${m.padre}`));
        }
    } finally {
        const v = await colores(original[0], original[1]);
        console.log('\n🔒 colores del Demo restaurados:', v.join(' / '));
        await b.close();
    }
    console.log(total === 0 ? '\n✅ Todo el texto se lee.' : `\n🚩 ${total} textos no se leen.`);
    process.exit(total === 0 ? 0 : 1);
})().catch(e => { console.error('ROTO:', e.message); process.exit(2); });
