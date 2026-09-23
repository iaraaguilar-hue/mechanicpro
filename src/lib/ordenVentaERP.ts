/**
 * ordenVentaERP.ts — la orden de venta que MP le manda al ERP, y su CORRECCIÓN.
 *
 * QUÉ RESUELVE (orden 372 de Probikes, 22/23-sep-2026):
 *
 *   El mecánico finalizó con un renglón "Plato 73 bike 54/33". MP mandó la
 *   orden de venta a Contabilium con el plato adentro. Después alguien le
 *   agregó "(ML)" al nombre (es de Mercado Libre: se factura por allá y NO
 *   tiene que entrar a Contabilium). El cambio quedó en MP y Contabilium nunca
 *   se enteró: la orden seguía con el plato, a punto de facturarse dos veces.
 *
 *   El envío salía UNA sola vez, al finalizar. Todo lo que se editaba después
 *   (un precio, un "(ML)", un repuesto que se saca o se agrega) quedaba solo en
 *   MP. Ahora, si la orden ya se había mandado y cambian los renglones que
 *   viajan al ERP, se vuelve a mandar corregida.
 *
 * POR QUÉ REENVIAR NO DUPLICA (medido contra Contabilium, 23-sep-2026):
 *   La automatización crea la orden por `/notificador/ecommerce` con
 *   `IDVentaIntegracion = numero_orden`. Contabilium la reconoce por ese número
 *   y ACTUALIZA la orden existente: la 370 se mandó dos veces con renglones
 *   distintos y quedó UNA orden con los del segundo envío; la 372 se reenvió
 *   solo con la cinta y quedó con la cinta sola, sin tocar el stock.
 *
 * LO QUE NO PUEDE HACER (y lo dice en pantalla en vez de callarlo):
 *   · Si se sacan TODOS los repuestos, no hay orden que mandar: la de
 *     Contabilium hay que anularla a mano.
 *   · Si la orden ya estaba FACTURADA, la factura no cambia con la orden.
 */
import { supabase } from '@/lib/supabase';
import { ordenNumberForWebhook } from '@/lib/formatId';
import { resolveOrdenWebhookUrl } from '@/lib/ordenWebhook';
import { claveProducto } from '@/lib/buscadorProductos';
import { itemsQueVanAlERP, clavesAChequear, type ItemOrden, type VinculoProducto } from '@/lib/chequeoOrdenERP';

// ─────────────────────────────────────────────────────────────────────────────
// 1. La huella de lo que viaja
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una cadena que cambia si y solo si cambia lo que el ERP recibiría: qué
 * renglones viajan (sin mano de obra ni "(ML)") y a qué precio. Cambiar la mano
 * de obra o una nota no dispara nada; ponerle "(ML)" a un repuesto sí.
 */
export function huellaItemsERP(items: ItemOrden[] | null | undefined): string {
    return itemsQueVanAlERP(items)
        .map(p => `${(p.descripcion || '').trim().toLowerCase()}|${Number(p.precio) || 0}`)
        .sort()
        .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. El payload (el MISMO para finalizar y para corregir)
// ─────────────────────────────────────────────────────────────────────────────

/** El catálogo del taller vinculado al ERP, para mandar SKU y nombre del ERP. */
export async function cargarVinculosERP(
    tallerId: string | null | undefined,
    items: ItemOrden[] | null | undefined,
): Promise<{ vinculos: Map<string, VinculoProducto>; pudoMedir: boolean }> {
    const vinculos = new Map<string, VinculoProducto>();
    const claves = clavesAChequear(items);
    if (claves.length === 0 || !tallerId) return { vinculos, pudoMedir: true };
    try {
        const { data, error } = await supabase
            .from('productos_taller')
            .select('clave,nombre,sku,id_externo,origen,veces_part,veces_labor')
            .eq('taller_id', tallerId)
            .in('clave', claves);
        if (error) throw error;
        for (const p of (data || []) as (VinculoProducto & { clave: string })[]) {
            vinculos.set(p.clave, p);
        }
        return { vinculos, pudoMedir: true };
    } catch (e: any) {
        console.warn('[ERP] No se pudo leer el catálogo del ERP:', e?.message);
        return { vinculos, pudoMedir: false };
    }
}

export interface DatosOrdenERP {
    numeroOrden: number | null | undefined;
    servicioId: string;
    dni: string | null | undefined;
    nombre: string | null | undefined;
    fechaFinalizacion: string;
    items: ItemOrden[] | null | undefined;
    vinculos: Map<string, VinculoProducto>;
}

/**
 * 🚩 Los campos viejos NO se tocan: la automatización del taller los lee por
 * nombre. Los nuevos (`sku`, `id_externo`, `nombre_erp`) van solo si existen.
 */
export function armarPayloadOrden(d: DatosOrdenERP) {
    const productos = itemsQueVanAlERP(d.items);
    return {
        numero_orden: ordenNumberForWebhook(d.numeroOrden ?? undefined, d.servicioId),
        dni_cliente: d.dni || 'Sin DNI',
        nombre_cliente: d.nombre || 'Cliente',
        fecha_finalizacion: d.fechaFinalizacion,
        nombre_producto: productos.map(p => p.descripcion).join(', '),
        productos: productos.map(p => {
            const v = d.vinculos.get(claveProducto(p.descripcion || ''));
            return {
                descripcion: p.descripcion,
                precio: Number(p.precio) || 0,
                // Un renglón de la orden = una unidad.
                cantidad: 1,
                ...(v?.sku ? { sku: v.sku } : {}),
                ...(v?.id_externo ? { id_externo: v.id_externo } : {}),
                ...(v?.nombre ? { nombre_erp: v.nombre } : {}),
            };
        }),
        total_service: productos.reduce((s, p) => s + (Number(p.precio) || 0), 0),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Mandar y dejar registro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los envíos de UNA misma orden salen en fila: el segundo espera la respuesta
 * del primero. Si dos ediciones seguidas salieran en paralelo y la vieja
 * llegara última, Contabilium se quedaría con los renglones viejos.
 * (Hallazgo del revisor independiente, 23-sep-2026.)
 */
const colaPorOrden = new Map<string, Promise<unknown>>();
export function enFila<T>(servicioId: string, tarea: () => Promise<T>): Promise<T> {
    const anterior = colaPorOrden.get(servicioId) || Promise.resolve();
    const esta = anterior.catch(() => undefined).then(tarea);
    colaPorOrden.set(servicioId, esta);
    esta.finally(() => { if (colaPorOrden.get(servicioId) === esta) colaPorOrden.delete(servicioId); }).catch(() => undefined);
    return esta;
}

export async function mandarOrden(url: string, payload: unknown): Promise<{ ok: boolean; detalle: string }> {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        signal: AbortSignal.timeout(20000),
    })
        .then(r => ({ ok: r.ok, detalle: `HTTP ${r.status}` }))
        .catch(e => ({ ok: false, detalle: e?.message || 'no se pudo entregar' }));
}

export async function registrarRespuestaERP(servicioId: string, ok: boolean, detalle: string) {
    try {
        await supabase.from('servicios').update({
            webhook_erp_ok: ok,
            webhook_erp_detalle: detalle,
            webhook_erp_at: new Date().toISOString(),
        }).eq('id', servicioId);
    } catch (e: any) {
        console.error('No pude registrar la respuesta del ERP:', e?.message);
    }
}

/** Prefijo de los avisos que ya son una frase para el taller (no un "HTTP 500"). */
export const AVISO_ERP = 'AVISO: ';

/** El texto del cartel rojo de la orden, según qué pasó. */
export function textoAvisoERP(detalle: string | null | undefined): { titulo: string; cuerpo: string } {
    if (detalle?.startsWith(AVISO_ERP)) {
        return { titulo: 'Hay que corregir la orden de venta en el ERP', cuerpo: detalle.slice(AVISO_ERP.length) };
    }
    return {
        titulo: 'La orden de venta no salió al ERP',
        cuerpo: `El aviso a la automatización no se pudo entregar${detalle ? ` (${detalle})` : ''}. Puede que haya que cargar la venta a mano.`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. La corrección: volver a mandar una orden ya enviada
// ─────────────────────────────────────────────────────────────────────────────

const CORREGIDA = 'corregida tras editar la orden';
const CORRECCION_FALLIDA = 'no salió la corrección tras editar';

/**
 * ¿La orden de venta EXISTE en el ERP? No alcanza con que se haya intentado
 * mandar (`webhook_erp_disparado` se marca aunque el envío falle): si el primer
 * envío no llegó, el taller puede haberla cargado a mano, y "corregirla" la
 * crearía por primera vez, duplicada. Existe si el ERP contestó bien alguna
 * vez: el envío original o una corrección (una corrección que falló o un aviso
 * de "anular a mano" solo se escriben sobre una orden que ya existía).
 */
export function ordenExisteEnERP(s: { webhook_erp_disparado?: boolean | null; webhook_erp_ok?: boolean | null; webhook_erp_detalle?: string | null }): boolean {
    if (!s.webhook_erp_disparado) return false;
    if (s.webhook_erp_ok === true) return true;
    const d = s.webhook_erp_detalle || '';
    return d.startsWith(CORRECCION_FALLIDA) || d.startsWith(AVISO_ERP);
}

export type ResultadoCorreccion = 'no_aplica' | 'reenviada' | 'sin_repuestos' | 'fallo';

/**
 * Se llama cuando cambian los renglones de una orden. Lee todo de la base (no
 * del estado de la pantalla) y solo actúa si la orden de venta YA se había
 * mandado: una orden que nunca salió no se crea desde acá.
 */
export function corregirOrdenEnERP(servicioId: string): Promise<ResultadoCorreccion> {
    return enFila(servicioId, () => corregirAhora(servicioId));
}

async function corregirAhora(servicioId: string): Promise<ResultadoCorreccion> {
    const { data: s, error } = await supabase
        .from('servicios')
        .select('id,taller_id,numero_orden,fecha_finalizacion,webhook_erp_disparado,webhook_erp_ok,webhook_erp_detalle,bicicleta_id,servicio_items(descripcion,precio,categoria)')
        .eq('id', servicioId)
        .maybeSingle();
    if (error || !s || !ordenExisteEnERP(s)) return 'no_aplica';

    const { data: conf } = await supabase
        .from('taller_configuraciones')
        .select('webhook_orden_url')
        .eq('taller_id', s.taller_id)
        .maybeSingle();
    const url = resolveOrdenWebhookUrl(s.taller_id, conf?.webhook_orden_url);
    if (!url) return 'no_aplica';

    const items = (s.servicio_items || []) as ItemOrden[];
    if (itemsQueVanAlERP(items).length === 0) {
        await registrarRespuestaERP(servicioId, false,
            `${AVISO_ERP}Después de mandar la orden de venta se sacaron todos los repuestos (o se marcaron (ML)). La orden sigue en el ERP: hay que anularla a mano en Contabilium.`);
        return 'sin_repuestos';
    }

    let dni: string | null = null, nombre: string | null = null;
    if (s.bicicleta_id) {
        const { data: b } = await supabase
            .from('bicicletas')
            .select('clientes(dni,nombre)')
            .eq('id', s.bicicleta_id)
            .maybeSingle();
        const c: any = Array.isArray((b as any)?.clientes) ? (b as any).clientes[0] : (b as any)?.clientes;
        dni = c?.dni ?? null;
        nombre = c?.nombre ?? null;
    }

    const { vinculos } = await cargarVinculosERP(s.taller_id, items);
    const payload = armarPayloadOrden({
        numeroOrden: s.numero_orden,
        servicioId,
        dni,
        nombre,
        fechaFinalizacion: s.fecha_finalizacion || new Date().toISOString(),
        items,
        vinculos,
    });

    const { ok, detalle } = await mandarOrden(url, payload);
    await registrarRespuestaERP(servicioId, ok,
        ok ? `${CORREGIDA} (${detalle})` : `${CORRECCION_FALLIDA} (${detalle})`);
    return ok ? 'reenviada' : 'fallo';
}
