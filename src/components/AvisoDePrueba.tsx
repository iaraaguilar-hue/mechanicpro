/**
 * El aviso de la prueba gratuita, arriba del Taller Activo (8-oct-2026).
 *
 * Reemplaza los dos WhatsApp que Iara le mandaba a mano a cada taller en prueba: la
 * ayuda (qué le falta prender) y el cierre (la prueba termina, para seguir escribile).
 * Absorbe el cartel de prueba extendida del 7-oct: un solo aviso de prueba, no dos.
 *
 * Lo que dice lo decide `lib/avisoDePrueba.ts` (con sus tests); acá solo se dibuja.
 * 🔴 Va NEUTRO, en grises: el color del taller es del botón principal de la pantalla
 * ("Recibir Bici"), y un aviso con el color del cliente le compite. Sin planes ni precios.
 * Lo mide `qa_aviso_de_prueba.cjs`.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import type { TallerData } from '@/store/authStore';
import { estadoPrueba } from '@/lib/pruebaGratuita';
import { avisoDePrueba, type OrdenParaElAviso, type ServiceDelMenu } from '@/lib/avisoDePrueba';
import { CONTACTO_NOMBRE, CORREO, TELEFONO, linkWhatsAppContacto } from '@/lib/contactoMechanicPro';

export function AvisoDePrueba({ taller, ordenes }: { taller: TallerData | null; ordenes: OrdenParaElAviso[] }) {
    const navigate = useNavigate();
    const corriendo = !!taller && estadoPrueba(taller).tipo === 'corriendo';

    // El menú de services se pide solo para un taller en prueba: al que paga no le
    // cuesta ni una consulta. Si falla, queda en null y ese ítem no se muestra
    // (no se aconseja a ciegas).
    const [menu, setMenu] = useState<ServiceDelMenu[] | null>(null);
    useEffect(() => {
        if (!corriendo || !taller?.id) return;
        let vivo = true;
        supabase.from('catalogo_servicios').select('nombre, activo').eq('taller_id', taller.id)
            .then(({ data, error }) => { if (vivo && !error) setMenu(data ?? []); });
        return () => { vivo = false; };
    }, [corriendo, taller?.id]);

    const aviso = corriendo ? avisoDePrueba(taller, ordenes, menu) : null;
    if (!aviso) return null;

    const textoWhatsApp = `Hola, te escribo de ${taller?.nombre ?? 'mi taller'} por la prueba de Mechanic Pro.`;

    return (
        <section
            data-aviso-prueba
            aria-label="Prueba gratuita"
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4 text-sm text-slate-700"
        >
            <div className="flex items-start gap-2">
                <CalendarClock className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" />
                <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{aviso.titulo}</p>
                    <p className="mt-0.5">{aviso.texto}</p>
                </div>
            </div>

            {aviso.pendientes.length > 0 && (
                <div className="mt-3 sm:pl-6">
                    <p className="font-medium text-slate-900">Lo que te falta para aprovecharla</p>
                    <ul className="mt-2 grid gap-2">
                        {aviso.pendientes.map(p => (
                            <li
                                key={p.id}
                                data-pendiente={p.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-2.5"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-900">{p.titulo}</p>
                                    <p className="text-slate-600">{p.detalle}</p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 gap-1 border-slate-300 text-slate-800 hover:bg-slate-100 hover:text-slate-900"
                                    onClick={() => navigate(p.ir)}
                                >
                                    {p.boton} <ChevronRight className="h-4 w-4" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {aviso.contacto && (
                <div data-aviso-contacto className="mt-3 border-t border-slate-200 pt-3 sm:pl-6">
                    <p>Para seguir usando Mechanic Pro cuando termine la prueba, escribile a {CONTACTO_NOMBRE}:</p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="whitespace-nowrap">
                            WhatsApp{' '}
                            <a
                                href={linkWhatsAppContacto(textoWhatsApp)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium tabular-nums text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500"
                            >
                                {TELEFONO}
                            </a>
                        </span>
                        <span className="break-all">
                            Correo{' '}
                            <a
                                href={`mailto:${CORREO}`}
                                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500"
                            >
                                {CORREO}
                            </a>
                        </span>
                    </p>
                </div>
            )}
        </section>
    );
}
