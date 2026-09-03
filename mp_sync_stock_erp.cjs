#!/usr/bin/env node
/**
 * mp_sync_stock_erp.cjs — Trae a Mechanic Pro el STOCK y la ÚLTIMA VENTA de
 * cada producto, leyendo el ERP (Contabilium) del taller.
 *
 * PARA QUÉ: es el cimiento de "cruzar el stock parado contra la base de
 * clientes" (idea 15 del roadmap). Sin esto, MP sabe QUÉ vende el taller
 * (`mp_import_catalogo.cjs` ya trae nombre/SKU/precio) pero no sabe si lo TIENE
 * ni hace cuánto que no lo vende, que es justo lo que define "parado".
 *
 * QUÉ ESCRIBE (y nada más): productos_taller.stock, .stock_reservado,
 * .stock_actualizado_en, .ultima_venta, .unidades_vendidas. NUNCA toca nombre,
 * precio, familia, sugerible ni el aprendizaje del taller (veces_usado).
 *
 * SOLO LECTURAS contra Contabilium. Credencial por env, nunca en el repo:
 *   set -a && . .secrets/contabilium.env && set +a
 *
 * USO
 *   node mp_sync_stock_erp.cjs --taller "Probikes" [--dias 365] [--dry-run]
 *
 * 🚩 LO QUE ESTE DATO NO ES: Contabilium sobre-reporta. Ya nos dio 3 unidades
 * de un talle que en la percha no existía. Sirve para decidir A QUIÉN LLAMAR
 * (lo lee el dueño, que tiene la bici a la vista); NO sirve para prometerle un
 * talle a un cliente. Por eso se guarda `stock_actualizado_en`: la pantalla
 * tiene que poder decir de cuándo es el dato.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const HOST = 'rest.contabilium.com';
const DEPOSITO = 56990; // Probikes: depósito único PRINCIPAL
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i+1] && !argv[i+1].startsWith('--') ? argv[i+1] : d; };
const DRY = argv.includes('--dry-run');
const TALLER = arg('taller');
const DIAS = parseInt(arg('dias', '365'), 10);
const EMAIL = process.env.CB_EMAIL, KEY = process.env.CB_KEY;

if (!TALLER) { console.error('Falta --taller'); process.exit(1); }
if (!EMAIL || !KEY) { console.error('Faltan CB_EMAIL / CB_KEY (set -a && . .secrets/contabilium.env && set +a)'); process.exit(1); }

// ── Supabase (service_role: escribe en el taller que corresponda) ────────────
const envLocal = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const gv = k => (envLocal.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const db = createClient(gv('VITE_SUPABASE_URL'), gv('SUPABASE_SERVICE_ROLE') || gv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// ── HTTP a Contabilium ──────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
function http(method, p, auth, body) {
  return new Promise(res => {
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (auth) headers.Authorization = 'Bearer ' + auth;
    if (body) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; headers['Content-Length'] = Buffer.byteLength(body); }
    const r = https.request({ host: HOST, path: p, method, headers }, resp => {
      let b = ''; resp.on('data', c => b += c); resp.on('end', () => res({ status: resp.statusCode, body: b }));
    });
    r.on('error', e => res({ status: 0, err: String(e) }));
    r.setTimeout(25000, () => r.destroy());
    if (body) r.write(body);
    r.end();
  });
}
async function GET(p, auth, reintentos = 3) {
  for (let i = 0; i < reintentos; i++) {
    const r = await http('GET', p, auth);
    if (r.status === 200) { try { return { data: JSON.parse(r.body) }; } catch { return { data: null }; } }
    if (r.status === 429 || r.status === 0 || r.status >= 500) { await sleep(900 * (i + 1)); continue; }
    return { data: null, status: r.status };
  }
  return { data: null };
}
async function token() {
  const data = new URLSearchParams({ grant_type: 'client_credentials', client_id: EMAIL, client_secret: KEY }).toString();
  const r = await http('POST', '/token', null, data);
  try { return JSON.parse(r.body).access_token; } catch { return null; }
}
/**
 * 🚩 Por qué esto no es un for simple. La primera version cortaba con
 * `if (!its.length) break;`: una sola pagina que volviera vacia por un 429
 * silencioso abortaba el barrido ENTERO y el script seguia como si nada. Medido:
 * tres corridas seguidas del mismo endpoint dieron 2400, 2000 y 1700 SKU.
 * Un faltante ahi no se ve como error: se ve como "esa bici no tiene stock",
 * que es exactamente la mentira que esta feature no puede decir.
 * Ahora cada pagina se reintenta, y al final se COMPARA contra TotalItems: si
 * falta algo, aborta en vez de devolver una foto incompleta.
 */
async function paginado(base, auth, cap = 400) {
  const sep = base.includes('?') ? '&' : '?';
  let first = null;
  for (let intento = 0; intento < 6 && !first?.data?.Items?.length; intento++) {
    if (intento) await sleep(2000 * intento);
    first = await GET(`${base}${sep}page=1`, auth);
  }
  if (!first?.data?.Items?.length) {
    throw new Error(`la pagina 1 de ${base} volvio vacia tras 6 intentos: el ERP no esta respondiendo. Abortado: 0 filas se leen como "no hay stock".`);
  }
  const total = first.data?.TotalItems || 0;
  let items = first.data?.Items || [];
  const porPagina = items.length || 50;
  const paginas = Math.min(cap, Math.max(1, Math.ceil(total / porPagina)));
  for (let p = 2; p <= paginas; p++) {
    let its = null;
    for (let intento = 0; intento < 6 && !its?.length; intento++) {
      if (intento) await sleep(2000 * intento);
      const r = await GET(`${base}${sep}page=${p}`, auth);
      its = r.data?.Items || [];
    }
    if (!its.length) throw new Error(`la pagina ${p} de ${base} volvio vacia despues de 6 intentos (esperaba ~${porPagina} items de ${total})`);
    items = items.concat(its);
    await sleep(120); // el ERP tira 429 si se lo castiga
  }
  if (!items.length || (total && items.length < total)) {
    throw new Error(`barrido incompleto de ${base}: traje ${items.length} de ${total}. Abortado a proposito: una foto de stock incompleta se lee como "no hay".`);
  }
  return items;
}
// pool chico: Contabilium tira 429 si se lo castiga
async function pool(arr, n, fn) {
  const out = new Array(arr.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => {
    while (i < arr.length) { const k = i++; out[k] = await fn(arr[k], k); }
  }));
  return out;
}
const fmt = d => d.toISOString().slice(0, 10);

(async () => {
  // taller destino
  const { data: talleres } = await db.from('talleres').select('id,nombre')
    .or(`id.eq.${/^[0-9a-f-]{36}$/i.test(TALLER) ? TALLER : '00000000-0000-0000-0000-000000000000'},nombre.ilike.${TALLER}`);
  if (!talleres?.length) { console.error('No encontré el taller:', TALLER); process.exit(1); }
  if (talleres.length > 1) { console.error('Ambiguo:', talleres.map(t => t.nombre).join(', ')); process.exit(1); }
  const taller = talleres[0];
  console.log(`Taller: ${taller.nombre} (${taller.id})${DRY ? '  [DRY-RUN]' : ''}`);

  const auth = await token();
  if (!auth) { console.error('No pude autenticar contra Contabilium'); process.exit(1); }

  // 1) STOCK del depósito
  console.log('· stock del depósito…');
  const filas = await paginado(`/api/inventarios/getStockByDeposito?id=${DEPOSITO}`, auth);
  const stock = new Map();
  /* 🔴 STOCK DISPONIBLE, NO BRUTO — la misma cuña del 26-ago-2026 de los 4 exportadores de
     Probikes, que este sync tenía pendiente (28-ago). `StockActual` incluye lo ya reservado
     para un cliente: medido en Probikes, 311 SKU (17%) se ofrecían sin tenerlos. El disponible
     es `StockConReservas` = max(0, actual − reservado); el max(0,…) es por las filas donde el
     reservado supera al actual (el ERP también las clampea). `stock_reservado` se sigue
     guardando aparte como dato informativo — la app NO lo resta (verificado 28-ago: ninguna
     vista lo usa), así que `stock` tiene que llegar ya restado. */
  for (const f of filas) if (f.Codigo) {
    const disponible = typeof f.StockConReservas === 'number'
      ? Math.max(0, f.StockConReservas)
      : Math.max(0, (f.StockActual ?? 0) - (f.StockReservado ?? 0));
    stock.set(String(f.Codigo).trim(), { actual: f.StockActual ?? 0, reservado: f.StockReservado ?? 0, disponible });
  }
  console.log(`  ${stock.size} SKU con registro de stock`);

  // 2) VENTAS de la ventana → última fecha + unidades por SKU
  const hoy = new Date();
  const desde = new Date(hoy.getTime() - DIAS * 864e5);
  console.log(`· comprobantes ${fmt(desde)} → ${fmt(hoy)}…`);
  const comps = await paginado(`/api/comprobantes/search?fechaDesde=${fmt(desde)}&fechaHasta=${fmt(hoy)}`, auth);
  console.log(`  ${comps.length} comprobantes · bajando detalle…`);

  const ventas = new Map(); // sku -> { unidades, ultima }
  await pool(comps, 4, async (c) => {
    const det = await GET(`/api/comprobantes/?id=${c.Id}`, auth);
    const items = det.data?.Items || det.data?.Conceptos || det.data?.Detalles || [];
    // Una nota de crédito devuelve mercadería: resta unidades y NO cuenta como venta.
    const esNC = /nota de cr|^NC/i.test(c.Tipo || c.TipoComprobante || '');
    const fecha = (c.Fecha || c.FechaEmision || '').slice(0, 10);
    for (const it of items) {
      const sku = String(it.Codigo || it.CodigoConcepto || '').trim();
      if (!sku) continue;
      const cant = Number(it.Cantidad || 0) * (esNC ? -1 : 1);
      const v = ventas.get(sku) || { unidades: 0, ultima: null };
      v.unidades += cant;
      if (!esNC && fecha && (!v.ultima || fecha > v.ultima)) v.ultima = fecha;
      ventas.set(sku, v);
    }
  });
  console.log(`  ${ventas.size} SKU con movimiento en la ventana`);

  // 3) Escribir en MP, SOLO los productos que ese taller ya tiene cargados
  let prods = [], off = 0;
  for (;;) {
    const { data } = await db.from('productos_taller').select('id,sku,nombre').eq('taller_id', taller.id).range(off, off + 999);
    prods = prods.concat(data); if (data.length < 1000) break; off += 1000;
  }
  console.log(`· ${prods.length} productos del taller en MP`);

  const ahora = new Date().toISOString();
  const updates = [];
  let conStock = 0, conVenta = 0, sinDato = 0;
  for (const p of prods) {
    const sku = (p.sku || '').trim();
    if (!sku) { sinDato++; continue; }
    const s = stock.get(sku);
    const v = ventas.get(sku);
    if (!s && !v) { sinDato++; continue; }
    if (s) conStock++;
    if (v?.ultima) conVenta++;
    updates.push({
      // El id sale de un SELECT de esta misma tabla, asi que el upsert siempre
      // resuelve por conflicto. taller_id y nombre van porque son NOT NULL: sin
      // ellos el upsert intenta INSERTAR y revienta. `clave` NO va: es una
      // columna generada y Postgres rechaza cualquier valor que se le mande.
      id: p.id,
      taller_id: taller.id,
      nombre: p.nombre,
      // `stock` es el DISPONIBLE (bruto − reservado), no el bruto: ver la cuña de arriba.
      stock: s ? s.disponible : null,
      stock_reservado: s ? s.reservado : null,
      stock_actualizado_en: ahora,
      ultima_venta: v?.ultima ?? null,
      unidades_vendidas: v ? Math.max(0, Math.round(v.unidades)) : 0,
      ventana_ventas_dias: DIAS,
    });
  }
  console.log(`  a escribir: ${updates.length} (con stock: ${conStock} · con venta en la ventana: ${conVenta} · sin dato en el ERP: ${sinDato})`);

  if (DRY) {
    console.log('\n[DRY-RUN] no se escribió nada. Muestra de 5:');
    updates.slice(0, 5).forEach(u => console.log('  ', JSON.stringify(u)));
    return;
  }
  for (let i = 0; i < updates.length; i += 500) {
    const lote = updates.slice(i, i + 500);
    const { error } = await db.from('productos_taller').upsert(lote, { onConflict: 'id' });
    if (error) { console.error('ERROR al escribir:', error.message); process.exit(1); }
    process.stdout.write(`\r  escritos ${Math.min(i + 500, updates.length)}/${updates.length}`);
  }
  console.log('\n✓ listo');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
