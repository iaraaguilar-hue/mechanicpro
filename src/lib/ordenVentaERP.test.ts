// Tests de la orden de venta al ERP y su corrección. Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/ordenVentaERP.test.ts --bundle --platform=node --format=cjs --alias:@=./src --define:import.meta.env='{"VITE_SUPABASE_URL":"http://x","VITE_SUPABASE_ANON_KEY":"x"}' --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// Los casos son reales: la 372 (el plato que se volvió "(ML)" después de
// mandar la orden) y la 375 (el JSON que de verdad le llegó a la automatización
// el 23-sep-2026, capturado del n8n). La 375 es la prueba de que el armado nuevo
// manda EXACTAMENTE lo mismo que mandaba el de Workshop.tsx.
import { huellaItemsERP, armarPayloadOrden, textoAvisoERP, AVISO_ERP, ordenExisteEnERP, enFila } from './ordenVentaERP';
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

fila().then(() => {
    console.log(`\n${fail === 0 ? '✅' : '❌'} ordenVentaERP: ${ok} ok, ${fail} fallaron`);
    if (fail) process.exit(1);
});
