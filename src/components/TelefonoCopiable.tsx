import React from 'react';
import { Copy, Check, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * EL TELEFONO DEL CLIENTE, A UN TOQUE.
 *
 * Lo pidió Alejo, el mecánico de 11 a Fondo, el 10-sep-2026: "poner un acceso directo o una
 * forma mas facil de acceder al numero de telefono del cliente para poder copiarlo facilmente".
 * En el mostrador el mecánico necesita llamar o escribir YA, y hasta hoy el número estaba en la
 * ficha del cliente, a dos pantallas de la orden que tiene abierta.
 *
 * Copiar y abrir WhatsApp, nada más. Sin color: el color del taller va en el botón principal de
 * la pantalla, no en los accesorios.
 */
export const TelefonoCopiable: React.FC<{ telefono?: string | null; className?: string }> = ({ telefono, className }) => {
    const [copiado, setCopiado] = React.useState(false);
    if (!telefono) return null;

    const soloDigitos = telefono.replace(/\D/g, '');

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(telefono);
        } catch {
            // Safari sin permiso de portapapeles: se selecciona en un input escondido.
            const input = document.createElement('input');
            input.value = telefono;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1600);
    };

    return (
        <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
            <span className="tabular-nums">{telefono}</span>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-500 hover:text-slate-900"
                onClick={copiar}
                title={copiado ? 'Copiado' : 'Copiar el numero'}
                aria-label={copiado ? 'Copiado' : 'Copiar el numero'}
            >
                {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <a
                href={`https://wa.me/${soloDigitos}`}
                target="_blank"
                rel="noreferrer"
                title="Escribirle por WhatsApp"
                aria-label="Escribirle por WhatsApp"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-accent hover:text-slate-900"
            >
                <MessageCircle className="h-3.5 w-3.5" />
            </a>
        </span>
    );
};
