// Tests de la orden de venta al ERP y su corrección. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/ordenVentaERP.test.ts --bundle --platform=node --format=cjs --alias:@=./src --define:import.meta.env='{"VITE_SUPABASE_URL":"http://x","VITE_SUPABASE_ANON_KEY":"x"}' --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// Los casos son reales: la 372 (el plato que se volvió "(ML)" después de
// mandar la orden) y la 375 (el JSON que de verdad le llegó a la automatización
// el 23-sep-2026, capturado del n8n). La 375 es la prueba de que el armado nuevo
// manda EXACTAMENTE lo mismo que mandaba el de Workshop.tsx.
import {
    huellaItemsERP, armarPayloadOrden, textoAvisoERP, AVISO_ERP, ordenExisteEnERP, enFila,
    leerRespuestaERP, mandarOrden, RECHAZADA_ERP,
    accionOrdenEnTaller, armarPayloadCancelacion, erpTallerTrasEnvio, textoAvisoEnTaller, aceptaOrdenEnTaller,
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
    eq('200 + ok:false (-1) → el ERP la rechazó, y es SEGURO que no cambió', leerRespuestaERP(true, 200, '{"ok":false,"id_orden":-1,"etapa":"cancelar_taller"}'),
        { ok: false, detalle: `${RECHAZADA_ERP} (código -1)`, rechazada: true });
    eq('n8n a veces contesta una lista: [{ok:false}] también es rechazo', leerRespuestaERP(true, 200, '[{"ok":false,"id_orden":-99}]').rechazada, true);
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
        eq('mandarOrden LEE el cuerpo: un 200 con ok:false es falla', await mandarOrden('http://x', {}), { ok: false, detalle: `${RECHAZADA_ERP} (código -1)`, rechazada: true });
        globalThis.fetch = (async () => { throw new Error('Failed to fetch'); }) as typeof fetch;
        eq('mandarOrden sin red → falla incierta', await mandarOrden('http://x', {}), { ok: false, detalle: 'Failed to fetch', rechazada: false });
    } finally {
        globalThis.fetch = fetchReal;
    }
}

// ── 7. La orden EN TALLER (<N>-T): qué se hace en cada caso (5-oct-2026) ──────
const CAMARA: ProductoOrdenERP = { descripcion: 'PV TUBE 700X20-28 48MM', precio: 9500, cantidad: 1, sku: '030-01305', nombre_erp: 'PV TUBE 700X20-28 48MM' };
const CADENA: ProductoOrdenERP = { descripcion: 'CADENA 9V SHIMANO CN-HG53', precio: 54708, cantidad: 1, sku: 'ECNHG53C116I', id_externo: '11748992', nombre_erp: 'CADENA 9V SHIMANO CN-HG53' };
const abiertaCon = (productos: ProductoOrdenERP[], error: string | null = null): ErpTaller => ({ abierta: true, confirmada: !error, productos, at: 't', etapa: 'en_taller', error });
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
        accionOrdenEnTaller({ ...enCurso, erp_taller: { abierta: false, productos: [], at: 't', etapa: 'en_taller', error: `${RECHAZADA_ERP} (código -1)` } }, [CAMARA]), 'en_taller');
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

// ── 9. Lo que queda escrito después de cada envío ────────────────────────────
{
    const OK = { ok: true, detalle: 'HTTP 200', rechazada: false };
    const RECHAZO = { ok: false, detalle: `${RECHAZADA_ERP} (código -1)`, rechazada: true };
    const INCIERTO = { ok: false, detalle: 'HTTP 500', rechazada: false };

    eq('en_taller OK → abierta y confirmada, con lo mandado', erpTallerTrasEnvio(null, 'en_taller', [CAMARA], OK, 't'),
        { abierta: true, confirmada: true, productos: [CAMARA], at: 't', etapa: 'en_taller', error: null });
    eq('cancelar OK → cerrada', erpTallerTrasEnvio(abiertaCon([CAMARA]), 'cancelar_taller', [CAMARA], OK, 't').abierta, false);
    eq('en_taller RECHAZADO la primera vez → no hay -T (no reserva nada)', erpTallerTrasEnvio(null, 'en_taller', [CAMARA], RECHAZO, 't'),
        { abierta: false, confirmada: false, productos: [], at: 't', etapa: 'en_taller', error: RECHAZO.detalle });
    eq('en_taller RECHAZADO sobre una abierta → sigue la de antes, con sus renglones',
        erpTallerTrasEnvio(abiertaCon([CAMARA]), 'en_taller', [CAMARA, CADENA], RECHAZO, 't'),
        { abierta: true, confirmada: true, productos: [CAMARA], at: 't', etapa: 'en_taller', error: RECHAZO.detalle });
    const incierta = erpTallerTrasEnvio(null, 'en_taller', [CAMARA], INCIERTO, 't');
    eq('en_taller con HTTP 500 → se supone creada (abierta, SIN confirmar), para que el cierre la cancele igual', incierta,
        { abierta: true, confirmada: false, productos: [CAMARA], at: 't', etapa: 'en_taller', error: 'HTTP 500' });
    eq('… y el cierre la cancela', accionOrdenEnTaller({ estado: 'ready', erp_taller: incierta }, []), 'cancelar_taller');
    // Medido el 5-oct contra Contabilium: cancelar una -T que nunca existió se RECHAZA (código 0)
    // y el stock no se mueve. Sobre una -T sin confirmar, ese rechazo es "no había nada".
    const CODIGO_0 = { ok: false, detalle: `${RECHAZADA_ERP} (código 0)`, rechazada: true };
    eq('cancelar RECHAZADO sobre una -T nunca confirmada → cerrada y sin cartel (no había nada que liberar)',
        erpTallerTrasEnvio(incierta, 'cancelar_taller', [CAMARA], CODIGO_0, 't'),
        { abierta: false, confirmada: false, productos: [CAMARA], at: 't', etapa: 'cancelar_taller', error: null });
    eq('cancelar RECHAZADO sobre una -T CONFIRMADA → sigue abierta y con cartel (esa sí reserva)',
        textoAvisoEnTaller(erpTallerTrasEnvio(abiertaCon([CAMARA]), 'cancelar_taller', [CAMARA], CODIGO_0, 't'), 412)?.titulo,
        'Orden en taller sin cancelar en el ERP');
    eq('confirmada y después un en_taller incierto → sigue confirmada (la -T existe seguro)',
        erpTallerTrasEnvio(abiertaCon([CAMARA]), 'en_taller', [CADENA], INCIERTO, 't').confirmada, true);
    const cierreFallido = erpTallerTrasEnvio(abiertaCon([CAMARA]), 'cancelar_taller', [CAMARA], INCIERTO, 't');
    eq('cancelar que falla sin saber cómo → sigue abierta con sus renglones', cierreFallido,
        { abierta: true, confirmada: true, productos: [CAMARA], at: 't', etapa: 'cancelar_taller', error: 'HTTP 500' });
    eq('… y la próxima vuelta (ya finalizada) la vuelve a cancelar', accionOrdenEnTaller({ estado: 'ready', erp_taller: cierreFallido }, []), 'cancelar_taller');
    eq('… con esos mismos renglones', armarPayloadCancelacion({ numeroOrden: 1, servicioId: 'x', dni: null, nombre: null, fechaFinalizacion: 'f' }, cierreFallido).productos, [CAMARA]);
}

// ── 10. El cartel de la fila y a quién le aplica ─────────────────────────────
{
    eq('sin error no hay cartel', textoAvisoEnTaller(abiertaCon([CAMARA]), 412), null);
    eq('nunca hubo -T → sin cartel', textoAvisoEnTaller(null, 412), null);
    const noReservo = textoAvisoEnTaller(abiertaCon([CAMARA], 'HTTP 500'), 412)!;
    eq('falló el en_taller → dice que el stock no bajó', [noReservo.titulo, noReservo.cuerpo.includes('412-T')], ['Repuestos sin reservar en el ERP', true]);
    const sinCancelar = textoAvisoEnTaller({ ...abiertaCon([CAMARA], 'HTTP 500'), etapa: 'cancelar_taller' }, 412)!;
    eq('falló la cancelación → dice que sigue reservando y que hay que cancelarla a mano',
        [sinCancelar.titulo, sinCancelar.cuerpo.includes('a mano')], ['Orden en taller sin cancelar en el ERP', true]);

    eq('Probikes entiende la etapa', aceptaOrdenEnTaller('f3844f35-cb20-420d-93e7-a940a50a68a1'), true);
    eq('la automatización de Crono NO (le llegaría como una venta por repuesto)', aceptaOrdenEnTaller('33209a9b-1751-4cbf-bc90-8603b6ad2752'), false);
    eq('sin taller, no', aceptaOrdenEnTaller(null), false);
}

fila().then(mandar).then(() => {
    console.log(`\n${fail === 0 ? '✅' : '❌'} ordenVentaERP: ${ok} ok, ${fail} fallaron`);
    if (fail) process.exit(1);
});
