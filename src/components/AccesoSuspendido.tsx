/**
 * La pantalla de un taller con el acceso cortado (25-sep-2026, Leira Bikes).
 *
 * Reemplaza la app entera: no hay menú, ni datos, ni nada que tocar; solo
 * cerrar sesión. Los datos del taller NO se tocan (ver la migración
 * 20260925120000_acceso_suspendido.sql).
 *
 * 🔴 Tono (2-oct-2026, Rami): tiene que leerse como un AVISO DEL SISTEMA, no como
 * una persona que le cortó el acceso al taller, para que no genere rechazo. Por eso
 * va impersonal (ni usted ni vos), dice que el corte fue automático y por qué
 * regla, y la persona aparece recién al final, como el contacto para seguir o
 * consultar. No se nombran planes ni precios acá. Y va en grises, sin el color del taller.
 * 🔴 "Automático" se dice SOLO cuando lo cortó el reloj de la prueba: un corte a
 * mano usa el texto genérico, que no lo afirma.
 */
import type { TallerData } from '@/store/authStore';
import { cortePorPrueba, diaYMes, fechaDelCorte } from '@/lib/pruebaGratuita';

// El celular de Iara (factura de Personal, portfolio de Meta) y el mail de la app.
const TELEFONO = '+54 9 11 2567-7858';
const TELEFONO_WA = '5491125677858';
const CORREO = 'iara@mechanicpro.com.ar';
const CONTACTO = 'Iara Aguilar';

function textoDeLaPrueba(taller: TallerData): string {
    const dias = Number(taller.prueba_dias) > 0 ? Number(taller.prueba_dias) : null;
    const dia = diaYMes(fechaDelCorte(taller));
    const cuando = dia ? ` el ${dia}` : '';
    // Sin prueba_dias el corte lo puso una persona (antes del reloj): no se dice "automática".
    if (!dias) return `El plazo de la prueba gratuita de Mechanic Pro se cumplió${cuando}.`;
    return `La prueba gratuita de Mechanic Pro dura ${dias} días desde la primera carga de datos. `
        + `El plazo se cumplió${cuando} y el sistema pausó el acceso de forma automática.`;
}

export function AccesoSuspendido({ taller, onLogout }: { taller: TallerData; onLogout: () => void }) {
    const porPrueba = cortePorPrueba(taller);
    const textoWhatsApp = `Hola, te escribo de ${taller.nombre ?? 'mi taller'} por la cuenta de Mechanic Pro.`;
    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
            <div
                role="alertdialog"
                aria-labelledby="acceso-suspendido-titulo"
                aria-describedby="acceso-suspendido-texto"
                className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-sm px-6 sm:px-8 py-10 text-center"
            >
                <img
                    src="/logo-mechanic-pro-trim.png"
                    alt="Mechanic Pro"
                    className="h-10 max-w-full object-contain mx-auto mb-8"
                />
                {porPrueba && (
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                        Aviso automático del sistema
                    </p>
                )}
                <h1 id="acceso-suspendido-titulo" className="text-xl font-semibold text-slate-900 tracking-tight">
                    {porPrueba ? 'Terminó el período de prueba' : 'El acceso a esta cuenta está pausado'}
                </h1>
                {porPrueba && (
                    <p id="acceso-suspendido-texto" className="mt-5 text-slate-700 leading-relaxed">
                        {textoDeLaPrueba(taller)}
                    </p>
                )}
                <p className={`${porPrueba ? 'mt-3' : 'mt-5'} text-sm text-slate-500 leading-relaxed`}>
                    Toda la información de la cuenta queda guardada, sin cambios.
                </p>

                <div className="mt-8 border-t border-slate-200 pt-6">
                    <p className="text-sm text-slate-700">
                        Para seguir usando Mechanic Pro o por cualquier consulta:
                    </p>
                    <dl className="mt-3 inline-grid grid-cols-[auto_auto] items-baseline gap-x-4 gap-y-1 text-left">
                        <dt className="text-sm text-slate-500">Contacto</dt>
                        <dd className="font-medium text-slate-900">{CONTACTO}</dd>
                        <dt className="text-sm text-slate-500">WhatsApp</dt>
                        <dd className="font-medium whitespace-nowrap tabular-nums">
                            <a
                                href={`https://wa.me/${TELEFONO_WA}?text=${encodeURIComponent(textoWhatsApp)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500"
                            >
                                {TELEFONO}
                            </a>
                        </dd>
                        <dt className="text-sm text-slate-500">Correo</dt>
                        <dd className="font-medium break-all">
                            <a
                                href={`mailto:${CORREO}`}
                                className="text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500"
                            >
                                {CORREO}
                            </a>
                        </dd>
                    </dl>
                </div>

                <button
                    type="button"
                    onClick={onLogout}
                    className="mt-8 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                >
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
}
