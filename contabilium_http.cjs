// contabilium_http.cjs — el cliente HTTP de Contabilium para los scripts de MP (sync de stock,
// altas desde el ERP). Uno solo, para que el límite del ERP se respete en un único lugar.
//
// 🔴 POR QUÉ EXISTE (6-oct-2026). Desde el 3-oct el sync de stock falló 4 mañanas seguidas. Medido:
// Contabilium tiene ahora Cloudflare adelante con LÍMITE DE PEDIDOS (error 1015). Tras ~29 pedidos
// seguidos (6,4 s) contesta 429 con `Retry-After: 60` y se levanta a los 61 s. El script viejo
// reintentaba ~30 s y se rendía ANTES de que se levantara: "la página 26 volvió vacía".
//
// Las tres reglas de este cliente:
//   1. RITMO: un pedido cada `ritmoMs` (2,2 s ≈ 27 por minuto), compartido entre pedidos en paralelo.
//      El turno se reserva de forma sincrónica, así el pool de 4 no se pisa.
//   2. 429 = ESPERAR lo que pide Retry-After (+2 s) y seguir, pausando a TODOS los que esperan turno.
//      No cuenta como falla hasta acumular 10 minutos de espera en el mismo pedido.
//   3. Nunca devuelve "vacío" como si fuera un dato: devuelve { status, data:null } y el que llama
//      decide abortar. Un faltante de stock se lee como "no hay", y esa es la mentira que no se dice.
const https = require('https');

const HOST = 'rest.contabilium.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function crearCliente({ email, key, ritmoMs = 2200, log = () => {} }) {
  let auth = null;
  let proximo = 0; // cuándo puede salir el próximo pedido (ms epoch)
  const stats = { pedidos: 0, r429: 0, esperaS: 0 };

  function http(method, p, body) {
    return new Promise(res => {
      const headers = { 'User-Agent': 'Mozilla/5.0' };
      if (auth && method === 'GET') headers.Authorization = 'Bearer ' + auth;
      if (body) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; headers['Content-Length'] = Buffer.byteLength(body); }
      const r = https.request({ host: HOST, path: p, method, headers }, resp => {
        let b = ''; resp.on('data', c => b += c); resp.on('end', () => res({ status: resp.statusCode, body: b, headers: resp.headers }));
      });
      r.on('error', e => res({ status: 0, body: '', err: String(e) }));
      r.setTimeout(30000, () => r.destroy(new Error('timeout 30s')));
      if (body) r.write(body);
      r.end();
    });
  }

  async function turno() {
    const ahora = Date.now();
    const slot = Math.max(ahora, proximo);
    proximo = slot + ritmoMs; // reservado ANTES de esperar: dos llamadas en paralelo no toman el mismo
    if (slot > ahora) await sleep(slot - ahora);
  }

  function pausarTodos(ms) { proximo = Math.max(proximo, Date.now() + ms); }

  async function token() {
    for (let i = 0; i < 6; i++) {
      await turno();
      const data = new URLSearchParams({ grant_type: 'client_credentials', client_id: email, client_secret: key }).toString();
      const r = await http('POST', '/token', data);
      stats.pedidos++;
      if (r.status === 200) {
        try { auth = JSON.parse(r.body).access_token; } catch { auth = null; }
        if (auth) return auth;
      }
      if (r.status === 429) { const ms = espera429(r); pausarTodos(ms); await sleep(ms); continue; }
      if (r.status === 400 || r.status === 401) {
        // Credencial rechazada: esto no se arregla reintentando. Mensaje claro para el vigía.
        throw new Error(`CREDENCIAL RECHAZADA por Contabilium (${r.status}): ${String(r.body).slice(0, 160)}`);
      }
      await sleep(2000 * 2 ** i);
    }
    throw new Error('no pude autenticar contra Contabilium tras 6 intentos (red o ERP caído)');
  }

  function espera429(r) {
    const ra = parseInt(r.headers?.['retry-after'], 10);
    const ms = ((Number.isFinite(ra) && ra > 0 ? ra : 60) + 2) * 1000;
    stats.r429++; stats.esperaS += Math.round(ms / 1000);
    return ms;
  }

  // GET con las tres reglas. Devuelve { status, data } (data null si no hubo 200 con JSON).
  async function get(p) {
    if (!auth) await token();
    let fallas = 0, renovado = false, esperado = 0;
    for (;;) {
      await turno();
      const r = await http('GET', p);
      stats.pedidos++;
      if (r.status === 200) { try { return { status: 200, data: JSON.parse(r.body) }; } catch { return { status: 200, data: null }; } }
      if (r.status === 429) {
        const ms = espera429(r);
        esperado += ms;
        if (esperado > 10 * 60e3) return { status: 429, data: null };
        log(`  ⏸ Contabilium pidió esperar ${Math.round(ms / 1000)} s (límite de pedidos)`);
        pausarTodos(ms);
        continue;
      }
      if (r.status === 401 && !renovado) { renovado = true; await token(); continue; }
      if (r.status === 0 || r.status >= 500) {
        if (++fallas > 5) return { status: r.status, data: null, err: r.err };
        await sleep(2000 * 2 ** (fallas - 1));
        continue;
      }
      return { status: r.status, data: null };
    }
  }

  return { get, token, stats };
}

module.exports = { crearCliente };
