import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const getBase64ImageFromUrl = async (imageUrl: string): Promise<string> => {
    if (!imageUrl) return "";
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Error converting image to base64", e);
        return "";
    }
};

export const generatePDF = async (
    serviceData: { service: any, bike: any, client: any },
    brandingData: { logoUrl: string, primaryColor: string }
) => {
    const { service, bike, client } = serviceData;
    const doc = new jsPDF();

    const hexToRgb = (hex: string) => {
        let r = 0, g = 173, b = 247; // Default #00adf7 Map
        if (hex) {
            if (hex.length === 4) {
                r = parseInt(hex[1] + hex[1], 16);
                g = parseInt(hex[2] + hex[2], 16);
                b = parseInt(hex[3] + hex[3], 16);
            } else if (hex.length >= 7) {
                r = parseInt(hex.slice(1, 3), 16);
                g = parseInt(hex.slice(3, 5), 16);
                b = parseInt(hex.slice(5, 7), 16);
            }
        }
        return [r, g, b];
    };

    const [r, g, b] = hexToRgb(brandingData.primaryColor || '#00adf7');

    // --- Header ---
    doc.setFillColor(r, g, b);
    doc.rect(0, 0, 210, 30, "F");
    
    // Inject Logo if exists
    if (brandingData.logoUrl) {
        const base64Logo = await getBase64ImageFromUrl(brandingData.logoUrl);
        if (base64Logo) {
            try {
                // Approximate 20h image size centered in y
                doc.addImage(base64Logo, 'PNG', 14, 5, 40, 20, '', 'FAST');
            } catch(e) {
                console.error("No se pudo inyectar el logo en jsPDF", e);
            }
        }
    }

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("INFORME DE SERVICIO", 105, 20, { align: "center" });

    doc.setTextColor(0, 0, 0);

    // --- Info Section ---
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    let yPos = 40;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Date
    const dateOut = service.date_out
        ? new Date(service.date_out).toLocaleDateString("es-AR")
        : new Date().toLocaleDateString("es-AR");
    doc.text(`Fecha de Salida: ${dateOut}`, margin, yPos);

    yPos += 10;

    // Two Column Layout
    // Col 1: Client
    doc.setFont("helvetica", "bold");
    doc.text("CLIENTE", margin, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(client.name || "", margin, yPos + 5);
    doc.text(client.phone || "", margin, yPos + 10);

    // Col 2: Bike
    const col2X = pageWidth / 2 + 10;
    doc.setFont("helvetica", "bold");
    doc.text("BICICLETA", col2X, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(`${bike.brand || ""} ${bike.model || ""}`, col2X, yPos + 5);
    doc.text(`Transmisión: ${bike.transmission || "N/A"}`, col2X, yPos + 10);

    yPos += 20;

    // --- Service Type Badge ---
    doc.setDrawColor(0, 0, 0);
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(margin, yPos, 60, 10, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.text(`SERVICIO: ${service.service_type?.toUpperCase() || ""}`, margin + 5, yPos + 6.5);

    yPos += 20;

    // --- Checklist ---
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TAREAS REALIZADAS", margin, yPos);
    yPos += 5;

    // Filter only checked items
    const tasks = service.checklist_data
        ? Object.entries(service.checklist_data)
            .filter(([, done]) => done)
            .map(([task]) => [task])
        : [];

    if (tasks.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [],
            body: tasks,
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { cellWidth: 'auto' } },
            margin: { left: margin },
        });
        // @ts-expect-error - jspdf-autotable adds lastAutoTable property
        yPos = doc.lastAutoTable.finalY + 15;
    } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("No se registraron tareas específicas.", margin, yPos + 5);
        yPos += 15;
    }

    // --- Parts and Notes ---

    // Repuestos
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("REPUESTOS E INSUMOS", margin, yPos);
    yPos += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const partsText = service.parts_used || "Ninguno.";
    const splitParts = doc.splitTextToSize(partsText, pageWidth - (margin * 2));
    doc.text(splitParts, margin, yPos);
    yPos += splitParts.length * 5 + 10;

    // Observaciones
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("OBSERVACIONES / DIAGNÓSTICO", margin, yPos);
    yPos += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const notesText = service.mechanic_notes || "Sin observaciones.";
    // Sanitize timestamps: Remove [DD/MM HH:MM] or similar patterns
    const cleanNotes = notesText.replace(/\[\d{1,2}\/\d{1,2}.*?\]\s?/g, "");

    const splitNotes = doc.splitTextToSize(cleanNotes, pageWidth - (margin * 2));
    doc.text(splitNotes, margin, yPos);

    // --- Footer ---
    const footerY = 280;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("Gracias por confiar en nosotros.", margin, footerY);
    doc.text(service.taller_nombre ? `GENERADO CON ${service.taller_nombre.toUpperCase()}` : "GENERADO CON MECHANIC PRO", pageWidth - margin, footerY, { align: "right" });

    doc.save(`Service_${service.id || "Report"}.pdf`);
};
