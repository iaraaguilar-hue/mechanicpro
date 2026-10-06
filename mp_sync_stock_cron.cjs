#!/usr/bin/env node
// mp_sync_stock_cron.cjs — corrida diaria del sync de stock (idea 15).
// Lo dispara el LaunchAgent com.mechanicpro.sync-stock (8:00, 12:00 y 17:00) y, como respaldo
// cuando la Mac está apagada, el workflow .github/workflows/sync-stock.yml (en la nube).
// Envoltorio de mp_sync_stock_erp.cjs: carga la credencial, loguea con fecha y NO SE RINDE SOLO.
//
// ⚠️ Es node y no .sh a propósito: TCC le bloquea ~/Documents a /bin/bash bajo
// launchd (murió así el backup 17 días); /opt/homebrew/bin/node tiene el permiso.
//
// 🔴 6-oct-2026 — POR QUÉ REINTENTA Y DESPIERTA AL VIGÍA. Del 3 al 6-oct falló 4 mañanas seguidas y
// la única defensa era una notificación en pantalla. Causa: Contabilium puso un límite de pedidos
// (Cloudflare 1015, 60 s de bloqueo) y el sync se rendía antes de que se levantara. El cliente nuevo
// (contabilium_http.cjs) espera lo que pide el ERP; este envoltorio agrega las otras capas:
//   1. ¿Ya está al día? Si Supabase muestra el stock de hoy (lo hizo la Mac o la nube), no corre.
//   2. Hasta 3 intentos: ya, a los 10 min y a los 30 min. Una credencial rechazada no se reintenta.
//   3. Si se agota (solo en la Mac): despierta al vigía (agents/rutinas/vigia_sync_mp.md), que
//      diagnostica y arregla, y deja la tarea en el tablero aunque Claude no ande.
//
// USO   node mp_sync_stock_cron.cjs [--forzar] [--sin-vigia] [--estado] [--probar-erp]
//   --forzar     corre aunque ya esté al día
//   --sin-vigia  si falla no despierta al vigía (lo usa el propio vigía, para no llamarse a sí mismo)
//   --estado     solo dice si el stock de hoy está cargado (sale 0 si sí, 1 si no)
//   --probar-erp un token y una página contra Contabilium, con el status (el vigía no toca .secrets)
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const NUBE = process.env.GITHUB_ACTIONS === 'true';
const argv = process.argv.slice(2);
const FORZAR = argv.includes('--forzar');
const SIN_VIGIA = argv.includes('--sin-vigia') || NUBE;
const SOLO_ESTADO = argv.includes('--estado') || argv.includes('--probar-erp');
const TALLER = 'Probikes';
const ESPERAS_MIN = [0, 10, 30];
const TOPE_INTENTO_MIN = 50; // la primera corrida sin caché baja ~880 detalles a ~27 por minuto

const LOGS = path.join(process.env.HOME || '/tmp', 'Library', 'Logs');
const LOG = path.join(LOGS, 'mp-sync-stock.log');
const ESTADO = path.join(LOGS, 'mp-sync-stock.estado.json');
const ESTUDIO = '/Users/iaraaguilar/Documents/estudio_iara';
const SECRETS = `${ESTUDIO}/.secrets/contabilium.env`;
const VIGIA = 'com.estudioiara.vigia-sync-mp';
const ID_TAREA = 'mp_sync_stock_caido';

const log = s => { if (NUBE || SOLO_ESTADO) console.log(s); else fs.appendFileSync(LOG, s + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Argentina no tiene horario de verano: el día de Iara empieza a las 03:00 UTC.
const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const inicioHoyAR = () => new Date(`${hoyAR()}T03:00:00.000Z`).toISOString();

function avisar(titulo, texto) {
  if (NUBE) return;
  try { execFileSync('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(texto)} with title ${JSON.stringify(titulo)}`]); } catch (_) {}
}
function tarea(...args) {
  if (NUBE) return null;
  try { return execFileSync('/opt/homebrew/bin/python3', [`${ESTUDIO}/tools/tarea.py`, ...args], { encoding: 'utf8' }); }
  catch (e) { log(`  (tablero: ${String(e.stderr || e.message).trim().slice(0, 160)})`); return null; }
}
function leerEstado() { try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch (_) { return {}; } }
function guardarEstado(e) { if (!NUBE) try { fs.writeFileSync(ESTADO, JSON.stringify(e, null, 2)); } catch (_) {} }

// Credencial por env; si no vino (caso launchd), del archivo de secrets (fuera de git).
if (!process.env.CB_EMAIL || !process.env.CB_KEY) {
  try {
    for (const l of fs.readFileSync(SECRETS, 'utf8').split('\n')) {
      const m = l.match(/^(?:export\s+)?([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) { if (!NUBE) log(`✗ no pude leer ${SECRETS}: ${e.message}`); }
}

// ── 1. ¿Ya está al día? Se le pregunta a la base, no al log: el log no sabe si corrió la nube.
async function alDia() {
  let envLocal = '';
  try { envLocal = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8'); } catch (_) {}
  const gv = k => process.env[k] || (envLocal.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');
  const db = createClient(gv('VITE_SUPABASE_URL'), gv('SUPABASE_SERVICE_ROLE') || gv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: t, error: e1 } = await db.from('talleres').select('id').ilike('nombre', TALLER);
  if (e1 || t?.length !== 1) return { medido: false, motivo: e1?.message || 'no encontré el taller' };
  const base = () => db.from('productos_taller').select('id', { count: 'exact', head: true }).eq('taller_id', t[0].id);
  const [conDato, deHoy, ultimo] = await Promise.all([
    base().not('stock_actualizado_en', 'is', null),
    base().gte('stock_actualizado_en', inicioHoyAR()),
    db.from('productos_taller').select('stock_actualizado_en').eq('taller_id', t[0].id)
      .not('stock_actualizado_en', 'is', null).order('stock_actualizado_en', { ascending: false }).limit(1),
  ]);
  if (conDato.error || deHoy.error) return { medido: false, motivo: (conDato.error || deHoy.error).message };
  // El sync escribe todos los productos con dato en una sola tanda: hoy tiene que estar casi todo.
  const ok = conDato.count > 0 && deHoy.count >= 0.9 * conDato.count;
  return { medido: true, ok, deHoy: deHoy.count, conDato: conDato.count, ultimo: ultimo.data?.[0]?.stock_actualizado_en };
}

function correrSync() {
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(__dirname, 'mp_sync_stock_erp.cjs'), '--taller', TALLER, '--dias', '365'],
      { cwd: __dirname, env: process.env });
    let salida = '', cortado = false;
    // En vivo, no al final: si el intento se corta, el log ya dice en qué fase iba.
    const escribir = d => { salida += d; if (NUBE) process.stdout.write(d); else fs.appendFileSync(LOG, d); };
    p.stdout.on('data', escribir); p.stderr.on('data', escribir);
    const tope = setTimeout(() => { cortado = true; p.kill('SIGTERM'); }, TOPE_INTENTO_MIN * 60e3);
    p.on('close', code => {
      clearTimeout(tope);
      res({ code: cortado ? 124 : (code ?? 1), salida, cortado, seg: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

(async () => {
  if (argv.includes('--probar-erp')) {
    const cb = require('./contabilium_http.cjs').crearCliente({ email: process.env.CB_EMAIL, key: process.env.CB_KEY, log: console.log });
    const t0 = Date.now();
    try { await cb.token(); } catch (e) { console.log(`✗ token: ${e.message}`); process.exit(1); }
    const r = await cb.get('/api/inventarios/getStockByDeposito?id=56990&page=1');
    console.log(`token ok · página 1: status ${r.status} · ${r.data?.Items?.length ?? 0} ítems de ${r.data?.TotalItems ?? '?'} · ${Date.now() - t0} ms · esperas por límite: ${cb.stats.r429}`);
    process.exit(r.data?.Items?.length ? 0 : 1);
  }
  if (SOLO_ESTADO) {
    const a = await alDia().catch(e => ({ medido: false, motivo: e.message }));
    console.log(a.medido
      ? `${a.ok ? '✅ AL DÍA' : '🔴 SIN ACTUALIZAR HOY'} · ${a.deHoy}/${a.conDato} productos con stock de hoy · último: ${a.ultimo}`
      : `⚠️ SIN MEDIR · ${a.motivo}`);
    process.exit(a.medido && a.ok ? 0 : 1);
  }

  log(`===== ${new Date().toISOString()} =====${NUBE ? ' (nube)' : ''}`);
  if (!FORZAR) {
    const a = await alDia().catch(e => ({ medido: false, motivo: e.message }));
    if (a.medido && a.ok) { log(`✓ ya estaba al día (último: ${a.ultimo}), no corro`); process.exit(0); }
    if (!a.medido) log(`  (no pude medir si ya estaba al día: ${a.motivo}; corro igual)`);
  }

  let r = null;
  for (let i = 0; i < ESPERAS_MIN.length; i++) {
    if (ESPERAS_MIN[i]) { log(`  … espero ${ESPERAS_MIN[i]} min y reintento (${i + 1}/${ESPERAS_MIN.length})`); await sleep(ESPERAS_MIN[i] * 60e3); }
    r = await correrSync();
    if (r.code === 0) break;
    log(r.cortado ? `✗ intento ${i + 1}: lo corté a los ${TOPE_INTENTO_MIN} min` : `✗ intento ${i + 1}: código ${r.code} a los ${r.seg} s`);
    if (/CREDENCIAL RECHAZADA/.test(r.salida)) break; // reintentar no la arregla
  }

  const previo = leerEstado();
  const error = r.code === 0 ? null : (r.salida.match(/ERROR[^\n]*/g) || []).pop() || (r.cortado ? 'cortado por tiempo' : `código ${r.code}`);
  const estado = { ...previo, fecha: new Date().toISOString(), ok: r.code === 0, error, donde: NUBE ? 'nube' : 'mac' };

  if (r.code === 0) {
    log('✓ ok');
    // Si venía caído, se cierra la tarea del tablero: la falla resuelta no queda abierta frenando.
    if (previo.ok === false && !NUBE) {
      tarea('nota', ID_TAREA, `${hoyAR()} · volvió a andar solo (${r.seg} s).`);
      tarea('completar', ID_TAREA);
      avisar('✅ MP — sync de stock', 'Volvió a andar: el stock de hoy ya está cargado.');
    }
    guardarEstado(estado);
    process.exit(0);
  }

  log(`✗ sync terminó con código ${r.code} después de ${ESPERAS_MIN.length} intentos`);
  if (NUBE) process.exit(r.code || 1);

  // El andón que NO depende de Claude: la tarea queda en el tablero aunque el vigía no pueda correr.
  if (tarea('ver', ID_TAREA) === null) {
    tarea('crear', '--id', ID_TAREA, '--marca', 'Mechanic Pro', '--prioridad', 'alta', '--status', 'en_curso',
      '--agente', 'vigia_sync_mp', '--titulo', 'MP: el sync de stock no se actualizó hoy',
      '--nota', `${hoyAR()} · ${error}. Lo levanta el vigía (agents/rutinas/vigia_sync_mp.md).`);
  } else {
    tarea('estado', ID_TAREA, 'en_curso');
    tarea('nota', ID_TAREA, `${hoyAR()} · ${error}`);
  }

  if (!SIN_VIGIA && previo.vigia_dia !== hoyAR()) {
    estado.vigia_dia = hoyAR();
    guardarEstado(estado);
    try {
      execFileSync('/bin/launchctl', ['kickstart', `gui/${process.getuid()}/${VIGIA}`]);
      log(`→ desperté al vigía (${VIGIA})`);
      avisar('🟠 MP — sync de stock', 'Falló 3 veces. El vigía ya lo está arreglando: no tenés que hacer nada.');
    } catch (e) {
      log(`✗ no pude despertar al vigía: ${e.message}`);
      avisar('🔴 MP — sync de stock falló', 'Y el vigía no arrancó. Está anotado en el tablero.');
    }
  } else {
    guardarEstado(estado);
    if (!SIN_VIGIA) avisar('🔴 MP — sync de stock sigue fallando', 'El vigía ya lo intentó hoy. Está en el tablero con el motivo.');
  }
  process.exit(r.code || 1);
})().catch(e => { log(`✗ el envoltorio se cayó: ${e.stack || e.message}`); process.exit(1); });
