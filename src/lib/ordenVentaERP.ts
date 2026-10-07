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
 *
 * LA ORDEN PENDIENTE (5 y 6-oct-2026, sección 5):
 *   La orden de venta baja el stock en el momento en que se CREA, y salía recién
 *   al finalizar: todo lo que tardaba el mecánico, el stock mentía (Iara: una de
 *   las trabas para que Leira y Nacho contraten la integración). Ahora, con el
 *   service en curso, cada cambio de repuestos crea o pisa la orden <N> como
 *   Pendiente, y al finalizar la MISMA <N> pasa a Aceptado. Hasta el 6-oct a la
 *   tarde fueron dos órdenes (la "<N>-T" en taller y la <N> final); desde ese día,
 *   por decisión de Iara y Mica, es una sola.
 */
import { supabase } from '@/lib/supabase';
import { ordenNumberForWebhook } from '@/lib/formatId';
import { resolveOrdenWebhookUrl, isProbikesTaller } from '@/lib/ordenWebhook';
import { claveProducto } from '@/lib/buscadorProductos';
import { grupoDeEstado } from '@/components/StatusBadge';
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

/**
 * Los renglones que viajan en la orden EN TALLER (<N>-T): los de la final MENOS
 * los que todavía no tienen nombre (vacío o solo espacios).
 *
 * POR QUÉ (orden 405 de Probikes, 6-oct-2026, 15:42): el mecánico agregó dos
 * renglones de repuesto y los iba a escribir después; mientras tanto se
 * guardaron vacíos, el en_taller salió con dos productos sin descripción y
 * Contabilium lo rechazó entero (-1). Un renglón sin nombre no reserva nada:
 * no viaja, y si solo quedan renglones vacíos es lo mismo que "sin repuestos".
 * 🚩 A la FINAL no se le saca nada: ahí el candado pre-finalización de "renglón
 * sin nombre" (`chequeoOrdenERP.ts`) frena y avisa antes de mandar.
 */
export function itemsQueVanALaT<T extends ItemOrden>(items: T[] | null | undefined): T[] {
    return itemsQueVanAlERP(items).filter(p => (p.descripcion || '').trim() !== '');
}

/**
 * La huella que dispara la -T: la de `huellaItemsERP` sin los renglones vacíos.
 * Agregar un renglón vacío no manda nada; escribirle el nombre, sí. (La de la
 * final, `huellaItemsERP`, no cambia: la corrección de una orden ya mandada
 * sigue viendo todo.)
 */
export function huellaItemsEnTaller(items: ItemOrden[] | null | undefined): string {
    return huellaItemsERP(itemsQueVanALaT(items));
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

/** Un renglón tal como viaja en el payload (y como queda guardado en `erp_taller`). */
export interface ProductoOrdenERP {
    descripcion: string | null | undefined;
    precio: number;
    cantidad: number;
    sku?: string;
    id_externo?: string;
    nombre_erp?: string;
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
        productos: productos.map((p): ProductoOrdenERP => {
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

/** Prefijo del detalle cuando la automatización contestó que el ERP NO aceptó la orden. */
export const RECHAZADA_ERP = 'el ERP la rechazó';

export interface RespuestaERP {
    ok: boolean;
    detalle: string;
    /**
     * true = la automatización llegó al ERP y el ERP dijo que no: es SEGURO que la
     * orden no cambió. Un HTTP 500 o un corte de red no dicen eso: la orden pudo
     * haberse creado igual, y quien lo lea tiene que suponer lo peor.
     */
    rechazada: boolean;
    /** Lo que devolvió el ERP al rechazar (Contabilium: 0, -1, -99). Como campo, no adentro del texto. */
    codigo?: number | null;
}

/**
 * Qué contestó la automatización (5-oct-2026). Hasta ese día la de Probikes
 * contestaba "recibido" ANTES de hacer nada, así que un 200 solo probaba que el
 * POST llegó (memoria integracion-que-falla-rio-abajo-en-silencio). Ahora contesta
 * al TERMINAR con `{ ok, id_orden, etapa }`, y `ok: false` es que Contabilium la
 * rechazó (-1 / -99). Una automatización que no manda `ok` (la de otro taller) se
 * sigue juzgando por el HTTP, como siempre.
 */
export function leerRespuestaERP(httpOk: boolean, status: number, texto: string): RespuestaERP {
    if (!httpOk) return { ok: false, detalle: `HTTP ${status}`, rechazada: false };
    let cuerpo: any = null;
    try { cuerpo = JSON.parse(texto); } catch { /* sin JSON: se juzga por el HTTP */ }
    if (Array.isArray(cuerpo)) cuerpo = cuerpo[0];
    if (cuerpo && typeof cuerpo === 'object' && cuerpo.ok === false) {
        const crudo = cuerpo.id_orden ?? cuerpo.codigo;
        const codigo = crudo != null && Number.isFinite(Number(crudo)) ? Number(crudo) : null;
        return { ok: false, detalle: `${RECHAZADA_ERP}${codigo != null ? ` (código ${codigo})` : ''}`, rechazada: true, codigo };
    }
    return { ok: true, detalle: `HTTP ${status}`, rechazada: false };
}

export async function mandarOrden(url: string, payload: unknown): Promise<RespuestaERP> {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        signal: AbortSignal.timeout(20000),
    })
        .then(async r => leerRespuestaERP(r.ok, r.status, await r.text().catch(() => '')))
        .catch(e => ({ ok: false, detalle: e?.message || 'no se pudo entregar', rechazada: false }));
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
    // Llegó y el ERP dijo que no: acá no hay "puede que", la orden no existe.
    if (detalle?.startsWith(RECHAZADA_ERP)) {
        return {
            titulo: 'La orden de venta no salió al ERP',
            cuerpo: `La automatización la recibió pero el ERP no la aceptó (${detalle}). Hay que cargar la venta a mano.`,
        };
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

    const { dni, nombre } = await leerCliente(s.bicicleta_id);

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

    // La corrección pisa la orden FINAL (<N>), no la de taller: etapa explícita.
    const { ok, detalle } = await mandarOrden(url, { ...payload, etapa: 'finalizada' satisfies EtapaOrden });
    await registrarRespuestaERP(servicioId, ok,
        ok ? `${CORREGIDA} (${detalle})` : `${CORRECCION_FALLIDA} (${detalle})`);
    return ok ? 'reenviada' : 'fallo';
}

/** DNI y nombre del dueño de la bici, leídos de la base (no de la pantalla). */
async function leerCliente(bicicletaId: string | null | undefined): Promise<{ dni: string | null; nombre: string | null }> {
    if (!bicicletaId) return { dni: null, nombre: null };
    const { data: b } = await supabase
        .from('bicicletas')
        .select('clientes(dni,nombre)')
        .eq('id', bicicletaId)
        .maybeSingle();
    const c: any = Array.isArray((b as any)?.clientes) ? (b as any).clientes[0] : (b as any)?.clientes;
    return { dni: c?.dni ?? null, nombre: c?.nombre ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. La orden PENDIENTE: el stock baja con el primer repuesto (5 y 6-oct-2026)
//
// UNA SOLA ORDEN por service (decisión de Iara y Mica, 6-oct-2026; en n8n desde
// ese día a las 18:12 AR). El MISMO payload de siempre más `etapa`:
//   en_taller       → crea o pisa la orden <N>, Pendiente. Reserva el stock.
//   cancelada       → cancela la MISMA <N> (Cancelado, "- ANULADA") y libera el
//                     stock: se sacaron todos los repuestos o se borró la orden.
//   finalizada      → la MISMA <N> pasa a Aceptado (sin etapa = finalizada).
//   cancelar_taller → SOLO las "<N>-T" del esquema anterior de dos órdenes (5 y
//                     6-oct); si no hay, Contabilium contesta 0 y se da por cerrado.
// 🔴 Toda cancelación lleva los renglones del último en_taller: Contabilium
// rechaza (-1) un Cancelado sin renglones. Por eso se guardan.
// Medido contra Contabilium: crear baja el stock en el acto, pisar con el mismo
// número mueve la reserva, Cancelado la libera, y un en_taller sobre una
// cancelada la reabre (Pendiente) y vuelve a reservar.
// ─────────────────────────────────────────────────────────────────────────────

export type EtapaOrden = 'en_taller' | 'cancelada' | 'cancelar_taller' | 'finalizada';

/** `servicios.erp_taller` (migración 20261005190000). null = nunca hubo orden pendiente. */
export interface ErpTaller {
    /** true = puede haber una orden pendiente reservando stock en el ERP. */
    abierta: boolean;
    /**
     * true = el ERP CONFIRMÓ que la -T existe (un en_taller contestó bien y nada
     * la canceló después). Distingue "abierta seguro" de "abierta por las dudas".
     */
    confirmada?: boolean;
    /** Los renglones del último envío: los necesita la cancelación. */
    productos: ProductoOrdenERP[];
    at: string;
    /** Qué fue el último envío (o el que está saliendo). */
    etapa?: 'en_taller' | 'cancelada' | 'cancelar_taller';
    /** Qué contestó, si falló. La pantalla lo muestra (ver avisoEnTaller). */
    error?: string | null;
    /** true = el ERP dijo que no (seguro que no cambió); false = falla incierta (HTTP 500, red). */
    rechazada?: boolean;
    /** El código del rechazo, si lo hubo. */
    codigo?: number | null;
    /** 'dos' = lo que reserva es una "<N>-T" del esquema anterior (ver esDelEsquemaDeDosOrdenes). */
    esquema?: 'dos';
}

/** Desde cuándo n8n arma UNA sola orden (commit 3de1533f del estudio, 6-oct 18:12 AR). */
export const UNA_SOLA_ORDEN_DESDE = '2026-10-06T21:12:11Z';

/**
 * ¿Lo que reserva este registro es una "<N>-T" del esquema anterior? Sí si lo
 * dice la marca, o si su último envío es de antes del cambio (la 404 del 6-oct).
 * Esa se sigue cancelando con `cancelar_taller`: `cancelada` iría a la <N>.
 */
export function esDelEsquemaDeDosOrdenes(e: ErpTaller | null | undefined): boolean {
    if (!e) return false;
    if (e.esquema === 'dos') return true;
    const t = Date.parse(e.at || '');
    return Number.isFinite(t) && t < Date.parse(UNA_SOLA_ORDEN_DESDE);
}

/**
 * Con qué etapa se cancela (6-oct-2026, una sola orden por service):
 *  · 'cancelada' → la MISMA <N>: se sacaron todos los repuestos de un service en
 *    curso, o se borró la orden (también al borrar su bici). n8n la anula y libera
 *    el stock; si después vuelven a cargar un repuesto, el en_taller la reabre.
 *  · 'cancelar_taller' → con la final MANDADA (lo que va después de la final no
 *    cambia: la <N> ES la venta, y `cancelada` la anularía) o con un registro del
 *    esquema anterior (lo que reserva es la -T). Si no hay -T, contesta 0 y cierra.
 */
export function etapaDeCancelacion(s: { webhook_erp_disparado?: boolean | null; erp_taller?: ErpTaller | null }): 'cancelada' | 'cancelar_taller' {
    return s.webhook_erp_disparado || esDelEsquemaDeDosOrdenes(s.erp_taller) ? 'cancelar_taller' : 'cancelada';
}

/**
 * ¿La automatización de este taller entiende `etapa`? Hoy solo la de Probikes.
 * 🔴 Las demás no la leen (la de Crono es exclusiva suya, de antes del 5-oct): un
 * `en_taller` les llegaría como una venta terminada, una por cada repuesto que
 * se carga. Se habilita taller por taller, como `shouldFireOrdenWebhook`.
 */
export function aceptaOrdenEnTaller(tallerId: string | null | undefined): boolean {
    return isProbikesTaller(tallerId);
}

/** 'cancelar' = cancelar lo que reserve; la etapa (cancelada o cancelar_taller) la elige `etapaDeCancelacion`. */
export type AccionEnTaller = 'en_taller' | 'cancelar' | 'nada';

export interface ServicioParaEnTaller {
    estado?: string | null;
    eliminado_en?: string | null;
    webhook_erp_disparado?: boolean | null;
    erp_taller?: ErpTaller | null;
}

/**
 * ¿Esta orden puede tener una -T? Solo EN CURSO, sin borrar y con la final SIN
 * MANDAR. Se mira `webhook_erp_disparado` y no `ordenExisteEnERP` a propósito:
 * si la final se intentó y falló, el taller pudo haberla cargado a mano, y una -T
 * reservaría el stock dos veces. Una orden reabierta la sigue corrigiendo
 * `corregirOrdenEnERP` (las dos se excluyen por esta condición).
 */
export function laOrdenPuedeTenerT(s: ServicioParaEnTaller): boolean {
    return !s.eliminado_en && grupoDeEstado(s.estado) === 'en_curso' && !s.webhook_erp_disparado;
}

/** Cambia si y solo si cambia algo de lo que la -T tiene adentro. */
function huellaProductos(productos: ProductoOrdenERP[] | null | undefined): string {
    return (productos || [])
        .map(p => JSON.stringify([p.descripcion ?? '', Number(p.precio) || 0, p.cantidad, p.sku ?? '', p.id_externo ?? '', p.nombre_erp ?? '']))
        .sort()
        .join('\n');
}

/**
 * Qué hacer con la -T, según cómo está el service y qué renglones viajarían hoy.
 *
 *  · Solo hay -T si `laOrdenPuedeTenerT`.
 *  · Fuera de eso, una -T que quedó abierta se CANCELA: nunca puede convivir con
 *    la final (reservaría dos veces), y es el reintento de un cierre que falló.
 *  · Sin repuestos que viajen (se sacaron todos, o pasaron a "(ML)"): se cancela.
 *  · Los mismos renglones que ya tiene, CONFIRMADA y sin error pendiente: nada.
 *    Sin confirmar no alcanza (auditor, 6-oct-2026): "abierta, sin confirmar, sin
 *    error" es la anotación previa de un en_taller que nunca contestó (pestaña
 *    cerrada en el medio). Tomarla por sincronizada dejaba el stock sin reservar y
 *    sin cartel; se vuelve a mandar (pisar con lo mismo no duplica nada).
 */
export function accionOrdenEnTaller(s: ServicioParaEnTaller, productos: ProductoOrdenERP[]): AccionEnTaller {
    const erp = s.erp_taller;
    const abierta = !!erp?.abierta;
    if (!laOrdenPuedeTenerT(s) || productos.length === 0) return abierta ? 'cancelar' : 'nada';
    if (abierta && erp?.confirmada && !erp.error && huellaProductos(erp.productos) === huellaProductos(productos)) return 'nada';
    return 'en_taller';
}

/**
 * Un error que ya no dice nada cierto (auditor, 6-oct-2026). Con la -T cerrada y
 * nada que mandar, un error viejo de un en_taller (rechazado antes de que se
 * sacaran todos los repuestos, o antes de finalizar) dejaba el cartel "Repuestos
 * sin reservar" en una orden sin repuestos. Devuelve lo que hay que escribir para
 * limpiarlo, o null si no hay nada que limpiar.
 */
export function erpTallerSinErrorViejo(guardado: ErpTaller | null | undefined): ErpTaller | null {
    if (!guardado || guardado.abierta || !guardado.error) return null;
    return { ...guardado, ...SIN_ERROR };
}

type DatosEtapa = Omit<DatosOrdenERP, 'items' | 'vinculos'>;

/**
 * La cancelación lleva los renglones GUARDADOS, no los de ahora: al cancelar
 * porque se sacaron todos los repuestos, los de ahora son cero, y Contabilium
 * rechaza un Cancelado sin renglones.
 */
export function armarPayloadCancelacion(d: DatosEtapa, guardado: Pick<ErpTaller, 'productos'>, etapa: 'cancelada' | 'cancelar_taller' = 'cancelar_taller') {
    const productos = guardado.productos || [];
    return {
        numero_orden: ordenNumberForWebhook(d.numeroOrden ?? undefined, d.servicioId),
        dni_cliente: d.dni || 'Sin DNI',
        nombre_cliente: d.nombre || 'Cliente',
        fecha_finalizacion: d.fechaFinalizacion,
        nombre_producto: productos.map(p => p.descripcion).join(', '),
        productos,
        total_service: productos.reduce((s, p) => s + (Number(p.precio) || 0), 0),
        etapa: etapa satisfies EtapaOrden,
    };
}

/** Sin error: lo que se escribe cuando un envío salió bien (o todavía no contestó). */
const SIN_ERROR = { error: null, rechazada: false, codigo: null } as const;

/**
 * Lo que se escribe ANTES de mandar un en_taller (hallazgo del auditor, 5-oct-2026).
 * El POST sale con `keepalive`: si el mecánico guarda y cierra la pestaña en los
 * 2 a 4 s que tarda la respuesta, la -T se crea igual pero nadie llega a anotarla,
 * y al finalizar no había nada que cancelar: stock reservado para siempre. Anotada
 * antes, en el peor caso queda "abierta sin confirmar" y el cierre (o el
 * reconciliador) la cancela. Si ya había una confirmada, sigue confirmada: existe
 * seguro, con los renglones viejos o con estos.
 */
export function erpTallerAntesDeMandar(previo: ErpTaller | null | undefined, productos: ProductoOrdenERP[], at: string): ErpTaller {
    return { abierta: true, confirmada: !!(previo?.abierta && previo.confirmada), productos, at, etapa: 'en_taller', ...SIN_ERROR };
}

/**
 * El único rechazo que prueba que la -T NO existe: medido contra Contabilium el
 * 5-oct, cancelar una -T que nunca se creó devuelve 0 y el stock no se mueve. El
 * -1 se midió como "Cancelado sin renglones", que no dice nada de si existe: no
 * entra. Cualquier otro código se trata como "puede seguir reservando".
 */
export const CODIGO_NO_EXISTE = 0;

/**
 * Lo que queda escrito después de un envío. `previo` es lo que había ANTES de
 * anotar el envío. Si salió bien, es lo que se mandó. Si falló, se supone lo PEOR
 * para el stock:
 *  · un en_taller RECHAZADO no cambió nada: queda lo de antes;
 *  · un en_taller que falló sin saber cómo (HTTP 500, red) pudo haber creado la
 *    -T: queda abierta (sin confirmar), para que el cierre la cancele igual;
 *  · una cancelación que falló sigue abierta, con sus renglones, para reintentar.
 *    SALVO el rechazo con CODIGO_NO_EXISTE: la -T no existe, así que no hay nada
 *    reservado. Vale aunque haya estado CONFIRMADA (auditor, 6-oct-2026): una
 *    confirmada que después da 0 es una que alguien anuló a mano en Contabilium, y
 *    dejarla abierta era un cartel rojo fijo y una cancelación por cada carga de
 *    cada equipo, para siempre.
 */
export function erpTallerTrasEnvio(
    previo: ErpTaller | null | undefined,
    etapa: 'en_taller' | 'cancelada' | 'cancelar_taller',
    productos: ProductoOrdenERP[],
    r: Pick<RespuestaERP, 'ok' | 'detalle' | 'rechazada' | 'codigo'>,
    at: string,
): ErpTaller {
    const abiertaSegura = !!(previo?.abierta && previo.confirmada);
    // Si no cambió nada, un registro del esquema anterior lo sigue siendo (su fecha
    // nueva no lo tiene que hacer pasar por uno de la orden única).
    const sigueViejo = esDelEsquemaDeDosOrdenes(previo) ? { esquema: 'dos' as const } : {};
    if (r.ok) {
        const abierta = etapa === 'en_taller';
        return { abierta, confirmada: abierta, productos, at, etapa, ...SIN_ERROR };
    }
    const fallo = { error: r.detalle, rechazada: !!r.rechazada, codigo: r.codigo ?? null };
    if (etapa === 'en_taller') {
        return r.rechazada
            ? { abierta: !!previo?.abierta, confirmada: abiertaSegura, productos: previo?.productos ?? [], at, etapa, ...fallo, ...sigueViejo }
            : { abierta: true, confirmada: abiertaSegura, productos, at, etapa, ...fallo };
    }
    const guardados = previo?.productos?.length ? previo.productos : productos;
    if (r.rechazada && r.codigo === CODIGO_NO_EXISTE) {
        return { abierta: false, confirmada: false, productos: guardados, at, etapa, ...SIN_ERROR };
    }
    return { abierta: true, confirmada: abiertaSegura, productos: guardados, at, etapa, ...fallo, ...sigueViejo };
}

export interface ServicioConEnTaller extends ServicioParaEnTaller {
    id?: string;
    numero_orden?: number | null;
    fecha_finalizacion?: string | null;
}

/**
 * Cuánto se espera antes de avisar que una -T sigue abierta en una orden que ya
 * no la necesita. Al finalizar o borrar, la cancelación tarda 2 a 4 s en volver:
 * sin esta espera, cada cierre sano mostraría un cartel rojo un instante, y un
 * cartel que salta en cada operación sana se deja de leer.
 */
export const ESPERA_AVISO_MS = 2 * 60 * 1000;

/**
 * El cartel de la -T, el mismo en el Taller Activo, en el Historial y para las
 * borradas. null = no hay nada que decir.
 */
export function avisoEnTaller(s: ServicioConEnTaller, ahora: number = Date.now()): { titulo: string; cuerpo: string } | null {
    const erp = s.erp_taller;
    if (!erp) return null;
    // Una sola orden: el número es el de la orden de venta. "-T" solo para lo que
    // reserva una del esquema anterior.
    const viejo = esDelEsquemaDeDosOrdenes(erp);
    const n = `${ordenNumberForWebhook(s.numero_orden ?? undefined, s.id)}${viejo ? '-T' : ''}`;
    const puede = laOrdenPuedeTenerT(s);

    // Una orden pendiente que ya no debería estarlo, o una cancelación que falló.
    // 🔴 Con la final mandada, la <N> ES la venta: nunca se pide anularla (salvo una -T vieja).
    const cancelacionFallida = !!erp.error && (erp.etapa === 'cancelada' || (erp.etapa === 'cancelar_taller' && viejo));
    const colgada = !puede && (!s.webhook_erp_disparado || viejo);
    if (erp.abierta && (colgada || cancelacionFallida)) {
        const desde = Date.parse(s.eliminado_en || s.fecha_finalizacion || '');
        const recien = !erp.error && Number.isFinite(desde) && ahora - desde < ESPERA_AVISO_MS;
        if (recien) return null;
        return {
            titulo: `Anular la orden ${n} a mano en Contabilium`,
            cuerpo: `La orden de venta ${n} sigue pendiente en el ERP y reserva el stock de sus repuestos${erp.error ? ` (la cancelación falló: ${erp.error})` : ''}, pero esta orden ya no la necesita. MP vuelve a intentar cancelarla sola; si este aviso sigue, hay que anular la orden ${n} a mano en Contabilium.`,
        };
    }

    // El en_taller falló con la orden todavía en el taller.
    if (puede && erp.etapa === 'en_taller' && erp.error) {
        if (erp.rechazada) {
            return {
                titulo: 'Repuestos sin reservar en el ERP',
                cuerpo: `El ERP no aceptó la orden ${n} (${erp.error}), así que el stock de estos repuestos no bajó. Se vuelve a intentar al cambiar los repuestos, y al finalizar la orden de venta sale igual.`,
            };
        }
        return {
            titulo: 'Reserva de repuestos sin confirmar en el ERP',
            cuerpo: `No se pudo confirmar si la orden ${n} quedó en el ERP (${erp.error}): el stock puede haber bajado o no. Se vuelve a intentar al cambiar los repuestos, y al finalizar la orden de venta sale igual.`,
        };
    }
    return null;
}

export type ResultadoEnTaller = 'no_aplica' | 'nada' | 'abierta' | 'cancelada' | 'fallo';

/**
 * Se llama cuando cambian los renglones (o se crea la orden con repuestos).
 * Lee TODO de la base, igual que la corrección, y va en la misma fila: un
 * en_taller y la final de la misma orden nunca se adelantan entre sí.
 */
export function sincronizarOrdenEnTaller(servicioId: string): Promise<ResultadoEnTaller> {
    return enFila(servicioId, () => enTallerAhora(servicioId, false));
}

/**
 * Cancela la -T si quedó abierta. Al finalizar (DESPUÉS de la final, en la misma
 * fila), al borrar la orden y desde el reconciliador. Nunca crea nada.
 */
export function cerrarOrdenEnTaller(servicioId: string): Promise<ResultadoEnTaller> {
    return enFila(servicioId, () => enTallerAhora(servicioId, true));
}

/**
 * Al finalizar: la final (si sale) y DESPUÉS, en la misma fila, el cierre de la
 * -T. Juntas en una función para que el orden sea una garantía y no una
 * casualidad de la pantalla (auditor, 5-oct-2026):
 *  · la cancelación nunca sale antes que la final: entre las dos, el stock no
 *    queda libre;
 *  · la cancelación sale aunque la final no (sin repuestos, reabierta, taller sin
 *    webhook).
 * `cerrar` se puede cambiar solo para probarlo.
 */
export function mandarFinalYCerrarEnTaller(
    servicioId: string,
    mandarFinal: (() => Promise<unknown>) | null,
    cerrarT: boolean,
    cerrar: (id: string) => Promise<ResultadoEnTaller> = cerrarOrdenEnTaller,
): { final: Promise<unknown> | null; cierre: Promise<ResultadoEnTaller> | null } {
    const final = mandarFinal ? enFila(servicioId, mandarFinal) : null;
    const cierre = cerrarT ? cerrar(servicioId) : null;
    return { final, cierre };
}

/** Lo que el reconciliador lee de cada orden con una -T abierta. */
export interface FilaEnTaller extends ServicioConEnTaller {
    id: string;
}

const COLUMNAS_EN_TALLER = 'id,numero_orden,estado,eliminado_en,webhook_erp_disparado,fecha_finalizacion,erp_taller';

/**
 * Qué órdenes tienen una -T abierta que ya no debería estarlo: finalizadas,
 * entregadas, borradas o con la final mandada. Son las que quedaron colgadas
 * porque la pestaña se cerró antes de cancelar (la cancelación espera en la fila
 * detrás de la final) o porque el cierre falló.
 */
export function ordenesParaReconciliar(filas: FilaEnTaller[]): string[] {
    return filas.filter(f => f.erp_taller?.abierta && !laOrdenPuedeTenerT(f)).map(f => f.id);
}

/**
 * El reconciliador (auditor, 5-oct-2026): corre al cargar los servicios del
 * taller (Probikes tiene MP abierto todo el día) y cancela toda -T colgada.
 * Cancelar dos veces no hace daño: medido contra Contabilium el 6-oct, una
 * segunda cancelación de una -T ya cancelada contesta bien y no mueve el stock.
 * Devuelve cómo quedaron las que tocó (las borradas no están en el store y la
 * pantalla las muestra aparte).
 */
export async function reconciliarOrdenesEnTaller(tallerId: string | null | undefined): Promise<FilaEnTaller[]> {
    if (!tallerId || !aceptaOrdenEnTaller(tallerId)) return [];
    try {
        const { data, error } = await supabase
            .from('servicios')
            .select(COLUMNAS_EN_TALLER)
            .eq('taller_id', tallerId)
            .eq('erp_taller->>abierta', 'true');
        if (error || !data?.length) return [];
        const ids = ordenesParaReconciliar(data as FilaEnTaller[]);
        if (!ids.length) return [];
        await Promise.all(ids.map(id => cerrarOrdenEnTaller(id)));
        const { data: despues } = await supabase.from('servicios').select(COLUMNAS_EN_TALLER).in('id', ids);
        return (despues || []) as FilaEnTaller[];
    } catch (e: any) {
        console.error('[ERP] Reconciliar órdenes en taller:', e?.message);
        return [];
    }
}

/**
 * Antes de borrar una BICI (auditor, 6-oct-2026). Borrarla borra EN CASCADA sus
 * órdenes: medido en la base ese día con una bici y una orden de usar y tirar en
 * el Demo, la orden desapareció. Con la orden se va el registro de su orden
 * pendiente, que quedaría reservando stock donde ni el reconciliador la
 * encuentra. Se cancelan ANTES de borrar (`cancelada`, como al borrar la orden).
 * Devuelve las que no se pudieron cerrar.
 */
export async function cerrarOrdenesEnTallerDeLaBici(bicicletaId: string): Promise<{ pudoLeer: boolean; sinCerrar: string[] }> {
    try {
        const { data, error } = await supabase
            .from('servicios')
            .select('id')
            .eq('bicicleta_id', bicicletaId)
            .eq('erp_taller->>abierta', 'true');
        if (error) return { pudoLeer: false, sinCerrar: [] };
        const ids = (data || []).map((f: { id: string }) => f.id);
        if (!ids.length) return { pudoLeer: true, sinCerrar: [] };
        await Promise.all(ids.map(id => cerrarOrdenEnTaller(id)));
        const { data: despues, error: e2 } = await supabase.from('servicios').select(COLUMNAS_EN_TALLER).in('id', ids);
        if (e2) return { pudoLeer: false, sinCerrar: [] };
        const sinCerrar = ((despues || []) as FilaEnTaller[])
            .filter(f => f.erp_taller?.abierta)
            .map(f => `${ordenNumberForWebhook(f.numero_orden ?? undefined, f.id)}${esDelEsquemaDeDosOrdenes(f.erp_taller) ? '-T' : ''}`);
        return { pudoLeer: true, sinCerrar };
    } catch {
        return { pudoLeer: false, sinCerrar: [] };
    }
}

/** Una orden con su -T, leída de la base (para la que se acaba de borrar). */
export async function leerOrdenEnTaller(servicioId: string): Promise<FilaEnTaller | null> {
    const { data } = await supabase.from('servicios').select(COLUMNAS_EN_TALLER).eq('id', servicioId).maybeSingle();
    return (data as FilaEnTaller | null) ?? null;
}

async function enTallerAhora(servicioId: string, soloCerrar: boolean): Promise<ResultadoEnTaller> {
    try {
        const { data: s, error } = await supabase
            .from('servicios')
            .select('id,taller_id,numero_orden,estado,eliminado_en,webhook_erp_disparado,erp_taller,bicicleta_id,servicio_items(descripcion,precio,categoria)')
            .eq('id', servicioId)
            .maybeSingle();
        if (error || !s || !aceptaOrdenEnTaller(s.taller_id)) return 'no_aplica';
        const guardado = (s.erp_taller ?? null) as ErpTaller | null;

        // Primero la decisión (lo más común es "nada"), después lo que cuesta ir a buscar.
        const items = (s.servicio_items || []) as ItemOrden[];
        let vinculos = new Map<string, VinculoProducto>();
        let accion: AccionEnTaller = guardado?.abierta ? 'cancelar' : 'nada';
        if (!soloCerrar) {
            vinculos = (await cargarVinculosERP(s.taller_id, items)).vinculos;
            const productos = armarPayloadOrden({ numeroOrden: s.numero_orden, servicioId, dni: null, nombre: null, fechaFinalizacion: '', items: itemsQueVanALaT(items), vinculos }).productos;
            accion = accionOrdenEnTaller(s, productos);
        }
        if (accion === 'nada') {
            // Nada que mandar. Si quedó un error viejo con la -T cerrada (un
            // en_taller rechazado antes de finalizar o de sacar todos los
            // repuestos), ya no dice nada cierto: se limpia.
            const limpio = erpTallerSinErrorViejo(guardado);
            if (limpio) await supabase.from('servicios').update({ erp_taller: limpio }).eq('id', servicioId);
            return 'nada';
        }

        const { data: conf } = await supabase
            .from('taller_configuraciones')
            .select('webhook_orden_url')
            .eq('taller_id', s.taller_id)
            .maybeSingle();
        const url = resolveOrdenWebhookUrl(s.taller_id, conf?.webhook_orden_url);
        if (!url) return 'no_aplica';

        const { dni, nombre } = await leerCliente(s.bicicleta_id);
        const datos: DatosEtapa = {
            numeroOrden: s.numero_orden,
            servicioId,
            dni,
            nombre,
            // La fecha de la orden es la de su creación: pisarla no la cambia.
            fechaFinalizacion: new Date().toISOString(),
        };
        // Cancelar: `cancelada` (la misma <N>) si se sacaron los repuestos o se borró
        // la orden; `cancelar_taller` (solo -T viejas) después de la final.
        const etapa = accion === 'en_taller' ? 'en_taller' as const : etapaDeCancelacion(s);
        const payload = accion === 'en_taller'
            ? { ...armarPayloadOrden({ ...datos, items: itemsQueVanALaT(items), vinculos }), etapa: 'en_taller' satisfies EtapaOrden }
            : armarPayloadCancelacion(datos, guardado ?? { productos: [] }, etapa as 'cancelada' | 'cancelar_taller');

        // Se anota ANTES de mandar (ver erpTallerAntesDeMandar). Si no se puede
        // anotar, no se manda: una -T que nadie sabe que existe es la que queda
        // reservando stock para siempre.
        if (accion === 'en_taller') {
            const { error: eAntes } = await supabase.from('servicios')
                .update({ erp_taller: erpTallerAntesDeMandar(guardado, payload.productos, new Date().toISOString()) })
                .eq('id', servicioId);
            if (eAntes) {
                console.error('[ERP] No pude anotar la orden en taller antes de mandarla:', eAntes.message);
                return 'fallo';
            }
        }

        const r = await mandarOrden(url, payload);
        if (!r.ok) console.error(`[ERP] La orden pendiente (${etapa}) no salió —`, r.detalle);

        const nuevo = erpTallerTrasEnvio(guardado, etapa, payload.productos, r, new Date().toISOString());
        const { error: e2 } = await supabase.from('servicios').update({ erp_taller: nuevo }).eq('id', servicioId);
        if (e2) console.error('[ERP] No pude registrar la orden en taller:', e2.message);

        // Una cancelación se juzga por cómo quedó: un 0 ("no existe") la deja cerrada.
        if (accion === 'cancelar') return nuevo.abierta ? 'fallo' : 'cancelada';
        if (!r.ok) return 'fallo';

        // Dos equipos (auditor, 5-oct-2026): mientras este en_taller viajaba, otra
        // compu pudo BORRAR la orden, y su cierre leyó la -T todavía sin crear. Se
        // relee y, si está borrada, se cancela en esta misma tarea (sin pasar por
        // la fila: esperaría a esta misma tarea).
        // 🔴 Si está FINALIZADA (o con la final por salir) NO se cancela acá
        // (auditor, 6-oct-2026): guardar un repuesto y finalizar en los 2 a 4 s
        // siguientes encolaba la final DETRÁS de este envío, y cancelar ahora
        // dejaba el stock libre hasta que llegaba la final. Esa -T la cancela el
        // cierre que va después de la final en la misma fila; si la finalizó otra
        // compu, o se cerró la pestaña, el reconciliador en la próxima carga.
        const { data: ahora } = await supabase
            .from('servicios')
            .select('eliminado_en')
            .eq('id', servicioId)
            .maybeSingle();
        if (ahora?.eliminado_en) return enTallerAhora(servicioId, true);
        return 'abierta';
    } catch (e: any) {
        console.error('[ERP] Orden en taller:', e?.message);
        return 'fallo';
    }
}
