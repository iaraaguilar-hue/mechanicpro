import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ServiceTicketPDF } from '@/components/ServiceTicketPDF';
import { formatOrdenNumber } from '@/lib/formatId';
import { cleanItemName } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { getBase64ImageFromUrl } from '@/lib/pdfGenerator';

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
  clientPhone: string = ''
): Promise<Blob | undefined> => {
  if (!job) return;

  const taller = useAuthStore.getState().taller;
  const planActual: string = taller?.plan_actual || 'Pro';
  const isSportPlan = planActual === 'Sport';

  const logoUrlRaw = isSportPlan
    ? `${window.location.origin}/img/logo_full.png`
    : (taller?.logo_url || `${window.location.origin}/img/logo_full.png`);

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
  const notesPlain: string = job.notes || job.mechanic_notes || '';

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
  
  const dateInStr = job.fecha_ingreso ? new Date(job.fecha_ingreso).toLocaleDateString('es-AR') : new Date().toLocaleDateString('es-AR');
  const dateOutStr = job.fecha_entrega ? new Date(job.fecha_entrega).toLocaleDateString('es-AR') : null;

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
    notes: job.notes || job.mechanic_notes || ''
  };

  // Generate the PDF
  try {
    const doc = React.createElement(ServiceTicketPDF, { data: pdfData });
    const asPdf = pdf();
    asPdf.updateContainer(doc);
    const blob = await asPdf.toBlob();

    // Descarga local temporal
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

    // Preparado para enviar por n8n: se retorna el blob
    return blob;
  } catch (error) {
    console.error("Error crítico renderizando PDF nativo:", error);
    throw error;
  }
};
