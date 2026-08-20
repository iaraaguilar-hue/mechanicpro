import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ServiceTicketPDF } from '@/components/ServiceTicketPDF';
import { formatOrdenNumber } from '@/lib/formatId';
import { cleanItemName } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { getBase64ImageFromUrl } from '@/lib/pdfGenerator';
import { instanteARLargo, entregaMostrable } from '@/lib/fechaAR';
import { notasParaElCliente } from '@/lib/notasServicio';

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\/?(p|div|li|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const printServiceReport = async (
  job: any,
  clientName: string = 'Cliente',
  bikeModel: string = 'Bicicleta',
  clientDni: string = '',
  clientPhone: string = '',
  shouldDownload: boolean = true
): Promise<Blob | undefined> => {
  if (!job) return;

  const taller = useAuthStore.getState().taller;
  const planActual: string = taller?.plan_actual || 'Pro';
  const isSportPlan = planActual === 'Sport';

  // Sin logo propio (o plan Sport, que lleva la marca del software) va el logo de MECHANIC PRO.
  // Antes caía a /img/logo_full.png, que es el logo de PROBIKES: cada taller sin logo le mandaba
  // a sus clientes un comprobante con la marca de otra bicicletería. (30-jul-2026)
  const LOGO_MP = `${window.location.origin}/logo-mechanic-pro-trim.png`;
  const logoUrlRaw = isSportPlan ? LOGO_MP : (taller?.logo_url || LOGO_MP);

  const primaryColor = taller?.color_primario || '#f25a30';
  const politicaPago = taller?.politica_pago || '';

  let logoBase64 = logoUrlRaw;
  if (logoUrlRaw.startsWith('http')) {
    const b64 = await getBase64ImageFromUrl(logoUrlRaw);
    if (b64) logoBase64 = b64;
  }

  const serviceTypeRaw = job.service_type || job.serviceType || job.tipo_servicio || "General";
  const serviceType = serviceTypeRaw.toUpperCase();

  const descripcionHtml: string = job.descripcion_catalogo || job.descripcion_html || '';
  // 🔴 Por acá NUNCA pasan las notas internas del taller: `notasParaElCliente`
  // ni siquiera mira ese campo, y tiene tests que lo prueban.
  const notesPlain: string = notasParaElCliente(job);

  const basePrice = Number(job.basePrice) || Number(job.precio_base) || 0;
  const extraItems = job.extraItems || job.items_extra || [];

  // Parse labor description lines
  const laborLines: Array<{ text: string; isSubtitle: boolean }> = [];
  const plainSource = isSportPlan
    ? (stripHtml(descripcionHtml) || notesPlain)
    : (stripHtml(descripcionHtml) || notesPlain); // simplified for this component as it only takes text

  if (plainSource) {
    plainSource
      .split('\n')
      .filter((t: string) => t.trim())
      .forEach((t: string) => {
        if (t.trim().endsWith(':')) {
          laborLines.push({ text: t.trim(), isSubtitle: true });
        } else {
          laborLines.push({ text: cleanItemName(t.trim()), isSubtitle: false });
        }
      });
  }

  // Parse extra items
  const extraLabor: Array<{ description: string; price: number }> = [];
  const products: Array<{ description: string; price: number }> = [];

  extraItems.forEach((item: any) => {
    if (item.category === 'part') {
      products.push({
        description: cleanItemName(item.description || item.descripcion),
        price: Number(item.price) || 0,
      });
    } else {
      extraLabor.push({
        description: cleanItemName(item.description || item.descripcion),
        price: Number(item.price) || 0,
      });
    }
  });

  const totalLabor = basePrice + extraLabor.reduce((acc: number, row: any) => acc + (Number(row.price) || 0), 0);
  const totalProducts = products.reduce((acc: number, row: any) => acc + (Number(row.price) || 0), 0);
  const grandTotal = totalLabor + totalProducts;
  
  // 🚩 Fechas: ver `lib/fechaAR.ts`. El ingreso es un INSTANTE (va en hora de
  // Argentina); la entrega la resuelve `entregaMostrable`: si la bici ya se
  // retiró va la fecha REAL, y si no la prometida — siempre diciendo cuál es.
  // Antes acá se hacía `new Date(fecha_entrega).toLocaleDateString('es-AR')`,
  // que le restaba 3 horas a un día de calendario: la orden 311 tenía prometido
  // el 10 y el comprobante decía 9.
  const dateInStr = instanteARLargo(job.fecha_ingreso || job.date_in || new Date().toISOString());
  const entrega = entregaMostrable(
    job.fecha_entregado ?? job.date_delivered,
    job.fecha_entrega ?? job.date_out,
    { largo: true },
  );
  const dateOutStr = entrega ? entrega.texto : null;
  const dateOutLabel = entrega ? entrega.etiqueta : null;

  const safeClientName = clientName.trim().replace(/\s+/g, '_');
  const printFileName = `${safeClientName}_#${formatOrdenNumber(job.numero_orden, job.id)}_Informe_Service`;

  // Build the props for the PDF
  const pdfData = {
    logoUrl: logoBase64,
    primaryColor,
    politicaPago,
    jobNo: formatOrdenNumber(job.numero_orden, job.id),
    dateIn: dateInStr,
    dateOut: dateOutStr,
    dateOutLabel,
    clientName,
    clientDni,
    clientPhone,
    bikeModel,
    serviceType,
    basePrice,
    laborLines,
    extraLabor,
    products,
    totalLabor,
    totalProducts,
    grandTotal,
    notes: notasParaElCliente(job),
    tallerName: taller?.nombre || '',
  };

  // Generate the PDF
  try {
    const doc = React.createElement(ServiceTicketPDF, { data: pdfData });
    const asPdf = pdf();
    asPdf.updateContainer(doc);
    const blob = await asPdf.toBlob();

    // Descarga local temporal
    if (shouldDownload) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${printFileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // Limpieza
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }

    // Preparado para enviar por n8n: se retorna el blob
    return blob;
  } catch (error) {
    console.error("Error crítico renderizando PDF nativo:", error);
    throw error;
  }
};
