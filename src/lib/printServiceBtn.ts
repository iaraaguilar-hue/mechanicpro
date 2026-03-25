import html2pdf from 'html2pdf.js';
import { formatOrdenNumber } from '@/lib/formatId';
import { cleanItemName } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { getBase64ImageFromUrl } from '@/lib/pdfGenerator';

const TASKS_SPORT = [
  "• Lavado de bicicleta y todos sus componentes",
  "TRANSMISIÓN:",
  "- Chequeo de desgaste",
  "- Limpieza",
  "- Lubricación",
  "RUEDAS:",
  "- Control de desgaste",
  "- Control de presión",
  "- No incluye centrado ni mantenimiento de maza y body",
  "FRENOS:",
  "- Regulado",
  "- Limpieza de pastillas y discos",
  "- No incluye: purgado ni cambio de líquido o componentes de ser necesario",
  "CAMBIOS:",
  "- Chequeo de desgaste",
  "- Regulación",
  "- Lubricación"
];

const TASKS_EXPERT = [
  "• Lavado de bicicleta y todos sus componentes",
  "TRANSMISIÓN:",
  "- Chequeo de desgaste",
  "- Limpieza profunda en batea de ultrasonido",
  "- Lubricación",
  "RUEDAS:",
  "- Control de desgaste",
  "- Chequeo Líquido Tubeless",
  "- Control de presión",
  "- No incluye centrado ni mantenimiento de maza y body",
  "FRENOS:",
  "- Regulado",
  "- Limpieza de pastillas y discos",
  "- No incluye: purgado ni cambio de líquido o componentes de ser necesario",
  "CAMBIOS:",
  "- Chequeo de desgaste",
  "- Regulación",
  "- Lubricación",
  "CAJA PEDALERA Y JUEGO DE DIRECCIÓN:",
  "- Desarme completo",
  "- Limpieza",
  "- Engrase general de rodamientos"
];

export const printServiceReport = async (
  job: any,
  clientName: string = 'Cliente',
  bikeModel: string = 'Bicicleta',
  clientDni: string = '',
  clientPhone: string = ''
) => {
  if (!job) return;

  const taller = useAuthStore.getState().taller;
  const logoUrlRaw = taller?.logo_url || `${window.location.origin}/img/logo_full.png`;
  const primaryColor = taller?.color_primario || '#f25a30';
  const politicaPago = taller?.politica_pago || '';

  // Transform to base64 to avoid html2canvas taint / CORS issues with Supabase Storage
  let logoBase64 = logoUrlRaw;
  if (logoUrlRaw.startsWith('http')) {
    const b64 = await getBase64ImageFromUrl(logoUrlRaw);
    if (b64) logoBase64 = b64;
  }

  // --- Logic ---
  const serviceTypeRaw = job.service_type || job.serviceType || "General";
  const serviceType = serviceTypeRaw.toUpperCase();
  let serviceTasks: string[] = [];

  if (serviceType.includes('SPORT')) serviceTasks = TASKS_SPORT;
  else if (serviceType.includes('EXPERT')) serviceTasks = TASKS_EXPERT;
  // Logic for "OTRO" or undefined types: Use notes as the breakdown
  else if (job.notes || job.mechanic_notes) {
    const notesStr = job.notes || job.mechanic_notes;
    serviceTasks = notesStr.split('\n').filter((t: string) => t.trim().length > 0);
  }

  const basePrice = Number(job.basePrice) || 0;
  const extraItems = job.extraItems || [];


  // Build Rows
  const laborRows: any[] = [];
  const extraLaborRows: any[] = [];
  const productRows: any[] = [];

  // --- 1. LABOR (Mano de Obra) ---
  // Header Row
  if (serviceType !== 'OTRO' && serviceType !== 'OTHER') {
    laborRows.push({ description: `SERVICE ${serviceType}`, price: basePrice, isHeader: true });
  }

  // Task Rows (Breakdown)
  serviceTasks.forEach(task => {
    // Detect Header vs Item
    if (task.trim().endsWith(':')) {
      laborRows.push({ description: task, isTaskHeader: true });
    } else {
      // Clean up bullet if present for consistent rendering
      const cleanTask = task.replace(/^[-•]\s*/, '');
      laborRows.push({ description: cleanTask, isTask: true, isMainBullet: task.includes('•') });
    }
  });

  // --- 2. EXTRA LABOR & PRODUCTS ---
  extraItems.forEach((item: any) => {
    if (item.category === 'part') {
      productRows.push({
        description: item.description,
        price: Number(item.price) || 0,
        isProduct: true
      });
    } else {
      // It's labor (or undefined category, treated as labor)
      extraLaborRows.push({
        description: item.description,
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

  // --- HTML TEMPLATE (Clean, White, No ID, No Signature) ---
  const element = document.createElement('div');
  element.innerHTML = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; background: white; padding: 40px;">
      
      <div style="border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
           <img src="${logoBase64}" alt="Mecánico" style="max-height: 85px; max-width: 250px; object-fit: contain;" crossorigin="anonymous" />
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

      <!-- SECTION 1: MANO DE OBRA (Standard) -->
      <div style="margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
        <span style="font-size: 12px; font-weight: 700; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 1px;">MANO DE OBRA</span>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <tbody>
          ${laborRows.map(row => {
    const price = row.price > 0 ? `$ ${row.price.toLocaleString('es-AR')}` : '';

    if (row.isHeader) {
      // Main Service Title (e.g. SERVICE SPORT)
      return `<tr><td style="padding: 8px 0 4px 0; font-weight: 700; font-size: 14px; color: #333;">${row.description}</td><td style="padding: 8px 0 4px 0; text-align: right; font-weight: 700; font-size: 14px;">${price}</td></tr>`;
    }
    if (row.isTaskHeader) {
      // Sub-category (e.g. TRANSMISIÓN:)
      return `<tr><td style="padding: 10px 0 2px 0; font-weight: 700; font-size: 11px; color: #555; text-transform: uppercase;">${row.description}</td><td></td></tr>`;
    }
    if (row.isTask) {
      // Specific task item
      const padding = row.isMainBullet ? "5px 0 5px 0" : "1px 0 1px 15px";
      const weight = row.isMainBullet ? "600" : "400";
      return `<tr><td style="padding: ${padding}; font-size: 11px; color: #666; font-weight: ${weight}; line-height: 1.4;">• ${row.description}</td><td></td></tr>`;
    }
    return '';
  }).join('')}
        </tbody>
      </table>

      <!-- SECTION 1.5: EXTRA LABOR (Attached to Labor Section but with separators) -->
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

      <!-- SECTION 2: PRODUCTOS (Only if exists) -->
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

      <div style="margin-top: 30px; padding-top: 15px; border-top: 2px solid #333;">
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
      ` : ''
    }

<div style="margin-top: 60px; text-align: center; font-size: 10px; color: #ccc;" > PROBIKES SERVICE CENTER </div>
  </div>
    `;

  const opt = {
    margin: 0,
    filename: `Informe_Service.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt as any).from(element).save();
};
