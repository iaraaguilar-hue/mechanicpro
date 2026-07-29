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

export function isProbikesTaller(tallerId: string | null | undefined): boolean {
  return tallerId === PROBIKES_TALLER_ID;
}

// Legacy (lo usa ServiceJob.tsx, página vieja): mantiene el comportamiento
// Probikes-only. La página VIVA (Workshop.tsx) usa los resolvers de abajo.
export function shouldFireOrdenWebhook(tallerId: string | null | undefined): boolean {
  return tallerId === PROBIKES_TALLER_ID;
}

// Multi-taller (29-jul-2026): cada taller dispara a SU PROPIO n8n si tiene una
// URL configurada en taller_configuraciones.webhook_orden_url. Sin URL propia,
// SOLO Probikes cae al env global (VITE_N8N_ORDEN_WEBHOOK_URL); cualquier otro
// taller sin config NO dispara (null) — así nunca toca la automatización ajena.
// configUrl = webhook_orden_url leída de taller_configuraciones (puede ser null).
export function resolveOrdenWebhookUrl(
  tallerId: string | null | undefined,
  configUrl: string | null | undefined,
): string | null {
  const own = configUrl?.trim();
  if (own) return own;
  if (isProbikesTaller(tallerId)) return import.meta.env.VITE_N8N_ORDEN_WEBHOOK_URL || null;
  return null;
}

// Ídem para el webhook "bici entregada". configUrl = webhook_entregado_url.
export function resolveEntregadoWebhookUrl(
  tallerId: string | null | undefined,
  configUrl: string | null | undefined,
): string | null {
  const own = configUrl?.trim();
  if (own) return own;
  if (isProbikesTaller(tallerId)) return getEntregadoWebhookUrl();
  return null;
}

// Webhook "bici entregada" (Probikes libro diario, 27-jul-2026).
// Al FINALIZAR el service generamos la orden y bajamos stock (VITE_N8N_ORDEN_WEBHOOK_URL).
// Pero la bici a veces se entrega y se cobra días después. Cuando el cliente RETIRA la
// bici (estado 'delivered') avisamos a la automatización de Probikes para que actualice
// la FECHA de la orden al día real de entrega. Mismo guard que el webhook de orden: solo
// Probikes dispara (otros talleres son autosuficientes).
//
// Vive en la MISMA instancia de n8n que generar-orden (mismo túnel ngrok de Mica), solo
// cambia el path → derivamos la URL del webhook de orden para tener UNA fuente de verdad
// del host: si el túnel cambia, se actualiza una sola variable y ambos webhooks siguen.
// Path fijado por Mica el 27-jul-2026. Override opcional: VITE_N8N_ENTREGADO_WEBHOOK_URL.
const ENTREGADO_WEBHOOK_PATH = '/webhook/mechanic-pro-entregado';

export function getEntregadoWebhookUrl(): string | null {
  const override = import.meta.env.VITE_N8N_ENTREGADO_WEBHOOK_URL;
  if (override) return override;
  const base = import.meta.env.VITE_N8N_ORDEN_WEBHOOK_URL;
  if (!base) return null;
  try {
    return new URL(ENTREGADO_WEBHOOK_PATH, base).toString();
  } catch {
    return null;
  }
}
