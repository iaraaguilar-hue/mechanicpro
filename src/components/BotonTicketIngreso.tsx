import { useState } from 'react';
import { Printer, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/store/dataStore';
import { useAuthStore } from '@/store/authStore';
import { printTicketIngreso } from '@/lib/printTicketIngreso';
import { configTicketIngreso } from '@/lib/ticketIngreso';

/**
 * EL COMPROBANTE DE INGRESO, en todos lados (Alejo, 11 a Fondo, 21-sep-2026).
 *
 * La hoja existe desde el 10-sep y Alejo, que la pidió, no la encontraba: el único
 * botón vivía en el diálogo de FINALIZAR, que el mecánico abre para CERRAR la orden,
 * no para recibir la bici. El tutorial encima prometía que estaba "adentro de la fila",
 * donde no estaba (tourSteps.ts). Desde hoy el botón sale de acá y está en los cuatro
 * momentos en que se necesita: al confirmar el ingreso, en la fila del taller activo,
 * adentro de la orden y en el historial.
 *
 * Toma SOLO el id del service: los datos salen del store, así que no hay dos armados
 * del mismo PDF que puedan divergir. Se esconde solo si el taller apagó el ticket en
 * Configuración → Preferencias → Ticket de ingreso.
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
    const [estado, setEstado] = useState<'listo' | 'generando' | 'hecho'>('listo');

    if (!configTicketIngreso(taller).habilitado) return null;

    const imprimir = async (e: React.MouseEvent) => {
        // Vive adentro de filas y tarjetas que abren la orden al hacerles clic.
        e.stopPropagation();
        const servicio = servicios.find(s => s.id === servicioId);
        if (!servicio) return;
        const bici = bicicletas.find(b => b.id === servicio.bicicleta_id);
        const cliente = bici ? clientes.find(c => c.id === bici.cliente_id) : null;
        setEstado('generando');
        try {
            await printTicketIngreso(
                servicio,
                cliente?.nombre || 'Cliente',
                `${bici?.marca ?? ''} ${bici?.modelo ?? ''}`.trim() || 'Bicicleta',
                cliente?.telefono || '',
            );
            // El PDF se descarga: sin este cambio de estado el clic no tiene respuesta
            // en pantalla y parece que no pasó nada.
            setEstado('hecho');
            setTimeout(() => setEstado('listo'), 3500);
        } catch (err) {
            console.error('No pude generar el comprobante de ingreso:', err);
            setEstado('listo');
        }
    };

    const icono = estado === 'generando'
        ? <Loader2 className={soloIcono ? 'h-4 w-4 animate-spin' : 'mr-2 h-4 w-4 animate-spin'} />
        : estado === 'hecho'
            ? <Check className={soloIcono ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
            : <Printer className={soloIcono ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />;

    return (
        <Button
            variant={variant}
            size={soloIcono ? 'icon' : size}
            className={className}
            onClick={imprimir}
            disabled={estado === 'generando'}
            title="Imprimir el comprobante de ingreso: hoja A4 para cortar al medio, arriba lo que se lleva el cliente y abajo tu checklist"
            aria-label="Imprimir el comprobante de ingreso"
        >
            {icono}
            {!soloIcono && (estado === 'hecho' ? 'Se descargó' : etiqueta)}
        </Button>
    );
}
