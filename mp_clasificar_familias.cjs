#!/usr/bin/env node
/**
 * mp_clasificar_familias.cjs — Marca qué productos del catálogo de un taller
 * NO son repuestos de taller, para que el buscador de la orden no los ofrezca.
 *
 * POR QUÉ: el catálogo del ERP es el del NEGOCIO, no el del taller. En Probikes,
 * 3.429 de 5.381 productos son bicicletas completas, ropa, cascos y calzado.
 * Nadie carga una bici entera como repuesto en una orden de service.
 *
 * NO BORRA NADA: guarda el rubro del ERP en `familia` y pone `sugerible=false`
 * en las familias que no son repuesto. Revertir es un UPDATE. Y si el taller
 * igual carga uno de esos en una orden, la propia app le devuelve el
 * `sugerible=true` (ver `registrar_productos_usados`): el uso real le gana a
 * esta clasificación.
 *
 * USO (desde frontend/, con las credenciales del ERP cargadas):
 *   set -a && . ../../Documents/estudio_iara/.secrets/contabilium.env && set +a
 *   node mp_clasificar_familias.cjs --taller "Probikes" [--dry-run]
 *
 * Solo sirve para talleres con Contabilium: la familia sale del rubro del ERP.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Familias del ERP que NO son repuesto de taller (decisión de Iara, 10-ago-2026).
const NO_SON_REPUESTO = new Set([
    'Bike',            // bicicletas completas
    'Apparel', 'Custom Apparel', 'Magenta', 'PAVE', 'SANTINI', 'Ziroox',  // ropa
    'Helmet', 'Lazer', // cascos
    'Shoe', 'DMT',     // calzado
    'Glove', 'Bag', 'Oakley',
]);

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DRY = argv.includes('--dry-run');
const TALLER = arg('taller');
if (!TALLER) { console.error('uso: node mp_clasificar_familias.cjs --taller "<nombre|uuid>" [--dry-run]'); process.exit(2); }

const env = {};
fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n').forEach(l => {
    const i = l.indexOf('='); if (i > 0 && !l.trim().startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const CB_EMAIL = process.env.CB_EMAIL, CB_KEY = process.env.CB_KEY;
if (!CB_EMAIL || !CB_KEY) {
    console.error('Faltan CB_EMAIL / CB_KEY. Cargalas primero:');
    console.error('  set -a && . <ruta a estudio_iara>/.secrets/contabilium.env && set +a');
    process.exit(2);
}
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

const HOST = 'rest.contabilium.com';
let token = null;
const pedirToken = () => new Promise((res, rej) => {
    const b = new URLSearchParams({ grant_type: 'client_credentials', client_id: CB_EMAIL, client_secret: CB_KEY }).toString();
    const r = https.request({ host: HOST, path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(b) } },
        x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res(JSON.parse(d).access_token) } catch (e) { rej(e) } }); });
    r.on('error', rej); r.write(b); r.end();
});
const GET = p => new Promise((res, rej) => {
    https.get({ host: HOST, path: p, headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'Mozilla/5.0' } },
        x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }); }).on('error', rej);
});
const dormir = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const esUuid = /^[0-9a-f-]{36}$/i.test(TALLER);
    const q = sb.from('talleres').select('id,nombre');
    const { data: ts } = esUuid ? await q.eq('id', TALLER) : await q.ilike('nombre', TALLER);
    if (!ts?.length) { console.error(`No existe el taller "${TALLER}".`); process.exit(1); }
    const taller = ts[0];
    console.log(`🏪 ${taller.nombre} (${taller.id})`);

    token = await pedirToken();

    // 🔴 El ERP manda IdRubro como TEXTO y el Id del rubro como NÚMERO: sin
    // normalizar a string el cruce no matchea NUNCA y todo queda sin familia,
    // que se lee como "no hay nada que sacar". Ya me pasó al medirlo.
    const rubros = await GET('/api/conceptos/rubros?includeChilds=true');
    const nombreRubro = new Map((rubros.Items || rubros).map(r => [String(r.Id), r.Nombre]));

    const familiaDeSku = new Map();
    let idAnt = null;
    for (let pg = 1; pg <= 2000; pg++) {
        const r = await GET(`/api/conceptos/search?page=${pg}`);
        const items = (r && r.Items) || [];
        if (!items.length || items[0].Id === idAnt) break;
        idAnt = items[0].Id;
        for (const c of items) {
            if (!c.Codigo) continue;
            familiaDeSku.set(String(c.Codigo).trim(), nombreRubro.get(String(c.IdRubro)) || null);
        }
        await dormir(60);
    }
    const conFamilia = [...familiaDeSku.values()].filter(Boolean).length;
    console.log(`📚 ${familiaDeSku.size} códigos del ERP · ${conFamilia} con familia reconocida`);
    if (!conFamilia) { console.error('🚩 Ninguno cruzó contra un rubro: no escribo nada.'); process.exit(1); }

    // Catálogo del taller
    let cat = [], desde = 0;
    for (; ;) {
        const { data, error } = await sb.from('productos_taller')
            .select('id,nombre,sku,veces_usado,familia,sugerible')
            .eq('taller_id', taller.id).range(desde, desde + 999);
        if (error) { console.error(error.message); process.exit(1); }
        cat = cat.concat(data);
        if (data.length < 1000) break;
        desde += 1000;
    }

    const porFamilia = new Map();
    const cambios = [];
    let usadosRescatados = 0;
    for (const p of cat) {
        const fam = p.sku ? familiaDeSku.get(p.sku) || null : null;
        // Lo que el taller YA usa se queda sugerible, diga lo que diga el ERP.
        const noEsRepuesto = fam && NO_SON_REPUESTO.has(fam);
        const sugerible = !noEsRepuesto || (p.veces_usado || 0) > 0;
        if (noEsRepuesto && (p.veces_usado || 0) > 0) usadosRescatados++;
        porFamilia.set(fam || '(sin familia)', (porFamilia.get(fam || '(sin familia)') || 0) + 1);
        if (p.familia !== fam || p.sugerible !== sugerible) cambios.push({ id: p.id, familia: fam, sugerible });
    }

    const fuera = cambios.filter(c => !c.sugerible).length;
    console.log('\nfamilias del catálogo:');
    [...porFamilia.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        .forEach(([n, c]) => console.log(`   ${String(c).padStart(5)}  ${n}${NO_SON_REPUESTO.has(n) ? '   ← fuera del buscador' : ''}`));
    console.log(`\n${cambios.length} filas a actualizar · ${fuera} dejan de sugerirse`);
    if (usadosRescatados) console.log(`   (${usadosRescatados} son de una familia excluida pero el taller YA las usó → se quedan)`);

    if (DRY) { console.log('\n🧪 --dry-run: no escribí nada.'); return; }

    let n = 0;
    for (const c of cambios) {
        const { error } = await sb.from('productos_taller')
            .update({ familia: c.familia, sugerible: c.sugerible }).eq('id', c.id);
        if (error) { console.error(`❌ ${c.id}: ${error.message}`); process.exit(1); }
        if (++n % 500 === 0) process.stdout.write(`\r   ⬆️  ${n}/${cambios.length}`);
    }
    process.stdout.write(`\r   ⬆️  ${n}/${cambios.length}\n`);

    const { count: ofrecidos } = await sb.from('productos_taller')
        .select('*', { count: 'exact', head: true })
        .eq('taller_id', taller.id).eq('activo', true).eq('sugerible', true);
    console.log(`✅ El buscador de ${taller.nombre} ofrece ahora ${ofrecidos} productos (antes ${cat.length}).`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
