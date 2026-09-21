import { useEffect, useRef, useState } from 'react';
import { Printer, Check, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { printTicketIngreso } from '@/lib/printTicketIngreso';
import { entregarArchivo, esCelular, type ResultadoEntrega } from '@/lib/entregarArchivo';
import { configTicketIngreso } from '@/lib/ticketIngreso';

/**
 * EL COMPROBANTE DE INGRESO, en todos lados (Alejo, 11 a Fondo, 21-sep-2026).
 *
 * La hoja existe desde el 10-sep y Alejo, que la pidió, no la encontraba: el único
 * botón vivía en el diálogo de FINALIZAR, que el mecánico abre para CERRAR la orden,
 * no para recibir la bici. El tutorial encima prometía que estaba "adentro de la fila",
 * donde no estaba (tourSteps.ts). Desde el 21-sep el botón sale de acá y está en los
 * cuatro momentos en que se necesita: al confirmar el ingreso, en el Taller Activo,
 * adentro de la orden y en el historial.
 *
 * 🔴 Y EN EL TELÉFONO (mismo día, segundo aviso de Alejo: "desde el celu no hace nada"):
 * el PDF ya no se baja a la fuerza con un `<a download>` invisible, que en un teléfono no
 * muestra nada en pantalla. Se ofrece la hoja de compartir del sistema —imprimir, guardar,
 * mandárselo al cliente por WhatsApp— y, si el teléfono no la tiene, queda a la vista un
 * enlace para abrirlo. Un botón que hace algo invisible es un botón roto: ver
 * `lib/entregarArchivo.ts`.
 *
 * Toma SOLO el id del service: los datos salen del store, así que no hay dos armados
 * del mismo PDF que puedan divergir. Se esconde solo si el taller apagó el ticket en
 * Configuración → Preferencias → Comprobante de ingreso.
 */
export function BotonTicketIngreso({
    servicioId,
    variant = 'outline',
    size = 'default',
    soloIcono = false,
    className = '',
    etiqueta = 'Comprobante de ingreso',
}: {
    servicioId: string;
    variant?: 'default' | 'outline' | 'ghost' | 'secondary';
    size?: 'default' | 'sm' | 'icon';
    soloIcono?: boolean;
    className?: string;
    etiqueta?: string;
}) {
    const servicios = useDataStore(s => s.servicios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const taller = useAuthStore(s => s.taller);
    const [estado, setEstado] = useState<'listo' | 'generando' | 'hecho' | 'error'>('listo');
    const [aMano, setAMano] = useState<ResultadoEntrega | null>(null);
    const urlViva = useRef<string | null>(null);

    // La URL del PDF se suelta al desmontar: si no, cada impresión deja el archivo
    // entero en memoria hasta que se recargue la página.
    useEffect(() => () => { if (urlViva.current) URL.revokeObjectURL(urlViva.current); }, []);

    if (!configTicketIngreso(taller).habilitado) return null;

    const imprimir = async (e: React.MouseEvent) => {
        // Vive adentro de filas y tarjetas que abren la orden al hacerles clic.
        e.stopPropagation();
        const servicio = servicios.find(s => s.id === servicioId);
        if (!servicio) { setEstado('error'); return; }
        const bici = bicicletas.find(b => b.id === servicio.bicicleta_id);
        const cliente = bici ? clientes.find(c => c.id === bici.cliente_id) : null;
        setEstado('generando');
        setAMano(null);
        try {
            const hoja = await printTicketIngreso(
                servicio,
                cliente?.nombre || 'Cliente',
                `${bici?.marca ?? ''} ${bici?.modelo ?? ''}`.trim() || 'Bicicleta',
                cliente?.telefono || '',
            );
            if (!hoja) throw new Error('el generador no devolvió la hoja');

            const entrega = await entregarArchivo(hoja.blob, hoja.nombre);
            if (urlViva.current) URL.revokeObjectURL(urlViva.current);
            urlViva.current = entrega.url;

            // En el teléfono no hay forma de saber si la descarga hizo algo: se deja el
            // enlace a la vista hasta que lo toque o se vaya de la pantalla.
            if (entrega.modo === 'a_mano') {
                setAMano(entrega);
            } else {
                // La descarga recién arrancó: soltar la URL en el mismo instante la
                // cancela en algunos navegadores.
                const url = entrega.url;
                urlViva.current = null;
                setTimeout(() => URL.revokeObjectURL(url), 4000);
            }

            setEstado('hecho');
            setTimeout(() => setEstado('listo'), 3500);
        } catch (err) {
            // 🔴 Antes esto moría en la consola y en pantalla no pasaba nada: exactamente
            // lo que Alejo describió. Si falla, se ve que falló y se puede reintentar.
            console.error('No pude generar el comprobante de ingreso:', err);
            setEstado('error');
        }
    };

    const celular = esCelular();
    // La impresora también en el teléfono: el ícono nombra QUÉ es (el papel del ingreso),
    // no cómo se entrega. Un ícono de "compartir" suelto en una tarjeta no dice qué comparte,
    // y el tutorial y la novedad le prometen al taller "el dibujo de la impresora".
    const iconoBase = <Printer className={soloIcono ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />;
    const icono = estado === 'generando'
        ? <Loader2 className={soloIcono ? 'h-4 w-4 animate-spin' : 'mr-2 h-4 w-4 animate-spin'} />
        : estado === 'hecho'
            ? <Check className={soloIcono ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
            : estado === 'error'
                ? <AlertTriangle className={soloIcono ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
                : iconoBase;

    const texto = estado === 'hecho' ? (celular ? 'Listo' : 'Se descargó')
        : estado === 'error' ? 'No salió, probá de nuevo'
            : etiqueta;

    return (
        <>
            <Button
                variant={estado === 'error' ? 'outline' : variant}
                size={soloIcono ? 'icon' : size}
                className={`${className} ${estado === 'error' ? 'border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800' : ''}`}
                onClick={imprimir}
                disabled={estado === 'generando'}
                title="Imprimir el comprobante de ingreso: hoja A4 para cortar al medio, arriba lo que se lleva el cliente y abajo tu checklist"
                aria-label="Imprimir el comprobante de ingreso"
            >
                {icono}
                {!soloIcono && texto}
            </Button>

            {/* El enlace de verdad, para tocar. Es el único camino que ningún teléfono
                puede tragarse en silencio.
                Va en su PROPIO renglón (`basis-full`): metido en la fila de acciones de la
                tarjeta le comía el ancho a "Entregar Bici" y lo partía en dos líneas. Y va en
                gris, no en el color del taller: ese color está reservado para la acción
                principal de la pantalla (regla de Iara, 15-sep-2026). */}
            {aMano && (
                <a
                    href={aMano.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 flex basis-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-700 underline underline-offset-2"
                >
                    <ExternalLink className="h-4 w-4" /> Abrir el comprobante
                </a>
            )}
        </>
    );
}
