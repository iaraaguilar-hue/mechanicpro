// ─────────────────────────────────────────────────────────────
// EL BUSCADOR DE AJUSTES (14-sep-2026).
//
// Iara: *"quiero que hagas un análisis exhaustivo de si todos los botones y todas
// las opciones de configuración están en el lugar indicado y si son fáciles de
// buscar (…) que cualquier persona pueda usarlo sin problema y sin explicación"*.
//
// Configuración tiene 21 ajustes repartidos en 5 pestañas, y el nombre de la
// pestaña no dice lo que hay adentro: el candado de finalización vive en
// «Preferencias», y quién firma los WhatsApp vivía en «Mi Taller», al lado del
// logo. Ordenarlos mejor ayuda, pero ningún orden adivina cómo lo llama cada uno:
// el que busca "comisión" no piensa en "Quién hizo cada service". El buscador sí,
// porque cada ajuste lleva las palabras con las que alguien lo buscaría.
//
// 🔴 Cada `id` de acá tiene que existir en pantalla como `data-ajuste="<id>"`, o
// el buscador lleva a la pestaña y no resalta nada. Lo cuida
// `qa_buscador_ajustes.cjs` (en la raíz del frontend), que los recorre todos.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { Feature } from '@/lib/planFeatures';

export type PestanaConfig = 'taller' | 'servicios' | 'whatsapp' | 'automaticos' | 'preferencias';

export type Ajuste = {
    id: string;
    titulo: string;
    tab: PestanaConfig;
    /** Cómo lo buscaría alguien que no sabe cómo se llama. Sin tildes no hace falta: se normaliza. */
    palabras: string;
    /** Si depende del plan: un ajuste que no está en pantalla no se ofrece. */
    requiere?: Feature;
    soloAdmin?: boolean;
};

export const NOMBRE_DE_PESTANA: Record<PestanaConfig, string> = {
    taller: 'Mi Taller',
    servicios: 'Menú de Services',
    whatsapp: 'WhatsApp',
    automaticos: 'Mensajes',
    preferencias: 'Preferencias',
};

export const AJUSTES: Ajuste[] = [
    { id: 'logo', titulo: 'Logo del taller', tab: 'taller', palabras: 'logo imagen marca foto subir cambiar logo' },
    { id: 'colores', titulo: 'Colores de tu marca', tab: 'taller', palabras: 'color colores marca tema pintar primario secundario' },
    { id: 'textos_pdf', titulo: 'Textos del comprobante (pie y forma de pago)', tab: 'taller', palabras: 'pdf comprobante remito orden de trabajo informe pie gracias politica de pago formas de pago como se paga efectivo transferencia tarjeta' },
    { id: 'menu', titulo: 'Menú de services y precios', tab: 'servicios', palabras: 'services servicios precios precio lista de precios catalogo agregar service desactivar tipos' },
    { id: 'firma', titulo: 'Quién firma los mensajes', tab: 'automaticos', palabras: 'firma nombre quien escribe quien firma mensajes whatsapp atiende' },
    { id: 'voz', titulo: 'Cómo hablás en los mensajes', tab: 'automaticos', palabras: 'tono voz estilo tuteo forma de hablar mensajes' },
    { id: 'ia_mensajes', titulo: 'Mensajes personalizados uno por uno', tab: 'automaticos', palabras: 'ia inteligencia artificial personalizados personalizar recordatorios historial', requiere: 'mensaje_ia' },
    { id: 'whatsapp', titulo: 'Conectar el WhatsApp del taller', tab: 'whatsapp', palabras: 'whatsapp numero conectar telefono celular coexistencia meta desconectar', requiere: 'whatsapp_propio' },
    { id: 'automaticos', titulo: 'Mensajes que salen solos', tab: 'automaticos', palabras: 'automaticos automatico solo avisar lista comprobante al cliente entrega seguimiento dias despues', requiere: 'mensajes_automaticos' },
    { id: 'plantillas', titulo: 'Armar un mensaje nuevo (plantilla)', tab: 'automaticos', palabras: 'plantilla plantillas mensaje nuevo crear armar meta aprobar texto', requiere: 'mensajes_automaticos' },
    { id: 'checklist', titulo: 'Checklist de trabajos', tab: 'preferencias', palabras: 'checklist tildar trabajos avances etapas lista de trabajos' },
    { id: 'tareas', titulo: 'Tareas del service y candado de finalización', tab: 'preferencias', palabras: 'tareas candado bloquear finalizar pendientes olvidarse anotar' },
    { id: 'mecanico', titulo: 'Quién hizo cada service', tab: 'preferencias', palabras: 'mecanico mecanicos empleado empleados quien hizo quien firma firma nombre nombres agregar persona sin usuario comision equipo metricas por persona' },
    { id: 'diagnostico', titulo: 'Registro del diagnóstico', tab: 'preferencias', palabras: 'diagnostico health check mantenimiento vencimientos componentes durante al finalizar' },
    { id: 'componentes', titulo: 'Componentes del diagnóstico y sus plazos', tab: 'preferencias', palabras: 'componentes diagnostico plazos meses sugerido cadena drop tija telescopica brain horquilla agregar sacar lista health check' },
    { id: 'orden_grande', titulo: 'Número de orden grande', tab: 'preferencias', palabras: 'numero de orden grande tamaño letra agrandar ver mejor orden' },
    { id: 'segundo_ojos', titulo: 'Segundo par de ojos sobre el presupuesto', tab: 'preferencias', palabras: 'presupuesto sugerencias ia se escapa olvidos al finalizar', requiere: 'segundo_ojos' },
    { id: 'avisos_suaves', titulo: 'Avisos de "vale una llamada"', tab: 'preferencias', palabras: 'primer service no volvio clientes perdidos llamar retencion avisos frecuentes clientes de siempre activos invitar service' },
    { id: 'postventa', titulo: 'Después de vender una bici (ajuste y primer service)', tab: 'preferencias', palabras: 'venta vendi vendida mostrador bici nueva ajuste primer service meses despues de la compra aviso mensaje agendar' },
    { id: 'horas', titulo: 'Cuánto esperar al cliente antes de llamarlo', tab: 'preferencias', palabras: 'horas esperar respuesta llamar plazo no contesta' },
    { id: 'altas_erp', titulo: 'La bici vendida entra sola', tab: 'preferencias', palabras: 'erp contabilium venta vendida alta provincias bici nueva cliente nuevo factura' },
    { id: 'vista_metricas', titulo: 'Qué ve el mecánico en Métricas', tab: 'preferencias', palabras: 'metricas facturacion ingresos esconder ocultar que ve el mecanico permisos plata sueldos panel ojo', soloAdmin: true },
    { id: 'bicis_paradas_mecanico', titulo: 'El mecánico también ve Bicis paradas', tab: 'preferencias', palabras: 'permisos permiso mecanico ver bicis paradas stock acceso', requiere: 'bicis_paradas', soloAdmin: true },
    { id: 'ocultos', titulo: 'Productos ocultos del buscador de repuestos', tab: 'preferencias', palabras: 'repuestos buscador ocultos no sugerir productos volver a mostrar' },
    { id: 'recorrido', titulo: 'Ver el recorrido de bienvenida', tab: 'preferencias', palabras: 'tutorial ayuda recorrido capacitar aprender como se usa empleado nuevo' },
];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Los ajustes que coinciden con lo que se escribió. Tienen que estar TODAS las
 * palabras (en el título o en las palabras clave), y primero van los que las
 * tienen en el título. Coincide por pedazo: "candad" ya encuentra "candado".
 */
export function buscarAjustes(q: string, entre: Ajuste[]): Ajuste[] {
    const tokens = normalizar(q).split(/\s+/).filter((t) => t.length >= 2);
    if (!tokens.length) return [];
    return entre
        .map((a) => {
            const titulo = normalizar(a.titulo);
            const todo = `${titulo} ${normalizar(a.palabras)}`;
            return { a, ok: tokens.every((t) => todo.includes(t)), enTitulo: tokens.filter((t) => titulo.includes(t)).length };
        })
        .filter((x) => x.ok)
        .sort((x, y) => y.enTitulo - x.enTitulo)
        .map((x) => x.a)
        .slice(0, 6);
}

export function BuscadorDeAjustes({ ajustes, onIr }: { ajustes: Ajuste[]; onIr: (a: Ajuste) => void }) {
    const [q, setQ] = useState('');
    const [abierto, setAbierto] = useState(false);
    const resultados = buscarAjustes(q, ajustes);

    const ir = (a: Ajuste) => {
        onIr(a);
        setQ('');
        setAbierto(false);
    };

    return (
        <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
                onFocus={() => setAbierto(true)}
                // El retraso deja que el clic en un resultado llegue antes de cerrar la lista.
                onBlur={() => setTimeout(() => setAbierto(false), 150)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && resultados[0]) { e.preventDefault(); ir(resultados[0]); }
                    if (e.key === 'Escape') setAbierto(false);
                }}
                placeholder="Buscá un ajuste: logo, firma, precios, candado…"
                aria-label="Buscar un ajuste"
                className="pl-9 h-11"
                data-buscador-ajustes
            />
            {abierto && q.trim().length >= 2 && (
                <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg py-1" role="listbox">
                    {resultados.length ? resultados.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            role="option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => ir(a)}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-3"
                        >
                            <span className="text-sm text-slate-800">{a.titulo}</span>
                            <span className="text-[11px] text-slate-500 whitespace-nowrap">{NOMBRE_DE_PESTANA[a.tab]}</span>
                        </button>
                    )) : (
                        <p className="px-3 py-2 text-sm text-slate-500">No encontramos eso. Probá con otra palabra.</p>
                    )}
                </div>
            )}
        </div>
    );
}
