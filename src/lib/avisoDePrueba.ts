/**
 * El AVISO DE PRUEBA del Taller Activo (8-oct-2026).
 *
 * Iara: *"no quiero mandar más mensajes yo misma. quiero que todo le aparezca al
 * mecánico directamente en la app"*. Hasta hoy, a cada taller en prueba gratuita Iara le
 * escribía a mano por WhatsApp dos cosas: la AYUDA (qué le falta prender) y el CIERRE
 * (la prueba termina, para seguir escribile). Esto es esas dos cosas, dentro de la app.
 *
 * Solo para un taller con la prueba CORRIENDO: el que paga no ve nada, el que todavía
 * no cargó datos tampoco (su reloj no arrancó), y el vencido ya ve `AccesoSuspendido`.
 *
 * 🔴 Sin planes ni precios (Iara, 8-oct-2026; Rami, 2-oct-2026): ni "$", ni el nombre de
 * un plan. Lo mide `qa_aviso_de_prueba.cjs`.
 * 🔴 Cada cosa de "lo que te falta" sale de un DATO del taller. Si la app no tiene una
 * señal confiable, el ítem no va: un consejo inventado con cara de diagnóstico es peor
 * que ninguno. Quedó afuera "cargá tu lista de clientes": la app no tiene cómo
 * importarla (`MigradorDatos.tsx` no está en ninguna pantalla).
 */
import { estadoPrueba, avisoPruebaExtendida, DIAS_DE_PRUEBA, type TallerConPrueba } from './pruebaGratuita';
import { ZONA_AR } from './fechaAR';
import { tieneFeature, turnosActivos } from './planFeatures';

/** Los últimos días en que el aviso suma con quién hablar para seguir. */
export const DIAS_DEL_CIERRE = 2;
/** Cuántas órdenes recientes se miran para saber si eligen el service del menú. */
export const ORDENES_A_MIRAR = 10;
/** Con menos órdenes que esto no hay costumbre que leer: no se aconseja nada. */
export const ORDENES_MINIMAS = 3;

export interface TallerParaElAviso extends TallerConPrueba {
    plan_actual?: string;
    wa_activo?: boolean;
    wa_phone_number_id?: string | null;
    config_turnos?: { habilitado?: boolean; leer_whatsapp?: boolean } | null;
}
export interface OrdenParaElAviso {
    tipo_servicio?: string | null;
    fecha_ingreso?: string | null;
}
export interface ServiceDelMenu {
    nombre?: string | null;
    activo?: boolean | null;
}

export interface Pendiente {
    id: 'whatsapp' | 'menu' | 'turnos';
    titulo: string;
    detalle: string;
    boton: string;
    /** La pantalla donde se hace (el `?ajuste=` abre Configuración en el lugar exacto). */
    ir: string;
}

export interface AvisoDePrueba {
    titulo: string;
    /** Cuándo termina, con día y, si no es a la medianoche, la hora. */
    texto: string;
    /** Días de calendario que quedan, contando hoy (hora de Argentina). 1 = hoy es el último. */
    diasQueQuedan: number;
    pendientes: Pendiente[];
    /** Los últimos 2 días: el aviso dice con quién hablar para seguir. */
    contacto: boolean;
}

const DIA_MS = 86_400_000;

/** El día de calendario de un instante, en Argentina: `2026-10-08`. */
function diaAR(ms: number): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_AR, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(ms));
}
function diasEntre(desde: string, hasta: string): number {
    const [a1, m1, d1] = desde.split('-').map(Number);
    const [a2, m2, d2] = hasta.split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / DIA_MS);
}
function diaConNombre(ms: number): string {
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_AR, weekday: 'long', day: 'numeric', month: 'long' })
        .format(new Date(ms))
        .replace(',', '');
}
function horaAR(ms: number): string {
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_AR, hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date(ms));
}

/** ¿La orden quedó sin un service del menú? ("OTRO" es la opción de precio libre.) */
export function ordenSinServiceDelMenu(tipo: string | null | undefined): boolean {
    const t = (tipo || '').trim().toUpperCase();
    return t === '' || t === 'OTRO' || t === 'OTHER';
}

/**
 * ¿Las órdenes recientes quedan como "OTRO" teniendo services en el menú?
 * Devuelve cuántas de las últimas quedaron así, o null si no hay nada que aconsejar.
 * `menu` null = todavía no se sabe (no se aconseja a ciegas).
 */
export function ordenesSinMenu(ordenes: OrdenParaElAviso[], menu: ServiceDelMenu[] | null): { sinMenu: number; miradas: number } | null {
    if (!menu) return null;
    const hayMenu = menu.some(s => s.activo !== false && !ordenSinServiceDelMenu(s.nombre));
    if (!hayMenu) return null;
    const recientes = [...ordenes]
        .filter(o => o.fecha_ingreso && !Number.isNaN(Date.parse(o.fecha_ingreso)))
        .sort((a, b) => Date.parse(b.fecha_ingreso!) - Date.parse(a.fecha_ingreso!))
        .slice(0, ORDENES_A_MIRAR);
    if (recientes.length < ORDENES_MINIMAS) return null;
    const sinMenu = recientes.filter(o => ordenSinServiceDelMenu(o.tipo_servicio)).length;
    // La mayoría: más de la mitad.
    return sinMenu * 2 > recientes.length ? { sinMenu, miradas: recientes.length } : null;
}

/** Lo que le falta al taller para aprovechar la prueba, en orden. Lo hecho no aparece. */
export function loQueFalta(taller: TallerParaElAviso, ordenes: OrdenParaElAviso[], menu: ServiceDelMenu[] | null): Pendiente[] {
    const out: Pendiente[] = [];
    // El mismo "conectado" que la pantalla a la que lleva el botón (ConectarWhatsApp.tsx):
    // si allá dice conectado, acá no puede decir que falta.
    const waConectado = Boolean(taller.wa_activo && taller.wa_phone_number_id);
    if (tieneFeature(taller, 'whatsapp_propio') && !waConectado) {
        out.push({
            id: 'whatsapp',
            titulo: 'Conectá el WhatsApp del taller',
            // Lo que promete la pantalla de conexión, con las mismas palabras.
            detalle: 'Los recordatorios salen solos, desde tu número.',
            boton: 'Conectar',
            ir: '/configuracion?ajuste=whatsapp',
        });
    }
    const otro = ordenesSinMenu(ordenes, menu);
    if (otro) {
        const cuantas = otro.sinMenu === otro.miradas
            ? `Tus últimas ${otro.miradas} órdenes quedaron como OTRO.`
            : `${otro.sinMenu} de tus últimas ${otro.miradas} órdenes quedaron como OTRO.`;
        out.push({
            id: 'menu',
            titulo: 'Al recibir una bici, elegí el service del menú',
            detalle: `El precio sale solo. ${cuantas}`,
            boton: 'Ver mi menú',
            ir: '/configuracion?ajuste=menu',
        });
    }
    // Casi ningún taller da turnos: por eso va al final y empieza con "si".
    if (tieneFeature(taller, 'turnos') && !turnosActivos(taller)) {
        out.push({
            id: 'turnos',
            titulo: 'Si das turnos, prendé el calendario',
            detalle: 'Cuando llega el cliente, su turno abre la orden.',
            boton: 'Prender',
            ir: '/configuracion?ajuste=turnos',
        });
    }
    return out;
}

/** El aviso entero, o null si este taller no tiene que ver nada. */
export function avisoDePrueba(
    taller: TallerParaElAviso | null | undefined,
    ordenes: OrdenParaElAviso[],
    menu: ServiceDelMenu[] | null,
    ahoraMs: number = Date.now(),
): AvisoDePrueba | null {
    if (!taller || taller.acceso_suspendido_at) return null;
    const e = estadoPrueba(taller, ahoraMs);
    if (e.tipo !== 'corriendo') return null;

    const venceMs = Date.parse(e.vence);
    // El último día es el del instante anterior al corte: si corta a las 00:00 del 14,
    // el último día entero es el 13.
    const ultimoMs = venceMs - 1;
    const hoy = diaAR(ahoraMs);
    const diasQueQuedan = diasEntre(hoy, diaAR(ultimoMs)) + 1;
    const aLaMedianoche = diaAR(venceMs) !== diaAR(ultimoMs);
    const esHoy = diasQueQuedan <= 1;

    const titulo = esHoy ? 'Hoy es el último día de prueba' : `Te quedan ${diasQueQuedan} días de prueba`;
    let texto: string;
    if (e.dias > DIAS_DE_PRUEBA) {
        // Prueba extendida (7-oct-2026): se conserva el texto de siempre.
        texto = avisoPruebaExtendida(taller, ahoraMs) ?? '';
    } else if (aLaMedianoche) {
        texto = esHoy
            ? 'Tu prueba gratuita termina hoy a la medianoche.'
            : `Tu prueba gratuita va hasta el ${diaConNombre(ultimoMs)} inclusive.`;
    } else {
        texto = esHoy
            ? `Tu prueba gratuita termina hoy a las ${horaAR(venceMs)}.`
            : `Tu prueba gratuita termina el ${diaConNombre(venceMs)} a las ${horaAR(venceMs)}.`;
    }

    return {
        titulo,
        texto,
        diasQueQuedan,
        pendientes: loQueFalta(taller, ordenes, menu),
        contacto: diasQueQuedan <= DIAS_DEL_CIERRE,
    };
}
