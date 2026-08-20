#!/usr/bin/env node
/**
 * mp_base_viva.cjs — el vigía de lo que tiene que estar vivo para que MP sirva:
 * la BASE y el PUENTE hacia el ERP.
 *
 * POR QUÉ EXISTE: el 20-ago-2026 la base de producción estuvo caída de 08:00 a
 * 12:45 (casi 5 horas). Toda consulta autenticada colgaba en timeout mientras
 * los endpoints sin llave contestaban al instante. Se enteró el cron del sync a
 * las 08:00, pero ese corre UNA vez por día: entre las 08:05 y que alguien
 * mirara, la app estuvo muerta para los talleres sin que nadie lo supiera.
 *
 * El que avisa que la base se cayó no puede ser un mecánico llamando a Iara.
 *
 * QUÉ HACE: cada corrida pregunta tres cosas, de la más barata a la más cara.
 *
 *   1. ¿Contesta la red?    `/auth/v1/health` sin llave.
 *   2. ¿Contesta la BASE?   una consulta REST autenticada con timeout de 15 s.
 *      🔴 ESTA ES LA QUE IMPORTA. El síntoma exacto del incidente fue que (1)
 *      contestaba al instante y (2) colgaba: la red estaba bien, la base no.
 *   3. ¿Qué dice Supabase?  la Management API, que es el veredicto oficial.
 *      Es "mejor esfuerzo": el token vive en el keychain de macOS y bajo
 *      launchd puede no estar accesible. Si no se puede leer, se dice y se
 *      decide igual con (1) y (2), que no necesitan token.
 *
 * QUÉ **NO** HACE: reiniciar el proyecto solo. El restart se probó y recupera
 * en ~40 segundos, pero es una decisión de Iara, no del cron. Este script avisa
 * y deja el runbook a mano.
 *
 * Se dispara con el LaunchAgent `com.mechanicpro.base-viva` (cada 6 horas).
 * ⚠️ Es node y no .sh a propósito: TCC le bloquea `~/Documents` a /bin/bash bajo
 * launchd (así murió el backup 17 días). Mismo patrón que mp_sync_stock_cron.
 *
 * ── EL PUENTE AL ERP (agregado 20-ago-2026, a las 3 horas de montar esto) ──
 * Luis avisó que otra orden no había generado su orden de venta. La orden 328
 * ($230.000 en cubiertas) tenía los repuestos PERFECTAMENTE vinculados al ERP,
 * con SKU y con el nombre idéntico al de Contabilium: o sea que NO era un
 * problema de match como la 311 y la 319. El webhook de la orden de venta vive
 * detrás de un túnel ngrok gratuito, y el túnel estaba caído
 * (`ERR_NGROK_3200: endpoint is offline`). Todo lo que MP mandaba se perdía.
 *
 * Se sondea con **GET, jamás con POST**: un POST a `generar-orden` crearía una
 * orden real y descontaría stock (memoria webhook-n8n-sondear-sin-dispararlo).
 * n8n vivo contesta 404 con un JSON que dice "not registered for GET requests";
 * ngrok caído contesta 404 con su propia página de error.
 *
 * Uso a mano:  node mp_base_viva.cjs [--json] [--sin-notificar]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const LOG = path.join(process.env.HOME, 'Library', 'Logs', 'mp-base-viva.log');
const ESTADO = path.join(process.env.HOME, 'Library', 'Logs', 'mp-base-viva.estado.json');
const PROYECTO = 'vsybmwuqhxcuuervmoas';
const TIMEOUT_MS = 15_000;
const JSON_OUT = process.argv.includes('--json');
const SIN_NOTIFICAR = process.argv.includes('--sin-notificar');

// La carpeta se crea si no está: un vigía que no puede escribir su log queda
// mudo justo el día que hace falta leerlo. Si aun así no se puede escribir, se
// avisa por pantalla en vez de tragarse el error.
try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); } catch (_) {}
let logRoto = false;
const log = (s) => {
    try { fs.appendFileSync(LOG, s + '\n'); }
    catch (e) { if (!logRoto) { logRoto = true; console.error(`⚠️ no puedo escribir ${LOG}: ${e.message}`); } }
    if (!JSON_OUT) console.log(s);
};

// ── El runbook, escrito acá para que esté en el log cuando haga falta ────────
const RUNBOOK = [
    'RUNBOOK (memoria mp-supabase-restart-runbook):',
    '  1. Confirmar: GET https://api.supabase.com/v1/projects/' + PROYECTO + '/health?services=db,auth,rest',
    '     (⚠️ /v1/projects puede decir ACTIVE_HEALTHY con la base muerta: es metadata vieja)',
    '  2. El token del Bearer sale del keychain:',
    '       security find-generic-password -s "Supabase CLI" -w',
    '     viene como go-keyring-base64:… → decodificar el base64 posterior a los dos puntos → sbp_…',
    '  3. Remedio (recuperó en ~40 s, no pierde datos):',
    '       POST https://api.supabase.com/v1/projects/' + PROYECTO + '/restart',
    '  4. Esperar a que db+auth+rest den healthy y probar el login real del Demo.',
    '  ⚠️ El restart NO lo hace este script: lo decide Iara.',
];

// ── Credenciales del .env.local del frontend ────────────────────────────────
function leerEnv() {
    const env = {};
    try {
        const raw = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
        for (const linea of raw.split('\n')) {
            const i = linea.indexOf('=');
            if (i > 0 && !linea.trim().startsWith('#')) env[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
        }
    } catch (e) {
        log(`✗ no pude leer .env.local: ${e.message}`);
    }
    return env;
}

async function conTimeout(url, opciones = {}, ms = TIMEOUT_MS) {
    const t0 = Date.now();
    try {
        const r = await fetch(url, { ...opciones, signal: AbortSignal.timeout(ms) });
        return { ok: true, status: r.status, ms: Date.now() - t0 };
    } catch (e) {
        const colgo = /timeout|abort/i.test(e.name + e.message);
        return { ok: false, colgo, error: e.message, ms: Date.now() - t0 };
    }
}

/** El token de la Management API. Mejor esfuerzo: bajo launchd puede no estar. */
function tokenManagement() {
    try {
        const crudo = execFileSync('/usr/bin/security',
            ['find-generic-password', '-s', 'Supabase CLI', '-w'],
            // stdio: el `security` escupe su error a stderr cuando el item no
            // está, y ese ruido no aporta nada al log del vigía.
            { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (crudo.startsWith('go-keyring-base64:')) {
            return Buffer.from(crudo.split(':')[1], 'base64').toString('utf8').trim();
        }
        return crudo || null;
    } catch (_) {
        return null;   // sin token no hay veredicto oficial, pero sí diagnóstico
    }
}

function notificar(titulo, mensaje) {
    if (SIN_NOTIFICAR) return;
    try {
        execFileSync('/usr/bin/osascript', ['-e',
            `display notification ${JSON.stringify(mensaje)} with title ${JSON.stringify(titulo)} sound name "Basso"`]);
    } catch (e) { log(`  (no pude notificar: ${e.message})`); }
}

function estadoPrevio() {
    try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch (_) { return { caida: false }; }
}
function guardarEstado(e) {
    try { fs.writeFileSync(ESTADO, JSON.stringify(e, null, 1)); } catch (_) {}
}

(async () => {
    log(`\n===== ${new Date().toISOString()} =====`);
    const env = leerEnv();
    const URL = env.VITE_SUPABASE_URL;
    const ANON = env.VITE_SUPABASE_ANON_KEY;
    const reporte = { ts: new Date().toISOString(), proyecto: PROYECTO, checks: {}, caida: false, motivo: null };

    if (!URL || !ANON) {
        const m = 'Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en frontend/.env.local';
        log(`✗ ${m}`);
        notificar('🔴 MP — no puedo chequear la base', m);
        if (JSON_OUT) console.log(JSON.stringify({ ...reporte, error: m }, null, 2));
        process.exit(2);
    }

    // ── 1. ¿Contesta la red? (sin llave, tiene que ser instantáneo) ─────────
    const red = await conTimeout(`${URL}/auth/v1/health`, {}, 8000);
    reporte.checks.red = red;
    log(`  red (auth/health sin llave): ${red.ok ? `HTTP ${red.status} en ${red.ms}ms` : `SIN RESPUESTA (${red.error})`}`);

    // ── 2. ¿Contesta la BASE? (autenticada — el síntoma del incidente) ──────
    // Dos intentos y basta: a un servicio caído no se lo martilla
    // (memoria meta-api-no-reintentar-en-rafaga).
    let base = null;
    for (let intento = 1; intento <= 2; intento++) {
        base = await conTimeout(`${URL}/rest/v1/talleres?select=id&limit=1`,
            { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
        if (base.ok) break;
        log(`  base: intento ${intento} falló (${base.colgo ? 'colgó' : base.error})`);
        if (intento === 1) await new Promise(r => setTimeout(r, 5000));
    }
    reporte.checks.base = base;
    log(`  base (REST autenticada):    ${base.ok ? `HTTP ${base.status} en ${base.ms}ms` : `NO RESPONDE (${base.error})`}`);

    // ── 3. El veredicto oficial (mejor esfuerzo) ────────────────────────────
    const token = tokenManagement();
    if (!token) {
        reporte.checks.management = { disponible: false, motivo: 'sin token en el keychain (normal bajo launchd)' };
        log('  management: sin token en el keychain — se decide con los dos checks de arriba');
    } else {
        try {
            const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/health?services=db,auth,rest`,
                { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
            const servicios = r.ok ? await r.json() : null;
            reporte.checks.management = { disponible: true, status: r.status, servicios };
            if (Array.isArray(servicios)) {
                for (const s of servicios) log(`  management ${String(s.name).padEnd(5)}: ${s.healthy ? 'healthy' : `🔴 ${s.error || 'unhealthy'}`}`);
                const enfermos = servicios.filter(s => !s.healthy);
                if (enfermos.length) { reporte.caida = true; reporte.motivo = `Supabase reporta ${enfermos.map(s => s.name).join(', ')} caídos`; }
            }
        } catch (e) {
            reporte.checks.management = { disponible: true, error: e.message };
            log(`  management: no contestó (${e.message})`);
        }
    }

    // ── 4. El puente hacia el ERP (el túnel de la automatización) ───────────
    // Solo GET. Nunca POST: un POST acá crea una orden de venta de verdad.
    const urlOrden = env.VITE_N8N_ORDEN_WEBHOOK_URL;
    if (!urlOrden) {
        reporte.checks.puenteERP = { configurado: false };
        log('  puente al ERP: sin VITE_N8N_ORDEN_WEBHOOK_URL, no hay nada que mirar');
    } else {
        const t0 = Date.now();
        try {
            const r = await fetch(urlOrden, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) });
            const errNgrok = r.headers.get('ngrok-error-code');
            const cuerpo = (await r.text().catch(() => '')).slice(0, 300);
            // n8n vivo con el flujo activo devuelve 404 diciendo que el webhook
            // no acepta GET. Ese texto ES la prueba de que está del otro lado.
            const n8nVivo = /not registered for GET/i.test(cuerpo) || /Did you mean to make a POST/i.test(cuerpo);
            const ok = n8nVivo && !errNgrok;
            reporte.checks.puenteERP = { configurado: true, ok, status: r.status, errNgrok, ms: Date.now() - t0 };
            log(`  puente al ERP:              ${ok ? `vivo (HTTP ${r.status}, n8n contesta)` : `🔴 NO RESPONDE${errNgrok ? ' — ' + errNgrok : ` — HTTP ${r.status}, no contesta n8n`}`}`);
            if (!ok) {
                reporte.puenteCaido = true;
                reporte.motivoPuente = errNgrok === 'ERR_NGROK_3200'
                    ? 'el túnel de la automatización está apagado'
                    : `el webhook no contesta como n8n (HTTP ${r.status}${errNgrok ? ', ' + errNgrok : ''})`;
            }
        } catch (e) {
            reporte.checks.puenteERP = { configurado: true, ok: false, error: e.message };
            reporte.puenteCaido = true;
            reporte.motivoPuente = `no se pudo llegar al webhook (${e.message})`;
            log(`  puente al ERP:              🔴 ${e.message}`);
        }
    }

    // ── Veredicto ───────────────────────────────────────────────────────────
    if (!base.ok) {
        reporte.caida = true;
        reporte.motivo = red.ok
            // El patrón EXACTO del incidente del 20-ago.
            ? 'la consulta autenticada no responde pero los endpoints sin llave sí: la red está bien, la BASE no'
            : 'no responde ni siquiera el endpoint sin llave: puede ser la conexión de esta máquina';
    }

    const previo = estadoPrevio();
    guardarEstado({
        caida: reporte.caida, ts: reporte.ts, motivo: reporte.motivo,
        puenteCaido: !!reporte.puenteCaido, motivoPuente: reporte.motivoPuente ?? null,
    });

    // El puente caído se avisa APARTE de la base: son dos problemas distintos y
    // el remedio lo tiene otra persona (la base la reinicia Iara, el túnel lo
    // levanta Mica).
    if (reporte.puenteCaido) {
        log(`\n🔴 PUENTE AL ERP CAÍDO — ${reporte.motivoPuente}`);
        log('  Efecto: cada service que se finalice con repuestos NO va a generar su orden');
        log('  de venta, y hasta el 20-ago-2026 eso no dejaba ningún rastro.');
        log('  Qué hacer: avisarle a Mica que levante el túnel / la instancia de n8n.');
        log('  Después: cruzar contra Contabilium las órdenes finalizadas mientras estuvo caído');
        log('  (en la app, las que digan "LA ORDEN DE VENTA NO SALIÓ").');
        notificar('🔴 Mechanic Pro — el puente al ERP está caído',
            `${reporte.motivoPuente}. Las órdenes que se finalicen NO van a generar su orden de venta. Avisale a Mica.`);
    } else if (previo.puenteCaido && reporte.checks.puenteERP?.ok) {
        log('  (el puente venía caído: volvió)');
        notificar('✅ Mechanic Pro — el puente al ERP volvió',
            'La automatización contesta otra vez. Revisá las órdenes que quedaron sin generar mientras estuvo caído.');
    }

    if (reporte.caida) {
        log(`\n🔴 BASE CAÍDA — ${reporte.motivo}`);
        RUNBOOK.forEach(l => log(l));
        notificar('🔴 Mechanic Pro — la base NO responde',
            `${reporte.motivo}. Los talleres no pueden usar la app. El runbook está en ~/Library/Logs/mp-base-viva.log`);
    } else {
        log('✓ la base contesta');
        // Si venía caída y volvió, se avisa igual: saber que se recuperó vale
        // tanto como saber que se cayó.
        if (previo.caida) {
            log('  (venía caída en la corrida anterior: se recuperó)');
            notificar('✅ Mechanic Pro — la base volvió', 'Contesta normal otra vez. Estaba caída en el chequeo anterior.');
        }
    }

    if (JSON_OUT) console.log(JSON.stringify(reporte, null, 2));
    process.exit(reporte.caida || reporte.puenteCaido ? 1 : 0);
})().catch(e => {
    log(`✗ error fatal: ${e.message}`);
    notificar('🔴 MP — el vigía de la base falló', `${e.message}. Mirá ~/Library/Logs/mp-base-viva.log`);
    process.exit(2);
});
