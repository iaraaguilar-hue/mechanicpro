/**
 * "El precio que no baja" (14-oct-2026, pedido de Pro Bike Salta).
 *
 * Con `talleres.mecanico_no_baja_repuestos` prendido, el mecánico puede SUBIR el precio de
 * un repuesto en la orden pero no bajarlo del precio de lista. El administrador sí.
 *
 * 🔴 El candado real vive en la base (trigger `controlar_precio_repuesto`, migración
 * 20261014120000). Esto es ESPEJO de su regla, solo para avisar ANTES de guardar, al lado
 * del renglón. Si se toca una, se toca la otra:
 *   · el piso de un repuesto en una orden se congela la primera vez que entra a ESA orden
 *     (tabla `servicio_piso_repuestos`); si el admin cobró menos, el piso baja a eso;
 *   · si no hay fila de piso, vale el precio del catálogo REDONDEADO a pesos (el campo del
 *     importe solo acepta pesos enteros) y solo para renglones de repuesto;
 *   · un renglón que ya entró como repuesto sigue con su piso aunque lo pasen a mano de obra;
 *   · sin precio de lista no hay piso: se guarda igual.
 */
import { claveProducto } from '@/lib/buscadorProductos';

export interface PisoOrden { precio_lista: number | null; piso: number | null }

export interface PisoDelRenglon {
    /** El control mira a este renglón (ajuste prendido, tiene nombre y es un repuesto). */
    aplica: boolean;
    /** Precio de lista conocido; null = "sin precio de lista". */
    lista: number | null;
    /** Lo mínimo que puede cobrar un mecánico; null = sin piso. */
    piso: number | null;
}

export function pisoDelRenglon(args: {
    activo: boolean;
    descripcion: string;
    categoria?: string;
    pisosDeLaOrden: Map<string, PisoOrden>;
    catalogo: Map<string, { precio?: number | null }>;
}): PisoDelRenglon {
    const nada = { aplica: false, lista: null, piso: null };
    if (!args.activo) return nada;
    const clave = claveProducto(args.descripcion || '');
    if (!clave) return nada;
    const fila = args.pisosDeLaOrden.get(clave);
    if (fila) {
        return {
            aplica: true,
            lista: fila.precio_lista != null ? Number(fila.precio_lista) : null,
            piso: fila.piso != null ? Number(fila.piso) : null,
        };
    }
    if (args.categoria !== 'part') return nada;
    const p = Number(args.catalogo.get(clave)?.precio);
    const lista = Number.isFinite(p) && p > 0 ? Math.round(p) : null;
    return { aplica: true, lista, piso: lista };
}

const pesos = (n: number) => '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/**
 * El aviso. Si el piso es MENOR que la lista (la orden ya tenía el repuesto cobrado bajo la lista
 * antes de prender el ajuste), el piso es lo que ya cobraba y decir "precio de lista" sería mentir.
 * Espejo del mensaje de la base (migración 20261014200000).
 */
export const textoPisoBajo = (piso: number, lista?: number | null) =>
    lista != null && piso < lista
        ? `Esta orden ya tenía este repuesto a ${pesos(piso)}. Podés cobrar eso o más. Un descuento lo hace el administrador.`
        : `El precio de lista es ${pesos(piso)}. Podés cobrar más, no menos. Un descuento lo hace el administrador.`;

/** El texto para el mecánico si el precio baja del piso; null si está bien. */
export function avisoPrecioBajo(r: PisoDelRenglon, precio: number): string | null {
    if (!r.aplica || r.piso == null) return null;
    return Number(precio || 0) < r.piso ? textoPisoBajo(r.piso, r.lista) : null;
}

/** Marca chica para el administrador: el control está prendido pero este repuesto no tiene piso. */
export const sinPrecioDeLista = (r: PisoDelRenglon) => r.aplica && r.lista == null;

/**
 * Si el error que llegó de la base es el del piso, devuelve el texto limpio (nunca el error
 * crudo con códigos); si es otro error, null.
 */
export function traducirErrorDePiso(mensaje: string | null | undefined): string | null {
    const m = /El precio de lista es \$([\d.,]+)\. Podés cobrar más, no menos/.exec(mensaje || '');
    if (m) return `El precio de lista es $${m[1]}. Podés cobrar más, no menos. Un descuento lo hace el administrador.`;
    const o = /Esta orden ya tenía este repuesto a \$([\d.,]+)\. Podés cobrar eso o más/.exec(mensaje || '');
    if (o) return `Esta orden ya tenía este repuesto a $${o[1]}. Podés cobrar eso o más. Un descuento lo hace el administrador.`;
    return null;
}
