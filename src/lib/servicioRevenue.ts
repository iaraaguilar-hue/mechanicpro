// ─────────────────────────────────────────────────────────────
// MODELO DE FACTURACIÓN (única fuente de verdad)
//
// Facturación de un servicio = mano de obra (precio_base) + TODOS los items
// (repuestos y otros). `precio_total` NO se usa para facturar: en algunos
// registros ya viene con los repuestos sumados, así que re-sumar los items lo
// duplica (era el bug del período anterior: contaba los repuestos 2×).
//
// Vivía dentro de Metrics.tsx. Se mudó acá (5-ago-2026) porque el candado de
// "orden en $0" de Workshop necesita la MISMA definición: si el aviso mirara
// `precio_total` y las métricas miraran base+items, podrían contradecirse y el
// taller vería un número distinto en cada pantalla.
// ─────────────────────────────────────────────────────────────
export function servicioRevenue(s: any): { facturacion: number; labor: number; parts: number } {
    let labor = Number(s?.precio_base) || 0;
    let parts = 0;
    const items = Array.isArray(s?.servicio_items)
        ? s.servicio_items
        : (Array.isArray(s?.items_extra) ? s.items_extra : []);
    for (const item of items) {
        const itemPrecio = Number(item?.precio) || 0;
        if (item?.categoria === 'part' || item?.categoria === 'producto' || item?.categoria === 'repuesto') {
            parts += itemPrecio;
        } else {
            labor += itemPrecio;
        }
    }
    return { facturacion: labor + parts, labor, parts };
}
