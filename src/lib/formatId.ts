/**
 * Formats a UUID into a short, human-readable display ID.
 * Extracts the last 6 characters and converts to uppercase.
 * Example: "fa11eea2-d60b-4669-9a96-a48b443899ec" → "#3899EC"
 */
export function formatDisplayId(uuid: string | undefined | null): string {
    if (!uuid || uuid.length < 6) return `#${uuid || "N/A"}`;
    return `#${uuid.slice(-6).toUpperCase()}`;
}

/**
 * Formats a numero_orden into a zero-padded order number.
 * Falls back to formatDisplayId if numero_orden is not available.
 * Example: 42 → "#0042", undefined → "#3899EC"
 */
export function formatOrdenNumber(numeroOrden: number | undefined | null, fallbackUuid?: string): string {
    if (numeroOrden != null) {
        return `#${String(numeroOrden).padStart(4, '0')}`;
    }
    return formatDisplayId(fallbackUuid);
}

/**
 * numero_orden para el PAYLOAD de los webhooks (libro diario de Mica).
 * Mica matchea por el número PELADO, sin '#' ni ceros a la izquierda (spec 29-jul-2026:
 * ejemplo `{"numero_orden": "123"}`). NO usar formatOrdenNumber acá (ese es para MOSTRAR
 * en pantalla). Fallback consistente para órdenes viejas sin numero_orden: últimos 6 del
 * uuid en mayúscula (mismo valor en finalizar y entregar, para que matcheen entre sí).
 * Example: 42 → "42", undefined → "3899EC"
 */
export function ordenNumberForWebhook(numeroOrden: number | undefined | null, fallbackUuid?: string): string {
    if (numeroOrden != null) {
        return String(numeroOrden);
    }
    if (fallbackUuid && fallbackUuid.length >= 6) {
        return fallbackUuid.slice(-6).toUpperCase();
    }
    return String(fallbackUuid ?? '');
}
