/**
 * La pantalla de un taller con el acceso cortado (25-sep-2026, Leira Bikes).
 *
 * Reemplaza la app entera: no hay menú, ni datos, ni nada que tocar; solo
 * cerrar sesión. Los datos del taller NO se tocan (ver la migración
 * 20260925120000_acceso_suspendido.sql).
 *
 * 🔴 Tono: formal y distante, en usted (pedido de Iara). No se nombran planes
 * ni precios acá: eso va por mail. Y va en grises, sin el color del taller.
 */
import type { TallerData } from '@/store/authStore';

// El celular de Iara (factura de Personal, portfolio de Meta) y el mail de la app.
const TELEFONO = '+54 9 11 2567-7858';
const CORREO = 'iara@mechanicpro.com.ar';

// Genérico a propósito (pedido de Iara, 25-sep-2026): sin el nombre del taller.
function titulo(taller: TallerData): string {
    return taller.acceso_suspendido_motivo === 'prueba_finalizada'
        ? 'Su prueba gratuita ha finalizado'
        : 'Su acceso se encuentra suspendido';
}

export function AccesoSuspendido({ taller, onLogout }: { taller: TallerData; onLogout: () => void }) {
    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
            <div
                role="alertdialog"
                aria-labelledby="acceso-suspendido-titulo"
                className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-sm px-8 py-10 text-center"
            >
                <img
                    src="/logo-mechanic-pro-trim.png"
                    alt="Mechanic Pro"
                    className="h-10 max-w-full object-contain mx-auto mb-8"
                />
                <h1 id="acceso-suspendido-titulo" className="text-xl font-semibold text-slate-900 tracking-tight">
                    {titulo(taller)}
                </h1>
                <p className="mt-5 text-slate-700 leading-relaxed">
                    Para continuar utilizando Mechanic Pro, comuníquese con Iara Aguilar.
                </p>
                <dl className="mt-5 inline-grid grid-cols-[auto_auto] items-baseline gap-x-4 gap-y-1 text-left">
                    <dt className="text-sm text-slate-500">Teléfono</dt>
                    <dd className="font-medium text-slate-900 whitespace-nowrap tabular-nums">{TELEFONO}</dd>
                    <dt className="text-sm text-slate-500">Correo</dt>
                    <dd className="font-medium text-slate-900 break-all">{CORREO}</dd>
                </dl>
                <p className="mt-5 text-sm text-slate-500 leading-relaxed">
                    La información registrada en su cuenta se conserva íntegramente.
                </p>
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
