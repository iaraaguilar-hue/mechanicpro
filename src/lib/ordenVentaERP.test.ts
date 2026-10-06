// Tests de la orden de venta al ERP y su corrección. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/ordenVentaERP.test.ts --bundle --platform=node --format=cjs --alias:@=./src --define:import.meta.env='{"VITE_SUPABASE_URL":"http://x","VITE_SUPABASE_ANON_KEY":"x"}' --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// Los casos son reales: la 372 (el plato que se volvió "(ML)" después de
// mandar la orden) y la 375 (el JSON que de verdad le llegó a la automatización
// el 23-sep-2026, capturado del n8n). La 375 es la prueba de que el armado nuevo
// manda EXACTAMENTE lo mismo que mandaba el de Workshop.tsx.
import {
    huellaItemsERP, armarPayloadOrden, textoAvisoERP, AVISO_ERP, ordenExisteEnERP, enFila,
    leerRespuestaERP, mandarOrden, RECHAZADA_ERP, CODIGO_NO_EXISTE,
    accionOrdenEnTaller, armarPayloadCancelacion, erpTallerAntesDeMandar, erpTallerTrasEnvio, avisoEnTaller, aceptaOrdenEnTaller,
    ordenesParaReconciliar, mandarFinalYCerrarEnTaller, cerrarOrdenEnTaller, sincronizarOrdenEnTaller,
    erpTallerSinErrorViejo, cerrarOrdenesEnTallerDeLaBici,
    type ErpTaller, type ProductoOrdenERP, type ServicioParaEnTaller,
} from './ordenVentaERP';
import type { VinculoProducto } from './chequeoOrdenERP';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

// ── 1. La huella: qué cambios disparan la corrección ─────────────────────────
{
    const al_finalizar = [
        { descripcion: 'CINTA DE MANUBRIO ROCKBROS DE GOMA EVA AERO', precio: 23111, categoria: 'part' },
        { descripcion: 'Instalación plato palanca y platos', precio: 30000, categoria: 'labor' },
        { descripcion: 'Plato 73 bike 54/33', precio: 126700, categoria: 'part' },
    ];
    const con_ml = al_finalizar.map(i => i.descripcion === 'Plato 73 bike 54/33' ? { ...i, descripcion: 'Plato 73 bike 54/33 (ML)' } : i);
    eq('372: ponerle (ML) al plato CAMBIA lo que viaja', huellaItemsERP(con_ml) !== huellaItemsERP(al_finalizar), true);
    eq('372: después del (ML) viaja solo la cinta',
        huellaItemsERP(con_ml), 'cinta de manubrio rockbros de goma eva aero|23111');

    const otro_precio = al_finalizar.map(i => i.categoria === 'part' && i.precio === 23111 ? { ...i, precio: 21000 } : i);
    eq('cambiar el precio de un repuesto CAMBIA la huella', huellaItemsERP(otro_precio) !== huellaItemsERP(al_finalizar), true);

    // Control negativo: lo que NO viaja al ERP no dispara nada.
    const otra_mano_de_obra = al_finalizar.map(i => i.categoria === 'labor' ? { ...i, precio: 45000 } : i);
    eq('cambiar la mano de obra NO cambia la huella', huellaItemsERP(otra_mano_de_obra), huellaItemsERP(al_finalizar));
    eq('reordenar los renglones NO cambia la huella', huellaItemsERP([...al_finalizar].reverse()), huellaItemsERP(al_finalizar));
    eq('editar un (ML) que ya era (ML) NO cambia la huella',
        huellaItemsERP([...con_ml, { descripcion: 'Cubierta (ML)', precio: 5, categoria: 'part' }]), huellaItemsERP(con_ml));
    eq('sin repuestos, la huella es vacía', huellaItemsERP([{ descripcion: 'Service', precio: 1, categoria: 'labor' }]), '');
}

// ── 2. Paridad: el armado nuevo manda lo mismo que llegó de verdad (375) ─────
{
    const LLEGO_AL_N8N = {"numero_orden":"375","dni_cliente":"23969059","nombre_cliente":"Matias Perez","fecha_finalizacion":"2026-09-23T16:47:29.000Z","nombre_producto":"CADENA 9V SHIMANO CN-HG53, Cables y fundas delanteros y traseros, PASTILLAS DE FRENO DE RESINA SHIMANO B05S, PASTILLAS DE FRENO DE RESINA SHIMANO B05S","productos":[{"descripcion":"CADENA 9V SHIMANO CN-HG53","precio":54708,"cantidad":1,"sku":"ECNHG53C116I","id_externo":"11748992","nombre_erp":"CADENA 9V SHIMANO CN-HG53"},{"descripcion":"Cables y fundas delanteros y traseros","precio":22000,"cantidad":1,"nombre_erp":"Cables y fundas delanteros y traseros"},{"descripcion":"PASTILLAS DE FRENO DE RESINA SHIMANO B05S","precio":17893,"cantidad":1,"sku":"EBPB05SRXA","id_externo":"11749039","nombre_erp":"PASTILLAS DE FRENO DE RESINA SHIMANO B05S"},{"descripcion":"PASTILLAS DE FRENO DE RESINA SHIMANO B05S","precio":17893,"cantidad":1,"sku":"EBPB05SRXA","id_externo":"11749039","nombre_erp":"PASTILLAS DE FRENO DE RESINA SHIMANO B05S"}],"total_service":112494};
    const vinculos = new Map<string, VinculoProducto>([
        ['cadena 9v shimano cn hg53', { nombre: 'CADENA 9V SHIMANO CN-HG53', sku: 'ECNHG53C116I', id_externo: '11748992' }],
        ['cables y fundas delanteros y traseros', { nombre: 'Cables y fundas delanteros y traseros', sku: null, id_externo: null }],
        ['pastillas de freno de resina shimano b05s', { nombre: 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S', sku: 'EBPB05SRXA', id_externo: '11749039' }],
    ]);
    const armado = armarPayloadOrden({
        numeroOrden: 375,
        servicioId: 'x',
        dni: '23969059',
        nombre: 'Matias Perez',
        fechaFinalizacion: '2026-09-23T16:47:29.000Z',
        items: [
            { descripcion: 'CADENA 9V SHIMANO CN-HG53', precio: 54708, categoria: 'part' },
            { descripcion: 'Cables y fundas delanteros y traseros', precio: 22000, categoria: 'part' },
            { descripcion: 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S', precio: 17893, categoria: 'part' },
            { descripcion: 'PASTILLAS DE FRENO DE RESINA SHIMANO B05S', precio: 17893, categoria: 'part' },
            { descripcion: 'Service Expert', precio: 60000, categoria: 'labor' },
        ],
        vinculos,
    });
    eq('375: el armado es idéntico a lo que llegó al n8n', armado, LLEGO_AL_N8N);

    const sin_cliente = armarPayloadOrden({ numeroOrden: 1, servicioId: 'x', dni: null, nombre: null, fechaFinalizacion: 'f', items: [], vinculos: new Map() });
    eq('sin DNI manda "Sin DNI" (la automatización usa el consumidor final)', sin_cliente.dni_cliente, 'Sin DNI');
    eq('un (ML) no viaja en el payload', armarPayloadOrden({ numeroOrden: 1, servicioId: 'x', dni: '1', nombre: 'a', fechaFinalizacion: 'f',
        items: [{ descripcion: 'Plato (ML)', precio: 9, categoria: 'part' }], vinculos: new Map() }).productos.length, 0);
}

// ── 3. El cartel: qué lee el taller ─────────────────────────────────────────
{
    eq('un aviso armado se muestra como frase', textoAvisoERP(`${AVISO_ERP}Hay que anularla.`),
        { titulo: 'Hay que corregir la orden de venta en el ERP', cuerpo: 'Hay que anularla.' });
    eq('un HTTP 500 sigue diciendo que no salió', textoAvisoERP('HTTP 500').titulo, 'La orden de venta no salió al ERP');
}

// ── 4. Solo se corrige una orden que EXISTE en el ERP (hallazgo del revisor) ──
{
    eq('372: se mandó y el ERP contestó bien → se corrige', ordenExisteEnERP({ webhook_erp_disparado: true, webhook_erp_ok: true, webhook_erp_detalle: 'HTTP 200' }), true);
    eq('se intentó pero falló (HTTP 500) → NO: la crearía duplicada', ordenExisteEnERP({ webhook_erp_disparado: true, webhook_erp_ok: false, webhook_erp_detalle: 'HTTP 500' }), false);
    eq('nunca se mandó → NO', ordenExisteEnERP({ webhook_erp_disparado: false, webhook_erp_ok: null }), false);
    eq('orden vieja sin registro de respuesta → NO (no se sabe si existe)', ordenExisteEnERP({ webhook_erp_disparado: true, webhook_erp_ok: null, webhook_erp_detalle: null }), false);
    eq('una corrección anterior falló → existe, se reintenta', ordenExisteEnERP({ webhook_erp_disparado: true, webhook_erp_ok: false, webhook_erp_detalle: 'no salió la corrección tras editar (HTTP 502)' }), true);
    eq('quedó el aviso de anular a mano → existe', ordenExisteEnERP({ webhook_erp_disparado: true, webhook_erp_ok: false, webhook_erp_detalle: AVISO_ERP + 'x' }), true);
}

// ── 5. La fila: dos envíos de la misma orden no se adelantan ────────────────
async function fila() {
    const orden: string[] = [];
    const lento = () => new Promise<void>(r => setTimeout(() => { orden.push('primero (lento)'); r(); }, 40));
    const rapido = async () => { orden.push('segundo (rápido)'); };
    const falla = async () => { throw new Error('x'); };
    await Promise.all([enFila('a', lento), enFila('a', falla).catch(() => undefined), enFila('a', rapido)]);
    eq('el segundo espera al primero aunque sea más rápido, y un error no corta la fila', orden, ['primero (lento)', 'segundo (rápido)']);
    const otra: string[] = [];
    await Promise.all([
        enFila('b', () => new Promise<void>(r => setTimeout(() => { otra.push('b'); r(); }, 30))),
        enFila('c', async () => { otra.push('c'); }),
    ]);
    eq('órdenes distintas no se esperan entre sí', otra, ['c', 'b']);
}

// ── 6. Qué contestó la automatización (desde el 5-oct contesta al TERMINAR) ──
{
    eq('200 + ok:true → salió', leerRespuestaERP(true, 200, '{"ok":true,"id_orden":123456,"etapa":"en_taller"}'),
        { ok: true, detalle: 'HTTP 200', rechazada: false });
    eq('200 + ok:false (-1) → el ERP la rechazó, seguro que no cambió, y el código viaja como CAMPO',
        leerRespuestaERP(true, 200, '{"ok":false,"id_orden":-1,"etapa":"cancelar_taller"}'),
        { ok: false, detalle: `${RECHAZADA_ERP} (código -1)`, rechazada: true, codigo: -1 });
    eq('n8n a veces contesta una lista: [{ok:false}] también es rechazo', leerRespuestaERP(true, 200, '[{"ok":false,"id_orden":-99}]').codigo, -99);
    eq('el 0 que devolvió Contabilium (como texto) llega como número', leerRespuestaERP(true, 200, '{"ok":false,"id_orden":"0"}').codigo, 0);
    // Control negativo: la automatización de otro taller no manda `ok`.
    eq('200 sin JSON ("recibido") → se juzga por el HTTP, como siempre', leerRespuestaERP(true, 200, 'recibido').ok, true);
    eq('200 con JSON sin campo ok → salió', leerRespuestaERP(true, 200, '{"enviados":0}').ok, true);
    eq('HTTP 500 → falló, pero NO se sabe si la creó (no es rechazo)', leerRespuestaERP(false, 500, '{"ok":false}'),
        { ok: false, detalle: 'HTTP 500', rechazada: false });
    eq('el cartel de un rechazo no dice "puede que": dice que no la aceptó',
        textoAvisoERP(`${RECHAZADA_ERP} (código -1)`).cuerpo.includes('no la aceptó'), true);
}
async function mandar() {
    const fetchReal = globalThis.fetch;
    try {
        globalThis.fetch = (async () => new Response('{"ok":false,"id_orden":-1}', { status: 200 })) as typeof fetch;
        eq('mandarOrden LEE el cuerpo: un 200 con ok:false es falla', await mandarOrden('http://x', {}),
            { ok: false, detalle: `${RECHAZADA_ERP} (código -1)`, rechazada: true, codigo: -1 });
        globalThis.fetch = (async () => { throw new Error('Failed to fetch'); }) as typeof fetch;
        eq('mandarOrden sin red → falla incierta', await mandarOrden('http://x', {}), { ok: false, detalle: 'Failed to fetch', rechazada: false });
    } finally {
        globalThis.fetch = fetchReal;
    }
}

// ── 7. La orden EN TALLER (<N>-T): qué se hace en cada caso (5-oct-2026) ──────
const CAMARA: ProductoOrdenERP = { descripcion: 'PV TUBE 700X20-28 48MM', precio: 9500, cantidad: 1, sku: '030-01305', nombre_erp: 'PV TUBE 700X20-28 48MM' };
const CADENA: ProductoOrdenERP = { descripcion: 'CADENA 9V SHIMANO CN-HG53', precio: 54708, cantidad: 1, sku: 'ECNHG53C116I', id_externo: '11748992', nombre_erp: 'CADENA 9V SHIMANO CN-HG53' };
const SIN_ERR = { error: null, rechazada: false, codigo: null };
const abiertaCon = (productos: ProductoOrdenERP[], error: string | null = null): ErpTaller =>
    ({ abierta: true, confirmada: !error, productos, at: 't', etapa: 'en_taller', error, rechazada: false, codigo: null });
const enCurso: ServicioParaEnTaller = { estado: 'in_progress', webhook_erp_disparado: false, erp_taller: null };
{
    eq('en curso, sin final, primer repuesto → crea la -T', accionOrdenEnTaller(enCurso, [CAMARA]), 'en_taller');
    eq('en curso, solo mano de obra → nada', accionOrdenEnTaller(enCurso, []), 'nada');
    eq('estado viejo o desconocido ("Intake") cuenta como en curso', accionOrdenEnTaller({ ...enCurso, estado: 'Intake' }, [CAMARA]), 'en_taller');
    eq('-T abierta con los MISMOS renglones → nada (no se pisa al pedo)',
        accionOrdenEnTaller({ ...enCurso, erp_taller: abiertaCon([CAMARA, CADENA]) }, [CADENA, CAMARA]), 'nada');
    eq('-T abierta y cambió un repuesto → se pisa', accionOrdenEnTaller({ ...enCurso, erp_taller: abiertaCon([CAMARA]) }, [CAMARA, CADENA]), 'en_taller');
    eq('-T abierta y cambió el precio → se pisa', accionOrdenEnTaller({ ...enCurso, erp_taller: abiertaCon([CAMARA]) }, [{ ...CAMARA, precio: 9900 }]), 'en_taller');
    eq('-T abierta y el repuesto ahora tiene SKU → se pisa (el ERP lo encuentra mejor)',
        accionOrdenEnTaller({ ...enCurso, erp_taller: abiertaCon([{ descripcion: 'PV TUBE 700X20-28 48MM', precio: 9500, cantidad: 1 }]) }, [CAMARA]), 'en_taller');
    eq('-T con error pendiente y mismos renglones → se reintenta',
        accionOrdenEnTaller({ ...enCurso, erp_taller: abiertaCon([CAMARA], 'HTTP 500') }, [CAMARA]), 'en_taller');
    eq('-T rechazada la primera vez (cerrada, con error) → se reintenta',
        accionOrdenEnTaller({ ...enCurso, erp_taller: { abierta: false, productos: [], at: 't', etapa: 'en_taller', error: `${RECHAZADA_ERP} (código -1)`, rechazada: true, codigo: -1 } }, [CAMARA]), 'en_taller');
    eq('-T abierta y se sacaron todos los repuestos (o pasaron a ML) → se cancela',
        accionOrdenEnTaller({ ...enCurso, erp_taller: abiertaCon([CAMARA]) }, []), 'cancelar_taller');
    eq('-T ya cancelada y sin repuestos → nada', accionOrdenEnTaller({ ...enCurso, erp_taller: { abierta: false, productos: [CAMARA], at: 't', etapa: 'cancelar_taller' } }, []), 'nada');

    // La final ya salió: eso es de corregirOrdenEnERP, nunca de la -T.
    const reabierta = { ...enCurso, webhook_erp_disparado: true, webhook_erp_ok: true, webhook_erp_detalle: 'HTTP 200' };
    eq('orden REABIERTA con la final en el ERP → nada (la corrige corregirOrdenEnERP)', accionOrdenEnTaller(reabierta, [CAMARA]), 'nada');
    eq('… y ahí la corrección SÍ aplica (se excluyen por condición)', ordenExisteEnERP(reabierta), true);
    eq('final intentada y fallida (HTTP 500) → nada: el taller pudo cargarla a mano',
        accionOrdenEnTaller({ ...enCurso, webhook_erp_disparado: true, webhook_erp_ok: false, webhook_erp_detalle: 'HTTP 500' } as ServicioParaEnTaller, [CAMARA]), 'nada');

    // Fuera de "en curso", una -T abierta solo puede cancelarse (reintento de un cierre que falló).
    eq('finalizada con la -T abierta → se cancela', accionOrdenEnTaller({ ...enCurso, estado: 'ready', erp_taller: abiertaCon([CAMARA], 'HTTP 502') }, [CAMARA]), 'cancelar_taller');
    eq('finalizada sin -T → nada', accionOrdenEnTaller({ ...enCurso, estado: 'ready' }, [CAMARA]), 'nada');
    eq('entregada con la -T abierta → se cancela', accionOrdenEnTaller({ ...enCurso, estado: 'delivered', erp_taller: abiertaCon([CAMARA]) }, [CAMARA]), 'cancelar_taller');
    eq('reabierta con una -T vieja abierta → se cancela, nunca convive con la final',
        accionOrdenEnTaller({ ...reabierta, erp_taller: abiertaCon([CAMARA]) }, [CAMARA]), 'cancelar_taller');
    eq('borrada con la -T abierta → se cancela', accionOrdenEnTaller({ ...enCurso, eliminado_en: '2026-10-05', erp_taller: abiertaCon([CAMARA]) }, [CAMARA]), 'cancelar_taller');
    eq('borrada sin -T → nada', accionOrdenEnTaller({ ...enCurso, eliminado_en: '2026-10-05' }, [CAMARA]), 'nada');

    // Barrido: en NINGÚN estado la -T se crea mientras la corrección también aplica.
    const choques: string[] = [];
    for (const estado of ['in_progress', 'ready', 'delivered', 'Completed', 'Intake'])
        for (const webhook_erp_disparado of [false, true])
            for (const webhook_erp_ok of [null, true, false])
                for (const erp_taller of [null, abiertaCon([CAMARA])]) {
                    const s = { estado, webhook_erp_disparado, webhook_erp_ok, webhook_erp_detalle: webhook_erp_ok === false ? 'HTTP 500' : 'HTTP 200', erp_taller };
                    if (accionOrdenEnTaller(s, [CADENA]) === 'en_taller' && ordenExisteEnERP(s)) choques.push(JSON.stringify(s));
                }
    eq('nunca se crea la -T sobre una orden cuya final ya existe', choques, []);
}

// ── 8. La cancelación lleva los renglones GUARDADOS (Contabilium rechaza sin) ─
{
    const datos = { numeroOrden: 412, servicioId: 'x', dni: null, nombre: null, fechaFinalizacion: '2026-10-05T21:00:00.000Z' };
    const c = armarPayloadCancelacion(datos, abiertaCon([CAMARA, CADENA]));
    eq('cancelar_taller lleva los productos del último en_taller', c.productos, [CAMARA, CADENA]);
    eq('… con su etapa', c.etapa, 'cancelar_taller');
    eq('… y el total y los nombres de esos renglones', [c.total_service, c.nombre_producto], [64208, 'PV TUBE 700X20-28 48MM, CADENA 9V SHIMANO CN-HG53']);
    eq('… y el mismo número que la -T (la automatización le agrega el -T)', c.numero_orden, '412');
    eq('sin DNI manda "Sin DNI" (consumidor final)', c.dni_cliente, 'Sin DNI');

    // Paridad: lo que cancela tiene la MISMA forma que lo que creó la -T.
    const vinculos = new Map([['pv tube 700x20 28 48mm', { nombre: 'PV TUBE 700X20-28 48MM', sku: '030-01305' }]]);
    const creo = armarPayloadOrden({ ...datos, items: [{ descripcion: 'PV TUBE 700X20-28 48MM', precio: 9500, categoria: 'part' }, { descripcion: 'Service', precio: 1, categoria: 'labor' }], vinculos });
    const { etapa: _e, ...cancelaSinEtapa } = armarPayloadCancelacion(datos, { productos: creo.productos });
    eq('la cancelación es el payload de la -T con otra etapa', cancelaSinEtapa, creo);
}

// ── 9. Lo que queda escrito antes y después de cada envío ────────────────────
{
    const OK = { ok: true, detalle: 'HTTP 200', rechazada: false };
    const RECHAZO = { ok: false, detalle: `${RECHAZADA_ERP} (código -1)`, rechazada: true, codigo: -1 };
    const INCIERTO = { ok: false, detalle: 'HTTP 500', rechazada: false };
    const CODIGO_0 = { ok: false, detalle: `${RECHAZADA_ERP} (código 0)`, rechazada: true, codigo: CODIGO_NO_EXISTE };

    // Antes de mandar (pestaña que se cierra en los 2 a 4 s del envío).
    const anotada = erpTallerAntesDeMandar(null, [CAMARA], 't0');
    eq('ANTES de mandar el primer en_taller queda anotada: abierta, sin confirmar, con lo que sale', anotada,
        { abierta: true, confirmada: false, productos: [CAMARA], at: 't0', etapa: 'en_taller', ...SIN_ERR });
    eq('… y si la pestaña muere ahí, al finalizar el cierre la cancela', accionOrdenEnTaller({ estado: 'ready', erp_taller: anotada }, []), 'cancelar_taller');
    eq('… y el reconciliador la encuentra', ordenesParaReconciliar([{ id: 'a', estado: 'ready', erp_taller: anotada }]), ['a']);
    eq('pisar una CONFIRMADA: la anotación sigue confirmada (la -T existe seguro)', erpTallerAntesDeMandar(abiertaCon([CAMARA]), [CADENA], 't').confirmada, true);
    // 2ª vuelta (6-oct): la anotación de un en_taller que nunca contestó NO es "ya sincronizada".
    eq('anotada sin confirmar y con los MISMOS repuestos (pestaña cerrada a mitad) → se vuelve a mandar, no "nada"',
        accionOrdenEnTaller({ ...enCurso, erp_taller: anotada }, [CAMARA]), 'en_taller');
    eq('control: confirmada con los mismos repuestos → nada', accionOrdenEnTaller({ ...enCurso, erp_taller: abiertaCon([CAMARA]) }, [CAMARA]), 'nada');

    eq('en_taller OK → abierta y confirmada, con lo mandado', erpTallerTrasEnvio(null, 'en_taller', [CAMARA], OK, 't'),
        { abierta: true, confirmada: true, productos: [CAMARA], at: 't', etapa: 'en_taller', ...SIN_ERR });
    eq('cancelar OK → cerrada', erpTallerTrasEnvio(abiertaCon([CAMARA]), 'cancelar_taller', [CAMARA], OK, 't').abierta, false);
    eq('en_taller RECHAZADO la primera vez → no hay -T (se vuelve a lo de ANTES de anotar)', erpTallerTrasEnvio(null, 'en_taller', [CAMARA], RECHAZO, 't'),
        { abierta: false, confirmada: false, productos: [], at: 't', etapa: 'en_taller', error: RECHAZO.detalle, rechazada: true, codigo: -1 });
    eq('en_taller RECHAZADO sobre una abierta → sigue la de antes, con sus renglones',
        erpTallerTrasEnvio(abiertaCon([CAMARA]), 'en_taller', [CAMARA, CADENA], RECHAZO, 't'),
        { abierta: true, confirmada: true, productos: [CAMARA], at: 't', etapa: 'en_taller', error: RECHAZO.detalle, rechazada: true, codigo: -1 });
    const incierta = erpTallerTrasEnvio(null, 'en_taller', [CAMARA], INCIERTO, 't');
    eq('en_taller con HTTP 500 → se supone creada (abierta, SIN confirmar), para que el cierre la cancele igual', incierta,
        { abierta: true, confirmada: false, productos: [CAMARA], at: 't', etapa: 'en_taller', error: 'HTTP 500', rechazada: false, codigo: null });
    eq('… y el cierre la cancela', accionOrdenEnTaller({ estado: 'ready', erp_taller: incierta }, []), 'cancelar_taller');
    // Medido el 5-oct contra Contabilium: cancelar una -T que nunca existió se RECHAZA con 0
    // y el stock no se mueve. Solo ESE código, sobre una sin confirmar, quiere decir "no había nada".
    eq('cancelar rechazado con 0 sobre una -T nunca confirmada → cerrada y sin cartel',
        erpTallerTrasEnvio(incierta, 'cancelar_taller', [CAMARA], CODIGO_0, 't'),
        { abierta: false, confirmada: false, productos: [CAMARA], at: 't', etapa: 'cancelar_taller', ...SIN_ERR });
    eq('cancelar rechazado con -1 (u otro código) sobre una sin confirmar → sigue abierta: -1 no dice que no exista',
        erpTallerTrasEnvio(incierta, 'cancelar_taller', [CAMARA], RECHAZO, 't').abierta, true);
    // 2ª vuelta (6-oct): una CONFIRMADA que al cancelar da 0 es una que alguien anuló a mano.
    const anuladaAMano = erpTallerTrasEnvio(abiertaCon([CAMARA]), 'cancelar_taller', [CAMARA], CODIGO_0, 't');
    eq('cancelar rechazado con 0 sobre una -T CONFIRMADA (anulada a mano) → cerrada y sin error',
        anuladaAMano, { abierta: false, confirmada: false, productos: [CAMARA], at: 't', etapa: 'cancelar_taller', ...SIN_ERR });
    eq('… sin cartel', avisoEnTaller({ numero_orden: 412, estado: 'delivered', fecha_finalizacion: '2026-10-01T00:00:00Z', erp_taller: anuladaAMano }), null);
    eq('… y el reconciliador ya no la vuelve a cancelar en cada carga',
        ordenesParaReconciliar([{ id: 'x', estado: 'delivered', erp_taller: anuladaAMano }]), []);
    eq('confirmada y después un en_taller incierto → sigue confirmada (la -T existe seguro)',
        erpTallerTrasEnvio(abiertaCon([CAMARA]), 'en_taller', [CADENA], INCIERTO, 't').confirmada, true);
    const cierreFallido = erpTallerTrasEnvio(abiertaCon([CAMARA]), 'cancelar_taller', [CAMARA], INCIERTO, 't');
    eq('cancelar que falla sin saber cómo → sigue abierta con sus renglones', cierreFallido,
        { abierta: true, confirmada: true, productos: [CAMARA], at: 't', etapa: 'cancelar_taller', error: 'HTTP 500', rechazada: false, codigo: null });
    eq('… y la próxima vuelta (ya finalizada) la vuelve a cancelar', accionOrdenEnTaller({ estado: 'ready', erp_taller: cierreFallido }, []), 'cancelar_taller');
    eq('… con esos mismos renglones', armarPayloadCancelacion({ numeroOrden: 1, servicioId: 'x', dni: null, nombre: null, fechaFinalizacion: 'f' }, cierreFallido).productos, [CAMARA]);
}

// ── 9-bis. El error viejo se limpia cuando ya no dice nada cierto (2ª vuelta) ─
{
    const rechazadaAntes: ErpTaller = { abierta: false, productos: [], at: 't', etapa: 'en_taller', error: 'el ERP la rechazó (código -1)', rechazada: true, codigo: -1 };
    eq('en_taller rechazado y después se sacan TODOS los repuestos → la decisión es nada…',
        accionOrdenEnTaller({ ...enCurso, erp_taller: rechazadaAntes }, []), 'nada');
    eq('… y el error viejo se limpia', erpTallerSinErrorViejo(rechazadaAntes), { ...rechazadaAntes, ...SIN_ERR });
    eq('una -T abierta con error NO se limpia (sigue reservando)', erpTallerSinErrorViejo(abiertaCon([CAMARA], 'HTTP 500')), null);
    eq('sin error no hay nada que limpiar', erpTallerSinErrorViejo({ ...rechazadaAntes, ...SIN_ERR }), null);
    eq('sin -T no hay nada que limpiar', erpTallerSinErrorViejo(null), null);
}

// ── 10. El reconciliador: qué órdenes barre al cargar el taller ──────────────
{
    const filas = [
        { id: 'en-curso', estado: 'in_progress', erp_taller: abiertaCon([CAMARA]) },
        { id: 'finalizada', estado: 'ready', erp_taller: abiertaCon([CAMARA]) },
        { id: 'entregada', estado: 'delivered', erp_taller: abiertaCon([CAMARA]) },
        { id: 'borrada', estado: 'in_progress', eliminado_en: '2026-10-05', erp_taller: abiertaCon([CAMARA]) },
        { id: 'final-mandada', estado: 'in_progress', webhook_erp_disparado: true, erp_taller: abiertaCon([CAMARA]) },
        { id: 'ya-cerrada', estado: 'ready', erp_taller: { ...abiertaCon([CAMARA]), abierta: false } },
        { id: 'sin-T', estado: 'ready', erp_taller: null },
    ];
    eq('barre las -T abiertas de finalizadas, entregadas, borradas y con la final mandada; deja la que está en curso',
        ordenesParaReconciliar(filas), ['finalizada', 'entregada', 'borrada', 'final-mandada']);
    eq('nada abierto → nada que barrer', ordenesParaReconciliar([]), []);
}

// ── 11. El cartel: el mismo en el Taller Activo, el Historial y las borradas ──
{
    const AHORA = Date.parse('2026-10-05T22:00:00.000Z');
    const hace = (min: number) => new Date(AHORA - min * 60000).toISOString();
    eq('sin -T no hay cartel', avisoEnTaller({ numero_orden: 412, estado: 'ready', erp_taller: null }, AHORA), null);
    eq('-T abierta en curso y sin error → sin cartel', avisoEnTaller({ numero_orden: 412, estado: 'in_progress', erp_taller: abiertaCon([CAMARA]) }, AHORA), null);
    eq('recién finalizada con la -T abierta → todavía no (la cancelación está viajando)',
        avisoEnTaller({ numero_orden: 412, estado: 'ready', fecha_finalizacion: hace(0.1), erp_taller: abiertaCon([CAMARA]) }, AHORA), null);
    const colgada = avisoEnTaller({ numero_orden: 412, estado: 'delivered', fecha_finalizacion: hace(60), erp_taller: abiertaCon([CAMARA]) }, AHORA)!;
    eq('finalizada hace rato con la -T abierta → dice qué hacer: anular la 412-T a mano en Contabilium',
        [colgada.titulo, colgada.cuerpo.includes('412-T a mano en Contabilium')], ['Anular la 412-T a mano en Contabilium', true]);
    eq('la cancelación FALLÓ → se avisa enseguida, sin esperar',
        avisoEnTaller({ numero_orden: 412, estado: 'ready', fecha_finalizacion: hace(0.1), erp_taller: { ...abiertaCon([CAMARA], 'HTTP 500'), etapa: 'cancelar_taller' } }, AHORA)?.titulo,
        'Anular la 412-T a mano en Contabilium');
    eq('cancelación fallida con la orden en curso (se sacaron los repuestos) → también se avisa',
        avisoEnTaller({ numero_orden: 412, estado: 'in_progress', erp_taller: { ...abiertaCon([CAMARA], 'HTTP 500'), etapa: 'cancelar_taller' } }, AHORA)?.titulo,
        'Anular la 412-T a mano en Contabilium');
    eq('borrada con la -T abierta → avisa (las borradas se muestran aparte)',
        avisoEnTaller({ numero_orden: 412, estado: 'in_progress', eliminado_en: hace(10), erp_taller: abiertaCon([CAMARA]) }, AHORA)?.titulo,
        'Anular la 412-T a mano en Contabilium');
    const rech = avisoEnTaller({ numero_orden: 412, estado: 'in_progress', erp_taller: { abierta: false, productos: [], at: 't', etapa: 'en_taller', error: 'x', rechazada: true, codigo: -1 } }, AHORA)!;
    eq('en_taller RECHAZADO → "no bajó" (es seguro)', [rech.titulo, rech.cuerpo.includes('no bajó')], ['Repuestos sin reservar en el ERP', true]);
    const inc = avisoEnTaller({ numero_orden: 412, estado: 'in_progress', erp_taller: { ...abiertaCon([CAMARA], 'HTTP 500'), confirmada: false } }, AHORA)!;
    eq('en_taller INCIERTO (HTTP 500) → no afirma que no bajó', [inc.titulo, inc.cuerpo.includes('no bajó'), inc.cuerpo.includes('puede haber bajado o no')],
        ['Reserva de repuestos sin confirmar en el ERP', false, true]);
    eq('error viejo de un en_taller en una orden ya finalizada y sin -T → sin cartel (no contradice nada)',
        avisoEnTaller({ numero_orden: 412, estado: 'ready', fecha_finalizacion: hace(60), erp_taller: { abierta: false, productos: [], at: 't', etapa: 'en_taller', error: 'x', rechazada: true, codigo: -1 } }, AHORA), null);
    eq('sin número de orden usa el mismo número que viaja al ERP',
        avisoEnTaller({ id: '0123456789abcdef', estado: 'ready', fecha_finalizacion: hace(60), erp_taller: abiertaCon([CAMARA]) }, AHORA)?.titulo,
        'Anular la ABCDEF-T a mano en Contabilium');

    eq('Probikes entiende la etapa', aceptaOrdenEnTaller('f3844f35-cb20-420d-93e7-a940a50a68a1'), true);
    eq('la automatización de Crono NO (le llegaría como una venta por repuesto)', aceptaOrdenEnTaller('33209a9b-1751-4cbf-bc90-8603b6ad2752'), false);
    eq('sin taller, no', aceptaOrdenEnTaller(null), false);
}

// ── 12. Al finalizar: la final SIEMPRE antes que la cancelación de la -T ─────
async function finalYCierre() {
    const orden: string[] = [];
    const cerrarFalso = (id: string) => enFila(id, async () => { orden.push('cancelar -T'); return 'cancelada' as const; });
    const finalLenta = () => new Promise<void>(r => setTimeout(() => { orden.push('final'); r(); }, 40));
    const { final, cierre } = mandarFinalYCerrarEnTaller('f1', finalLenta, true, cerrarFalso);
    await Promise.all([final, cierre]);
    eq('la cancelación de la -T sale DESPUÉS de la final, aunque la final tarde', orden, ['final', 'cancelar -T']);

    const sinFinal: string[] = [];
    const r = mandarFinalYCerrarEnTaller('f2', null, true, (id) => enFila(id, async () => { sinFinal.push('cancelar -T'); return 'cancelada' as const; }));
    await r.cierre;
    eq('sin final (no quedan repuestos, reabierta, sin webhook) la -T se cancela igual', [r.final, sinFinal], [null, ['cancelar -T']]);

    const otro = mandarFinalYCerrarEnTaller('f3', async () => undefined, false, async () => { throw new Error('no debería'); });
    eq('un taller sin orden en taller no cancela nada', otro.cierre, null);

    // El cierre DE VERDAD también espera en la fila (no solo el de prueba).
    const fetchReal = globalThis.fetch;
    globalThis.fetch = (async () => new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    try {
        const pasos: string[] = [];
        void enFila('f4', () => new Promise<void>(res => setTimeout(() => { pasos.push('final'); res(); }, 40)));
        await cerrarOrdenEnTaller('f4').then(() => pasos.push('cierre'));
        eq('cerrarOrdenEnTaller espera a la final que está en la fila', pasos, ['final', 'cierre']);
    } finally {
        globalThis.fetch = fetchReal;
    }
}

// ── 13. enTallerAhora de punta a punta, con una base y un n8n de mentira ─────
// Lo que el auditor pidió y una función pura no puede probar: el ORDEN de las
// escrituras contra los envíos. La base y el n8n son un `fetch` falso que anota
// todo en un registro.
const PROBIKES = 'f3844f35-cb20-420d-93e7-a940a50a68a1';
function mundoFalso(fila: any, alLlegarAlN8n?: (body: any, fila: any) => void, contestar?: (body: any) => { ok: boolean; id_orden: number }) {
    const registro: string[] = [];
    const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchFalso = (async (input: any, init?: any) => {
        const url = String(typeof input === 'string' ? input : input?.url);
        const metodo = String(init?.method || 'GET').toUpperCase();
        if (url.startsWith('http://n8n')) {
            const body = JSON.parse(init.body);
            registro.push(`n8n ${body.etapa}`);
            alLlegarAlN8n?.(body, fila);
            return json({ ...(contestar ? contestar(body) : { ok: true, id_orden: 99 }), etapa: body.etapa });
        }
        if (url.includes('/rest/v1/servicios')) {
            if (metodo === 'PATCH') {
                const b = JSON.parse(init.body);
                Object.assign(fila, b);
                registro.push(`anota abierta=${b.erp_taller?.abierta} confirmada=${b.erp_taller?.confirmada} error=${b.erp_taller?.error ?? null}`);
                return new Response(null, { status: 204 });
            }
            return json([fila]);
        }
        if (url.includes('/rest/v1/taller_configuraciones')) return json([{ webhook_orden_url: 'http://n8n/orden' }]);
        if (url.includes('/rest/v1/bicicletas')) return json([{ clientes: { dni: null, nombre: 'Prueba' } }]);
        return json([]);
    }) as typeof fetch;
    return { registro, fetchFalso };
}
async function dePuntaAPunta() {
    const fetchReal = globalThis.fetch;
    const filaBase = () => ({
        id: 'e2e', taller_id: PROBIKES, numero_orden: 412, estado: 'in_progress', eliminado_en: null,
        webhook_erp_disparado: false, erp_taller: null as any, bicicleta_id: 'b1',
        servicio_items: [{ descripcion: 'PV TUBE 700X20-28 48MM', precio: 12500, categoria: 'part' }],
    });
    try {
        // A. Primer repuesto: se ANOTA antes de mandar.
        const a = filaBase();
        const A = mundoFalso(a);
        globalThis.fetch = A.fetchFalso;
        const ra = await sincronizarOrdenEnTaller('e2e');
        eq('primer repuesto: la -T se anota ANTES de salir al n8n, y se confirma al volver', [ra, A.registro],
            ['abierta', ['anota abierta=true confirmada=false error=null', 'n8n en_taller', 'anota abierta=true confirmada=true error=null']]);

        // B. Se BORRÓ (otra compu) mientras el en_taller viajaba: se relee y se cancela en la misma tarea.
        const b = filaBase();
        const B = mundoFalso(b, (body, f) => { if (body.etapa === 'en_taller') f.eliminado_en = '2026-10-06T10:00:00Z'; });
        globalThis.fetch = B.fetchFalso;
        const rb = await sincronizarOrdenEnTaller('e2e');
        eq('si la orden se BORRÓ mientras viajaba el en_taller, se cancela enseguida',
            [rb, B.registro.filter(x => x.startsWith('n8n')), b.erp_taller?.abierta], ['cancelada', ['n8n en_taller', 'n8n cancelar_taller'], false]);

        // B2 (2ª vuelta). Se FINALIZÓ mientras viajaba: NO se cancela ahí (la final todavía no salió).
        const b2 = filaBase();
        const B2 = mundoFalso(b2, (body, f) => { if (body.etapa === 'en_taller') { f.estado = 'ready'; f.webhook_erp_disparado = true; } });
        globalThis.fetch = B2.fetchFalso;
        const rb2 = await sincronizarOrdenEnTaller('e2e');
        eq('si se FINALIZÓ mientras viajaba el en_taller, la -T queda abierta (la cancela el cierre de después de la final)',
            [rb2, B2.registro.filter(x => x.startsWith('n8n')), b2.erp_taller?.abierta], ['abierta', ['n8n en_taller'], true]);

        // B3 (2ª vuelta). La misma pestaña: guarda un repuesto y finaliza en los 2-4 s siguientes.
        const b3 = filaBase();
        const B3 = mundoFalso(b3, (body, f) => { if (body.etapa === 'en_taller') { f.estado = 'ready'; f.webhook_erp_disparado = true; } });
        globalThis.fetch = B3.fetchFalso;
        const sync = sincronizarOrdenEnTaller('e2e');
        const { final, cierre } = mandarFinalYCerrarEnTaller('e2e', async () => { B3.registro.push('n8n finalizada'); }, true);
        await Promise.all([sync, final, cierre]);
        eq('repuesto + finalizar enseguida: en_taller, DESPUÉS la final, DESPUÉS la cancelación (el stock nunca queda libre)',
            [B3.registro.filter(x => x.startsWith('n8n')), b3.erp_taller?.abierta], [['n8n en_taller', 'n8n finalizada', 'n8n cancelar_taller'], false]);

        // C. Al finalizar sin -T abierta pero con un error viejo: no se manda nada y el error se limpia.
        const c = { ...filaBase(), estado: 'ready', erp_taller: { abierta: false, productos: [], at: 't', etapa: 'en_taller', error: 'el ERP la rechazó (código -1)', rechazada: true, codigo: -1 } };
        const C = mundoFalso(c);
        globalThis.fetch = C.fetchFalso;
        const rc = await cerrarOrdenEnTaller('e2e');
        eq('cierre sin -T: no sale nada al n8n y se limpia el error viejo', [rc, C.registro, c.erp_taller.error], ['nada', ['anota abierta=false confirmada=undefined error=null'], null]);

        // D. Cierre con la -T abierta: manda los renglones GUARDADOS aunque la orden ya no tenga repuestos.
        let mandados: any = null;
        const d = { ...filaBase(), estado: 'ready', servicio_items: [], erp_taller: abiertaCon([CAMARA]) };
        const D = mundoFalso(d, (body) => { mandados = body.productos; });
        globalThis.fetch = D.fetchFalso;
        const rd = await cerrarOrdenEnTaller('e2e');
        eq('cierre con la -T abierta y sin repuestos: cancela con los guardados', [rd, mandados, d.erp_taller.abierta], ['cancelada', [CAMARA], false]);

        // C2 (2ª vuelta). En curso, en_taller rechazado y después se sacaron todos los repuestos.
        const c2 = { ...filaBase(), servicio_items: [], erp_taller: { abierta: false, productos: [], at: 't', etapa: 'en_taller', error: 'el ERP la rechazó (código -1)', rechazada: true, codigo: -1 } };
        const C2 = mundoFalso(c2);
        globalThis.fetch = C2.fetchFalso;
        const rc2 = await sincronizarOrdenEnTaller('e2e');
        eq('sin repuestos tras un rechazo: no sale nada y el cartel "sin reservar" desaparece',
            [rc2, C2.registro.filter(x => x.startsWith('n8n')), c2.erp_taller.error, avisoEnTaller(c2 as any)], ['nada', [], null, null]);

        // F (2ª vuelta). Borrar una BICI: sus órdenes se borran en cascada, así que su -T se cancela ANTES.
        const f = { ...filaBase(), erp_taller: abiertaCon([CAMARA]) };
        const F = mundoFalso(f);
        globalThis.fetch = F.fetchFalso;
        eq('antes de borrar la bici se cancela la -T abierta de su orden', [await cerrarOrdenesEnTallerDeLaBici('b1'), F.registro.filter(x => x.startsWith('n8n'))],
            [{ pudoLeer: true, sinCerrar: [] }, ['n8n cancelar_taller']]);
        const g = { ...filaBase(), erp_taller: abiertaCon([CAMARA]) };
        const G = mundoFalso(g, undefined, () => ({ ok: false, id_orden: -99 }));
        globalThis.fetch = G.fetchFalso;
        eq('si la cancelación no sale, dice cuál quedó (y la bici no se borra)', await cerrarOrdenesEnTallerDeLaBici('b1'), { pudoLeer: true, sinCerrar: ['412-T'] });

        // E. Control negativo: otro taller no manda nada.
        const e = { ...filaBase(), taller_id: '33209a9b-1751-4cbf-bc90-8603b6ad2752' };
        const E = mundoFalso(e);
        globalThis.fetch = E.fetchFalso;
        eq('otro taller: no aplica y no sale nada', [await sincronizarOrdenEnTaller('e2e'), E.registro], ['no_aplica', []]);
    } finally {
        globalThis.fetch = fetchReal;
    }
}

fila().then(mandar).then(finalYCierre).then(dePuntaAPunta).then(() => {
    console.log(`\n${fail === 0 ? '✅' : '❌'} ordenVentaERP: ${ok} ok, ${fail} fallaron`);
    if (fail) process.exit(1);
});
