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
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { crearCliente } = require('./contabilium_http.cjs');

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
// En la Mac sale de .env.local; en la nube (GitHub Actions) viene por variable de entorno.
let envLocal = '';
try { envLocal = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8'); } catch (_) {}
const gv = k => process.env[k] || (envLocal.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const db = createClient(gv('VITE_SUPABASE_URL'), gv('SUPABASE_SERVICE_ROLE') || gv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// ── HTTP a Contabilium: ritmo, 429 con Retry-After y token, en contabilium_http.cjs ──
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cb = crearCliente({ email: EMAIL, key: KEY, log: s => console.log(s) });
/**
 * 🚩 Por qué esto no es un for simple. La primera version cortaba con
 * `if (!its.length) break;`: una sola pagina que volviera vacia por un 429
 * silencioso abortaba el barrido ENTERO y el script seguia como si nada. Medido:
 * tres corridas seguidas del mismo endpoint dieron 2400, 2000 y 1700 SKU.
 * Un faltante ahi no se ve como error: se ve como "esa bici no tiene stock",
 * que es exactamente la mentira que esta feature no puede decir.
 * Ahora cada pagina se reintenta, y al final se COMPARA contra TotalItems: si
 * falta algo, aborta en vez de devolver una foto incompleta.
 * (6-oct: el 429 lo absorbe cb.get esperando el Retry-After; acá solo queda la
 * página que vuelve 200 pero vacía, que se reintenta 4 veces.)
 */
async function pagina(url) {
  let r = null;
  for (let intento = 0; intento < 4; intento++) {
    if (intento) await sleep(5000 * intento);
    r = await cb.get(url);
    if (r.data?.Items?.length) return r;
    if (r.status !== 200) break; // cb.get ya agotó sus esperas: no tiene sentido insistir acá
  }
  return r;
}
async function paginado(base, cap = 400) {
  const sep = base.includes('?') ? '&' : '?';
  const first = await pagina(`${base}${sep}page=1`);
  if (!first?.data?.Items?.length) {
    throw new Error(`la pagina 1 de ${base} volvio vacia (ultimo status ${first?.status}): el ERP no esta respondiendo. Abortado: 0 filas se leen como "no hay stock".`);
  }
  const total = first.data?.TotalItems || 0;
  let items = first.data?.Items || [];
  const porPagina = items.length || 50;
  const paginas = Math.min(cap, Math.max(1, Math.ceil(total / porPagina)));
  for (let p = 2; p <= paginas; p++) {
    const r = await pagina(`${base}${sep}page=${p}`);
    const its = r?.data?.Items || [];
    if (!its.length) throw new Error(`la pagina ${p} de ${base} volvio vacia (ultimo status ${r?.status}; 429 recibidos en la corrida: ${cb.stats.r429}) (esperaba ~${porPagina} items de ${total})`);
    items = items.concat(its);
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

  const t0 = Date.now();
  await cb.token(); // si la credencial está rechazada, tira un error que lo dice con esas palabras

  // 1) STOCK del depósito
  console.log('· stock del depósito…');
  const filas = await paginado(`/api/inventarios/getStockByDeposito?id=${DEPOSITO}`);
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
  const comps = await paginado(`/api/comprobantes/search?fechaDesde=${fmt(desde)}&fechaHasta=${fmt(hoy)}`);
  /* CACHÉ DEL DETALLE (6-oct-2026). Con el límite de Contabilium (~27 pedidos por minuto), bajar
     el detalle de ~880 comprobantes todos los días son 35 minutos. Una factura emitida no cambia:
     el detalle de lo que tiene más de 7 días se guarda y se reusa; lo reciente se vuelve a bajar
     siempre, por si se corrigió. Vive fuera del repo (en la nube, MP_CACHE_DIR + actions/cache). */
  const CACHE_DIR = process.env.MP_CACHE_DIR || path.join(process.env.HOME, 'Library', 'Application Support', 'mechanic_pro');
  const CACHE = path.join(CACHE_DIR, `comprobantes_${taller.id}.json`);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (_) {}
  const reciente = fmt(new Date(hoy.getTime() - 7 * 864e5));
  const fechaDe = c => (c.Fecha || c.FechaEmision || '').slice(0, 10);
  const aBajar = comps.filter(c => !(cache[c.Id] && fechaDe(c) && fechaDe(c) < reciente));
  console.log(`  ${comps.length} comprobantes · bajando detalle de ${aBajar.length} (el resto, del caché)…`);

  async function bajar(c) {
    const det = await cb.get(`/api/comprobantes/?id=${c.Id}`);
    if (!det.data) return false;
    const items = det.data.Items || det.data.Conceptos || det.data.Detalles || [];
    cache[c.Id] = items.map(it => [String(it.Codigo || it.CodigoConcepto || '').trim(), Number(it.Cantidad || 0)]);
    return true;
  }
  const fallidos = [];
  await pool(aBajar, 4, async c => { if (!(await bajar(c))) fallidos.push(c); });
  // Un detalle que no llegó NO se saltea: esa venta desaparecería del cálculo de "parado" sin que
  // nadie se entere. Segunda pasada de a uno; si sigue faltando, se aborta.
  const siguen = [];
  for (const c of fallidos) if (!(await bajar(c))) siguen.push(c.Id);
  if (siguen.length) throw new Error(`no pude bajar el detalle de ${siguen.length} comprobante(s) (ids ${siguen.slice(0, 5).join(', ')}…). Abortado: sin ese detalle, esas ventas no cuentan.`);

  const vigentes = {};
  for (const c of comps) if (cache[c.Id]) vigentes[c.Id] = cache[c.Id];
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(vigentes)); }
  catch (e) { console.log(`  (no pude guardar el caché: ${e.message})`); }

  const ventas = new Map(); // sku -> { unidades, ultima }
  for (const c of comps) {
    // Una nota de crédito devuelve mercadería: resta unidades y NO cuenta como venta.
    const esNC = /nota de cr|^NC/i.test(c.Tipo || c.TipoComprobante || '');
    const fecha = fechaDe(c);
    for (const [sku, cantidad] of vigentes[c.Id] || []) {
      if (!sku) continue;
      const cant = cantidad * (esNC ? -1 : 1);
      const v = ventas.get(sku) || { unidades: 0, ultima: null };
      v.unidades += cant;
      if (!esNC && fecha && (!v.ultima || fecha > v.ultima)) v.ultima = fecha;
      ventas.set(sku, v);
    }
  }
  console.log(`  ${ventas.size} SKU con movimiento en la ventana`);

  // 3) Escribir en MP, SOLO los productos que ese taller ya tiene cargados
  let prods = [], off = 0;
  for (;;) {
    const { data, error } = await db.from('productos_taller').select('id,sku,nombre').eq('taller_id', taller.id).range(off, off + 999);
    if (error) throw new Error(`no pude leer los productos del taller en Supabase: ${error.message}`);
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
  console.log(`\n✓ listo en ${Math.round((Date.now() - t0) / 1000)} s · ${cb.stats.pedidos} pedidos al ERP · ${cb.stats.r429} esperas por límite (${cb.stats.esperaS} s)`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
