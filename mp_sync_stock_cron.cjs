#!/usr/bin/env node
// mp_sync_stock_cron.cjs — corrida diaria del sync de stock (idea 15).
// Lo dispara el LaunchAgent com.mechanicpro.sync-stock (08:00). Envoltorio de
// mp_sync_stock_erp.cjs: carga la credencial, loguea con fecha y AVISA si falla.
//
// ⚠️ Es node y no .sh a propósito: TCC le bloquea ~/Documents a /bin/bash bajo
// launchd (murió así el backup 17 días); /opt/homebrew/bin/node tiene el permiso.
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const LOG = path.join(process.env.HOME, 'Library', 'Logs', 'mp-sync-stock.log');
const SECRETS = '/Users/iaraaguilar/Documents/estudio_iara/.secrets/contabilium.env';
const log = s => fs.appendFileSync(LOG, s + '\n');

log(`===== ${new Date().toISOString()} =====`);

// Credencial por env; si no vino (caso launchd), del archivo de secrets (fuera de git).
if (!process.env.CB_EMAIL || !process.env.CB_KEY) {
  try {
    for (const l of fs.readFileSync(SECRETS, 'utf8').split('\n')) {
      const m = l.match(/^(?:export\s+)?([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) { log(`✗ no pude leer ${SECRETS}: ${e.message}`); }
}

const r = spawnSync(process.execPath, [
  path.join(__dirname, 'mp_sync_stock_erp.cjs'), '--taller', 'Probikes', '--dias', '365',
], { cwd: __dirname, encoding: 'utf8', timeout: 15 * 60 * 1000 });

log((r.stdout || '') + (r.stderr || ''));
const code = r.status ?? 1;

if (code !== 0) {
  log(`✗ sync terminó con código ${code}`);
  // El andón: la falla se anuncia en pantalla, no duerme en un log que nadie mira.
  try {
    execFileSync('/usr/bin/osascript', ['-e',
      'display notification "El stock de Mechanic Pro NO se actualizó hoy. Mirá ~/Library/Logs/mp-sync-stock.log" with title "🔴 MP — sync de stock falló"']);
  } catch (_) {}
} else {
  log('✓ ok');
}
process.exit(code);
