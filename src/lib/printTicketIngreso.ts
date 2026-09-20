import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { TicketIngresoPDF } from '@/components/TicketIngresoPDF';
import { formatOrdenNumber } from '@/lib/formatId';
import { stripHtml } from '@/lib/printServiceBtn';
import { getBase64ImageFromUrl } from '@/lib/pdfGenerator';
import { useAuthStore } from '@/store/authStore';
import { instanteARLargo, entregaMostrable } from '@/lib/fechaAR';
import { notasParaElCliente } from '@/lib/notasServicio';
import { nombreArchivoComprobante } from '@/lib/nombreArchivoComprobante';
import { configTicketIngreso } from '@/lib/ticketIngreso';

/**
 * EL TICKET DE INGRESO en A4 para cortar al medio (pedido de Alejo, 11 a Fondo, 10-sep-2026).
 *
 * Arriba va el comprobante del cliente y abajo el checklist del taller. Ver el porqué de cada
 * mitad en `components/TicketIngresoPDF.tsx`.
 */
export const printTicketIngreso = async (
    job: any,
    clientName = 'Cliente',
    bikeModel = 'Bicicleta',
    clientPhone = '',
): Promise<Blob | undefined> => {
    if (!job) return;

    const taller = useAuthStore.getState().taller;
    const esSport = (taller?.plan_actual || 'Pro') === 'Sport';
    const { notasInternas: imprimeNotasInternas } = configTicketIngreso(taller);

    // Mismo criterio que el comprobante: sin logo propio (o plan Sport) va el de Mechanic Pro,
    // nunca el de Probikes. Ver printServiceBtn.ts.
    const LOGO_MP = `${window.location.origin}/logo-mechanic-pro-trim.png`;
    const logoUrlRaw = esSport ? LOGO_MP : (taller?.logo_url || LOGO_MP);
    let logoUrl = logoUrlRaw;
    if (logoUrlRaw.startsWith('http')) {
        const b64 = await getBase64ImageFromUrl(logoUrlRaw);
        if (b64) logoUrl = b64;
    }

    // La entrega del ticket de ingreso es SIEMPRE la prometida, nunca la real: la bici recién
    // entra. `entregaMostrable` devuelve la etiqueta correcta ("estimada") al no pasarle la
    // fecha de entregado. Un día de calendario se muestra tal cual: ver lib/fechaAR.ts.
    const entrega = entregaMostrable(null, job.fecha_entrega ?? job.date_out, {
        largo: false,
        hora: job.hora_entrega ?? job.hora_out,
    });

    // El checklist: lo que incluye el service del catálogo, más los trabajos que se agregaron
    // a mano, más las tareas extra. Es lo que el mecánico va a tildar.
    const delCatalogo = stripHtml(job.descripcion_catalogo || job.descripcion_html || '')
        .split('\n')
        .map((l: string) => l.replace(/^[-•·]\s*/, '').trim())
        .filter(Boolean);
    const itemsMano = (job.items_extra || job.extraItems || [])
        .filter((i: any) => (i.categoria || 'labor') === 'labor')
        .map((i: any) => String(i.descripcion || '').trim())
        .filter(Boolean);
    const tareas = (job.tareas_extra || []).map((t: any) => String(t.texto || '').trim()).filter(Boolean);
    const trabajos = [...new Set([...delCatalogo, ...itemsMano, ...tareas])];

    const precioBase = Number(job.precio_base) || Number(job.basePrice) || 0;
    const extras = (job.items_extra || job.extraItems || [])
        .reduce((a: number, i: any) => a + (Number(i.precio) || 0), 0);
    const presupuesto = precioBase + extras;

    const data = {
        logoUrl,
        primaryColor: taller?.color_primario || '#f25a30',
        tallerName: taller?.nombre || 'Mechanic Pro',
        tallerTelefono: taller?.telefono || taller?.whatsapp || null,
        jobNo: formatOrdenNumber(job.numero_orden, job.id),
        dateIn: instanteARLargo(job.fecha_ingreso || job.date_in || new Date().toISOString()),
        entregaEstimada: entrega ? entrega.texto : null,
        clientName,
        clientPhone,
        // Si trajo SOLO una pieza, es lo que hay que escribir: el cliente no dejó la bici.
        bikeModel: job.pieza ? `${job.pieza} (${bikeModel})` : bikeModel,
        serviceType: String(job.tipo_servicio || job.service_type || 'Service').toUpperCase(),
        trabajos,
        notasCliente: notasParaElCliente(job),
        // 🔴 El ÚNICO lugar del sistema donde las notas internas se imprimen, y solo en la
        // mitad de abajo, que queda en el taller. Cada taller decide si las quiere impresas
        // (Configuración → En cada orden → Ticket de ingreso): si no corta la hoja, el
        // cliente se lleva lo que el taller escribió para adentro.
        notasInternas: imprimeNotasInternas ? String(job.notas_internas || '').trim() : '',
        presupuesto: presupuesto > 0 ? presupuesto : null,
    };

    const doc = React.createElement(TicketIngresoPDF, { data });
    const asPdf = pdf();
    asPdf.updateContainer(doc);
    const blob = await asPdf.toBlob();

    const nombre = nombreArchivoComprobante({
        taller: taller?.nombre,
        numeroOrden: job.numero_orden,
        fallbackId: job.id,
        cliente: clientName,
    }).replace(/\.pdf$/i, '');

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombre} - Ingreso.pdf`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

    return blob;
};
