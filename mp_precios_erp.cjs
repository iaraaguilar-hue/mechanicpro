/**
 * mp_precios_erp.cjs — "El precio de los repuestos lo manda Contabilium" (14-oct-2026, pedido de Iara).
 *
 * Lo llama mp_sync_stock_erp.cjs (el sync diario) con los conceptos que YA bajó de Contabilium para las
 * altas: no hace ningún pedido extra al ERP (que tiene límite de pedidos).
 *
 * SOLO corre si el taller tiene `talleres.precio_erp_manda` prendido (apagado por defecto; lo elige el
 * admin en Configuración). Apagado no toca nada.
 *
 * QUÉ ESCRIBE (y nada más): productos_taller.precio, SOLO en filas con SKU, SOLO si difiere del precio
 * final (con IVA, el de la página) de Contabilium. Antes de escribir deja lo viejo en
 * `precios_antes_<taller>_<fecha>.json` en la carpeta de caché (fuera del repo, que es público):
 * para deshacer, se vuelve a escribir "antes" de cada fila.
 *
 * Regla de mp_sync_precios_erp.cjs (la corrida manual de Probikes), con el ajuste como interruptor.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param db        cliente supabase (service_role)
 * @param taller    { id, nombre, precio_erp_manda }
 * @param conceptos [{ Codigo, PrecioFinal }] tal cual los devuelve /api/conceptos/search
 * @param opt       { dry, dirBackup, log }
 */
async function actualizarPreciosDesdeERP(db, taller, conceptos, opt = {}) {
  const log = opt.log || (s => console.log(s));
  if (taller.precio_erp_manda !== true) {
    log('· precios: el ajuste "el precio lo manda Contabilium" está apagado en este taller, no toco precios');
    return { corrio: false };
  }
  const vivo = new Map();
  for (const c of conceptos || []) {
    const sku = String(c.Codigo || '').trim();
    const precio = Number(c.PrecioFinal);
    if (sku && precio > 0) vivo.set(sku, precio);
  }
  if (!vivo.size) { log('· precios: Contabilium no trajo ningún precio, no toco nada'); return { corrio: true, cambios: 0, sinPrecioVivo: true }; }

  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from('productos_taller')
      .select('id,nombre,sku,precio')
      .eq('taller_id', taller.id).not('sku', 'is', null)
      .order('id').range(desde, desde + 999);
    if (error) throw new Error(`precios: no pude leer los productos del taller: ${error.message}`);
    filas.push(...data);
    if (data.length < 1000) break;
  }
  const cambios = filas
    .filter(f => vivo.has((f.sku || '').trim()))
    .filter(f => f.precio == null || Math.abs(Number(f.precio) - vivo.get(f.sku.trim())) > 0.5)
    .map(f => ({ id: f.id, sku: f.sku.trim(), nombre: f.nombre, antes: f.precio, despues: vivo.get(f.sku.trim()) }));
  log(`· precios: ${filas.length} productos con SKU · ${cambios.length} con precio distinto al de Contabilium`);
  if (opt.dry || !cambios.length) { if (opt.dry) log('  (dry-run: no escribo precios)'); return { corrio: true, cambios: cambios.length, escritos: 0 }; }

  let backup = null;
  try {
    const dir = opt.dirBackup || path.join(process.env.HOME || '.', 'Library', 'Application Support', 'mechanic_pro');
    fs.mkdirSync(dir, { recursive: true });
    backup = path.join(dir, `precios_antes_${String(taller.nombre).replace(/\W+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`);
    let previo = [];
    try { previo = JSON.parse(fs.readFileSync(backup, 'utf8')); } catch (_) {}
    fs.writeFileSync(backup, JSON.stringify([...previo, ...cambios.map(c => ({ ...c, a_las: new Date().toISOString() }))], null, 1));
  } catch (e) {
    // Sin dónde guardar lo viejo no se escribe: es el trato (todo cambio de precio se puede deshacer).
    throw new Error(`precios: no pude guardar el respaldo de los precios viejos (${e.message}); no escribí nada`);
  }

  let ok = 0;
  for (let i = 0; i < cambios.length; i += 500) {
    const lote = cambios.slice(i, i + 500).map(c => ({ id: c.id, taller_id: taller.id, nombre: c.nombre, precio: c.despues }));
    const { error } = await db.from('productos_taller').upsert(lote, { onConflict: 'id' });
    if (error) throw new Error(`precios: error al escribir (${ok} ya escritos, respaldo en ${backup}): ${error.message}`);
    ok += lote.length;
  }
  log(`  ✓ ${ok} precios actualizados desde Contabilium (lo viejo en ${backup})`);
  return { corrio: true, cambios: cambios.length, escritos: ok, backup };
}

module.exports = { actualizarPreciosDesdeERP };
