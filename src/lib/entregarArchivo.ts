/**
 * CÓMO LLEGA UN PDF A LAS MANOS DEL QUE LO PIDIÓ (21-sep-2026).
 *
 * 🔴 POR QUÉ EXISTE: Alejo (11 a Fondo) avisó que el comprobante de ingreso "desde el celu
 * no hace nada". Todos los PDF de la app se entregaban de una sola forma: un `<a download>`
 * invisible al que se le hace click por código. Eso está bien en una compu —el archivo cae
 * en Descargas y se imprime— y es el peor camino en un teléfono:
 *
 *   · en iOS el archivo se guarda en Archivos sin abrirse: en pantalla no pasa NADA visible,
 *     y el mecánico, que tiene al cliente enfrente, concluye que el botón está roto;
 *   · adentro de un navegador embebido (el que abre WhatsApp o Instagram al tocar un link)
 *     `download` directamente no hace nada, sin error ni aviso;
 *   · y lo que el taller quiere hacer con el papel desde el teléfono casi nunca es "guardarlo":
 *     es IMPRIMIRLO o MANDÁRSELO al cliente. Eso es la hoja de compartir del sistema.
 *
 * LA REGLA: en la compu se descarga (que es lo que se espera de una compu) y en el teléfono
 * se ofrece compartir, que trae imprimir, guardar en Archivos y mandar por WhatsApp en el
 * mismo gesto. Si nada de eso se puede, la función NO se queda callada: devuelve `a_mano`
 * con la URL para que la pantalla ofrezca un enlace de verdad que la persona pueda tocar.
 * Un camino que falla en silencio es indistinguible de un botón roto.
 *
 * El entorno se puede inyectar: así los tests prueban el iPhone, el navegador embebido y la
 * compu sin depender de en qué máquina corren (`entregarArchivo.test.ts`).
 */

export type ModoDeEntrega = 'compartido' | 'descargado' | 'a_mano';

export interface ResultadoEntrega {
    modo: ModoDeEntrega;
    /** Queda viva para que la pantalla pueda ofrecer "Abrirlo". El que la usa la revoca. */
    url: string;
    nombre: string;
}

export interface EntornoDeEntrega {
    esCelular: boolean;
    puedeCompartirArchivos: (archivo: File) => boolean;
    compartir: (datos: { files: File[]; title?: string }) => Promise<void>;
    descargar: (url: string, nombre: string) => void;
    hacerUrl: (blob: Blob) => string;
}

/**
 * Teléfono o tablet. El iPad se declara "Macintosh" desde iPadOS 13, así que se lo reconoce
 * por el dedo: una Mac de escritorio no tiene más de un punto de contacto.
 */
export function esCelular(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const iPadDisfrazado = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
    return /Android|iPhone|iPad|iPod/i.test(ua) || iPadDisfrazado;
}

const entornoReal = (): EntornoDeEntrega => ({
    esCelular: esCelular(),
    puedeCompartirArchivos: (archivo) => {
        const n = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        return typeof n.share === 'function' && typeof n.canShare === 'function' && n.canShare({ files: [archivo] });
    },
    compartir: (datos) => navigator.share(datos),
    descargar: (url, nombre) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); }, 100);
    },
    hacerUrl: (blob) => URL.createObjectURL(blob),
});

/**
 * Deja el PDF en manos del usuario y dice CÓMO lo hizo.
 *
 * Nunca tira: el que llama necesita poder mostrar algo en pantalla en todos los casos, y una
 * excepción acá terminaba en un `console.error` que nadie ve.
 */
export async function entregarArchivo(
    blob: Blob,
    nombre: string,
    entorno: EntornoDeEntrega = entornoReal(),
): Promise<ResultadoEntrega> {
    const url = entorno.hacerUrl(blob);
    const archivo = new File([blob], nombre, { type: blob.type || 'application/pdf' });

    if (entorno.esCelular && entorno.puedeCompartirArchivos(archivo)) {
        try {
            await entorno.compartir({ files: [archivo], title: nombre });
            return { modo: 'compartido', url, nombre };
        } catch (e) {
            // Cerrar la hoja de compartir es una decisión, no una falla: ya lo tuvo en la mano.
            if ((e as Error)?.name === 'AbortError') return { modo: 'compartido', url, nombre };
            // Cualquier otra cosa (Safari suele negar el permiso si la generación tardó más de
            // unos segundos y perdió el gesto que la originó) sigue por el camino de abajo.
        }
    }

    try {
        entorno.descargar(url, nombre);
    } catch {
        return { modo: 'a_mano', url, nombre };
    }

    // 🔴 En el teléfono `descargar` puede no haber hecho NADA y no hay forma de enterarse:
    // no avisa ni con un error ni con un evento. Por eso en el celular la respuesta es
    // `a_mano`: la pantalla tiene que ofrecer igual el enlace para abrirlo. En la compu el
    // archivo cayó en Descargas y ahí termina.
    return { modo: entorno.esCelular ? 'a_mano' : 'descargado', url, nombre };
}
