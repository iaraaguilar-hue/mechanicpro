// ─────────────────────────────────────────────────────────────
// Generar el comprobante en PDF y dejarlo con una URL, para poder mandarlo.
//
// POR QUÉ EXISTE: esta secuencia (armar el objeto del service → generar el PDF
// → subirlo al bucket → sacar la URL pública) ya vivía adentro de `notifyCustomer`
// en Workshop.tsx, que es el botón que una persona aprieta. Ahora hace falta lo
// mismo cuando el envío sale SOLO al finalizar o entregar. Copiarla habría dejado
// dos versiones del mismo PDF que se desincronizan en la primera corrección.
//
// POR QUÉ URL Y NO EL ARCHIVO: WhatsApp acepta un documento por link, y el bucket
// `ordenes_trabajo` ya es público. Mandar el PDF entero por la Edge Function
// funcionaría, pero deja el comprobante sin rastro; así queda guardado y se puede
// volver a mirar qué se le mandó a un cliente hace tres meses.
// ─────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase';
import { printServiceReport } from '@/lib/printServiceBtn';

type ServicioFila = any;

/**
 * Arma el objeto que espera el generador del comprobante.
 * Es el mismo mapeo que usa el botón manual: si cambia el PDF, cambia acá.
 */
export function comoJobParaPdf(serviceData: ServicioFila) {
    return {
        id: serviceData.id,
        numero_orden: serviceData.numero_orden,
        bike_id: serviceData.bicicleta_id,
        status: serviceData.estado || '',
        service_type: serviceData.tipo_servicio,
        date_in: serviceData.fecha_ingreso,
        date_out: serviceData.fecha_entrega,
        date_delivered: serviceData.fecha_entregado,
        basePrice: serviceData.precio_base,
        totalPrice: serviceData.precio_total,
        extraItems: serviceData.items_extra?.map((i: any) => ({
            id: i.id || crypto.randomUUID(),
            description: i.descripcion,
            price: i.precio,
            category: i.categoria,
        })),
        mechanic_notes: serviceData.notas_mecanico,
    };
}

/**
 * Genera el comprobante y lo sube. Devuelve la URL pública, o null si algo falla.
 *
 * Nunca tira una excepción: lo llaman los botones de finalizar y entregar, y un
 * fallo del comprobante no puede impedir que el service se cierre. El taller
 * cerró la bici; que el aviso no haya salido es un problema menor y separado.
 */
export async function subirComprobante(
    serviceData: ServicioFila,
    clientName: string,
    bikeModel: string,
    clientPhone: string,
): Promise<string | null> {
    try {
        const blob = await printServiceReport(
            comoJobParaPdf(serviceData), clientName || 'Cliente', bikeModel || 'Bicicleta',
            '', clientPhone || '', false,
        );
        if (!blob) return null;

        const nombre = `orden_${serviceData.id}_${Date.now()}.pdf`;
        const { error } = await supabase.storage
            .from('ordenes_trabajo')
            .upload(nombre, blob, { contentType: 'application/pdf' });
        if (error) { console.error('[comprobante] no se pudo subir:', error.message); return null; }

        const { data } = supabase.storage.from('ordenes_trabajo').getPublicUrl(nombre);
        return data?.publicUrl ?? null;
    } catch (e) {
        console.error('[comprobante] falló la generación:', e);
        return null;
    }
}

/**
 * Dispara los mensajes automáticos que el taller haya configurado para un evento.
 *
 * Se llama después de cerrar o entregar. Devuelve cuántos salieron, para poder
 * avisarlo en pantalla: un envío que ocurre sin que nadie lo vea es indistinguible
 * de uno que no ocurrió, y el taller tiene que saber qué se dijo en su nombre.
 *
 * El PDF se genera SOLO si hay algo que mandar. Antes de eso no se sabe, así que
 * la función pregunta primero.
 */
export async function dispararMensajesAutomaticos(opciones: {
    servicioId: string;
    evento: 'service_finalizado' | 'bici_entregada';
    serviceData: ServicioFila;
    clientName: string;
    bikeModel: string;
    clientPhone: string;
}): Promise<{ enviados: number; aviso?: string } | null> {
    const { servicioId, evento, serviceData, clientName, bikeModel, clientPhone } = opciones;
    try {
        // ¿Hay alguna regla prendida para este evento? Si no, no se genera ni se
        // sube nada: sería trabajo y un archivo en el bucket para nadie.
        const { data: reglas } = await supabase
            .from('automatizaciones_wa')
            .select('id, adjunta_pdf')
            .eq('evento', evento)
            .eq('activa', true);
        if (!reglas?.length) return null;

        const necesitaPdf = reglas.some((r: any) => r.adjunta_pdf);
        const pdfUrl = necesitaPdf
            ? await subirComprobante(serviceData, clientName, bikeModel, clientPhone)
            : null;

        const { data, error } = await supabase.functions.invoke('automatizaciones-wa', {
            body: { servicio_id: servicioId, evento, pdf_url: pdfUrl },
        });
        if (error) { console.error('[automatizaciones]', error); return null; }
        return { enviados: data?.enviados ?? 0, aviso: data?.aviso_pdf ?? undefined };
    } catch (e) {
        console.error('[automatizaciones] falló:', e);
        return null;
    }
}
