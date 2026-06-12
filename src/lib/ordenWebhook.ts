// Guard multi-taller para el webhook de "generar orden" (baja de stock / ERP).
//
// El fetch del frontend (Workshop.tsx, ServiceJob.tsx) apunta a un n8n GLOBAL
// (VITE_N8N_ORDEN_WEBHOOK_URL) que pertenece a Probikes. Ese payload no lleva
// taller_id, así que sin este guard CUALQUIER taller que finalice un service con
// repuestos dispararía la baja de stock / la orden en el ERP de Probikes.
//
// Regla: solo Probikes dispara este webhook desde el frontend. Cualquier otro
// taller (ej: Once a Fondo) es autosuficiente y NO debe tocar la automatización
// de Probikes. La sincronización ERP per-taller se maneja por el trigger de la
// base (taller_configuraciones.webhook_erp_url), que es seguro por diseño.
export const PROBIKES_TALLER_ID = 'f3844f35-cb20-420d-93e7-a940a50a68a1';

export function shouldFireOrdenWebhook(tallerId: string | null | undefined): boolean {
  return tallerId === PROBIKES_TALLER_ID;
}
