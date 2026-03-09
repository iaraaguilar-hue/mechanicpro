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
