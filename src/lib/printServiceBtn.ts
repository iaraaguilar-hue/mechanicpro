import html2pdf from 'html2pdf.js';
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
) => {
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

  // --- 1. LABOR (Mano de Obra) ---
  const laborTitleRow = serviceType !== 'OTRO' && serviceType !== 'OTHER'
    ? `<tr><td style="padding: 8px 0 4px 0; font-weight: 700; font-size: 14px; color: #333;">${serviceType}</td><td style="padding: 8px 0 4px 0; text-align: right; font-weight: 700; font-size: 14px;">$ ${basePrice.toLocaleString('es-AR')}</td></tr>`
    : '';

  let laborDescriptionBlock = '';
  if (!isSportPlan && descripcionHtml && descripcionHtml.trim() !== '<p></p>') {
    laborDescriptionBlock = `
      <tr><td colspan="2" style="padding: 8px 0 4px 0;">
        <div style="font-size: 11px; color: #555; line-height: 1.7; padding-left: 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          <style>
            .labor-desc ul { margin: 4px 0; padding-left: 18px; }
            .labor-desc li { margin-bottom: 2px; }
            .labor-desc strong, .labor-desc b { font-weight: 700; color: #333; }
            .labor-desc em { font-style: italic; }
            .labor-desc p { margin: 3px 0; }
          </style>
          <div class="labor-desc">${descripcionHtml}</div>
        </div>
      </td></tr>`;
  } else {
    const plainSource = isSportPlan
      ? (stripHtml(descripcionHtml) || notesPlain)
      : notesPlain;

    if (plainSource) {
      laborDescriptionBlock = plainSource
        .split('\n')
        .filter((t: string) => t.trim())
        .map((t: string) => {
          if (t.trim().endsWith(':')) {
            return `<tr><td style="padding: 10px 0 2px 0; font-weight: 700; font-size: 11px; color: #555; text-transform: uppercase;">${t}</td><td></td></tr>`;
          }
          const clean = t.replace(/^[-•]\s*/, '');
          return `<tr><td style="padding: 1px 0 1px 15px; font-size: 11px; color: #666; line-height: 1.4;">• ${clean}</td><td></td></tr>`;
        })
        .join('');
    }
  }

  // --- 2. EXTRA LABOR & PRODUCTS ---
  const extraLaborRows: Array<{ description: string; price: number; isExtraLabor: boolean }> = [];
  const productRows: Array<{ description: string; price: number; isProduct: boolean }> = [];

  extraItems.forEach((item: any) => {
    if (item.category === 'part') {
      productRows.push({
        description: item.description || item.descripcion,
        price: Number(item.price) || 0,
        isProduct: true
      });
    } else {
      extraLaborRows.push({
        description: item.description || item.descripcion,
        price: Number(item.price) || 0,
        isExtraLabor: true
      });
    }
  });

  const totalLabor = basePrice + extraLaborRows.reduce((acc: number, row: any) => acc + (Number(row.price) || 0), 0);
  const totalProducts = productRows.reduce((acc: number, row: any) => acc + (Number(row.price) || 0), 0);
  const grandTotal = totalLabor + totalProducts;
  const dateInStr = job.fecha_ingreso ? new Date(job.fecha_ingreso).toLocaleDateString('es-AR') : new Date().toLocaleDateString('es-AR');
  const dateOutStr = job.fecha_entrega ? new Date(job.fecha_entrega).toLocaleDateString('es-AR') : null;

  // --- Premium HTML TEMPLATE ---
  const element = document.createElement('div');
  element.innerHTML = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; background: white; padding: 40px;">
      
      <div style="border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
           <img src="${logoBase64}" alt="Logo" style="max-width: 150px; max-height: 70px; height: auto; width: auto; object-fit: contain;" crossorigin="anonymous" />
        </div>
        <div style="text-align: right;">
           <div style="font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 1px;">Informe de Servicio</div>
           <div style="font-size: 16px; font-weight: 700;">Service ${formatOrdenNumber(job.numero_orden, job.id)}</div>
           <div style="font-size: 14px; font-weight: 400; margin-top: 5px;">Ingreso: ${dateInStr}</div>
           ${dateOutStr ? `<div style="font-size: 13px; font-weight: 600; color: ${primaryColor}; margin-top: 2px;">Entrega: ${dateOutStr}</div>` : ''}
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
        <div>
           <div style="font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Cliente</div>
           <div style="font-size: 20px; font-weight: 600; margin-bottom: 5px; color: #111;">${clientName}</div>
           <div style="font-size: 12px; color: #666;">
             ${clientDni ? `DNI: ${clientDni}` : ''} 
             ${clientDni && clientPhone ? ' • ' : ''} 
             ${clientPhone ? `Tel: ${clientPhone}` : ''}
           </div>
        </div>
        <div style="text-align: right;">
           <div style="font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Bicicleta</div>
           <div style="font-size: 20px; font-weight: 600; margin-bottom: 5px; color: #111;">${bikeModel}</div>
        </div>
      </div>

      <!-- SECTION 1: MANO DE OBRA -->
      <div style="margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
        <span style="font-size: 12px; font-weight: 700; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 1px;">MANO DE OBRA</span>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; page-break-inside: avoid;">
        <tbody>
          ${laborTitleRow}
          ${laborDescriptionBlock}
        </tbody>
      </table>

      <!-- SECTION 1.5: EXTRA LABOR -->
      ${extraLaborRows.length > 0 ? `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; margin-top: 0; border-top: 1px solid #eee;">
            <tbody>
            ${extraLaborRows.map(row => {
    const price = row.price > 0 ? `$ ${row.price.toLocaleString('es-AR')}` : '';
    return `<tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 12px; color: #000; font-weight: 700; text-transform: uppercase;">${cleanItemName(row.description)}</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-family: monospace; font-size: 13px; font-weight: 700; color: #000;">${price}</td>
                </tr>`;
  }).join('')}
            </tbody>
        </table>
      ` : ''}

      <!-- SECTION 2: PRODUCTOS -->
      ${productRows.length > 0 ? `
        <div style="margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 20px;">
            <span style="font-size: 12px; font-weight: 700; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 1px;">REPUESTOS E INSUMOS</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <tbody>
            ${productRows.map(row => {
    const price = row.price > 0 ? `$ ${row.price.toLocaleString('es-AR')}` : '';
    return `<tr>
                    <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-size: 12px; color: #444;">${cleanItemName(row.description)}</td>
                    <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; font-family: monospace; font-size: 12px;">${price}</td>
                </tr>`;
  }).join('')}
            </tbody>
        </table>
      ` : ''}

      <div style="margin-top: 30px; padding-top: 15px; border-top: 2px solid #333; page-break-inside: avoid;">
         <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-size: 14px; font-weight: 700; color: #333;">
              TOTAL MANO DE OBRA 
              ${politicaPago ? `<span style="color: #333; text-transform: uppercase; font-weight: 700; font-size: 11px; margin-left: 8px;">${politicaPago}</span>` : ''}
            </div>
            <div style="font-size: 16px; font-weight: 700; color: #333; font-family: monospace;">$ ${totalLabor.toLocaleString('es-AR')}</div>
         </div>
         <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div style="font-size: 14px; font-weight: 700; color: #333;">TOTAL REPUESTOS</div>
            <div style="font-size: 16px; font-weight: 700; color: #333; font-family: monospace;">$ ${totalProducts.toLocaleString('es-AR')}</div>
         </div>
         <div style="text-align: right; padding-top: 15px; border-top: 2px solid #333;">
            <div style="font-size: 30px; font-weight: 900; color: #333;">$ ${grandTotal.toLocaleString('es-AR')}</div>
         </div>
      </div>

      ${(job.notes || job.mechanic_notes) ? `
        <div style="margin-top: 50px; padding-top: 15px; border-top: 1px solid #eee;">
          <div style="font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Observaciones</div>
          <div style="font-size: 12px; color: #555;">${job.notes || job.mechanic_notes}</div>
        </div>
      ` : ''}

      <div style="margin-top: 60px; text-align: center; font-size: 10px; color: #ccc;">PROBIKES SERVICE CENTER</div>
    </div>
  `;

  const safeClientName = clientName.trim().replace(/\s+/g, '_');
  const printFileName = `${safeClientName}_#${formatOrdenNumber(job.numero_orden, job.id)}_Informe_Service`;

  const opt = {
    margin: 0,
    filename: `${printFileName}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt as any).from(element).save();
};
