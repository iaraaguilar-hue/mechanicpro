#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Cuando el local vende una bici, la bici aparece sola en Mechanic Pro.
//
// PEDIDO DE IARA (3-sep-2026): "quiero que quede registrada la bici en Mechanic
// Pro con los datos del cliente que la compró en Contabilium, y que ya
// automáticamente se autocargue lo del recordatorio del chequeo del mes".
//
// LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO, y cambió el diseño:
//   · Los comprobantes traen Items[] con IdRubro. **Bike = 196196** marca una bici.
//   · 🔴 Contabilium casi no guarda el teléfono: **1 de 40** clientes lo tiene (2%).
//     El mail sí, en el 22%. Y el CUIT siempre.
//   · Mechanic Pro tiene teléfono en **207 de 207** clientes de Probikes, y DNI en 205.
//
// Por eso NO se crea el cliente desde el ERP como primera opción: nacería mudo, y
// sin teléfono no hay aviso del primer service, que era el punto. Se cruza por
// DOCUMENTO contra los clientes que ya están en MP (el CUIT contiene el DNI). Si
// no aparece, se crea igual pero marcado `origen='erp'`, para que el taller sepa
// que le falta el teléfono.
//
// EL RECORDATORIO DEL PRIMER SERVICE NO SE CONSTRUYE ACÁ, y a propósito: la bici
// entra sin ningún service, así que el aviso «primer service» de «Vale una
// llamada» la levanta sola a los 30 días. Un recordatorio propio sería un segundo
// sistema diciendo lo mismo.
//
// USO:
//   cd ~/Desktop/mechanic_pro/frontend
//   node mp_altas_desde_erp.cjs --taller Probikes [--dias 7] [--dry-run]
//
// `--dry-run` muestra qué haría sin escribir nada. Correrlo así la primera vez.
// Es idempotente: `altas_desde_erp` tiene unique(taller, comprobante).
// ─────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const RUBRO_BIKE = 196196;                 // rubro "Bike" de Contabilium
const CB = 'https://rest.contabilium.com';
const SECRETS = '/Users/iaraaguilar/Documents/estudio_iara/.secrets/contabilium.env';

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
    if (a.startsWith('--')) args[a.slice(2)] = (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true;
});
const TALLER = args.taller || 'Probikes';
const DIAS = Number(args.dias) || 7;
const DRY = !!args['dry-run'];
const die = (m) => { console.error('✖ ' + m); process.exit(1); };

// ── credenciales ──
const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
for (const l of fs.readFileSync(SECRETS, 'utf8').split('\n')) {
    const m = l.match(/^(?:export\s+)?([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE) die('faltan credenciales de Supabase en .env.local');
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

/** Solo dígitos. Los documentos vienen cargados a mano y con formatos varios ("31,861,129"). */
const soloNum = (t) => String(t ?? '').replace(/\D/g, '');

/**
 * El DNI que hay adentro de un CUIT/CUIL argentino: 20-39345627-3 → 39345627.
 * Si ya viene un DNI pelado (7-8 dígitos), se devuelve tal cual.
 */
function dniDe(doc) {
    const n = soloNum(doc);
    if (n.length === 11) {
        // 🔴 Los prefijos 30/33/34 son PERSONA JURÍDICA: una empresa, no un ciclista.
        // Un CUIT de empresa no contiene ningún DNI, así que recortarle el medio
        // produce un número inventado. Pasó el 3-sep: "ELECTROSOF S.A." entró como
        // cliente del taller con una bici a su nombre, camino a recibir un aviso de
        // primer service. Es venta mayorista y no tiene nada que hacer acá.
        //
        // El campo `Personeria` de Contabilium NO sirve para esto: ELECTROSOF S.A.
        // figura como "F" (física). El prefijo del CUIT sí.
        if (/^(30|33|34)/.test(n)) return null;
        return n.slice(2, -1).replace(/^0+/, '');
    }
    if (n.length >= 7 && n.length <= 8) return n;
    return null;
}

/** ¿El documento es de una empresa? Se usa para saltear la venta entera. */
const esEmpresa = (doc) => /^(30|33|34)/.test(soloNum(doc)) && soloNum(doc).length === 11;

/** Token OAuth de Contabilium. */
async function tokenCB() {
    const r = await fetch(`${CB}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.CB_EMAIL, client_secret: process.env.CB_KEY,
        }),
    });
    const d = await r.json().catch(() => ({}));
    if (!d.access_token) die('no pude autenticar contra Contabilium: ' + JSON.stringify(d).slice(0, 180));
    return d.access_token;
}

const cbGet = async (tok, p) => {
    const r = await fetch(CB + p, { headers: { Authorization: `Bearer ${tok}` } });
    return r.ok ? r.json() : null;
};

/**
 * La marca, deducida de las bicis que el taller YA tiene cargadas.
 *
 * El nombre del ERP no la trae ("ROCKHOPPER COMP PST/WHTMTN XS") y `marca` es
 * NOT NULL en la base, así que hay que poner algo. Poner "Specialized" porque el
 * taller es dealer sería inventar; en cambio, mirar qué marca le puso el propio
 * taller a sus otras bicis del mismo modelo es leer un dato que ya existe.
 * Medido el 3-sep en Probikes: 21 Rockhopper, 9 Diverge y 21 Chisel, todas
 * Specialized. Si el modelo no aparece, queda "Sin confirmar" y el mecánico la
 * corrige cuando tenga la bici delante.
 */
function marcaSegunElTaller(modelo, bicisDelTaller) {
    const clave = (t) => String(t || '').toLowerCase().split(/\s+/)[0] || '';
    const k = clave(modelo);
    if (!k) return 'Sin confirmar';
    const cuenta = new Map();
    for (const b of bicisDelTaller) {
        if (clave(b.modelo) !== k || !b.marca) continue;
        // Se normaliza para que "Specialized " y "Specilized" no partan el voto.
        const m = String(b.marca).trim();
        cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
    }
    if (!cuenta.size) return 'Sin confirmar';
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Del nombre del producto saca modelo y talle.
 * "ROCKHOPPER COMP PST/WHTMTN XS - 27.5" → { modelo: "Rockhopper Comp", talle: "XS" }
 *
 * La MARCA no se adivina: el nombre del ERP no la trae, y ponerle "Specialized"
 * porque el taller es dealer sería inventar. Queda vacía y el mecánico la completa
 * cuando la bici entre — o cuando corrija la ficha, que es cuando la tiene delante.
 */
function leerProducto(nombre) {
    const limpio = String(nombre || '').trim();
    // Dos sistemas de talle conviven: letras en MTB (XS…XXL) y centímetros en
    // ruta (49, 52, 54, 56…). "Diverge E5 Sport 54" tiene el talle en el 54, y
    // sin esto quedaba pegado al modelo.
    const talle = (limpio.match(/\b(XXS|XS|S|M|L|XL|XXL)\b/) || [])[1]
        || (limpio.match(/\b(4[4-9]|5[0-9]|6[0-4])\b(?!\s*[.,]\d)/) || [])[1]
        || null;
    const modelo = limpio
        .replace(/\b(XXS|XS|S|M|L|XL|XXL)\b/g, ' ')
        .replace(/\b(4[4-9]|5[0-9]|6[0-4])\b(?!\s*[.,]\d)/g, ' ')
        .replace(/[A-Z]{2,}\/[A-Z]+/g, ' ')          // códigos de color tipo PST/WHT
        .replace(/\s*-\s*[\d.]+\s*$/, '')            // el rodado del final
        .replace(/\s{2,}/g, ' ').trim();
    const bonito = modelo.split(' ')
        .map(p => p.length > 2 ? p[0] + p.slice(1).toLowerCase() : p).join(' ');
    return { modelo: bonito || limpio, talle };
}

(async () => {
    const { data: talleres } = await db.from('talleres').select('id, nombre').ilike('nombre', TALLER).limit(2);
    if (!talleres?.length) die(`no encontré el taller "${TALLER}"`);
    if (talleres.length > 1) die(`hay más de un taller que matchea "${TALLER}"`);
    const taller = talleres[0];

    // Dónde atiende el taller y a partir de cuántas bicis es venta mayorista.
    // Sin config, no se filtra por provincia (mejor no cargar de menos por un
    // default que el taller no eligió) y una sola bici por venta.
    const { data: cfgRow } = await db.from('talleres').select('config_altas_erp').eq('id', taller.id).maybeSingle();
    const cfg = cfgRow?.config_altas_erp || {};
    const PROVINCIAS = Array.isArray(cfg.provincias) ? cfg.provincias : [];
    const MAX_BICIS = Number(cfg.max_bicis_por_venta) || 1;

    const hasta = new Date();
    const desde = new Date(Date.now() - DIAS * 86400000);
    const f = (d) => d.toISOString().slice(0, 10);
    console.log(`· taller: ${taller.nombre}`);
    console.log(`· ventana: ${f(desde)} → ${f(hasta)}${DRY ? '   [DRY-RUN: no escribe nada]' : ''}`);

    const tok = await tokenCB();
    // 🔴 La API devuelve de a 50 y hay que pedir las páginas. Sin esto, una ventana
    // con más de 50 comprobantes deja afuera al resto EN SILENCIO: el 3-sep, correr
    // 40 días y después 7 días dio ventas distintas, que es como se descubrió.
    const comprobantes = [];
    for (let pagina = 1; pagina <= 40; pagina++) {
        const r = await cbGet(tok, `/api/comprobantes/search?fechaDesde=${f(desde)}&fechaHasta=${f(hasta)}&page=${pagina}`);
        const lote = r?.Items ?? r?.items ?? [];
        if (!lote.length) break;
        const nuevos = lote.filter(x => !comprobantes.some(y => String(y.Id) === String(x.Id)));
        if (!nuevos.length) break;          // la API ignora `page` y repite: se corta
        comprobantes.push(...nuevos);
        if (lote.length < 50) break;
    }
    console.log(`· ${comprobantes.length} comprobantes en la ventana`);

    // Los que ya se procesaron, para no volver a mirarlos.
    const { data: yaVistos } = await db.from('altas_desde_erp')
        .select('comprobante_id').eq('taller_id', taller.id);
    const vistos = new Set((yaVistos ?? []).map(v => v.comprobante_id));

    // Las bicis que ya tiene el taller: de ahí sale la marca.
    const { data: bicisDelTaller } = await db.from('bicicletas')
        .select('marca, modelo').eq('taller_id', taller.id);

    // Los clientes de MP con documento, para el cruce.
    const { data: clientesMP } = await db.from('clientes')
        .select('id, nombre, dni, telefono').eq('taller_id', taller.id).is('eliminado_en', null);
    const porDni = new Map();
    for (const c of clientesMP ?? []) { const d = dniDe(c.dni); if (d) porDni.set(d, c); }

    const resumen = { vinculado: 0, creado: 0, lejos: 0, mayorista: 0, a_revisar: 0,
                      generico: 0, sin_cliente: 0, omitido: 0, fallo: 0, saltados: 0 };

    for (const c of comprobantes) {
        const id = String(c.Id);
        if (vistos.has(id)) { resumen.saltados++; continue; }

        const det = await cbGet(tok, `/api/comprobantes/${id}`);
        const bicis = (det?.Items ?? []).filter(i => i.IdRubro === RUBRO_BIKE);

        const anotar = async (resultado, detalle, cliente_id = null, bicicleta_id = null) => {
            resumen[resultado]++;
            if (DRY) return;
            await db.from('altas_desde_erp').insert({
                taller_id: taller.id, comprobante_id: id,
                fecha_venta: (det?.FechaAlta || c.FechaAlta || '').slice(0, 10) || null,
                cliente_id, bicicleta_id, resultado, detalle: (detalle ?? '').slice(0, 500),
            });
        };

        if (!bicis.length) { await anotar('omitido', 'sin ítems del rubro Bike'); continue; }

        // El comprador
        const cli = det?.IdCliente ? await cbGet(tok, `/api/clientes/${det.IdCliente}`) : null;
        const nombre = (cli?.RazonSocial || det?.RazonSocial || '').trim();
        const dni = dniDe(cli?.NroDoc);
        if (!nombre) { await anotar('sin_cliente', 'el comprobante no trae nombre'); continue; }

        // ── 1. El cliente genérico de facturación no es nadie.
        // "CONSUMIDOR FINAL" aparece en las ventas sin datos: cargarlo como cliente
        // del taller crea una ficha a nombre de nadie que después nadie borra.
        if (/^(consumidor final|sin identificar|cliente ocasional|s\/?d)$/i.test(nombre.trim())) {
            await anotar('generico', `"${nombre}": es el cliente genérico de facturación`);
            continue;
        }

        // ── 2. El que compra desde afuera.
        // Iara: "si nos compra una bici en Mendoza, no nos sirve de nada tenerlo en
        // Mechanic Pro". Es una venta, pero no un cliente de taller: no va a traer
        // la bici, y el aviso de service le llegaría a 1.000 km. Se registra igual
        // para que el taller lo pueda mirar, pero no entra a la base de clientes.
        const provincia = (cli?.Provincia || '').trim();
        if (PROVINCIAS.length && provincia && !PROVINCIAS.some(p => p.toLowerCase() === provincia.toLowerCase())) {
            await anotar('lejos', `${nombre} · ${provincia}: fuera de donde atiende el taller`);
            console.log(`  🌎 ${nombre} — ${provincia} (no se carga: está lejos)`);
            continue;
        }

        // ── 3. El que factura a su empresa.
        // Saltear TODA venta con CUIT de empresa tiraba al bebé con el agua: una
        // persona que compra su bici y la factura a su empresa para descargar IVA
        // SÍ es cliente del taller. Lo que no lo es, es la S.A. que se lleva tres.
        // Por eso el corte es por CANTIDAD DE BICIS, no por tipo de documento.
        if (esEmpresa(cli?.NroDoc)) {
            if (bicis.length > MAX_BICIS) {
                await anotar('mayorista', `${nombre}: empresa con ${bicis.length} bicis en un comprobante`);
                console.log(`  🏢 ${nombre} — ${bicis.length} bicis (mayorista, no se carga)`);
                continue;
            }
            // Una sola bici a nombre de una empresa: probablemente hay una persona
            // atrás. Se registra para que el taller pregunte de quién es, pero no se
            // crea un cliente con el nombre de la empresa.
            const { modelo: mod, talle: tal } = leerProducto(bicis[0].Concepto);
            await anotar('a_revisar',
                `${nombre} (CUIT ${cli?.NroDoc}) compró 1 ${mod}${tal ? ' ' + tal : ''}. `
                + `Facturado a una empresa: preguntar de quién es la bici.`);
            console.log(`  ❓ ${nombre} — 1 ${mod}: facturado a empresa, hay que preguntar de quién es`);
            continue;
        }

        let cliente = dni ? porDni.get(dni) : null;
        let resultado = 'vinculado';

        if (!cliente) {
            // No estaba en MP: se crea, pero SIN teléfono y marcado, porque el ERP
            // no lo tiene. El taller lo completa cuando el cliente pase por el local.
            resultado = 'creado';
            if (!DRY) {
                const { data: nuevo, error } = await db.from('clientes').insert({
                    taller_id: taller.id, nombre, dni: dni || null,
                    telefono: null,
                    // El mail está en 1 de cada 5 y es la única vía de contacto que
                    // el ERP a veces sí trae. Vale más que dejarlo vacío.
                    email: (cli?.Email || '').trim() || null,
                    origen: 'erp',
                }).select().single();
                if (error) { await anotar('fallo', 'no pude crear el cliente: ' + error.message); continue; }
                cliente = nuevo;
                if (dni) porDni.set(dni, nuevo);
            } else {
                cliente = { id: null, nombre };
            }
        }

        // La bici (la primera del comprobante; si vendieron dos, se anota y se avisa)
        const { modelo, talle } = leerProducto(bicis[0].Concepto);
        let biciId = null;
        if (!DRY && cliente.id) {
            const { data: bici, error } = await db.from('bicicletas').insert({
                taller_id: taller.id, cliente_id: cliente.id,
                marca: marcaSegunElTaller(modelo, bicisDelTaller ?? []),
                modelo, talle,
                notas: `Alta automática desde la venta del ${(det?.FechaAlta || '').slice(0, 10)} `
                     + `(comprobante ${id}, ${bicis[0].Codigo || 's/SKU'}). `
                     + `La marca se dedujo de las otras bicis del taller: conviene confirmarla.`,
            }).select().single();
            if (error) { await anotar('fallo', 'no pude crear la bici: ' + error.message, cliente.id); continue; }
            biciId = bici.id;
        }

        const extra = bicis.length > 1 ? ` (⚠️ el comprobante tenía ${bicis.length} bicis, se cargó la primera)` : '';
        await anotar(resultado, `${nombre} · ${modelo}${talle ? ' ' + talle : ''}${extra}`, cliente.id, biciId);
        console.log(`  ${resultado === 'vinculado' ? '🔗' : '➕'} ${nombre} — ${modelo}${talle ? ' ' + talle : ''}`
            + (resultado === 'creado'
                ? `   (cliente nuevo, sin teléfono${(cli?.Email || '').trim() ? ', con mail' : ''})`
                : ''));
    }

    console.log('\n═══ RESUMEN ═══');
    console.log(`  bicis vinculadas a un cliente que ya estaba: ${resumen.vinculado}`);
    console.log(`  clientes creados (les falta el teléfono):    ${resumen.creado}`);
    console.log(`  comprobantes sin bici:                       ${resumen.omitido}`);
    console.log(`  sin documento utilizable:                    ${resumen.sin_cliente}`);
    console.log(`  fallaron:                                    ${resumen.fallo}`);
    console.log(`  ya procesados antes:                         ${resumen.saltados}`);
    if (resumen.lejos + resumen.mayorista + resumen.a_revisar + resumen.generico > 0) {
        console.log('\n── ventas que NO se cargaron, y por qué ──');
        if (resumen.lejos)     console.log(`  🌎 ${resumen.lejos} de otra provincia (no van a traer la bici acá)`);
        if (resumen.mayorista) console.log(`  🏢 ${resumen.mayorista} mayoristas (empresa con varias bicis)`);
        if (resumen.generico)  console.log(`  👤 ${resumen.generico} a "consumidor final" (no es nadie)`);
        if (resumen.a_revisar) console.log(`  ❓ ${resumen.a_revisar} facturadas a una empresa: HAY QUE PREGUNTAR de quién es la bici`);
    }
    if (resumen.creado > 0) {
        console.log(`\n⚠️  Hay ${resumen.creado} cliente(s) sin teléfono. Contabilium no lo guarda:`);
        console.log('   se los pide el taller cuando pasen. Salen en la lista de clientes con origen "erp".');
    }
    if (!DRY && (resumen.vinculado + resumen.creado) > 0) {
        console.log('\n📅 Las bicis entraron SIN service, así que el aviso de «primer service»');
        console.log('   las va a levantar solo en Retención cuando cumplan el plazo configurado.');
    }
})().catch(e => die(e.stack || e.message));
