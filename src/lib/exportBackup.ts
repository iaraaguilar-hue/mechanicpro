import JSZip from 'jszip';

/**
 * UUID de producción de ProBikes — fallback cuando el usuario
 * no está autenticado y no se encuentra taller_id en localStorage.
 */
const PROBIKES_PRODUCTION_TALLER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

/**
 * Intenta resolver el taller_id desde múltiples fuentes,
 * en orden de prioridad:
 * 1. El parámetro explícito (desde authStore, si está logueado)
 * 2. localStorage legacy (configuración vieja del taller)
 * 3. UUID hardcodeado de producción de ProBikes
 */
function resolveTallerId(explicitTallerId?: string | null): string {
    if (explicitTallerId) return explicitTallerId;

    // Intentar leer de localStorage legacy
    try {
        const authStorage = localStorage.getItem('auth-storage');
        if (authStorage) {
            const parsed = JSON.parse(authStorage);
            const storedId = parsed?.state?.taller_id;
            if (storedId) return storedId;
        }
    } catch { /* ignore parse errors */ }

    // Fallback final: UUID fijo de producción
    return PROBIKES_PRODUCTION_TALLER_ID;
}

// ─────────────────────────────────────────────────────────────
// Helper CSV Builder
// ─────────────────────────────────────────────────────────────
function buildCsvString(headers: string[], rows: any[][]): string {
    const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return /[",\n]/.test(str) ? `"${str}"` : str;
    };
    const headerRow = headers.join(',');
    const bodyRows = rows.map(row => row.map(escapeCsv).join(','));
    return [headerRow, ...bodyRows].join('\n');
}

// ─────────────────────────────────────────────────────────────
// FK Validator
// ─────────────────────────────────────────────────────────────
function validateFKs(rows: any[][], fkColumns: number[], tableName: string) {
    for (let i = 0; i < rows.length; i++) {
        for (const colIdx of fkColumns) {
            const val = rows[i][colIdx];
            if (!val || val === 'undefined' || val === 'null') {
                throw new Error(
                    `❌ Validación Final: Celda FK vacía en ${tableName}, ` +
                    `fila ${i + 1}, columna ${colIdx}. Valor: "${val}".`
                );
            }
        }
    }
}

export interface ExportResult {
    clients: number;
    bikes: number;
    services: number;
    items: number;
    reminders: number;
    skippedTotal: number;
}

/**
 * Exporta los datos de localStorage como un ZIP con 5 CSVs relacionales.
 * Usa crypto.randomUUID() con diccionarios de mapeo en memoria.
 * Aplica filtrado en cascada: clientes eliminados → sus bicis/servicios/items/recordatorios descartados.
 *
 * @param tallerId - UUID del taller desde authStore (puede ser null si el usuario no está logueado)
 */
export async function exportBackupToZip(tallerId?: string | null): Promise<ExportResult> {
    const rawData = localStorage.getItem('mechanicPro_db');
    if (!rawData) throw new Error('No hay datos locales para exportar.');

    const db = JSON.parse(rawData);

    // ─────────────────────────────────────────────────────────────
    // 1. INICIALIZACIÓN
    // ─────────────────────────────────────────────────────────────
    const currentTallerId = resolveTallerId(tallerId);

    const clientMap: Record<string, string> = {};
    const bikeMap: Record<string, string> = {};
    const serviceMap: Record<string, string> = {};

    let skippedClients = 0;
    let skippedBikes = 0;
    let skippedServices = 0;
    let skippedItems = 0;
    let skippedReminders = 0;

    const zip = new JSZip();

    // ─────────────────────────────────────────────────────────────
    // 2. CLIENTES — Filtro y Mapeo
    // ─────────────────────────────────────────────────────────────
    const clientsArray = Array.isArray(db.clients) ? db.clients : [];
    const clientsHeaders = ['id', 'taller_id', 'nombre', 'dni', 'telefono', 'email', 'tipo_ciclista'];
    const clientsRows: any[][] = [];

    clientsArray.forEach((c: any) => {
        if (c.isDeleted === true) {
            skippedClients++;
            return;
        }

        const newId = crypto.randomUUID();
        clientMap[String(c.id)] = newId;

        clientsRows.push([
            newId,
            currentTallerId,
            c.name || c.nombre || '',
            c.dni || '',
            c.phone || c.telefono || '',
            c.email || '',
            c.usage_tier || c.tipo_ciclista || ''
        ]);
    });

    // ─────────────────────────────────────────────────────────────
    // 3. BICICLETAS — Filtro en Cascada
    // ─────────────────────────────────────────────────────────────
    const bikesArray = Array.isArray(db.bikes) ? db.bikes : [];
    const bikesHeaders = ['id', 'taller_id', 'cliente_id', 'marca', 'modelo', 'transmision', 'categoria'];
    const bikesRows: any[][] = [];

    bikesArray.forEach((b: any) => {
        const localClientId = String(b.clientId || b.client_id || b.cliente_id || '');
        const ownerId = clientMap[localClientId];

        if (!ownerId) {
            skippedBikes++;
            return;
        }

        const newId = crypto.randomUUID();
        bikeMap[String(b.id)] = newId;

        bikesRows.push([
            newId,
            currentTallerId,
            ownerId,
            b.brand || b.marca || '',
            b.model || b.modelo || '',
            b.transmission || b.transmision || '',
            b.categoria || ''
        ]);
    });

    // ─────────────────────────────────────────────────────────────
    // 4. SERVICIOS — Filtro en Cascada
    // ─────────────────────────────────────────────────────────────
    const servicesArray = Array.isArray(db.services) ? db.services : [];
    const servicesHeaders = ['id', 'taller_id', 'bicicleta_id', 'fecha_ingreso', 'estado', 'tipo_servicio', 'precio_total', 'precio_base', 'notas_mecanico', 'fecha_entrega'];
    const servicesRows: any[][] = [];

    const extraItemsHeaders = ['id', 'taller_id', 'servicio_id', 'descripcion', 'categoria', 'precio'];
    const extraItemsRows: any[][] = [];

    servicesArray.forEach((s: any) => {
        if (s.isDeleted || s.eliminado_en) return;

        const localBikeId = String(s.bikeId || s.bike_id || s.bicicleta_id || '');
        const bId = bikeMap[localBikeId];

        if (!bId) {
            skippedServices++;
            return;
        }

        const newServiceId = crypto.randomUUID();
        serviceMap[String(s.id)] = newServiceId;

        servicesRows.push([
            newServiceId,
            currentTallerId,
            bId,
            s.createdAt || s.created_at || s.fecha_ingreso || new Date().toISOString(),
            s.status || s.estado || 'pending',
            s.serviceType || s.service_type || s.tipo_servicio || 'Service General',
            s.totalPrice || s.precio_total || s.estimatedCost || 0,
            s.basePrice || s.precio_base || 0,
            s.mechanic_notes || s.notas_mecanico || '',
            s.date_out || s.fecha_entrega || ''
        ]);

        // 5. ITEMS / REPUESTOS
        const items = s.extraItems || s.items_extra || [];
        items.forEach((item: any) => {
            extraItemsRows.push([
                crypto.randomUUID(),
                currentTallerId,
                newServiceId,
                item.description || item.descripcion || item.nombre || '',
                item.category || item.categoria || '',
                item.price || item.precio || 0
            ]);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 6. RECORDATORIOS — Filtro en Cascada
    // ─────────────────────────────────────────────────────────────
    const remindersArray = Array.isArray(db.reminders) ? db.reminders : [];
    const remindersHeaders = ['id', 'taller_id', 'bicicleta_id', 'componente', 'fecha_asignacion', 'fecha_vencimiento', 'estado'];
    const remindersRows: any[][] = [];

    remindersArray.forEach((r: any) => {
        const localBikeId = String(r.bike_id || r.bikeId || '');
        const bicicletaUUID = bikeMap[localBikeId];

        if (!bicicletaUUID) {
            skippedReminders++;
            return;
        }

        const dueDate = r.due_date || r.fecha_vencimiento || '';
        const estado = dueDate && new Date(dueDate) < new Date() ? 'Vencido' : 'Pendiente';

        remindersRows.push([
            crypto.randomUUID(),
            currentTallerId,
            bicicletaUUID,
            r.component || r.componente || '',
            r.assigned_date || r.fecha_asignacion || '',
            dueDate,
            estado
        ]);
    });

    // ─────────────────────────────────────────────────────────────
    // VALIDACIÓN FINAL
    // ─────────────────────────────────────────────────────────────
    validateFKs(clientsRows, [0, 1], 'clientes.csv');
    validateFKs(bikesRows, [0, 1, 2], 'bicicletas.csv');
    validateFKs(servicesRows, [0, 1, 2], 'servicios.csv');
    validateFKs(extraItemsRows, [0, 1, 2], 'servicio_items.csv');
    validateFKs(remindersRows, [0, 1, 2], 'recordatorios.csv');

    // ─────────────────────────────────────────────────────────────
    // EMPAQUETADO ZIP
    // ─────────────────────────────────────────────────────────────
    zip.file('clientes.csv', buildCsvString(clientsHeaders, clientsRows));
    zip.file('bicicletas.csv', buildCsvString(bikesHeaders, bikesRows));
    zip.file('servicios.csv', buildCsvString(servicesHeaders, servicesRows));
    zip.file('servicio_items.csv', buildCsvString(extraItemsHeaders, extraItemsRows));
    zip.file('recordatorios.csv', buildCsvString(remindersHeaders, remindersRows));

    const totalSkipped = skippedClients + skippedBikes + skippedServices + skippedItems + skippedReminders;

    // Resumen en consola
    console.log('📦 Backup Export — Resumen:');
    console.log(`   ✅ Clientes:       ${clientsRows.length} exportados (${skippedClients} descartados)`);
    console.log(`   ✅ Bicicletas:     ${bikesRows.length} exportadas (${skippedBikes} descartadas en cascada)`);
    console.log(`   ✅ Servicios:      ${servicesRows.length} exportados (${skippedServices} descartados en cascada)`);
    console.log(`   ✅ Servicio Items: ${extraItemsRows.length} exportados (${skippedItems} descartados)`);
    console.log(`   ✅ Recordatorios:  ${remindersRows.length} exportados (${skippedReminders} descartados en cascada)`);
    console.log(`   🏢 Taller ID:      ${currentTallerId}`);
    if (totalSkipped > 0) {
        console.warn(`   ⚠️ Total descartados por cascada: ${totalSkipped} filas`);
    }

    // Descargar
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MecaniPro_Relational_Backup_${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    return {
        clients: clientsRows.length,
        bikes: bikesRows.length,
        services: servicesRows.length,
        items: extraItemsRows.length,
        reminders: remindersRows.length,
        skippedTotal: totalSkipped
    };
}
