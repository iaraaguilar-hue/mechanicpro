/**
 * EL NOMBRE DEL ARCHIVO DEL COMPROBANTE, uno solo para los dos caminos.
 *
 * 🚩 Espejo de `supabase/functions/_shared/nombre_archivo.ts`. Si se toca uno, el otro.
 * (Deno no importa de `frontend/src`, por eso vive dos veces. La paridad se prueba con
 * `tools/paridad_nombre_archivo.cjs`.)
 *
 * 🔴 POR QUE EXISTE (19-sep-2026). El mismo PDF viajaba con dos nombres distintos: al
 * cliente se le bajaba como `VERONICA_NATALIA_BACCARO_#0374_Informe_Service.pdf` y al
 * taller le llegaba por WhatsApp como `Comprobante de service.pdf`, escrito a mano en la
 * Edge Function. Iara, 19-sep: *"me gustaría que el nombre del pdf esté bien puesto, o sea
 * que aparezca con el nombre de archivo igual que cuando le mandamos el pdf al cliente"*,
 * y sobre el nombre viejo: *"no me parece tan estético como se manda"*.
 *
 * Queda: `Probikes - Service 0374 - Veronica Baccaro.pdf`
 *   - el taller primero, que es lo que identifica el archivo en una lista de WhatsApp;
 *   - el numero de orden sin '#' (en un nombre de archivo y en una URL el '#' molesta);
 *   - el cliente en Nombre Propio, y de 3 palabras o mas, la primera y la ultima:
 *     "VERONICA NATALIA BACCARO" -> "Veronica Baccaro". Nadie nombra un archivo con los
 *     tres nombres del documento; el nombre completo sigue entero ADENTRO del comprobante,
 *     que es donde es un dato.
 */

const limpiar = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Lo que ningun sistema de archivos quiere adentro de un nombre. Los acentos SI van. */
const sacarProhibidos = (t: string) => limpiar(t.replace(/[\\/:*?"<>|#]+/g, ' '));

const mayusculaInicial = (p: string) => (p === p.toLowerCase() ? p.charAt(0).toUpperCase() + p.slice(1) : p);

/** "VERONICA NATALIA BACCARO" -> "Veronica Baccaro" · "romina suppa" -> "Romina Suppa" */
export function clienteParaArchivo(nombre?: string | null): string {
    const partes = limpiar(nombre ?? '').split(' ').filter(Boolean);
    if (partes.length === 0) return '';
    // Un nombre TODO EN MAYUSCULA no trae informacion de capitalizacion: se baja entero
    // antes de recomponerlo. Uno que ya viene mezclado ("McDonald") se respeta.
    const normal = partes.map((p) => (p === p.toUpperCase() ? p.toLowerCase() : p)).map(mayusculaInicial);
    return normal.length >= 3 ? `${normal[0]} ${normal[normal.length - 1]}` : normal.join(' ');
}

export function nombreArchivoComprobante(opts: {
    taller?: string | null;
    numeroOrden?: number | null;
    fallbackId?: string | null;
    cliente?: string | null;
}): string {
    const orden = opts.numeroOrden != null
        ? String(opts.numeroOrden).padStart(4, '0')
        : (opts.fallbackId && opts.fallbackId.length >= 6 ? opts.fallbackId.slice(-6).toUpperCase() : '');

    const partes = [
        sacarProhibidos(opts.taller ?? ''),
        orden ? `Service ${sacarProhibidos(orden)}` : 'Comprobante de service',
        sacarProhibidos(clienteParaArchivo(opts.cliente)),
    ].filter(Boolean);

    return `${partes.join(' - ')}.pdf`;
}
