#!/usr/bin/env node
/**
 * mp_import_catalogo.cjs — Importa el catálogo de productos de un taller a
 * `productos_taller`, que es la tabla sobre la que corre el buscador de
 * repuestos de la app.
 *
 * PARA QUÉ: los talleres que tienen ERP (Contabilium) ya tienen su catálogo
 * maestro cargado ahí. En vez de que el mecánico vuelva a tipear cada repuesto,
 * se importa una vez y el buscador lo encuentra escribiendo dos letras.
 * Los talleres SIN integración no usan esto: su catálogo se arma solo, con lo
 * que van cargando (ver `registrar_productos_usados` en la migración).
 *
 * Corre desde frontend/ y lee `SUPABASE_SERVICE_ROLE` de `.env.local`
 * (la service_role bypasea RLS: es la única forma de escribir en el taller de
 * otro). NUNCA imprime la credencial.
 *
 * USO
 *   node mp_import_catalogo.cjs --taller "Probikes" --csv ../ruta/productos.csv
 *   node mp_import_catalogo.cjs --taller <uuid> --csv x.csv --dry-run
 *
 * OPCIONES
 *   --taller <uuid|nombre>   taller destino (obligatorio)
 *   --csv <ruta>             archivo CSV (obligatorio)
 *   --col-nombre <col>       columna del nombre     (default: ID)
 *   --col-sku <col>          columna del SKU        (default: SKU)
 *   --col-externo <col>      id en el ERP           (default: idConcepto)
 *   --col-precio <col>       precio                 (default: ninguna)
 *   --categoria <part|labor> default: part
 *   --origen <texto>         default: contabilium
 *   --dry-run                no escribe: solo informa qué haría
 *
 * QUÉ HACE CON LOS DUPLICADOS: la llave es el nombre normalizado, así que dos
 * filas del ERP con el mismo nombre y distinto SKU colapsan en una sola (dos
 * renglones idénticos en el buscador serían ruido para el mecánico). Los que
 * colapsa los lista al final para que se puedan revisar.
 *
 * QUÉ NO PISA: si el producto ya existía porque el taller lo venía cargando a
 * mano, la importación le suma el SKU y el id del ERP pero NO le toca
 * `veces_usado` ni `ultima_vez` — el aprendizaje del taller no se pierde.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Argumentos ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);

const OPT = {
    taller: arg('taller'),
    csv: arg('csv'),
    colNombre: arg('col-nombre', 'ID'),
    colSku: arg('col-sku', 'SKU'),
    colExterno: arg('col-externo', 'idConcepto'),
    colPrecio: arg('col-precio', null),
    categoria: arg('categoria', 'part'),
    origen: arg('origen', 'contabilium'),
    dryRun: flag('dry-run'),
};

if (!OPT.taller || !OPT.csv) {
    console.error('Uso: node mp_import_catalogo.cjs --taller "<nombre|uuid>" --csv <ruta.csv> [--dry-run]');
    process.exit(2);
}
if (!['part', 'labor'].includes(OPT.categoria)) {
    console.error(`--categoria tiene que ser "part" o "labor" (vino "${OPT.categoria}")`);
    process.exit(2);
}

// ── Credenciales ────────────────────────────────────────────────────────────
const env = {};
try {
    fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n').forEach(l => {
        const i = l.indexOf('=');
        if (i > 0 && !l.trim().startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    });
} catch {
    console.error('❌ No encuentro .env.local (tiene que estar en frontend/).');
    process.exit(2);
}
const URL = env.VITE_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE;
if (!URL || !SERVICE) {
    console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE en .env.local.');
    process.exit(2);
}
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

// ── CSV (RFC 4180: comillas dobles, comas y saltos adentro de comillas) ─────
function parseCSV(texto) {
    const filas = [];
    let campo = '', fila = [], enComillas = false;
    const t = texto.replace(/^﻿/, ''); // BOM de Excel
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (enComillas) {
            if (c === '"') {
                if (t[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
            } else campo += c;
        } else if (c === '"') enComillas = true;
        else if (c === ',') { fila.push(campo); campo = ''; }
        else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
        else if (c === '\r') { /* ignorar */ }
        else campo += c;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(f => f.some(v => v.trim() !== ''));
}

/**
 * Espejo EXACTO de `public.clave_producto()` (migración 20260809170000) y de
 * `claveProducto()` en `src/lib/buscadorProductos.ts`. Se usa solo para
 * deduplicar dentro del archivo antes de mandarlo: la clave real la calcula
 * la base.
 */
function claveProducto(s) {
    return (s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const numero = (v) => {
    if (v === undefined || v === null) return null;
    // "1.234,56" (formato AR) y "1234.56" (formato plano)
    const limpio = String(v).replace(/[^\d,.-]/g, '');
    if (!limpio) return null;
    const n = Number(limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio);
    return Number.isFinite(n) && n > 0 ? n : null;
};

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
    // 1. Resolver el taller
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(OPT.taller);
    const q = sb.from('talleres').select('id,nombre');
    const { data: talleres, error: eT } = esUuid
        ? await q.eq('id', OPT.taller)
        : await q.ilike('nombre', OPT.taller);
    if (eT) { console.error('❌ Error buscando el taller:', eT.message); process.exit(1); }
    if (!talleres?.length) { console.error(`❌ No existe el taller "${OPT.taller}".`); process.exit(1); }
    if (talleres.length > 1) {
        console.error(`❌ "${OPT.taller}" matchea ${talleres.length} talleres. Pasá el uuid.`);
        process.exit(1);
    }
    const taller = talleres[0];
    console.log(`🏪 Taller: ${taller.nombre} (${taller.id})`);

    // 2. Leer y mapear el CSV
    const filas = parseCSV(fs.readFileSync(OPT.csv, 'utf8'));
    if (filas.length < 2) { console.error('❌ El CSV no tiene filas de datos.'); process.exit(1); }
    const cabecera = filas[0].map(h => h.trim());
    const idx = (col) => (col ? cabecera.indexOf(col) : -1);

    const iNombre = idx(OPT.colNombre);
    if (iNombre < 0) {
        console.error(`❌ No encuentro la columna "${OPT.colNombre}". Columnas: ${cabecera.join(', ')}`);
        process.exit(1);
    }
    const iSku = idx(OPT.colSku), iExt = idx(OPT.colExterno), iPre = idx(OPT.colPrecio);

    // 3. Deduplicar por clave (la base tiene el mismo criterio, pero así el
    //    upsert no intenta tocar la misma fila dos veces en un mismo lote).
    const porClave = new Map();
    const colapsados = [];
    let sinNombre = 0;
    for (const f of filas.slice(1)) {
        const nombre = (f[iNombre] || '').trim();
        const clave = claveProducto(nombre);
        if (!clave) { sinNombre++; continue; }
        // 🔴 Solo viajan las columnas que el CSV TRAE de verdad.
        //    El UPDATE del upsert pisa exactamente las columnas del payload, así
        //    que mandar un campo en null porque "no está en este archivo" le
        //    borra al taller un dato que ya tenía. Ya pasó con `precio` (una
        //    importación sin precios borró 34 que el taller había aprendido); el
        //    mismo agujero estaba abierto para `sku` e `id_externo`: importar el
        //    CSV de precios, que no trae idConcepto, habría vaciado los 5.380
        //    ids del ERP.
        const fila = {
            taller_id: taller.id,
            nombre,
            categoria: OPT.categoria,
            origen: OPT.origen,
            activo: true,
        };
        if (iSku >= 0) fila.sku = (f[iSku] || '').trim() || null;
        if (iExt >= 0) fila.id_externo = (f[iExt] || '').trim() || null;
        if (iPre >= 0) fila.precio = numero(f[iPre]);
        if (porClave.has(clave)) colapsados.push({ clave, descartado: fila.sku, se_queda: porClave.get(clave).sku });
        else porClave.set(clave, fila);
    }
    const productos = [...porClave.values()];

    console.log(`📄 ${filas.length - 1} filas leídas → ${productos.length} productos únicos`);
    if (sinNombre) console.log(`   ⚠️  ${sinNombre} filas sin nombre usable (salteadas)`);
    if (colapsados.length) {
        console.log(`   ⚠️  ${colapsados.length} colapsadas por nombre repetido (se queda un SKU por nombre):`);
        colapsados.slice(0, 15).forEach(c => console.log(`      · ${c.clave} — queda ${c.se_queda}, sale ${c.descartado}`));
        if (colapsados.length > 15) console.log(`      … y ${colapsados.length - 15} más`);
    }
    const conPrecio = productos.filter(p => p.precio !== null).length;
    console.log(`   💲 ${conPrecio} con precio · ${productos.length - conPrecio} sin precio`);

    if (OPT.dryRun) {
        console.log('\n🧪 --dry-run: no se escribió nada. Muestra de 3:');
        console.log(JSON.stringify(productos.slice(0, 3), null, 2));
        return;
    }

    // 4. Upsert por lotes.
    //    onConflict = (taller_id, clave). `clave` es una columna generada: no
    //    viaja en el payload, la calcula la base a partir de `nombre`.
    //
    //    🔴 El UPDATE del upsert pisa EXACTAMENTE las columnas que van en el
    //    payload. Por eso:
    //      · veces_usado / ultima_vez nunca viajan → el aprendizaje del taller
    //        sobre ese producto se conserva intacto.
    //      · `precio` solo viaja cuando el CSV trae uno de verdad. Si viajara
    //        en null, una importación sin precios (la exportación de
    //        Contabilium no los trae) le borraría al taller el precio que ya
    //        sabía de haberlo cargado a mano. Pasó en la primera corrida.
    //    PostgREST exige que todos los objetos de un lote tengan las MISMAS
    //    claves, así que van en dos tandas: con precio y sin precio.
    const sinPrecio = productos.filter(p => p.precio == null).map(({ precio, ...resto }) => resto);
    const conPrecioFilas = productos.filter(p => p.precio != null);

    const LOTE = 500;
    let escritos = 0;
    for (const tanda of [conPrecioFilas, sinPrecio]) {
        for (let i = 0; i < tanda.length; i += LOTE) {
            const lote = tanda.slice(i, i + LOTE);
            const { error } = await sb
                .from('productos_taller')
                .upsert(lote, { onConflict: 'taller_id,clave', ignoreDuplicates: false });
            if (error) {
                console.error(`\n❌ Error escribiendo un lote: ${error.message}`);
                process.exit(1);
            }
            escritos += lote.length;
            process.stdout.write(`\r   ⬆️  ${escritos}/${productos.length}`);
        }
    }
    process.stdout.write('\n');

    // 5. Verificar contra la base (no confiar en que el upsert "no dio error")
    const { count } = await sb
        .from('productos_taller')
        .select('*', { count: 'exact', head: true })
        .eq('taller_id', taller.id);
    const { count: cAprendidos } = await sb
        .from('productos_taller')
        .select('*', { count: 'exact', head: true })
        .eq('taller_id', taller.id)
        .gt('veces_usado', 0);

    console.log(`✅ Listo. ${taller.nombre} tiene ${count} productos en el buscador`);
    console.log(`   (${cAprendidos} con historial de uso propio, que son los que van primero en el ranking)`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
