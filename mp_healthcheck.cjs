#!/usr/bin/env node
/**
 * mp_healthcheck.cjs — Chequeo de salud de Mechanic Pro
 * Herramienta del agente 🩺 mp_auditor (Estudio Iara).
 *
 * Corre desde frontend/ y lee .env.local. Uso:
 *   node mp_healthcheck.cjs            → chequeo básico (connectividad, latencia, schema)
 *   node mp_healthcheck.cjs --json     → salida JSON (para que el agente la parsee)
 *
 * Chequeo PROFUNDO (row counts, huérfanos, capacidad): requiere una service_role key.
 * Agregá a .env.local:  SUPABASE_SERVICE_ROLE=eyJ...   (gratis, desde el dashboard de Supabase → Settings → API)
 * Sin esa key, RLS bloquea las lecturas y el script solo hace el chequeo básico.
 */
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// ── Cargar .env.local ──
const env = {};
try {
    fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
        const i = line.indexOf('=');
        if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
} catch { console.error('❌ No encuentro .env.local — corré este script desde frontend/'); process.exit(2); }

const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE;
const JSON_OUT = process.argv.includes('--json');

// Tablas del dominio (de rls_multitenant.sql + queries del dataStore)
const TABLAS = ['usuarios', 'talleres', 'clientes', 'bicicletas', 'servicios', 'servicio_items', 'recordatorios', 'catalogo_servicios', 'carreras', 'registro_actividad'];

const report = { ts: new Date().toISOString(), ok: true, nivel: SERVICE ? 'profundo' : 'basico', checks: [], alertas: [] };
const add = (nombre, estado, detalle) => { report.checks.push({ nombre, estado, detalle }); if (estado === 'FALLA') { report.ok = false; report.alertas.push(`${nombre}: ${detalle}`); } };

async function main() {
    if (!URL || !ANON) { console.error('❌ Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(2); }

    // ── 1. Conectividad + latencia (REST) ──
    const t0 = Date.now();
    try {
        const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: ANON } });
        const ms = Date.now() - t0;
        // <500 = el server respondió (401/400 son normales en el root sin contexto de auth).
        add('conectividad_rest', r.status < 500 ? 'OK' : 'FALLA', `HTTP ${r.status} en ${ms}ms`);
        if (ms > 2000) report.alertas.push(`Latencia REST alta: ${ms}ms (>2s)`);
    } catch (e) { add('conectividad_rest', 'FALLA', `sin respuesta: ${e.message}`); }

    // ── 2. Auth endpoint vivo ──
    try {
        const r = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } });
        add('auth_health', r.ok ? 'OK' : 'FALLA', `HTTP ${r.status}`);
    } catch (e) { add('auth_health', 'FALLA', e.message); }

    // ── 2-bis. El veredicto OFICIAL de Supabase sobre el proyecto ──
    // Los checks de arriba prueban que el server contesta; este pregunta si la
    // BASE está sana, que no es lo mismo. El 20-ago-2026 la base estuvo caída 5
    // horas con los endpoints sin llave contestando 401 al instante. El token
    // vive en el keychain (lo guarda el CLI de Supabase); si no está, se dice y
    // el chequeo se marca OMITIDO en vez de dar un OK que no midió nada.
    // El vigía que corre cada 6 horas es `mp_base_viva.cjs`; esto es la foto
    // semanal. Runbook: memoria mp-supabase-restart-runbook.
    try {
        const crudo = require('child_process').execFileSync('/usr/bin/security',
            ['find-generic-password', '-s', 'Supabase CLI', '-w'],
            { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const token = crudo.startsWith('go-keyring-base64:')
            ? Buffer.from(crudo.split(':')[1], 'base64').toString('utf8').trim()
            : crudo;
        const proyecto = (URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
        if (!token || !proyecto) throw new Error('sin token o sin ref de proyecto');
        const r = await fetch(`https://api.supabase.com/v1/projects/${proyecto}/health?services=db,auth,rest`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const servicios = await r.json();
        const enfermos = (servicios || []).filter(sv => !sv.healthy);
        add('salud_proyecto_supabase', enfermos.length ? 'FALLA' : 'OK',
            enfermos.length
                ? enfermos.map(sv => `${sv.name}: ${sv.error || 'unhealthy'}`).join(' · ')
                : (servicios || []).map(sv => sv.name).join(', ') + ' healthy');
    } catch (e) {
        add('salud_proyecto_supabase', 'OMITIDO', `no pude consultar la Management API (${e.message})`);
    }

    // ── 3. Chequeo profundo (solo con service_role) ──
    if (!SERVICE) {
        add('chequeo_profundo', 'OMITIDO', 'sin SUPABASE_SERVICE_ROLE — no puedo ver datos por RLS');
        return finish();
    }
    const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

    // 3a. Row counts por tabla (existencia + volumen = proxy de capacidad)
    const counts = {};
    for (const t of TABLAS) {
        const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
        if (error) { add(`tabla_${t}`, 'FALLA', error.message); continue; }
        counts[t] = count;
        add(`tabla_${t}`, 'OK', `${count} filas`);
    }
    report.counts = counts;

    // 3b. Canario "taller vacío": talleres con 0 clientes (posible bug de datos o taller nuevo)
    const { data: talleres } = await db.from('talleres').select('id, nombre');
    for (const tal of (talleres || [])) {
        const { count } = await db.from('clientes').select('*', { count: 'exact', head: true }).eq('taller_id', tal.id).is('eliminado_en', null);
        if (count === 0) report.alertas.push(`Taller "${tal.nombre || tal.id}" tiene 0 clientes activos (¿taller nuevo o pérdida de datos?)`);
    }

    // 3c. Integridad referencial: huérfanos
    const { data: bikes } = await db.from('bicicletas').select('id, cliente_id');
    const { data: clientes } = await db.from('clientes').select('id');
    const clientIds = new Set((clientes || []).map(c => c.id));
    const bikesHuerfanas = (bikes || []).filter(b => b.cliente_id && !clientIds.has(b.cliente_id));
    add('integridad_bicicletas', bikesHuerfanas.length ? 'FALLA' : 'OK', `${bikesHuerfanas.length} bicicletas sin cliente`);

    const { data: servs } = await db.from('servicios').select('id, bicicleta_id').is('eliminado_en', null);
    const bikeIds = new Set((bikes || []).map(b => b.id));
    const servHuerfanos = (servs || []).filter(s => s.bicicleta_id && !bikeIds.has(s.bicicleta_id));
    add('integridad_servicios', servHuerfanos.length ? 'FALLA' : 'OK', `${servHuerfanos.length} servicios sin bicicleta`);

    // 3c-bis. TOKENS DE WHATSAPP POR VENCER (Coexistencia, desde el 2-sep-2026).
    //
    // El token que cada taller nos da al conectar su WhatsApp vive 60 días. Si
    // vence, los recordatorios de ESE taller dejan de salir sin ningún síntoma
    // visible: el taller cree que sus clientes están siendo contactados y no lo
    // están. Y un token ya vencido NO se puede renovar — hay que rehacer todo el
    // Embedded Signup con el dueño del taller delante.
    //
    // La Edge Function whatsapp-renovar-tokens renueva con 15 días de margen.
    // Este chequeo es la red por si esa función no está corriendo: acá se ve.
    {
        const { data: creds, error } = await db
            .from('wa_credenciales')
            .select('taller_id, expira_at');

        if (error) {
            // Tabla nueva: si todavía no existe en este entorno, no es una falla.
            add('tokens_whatsapp', 'OMITIDO', `no pude leer wa_credenciales (${error.message})`);
        } else if (!creds || creds.length === 0) {
            add('tokens_whatsapp', 'OK', 'ningún taller con WhatsApp conectado todavía');
        } else {
            const ahora = Date.now();
            const dias = ms => Math.floor((ms - ahora) / 86400000);
            const vencidos = creds.filter(c => c.expira_at && Date.parse(c.expira_at) <= ahora);
            const porVencer = creds.filter(c => {
                if (!c.expira_at) return false;
                const d = dias(Date.parse(c.expira_at));
                return d > 0 && d <= 15;
            });

            if (vencidos.length) {
                add('tokens_whatsapp', 'FALLA',
                    `${vencidos.length} taller(es) con el token VENCIDO: no pueden mandar y hay que reconectarlos a mano`);
            } else if (porVencer.length) {
                const masCerca = Math.min(...porVencer.map(c => dias(Date.parse(c.expira_at))));
                add('tokens_whatsapp', 'FALLA',
                    `${porVencer.length} token(es) vencen en <=15 días (el más cercano en ${masCerca}) y no se renovaron`);
            } else {
                add('tokens_whatsapp', 'OK', `${creds.length} conectado(s), ninguno vence en 15 días`);
            }
        }
    }

    // 3d. Fugas cross-tenant: filas sin taller_id (RLS no las protege)
    for (const t of ['clientes', 'bicicletas', 'servicios', 'recordatorios']) {
        const { count } = await db.from(t).select('*', { count: 'exact', head: true }).is('taller_id', null);
        if (count > 0) report.alertas.push(`${count} filas en "${t}" sin taller_id (invisibles por RLS / riesgo multi-tenant)`);
    }

    finish();
}

function finish() {
    if (report.alertas.length) report.ok = false;
    if (JSON_OUT) { console.log(JSON.stringify(report, null, 2)); return; }
    console.log(`\n🩺 MECHANIC PRO — HEALTH CHECK  [${report.nivel}]  ${report.ts}`);
    console.log('─'.repeat(60));
    for (const c of report.checks) {
        const icon = c.estado === 'OK' ? '✅' : c.estado === 'OMITIDO' ? '⏭️ ' : '🔴';
        console.log(`${icon} ${c.nombre.padEnd(24)} ${c.detalle}`);
    }
    if (report.alertas.length) {
        console.log('\n⚠️  ALERTAS:');
        report.alertas.forEach(a => console.log(`   • ${a}`));
    }
    console.log('\n' + (report.ok ? '✅ TODO OK' : '🔴 REVISAR ALERTAS ARRIBA') + '\n');
    process.exit(report.ok ? 0 : 1);
}

main().catch(e => { console.error('❌ Error fatal:', e.message); process.exit(2); });
