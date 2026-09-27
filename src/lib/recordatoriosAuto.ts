// ─────────────────────────────────────────────────────────────
// LOS RECORDATORIOS QUE SALEN SOLOS, del lado de la pantalla (27-sep-2026).
//
// La Edge Function `recordatorios-auto` anota cada recordatorio que miró en
// `recordatorios_auto` (uno por ciclo: el día en que vence). Esto lo lee para que
// NINGÚN lugar de la app ofrezca mandar a mano uno que ya salió solo:
//   · la tarjeta de Retención dice "Salió solo el …" en vez del botón;
//   · la campana no lo cuenta ni lo ofrece por wa.me;
//   · antes de abrir el texto (y antes de "Mandar") se vuelve a preguntar a la base,
//     porque la pestaña pudo quedar abierta desde antes de la corrida.
// Hallazgo del auditor independiente: los tres terminaban en un SEGUNDO mensaje al
// mismo cliente. Por eso vive en un store compartido y no en cada pantalla.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { hoyAR } from '@/lib/mantenimiento';
import { instanteAR } from '@/lib/fechaAR';
import { motivoDeMeta } from '@/lib/motivoDeMeta';

export interface FilaAuto {
    id?: string;
    recordatorio_id: string;
    vence_el: string;
    estado: 'omitido' | 'enviando' | 'enviado' | 'fallo';
    motivo: string | null;
    dia: string;
    actualizado_at: string;
    mensajes_whatsapp?: MensajeDeLaFila | MensajeDeLaFila[] | null;
}
interface MensajeDeLaFila { estado?: string | null; error_codigo?: string | null; error_detalle?: string | null; enviado_at?: string | null }

const COLUMNAS = 'id, recordatorio_id, vence_el, estado, motivo, dia, actualizado_at, mensajes_whatsapp(estado, error_codigo, error_detalle, enviado_at)';

/** Lo mínimo de una alerta para ubicar su ciclo. */
interface AlertaDelCiclo { id: string; dueDate: string; daysRemaining: number; isPostCarrera?: boolean; isPreCarrera?: boolean }

/** La llave del ciclo: el recordatorio y el día en que vence (como lo anota el servidor). */
export const claveCiclo = (a: AlertaDelCiclo) => `${a.id}|${String(a.dueDate ?? '').slice(0, 10)}`;

/** Solo los recordatorios de componentes salen solos: las de carrera no tienen fila. */
const esDeComponente = (a: AlertaDelCiclo) => !a.isPostCarrera && !a.isPreCarrera && /^[0-9a-f-]{36}$/i.test(a.id);

/** Un día de calendario ± N días, sin pasar por la hora local. */
export function sumarDias(dia: string, n: number): string {
    const d = new Date(`${dia}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

const mensajeDe = (f: FilaAuto) => (Array.isArray(f.mensajes_whatsapp) ? f.mensajes_whatsapp[0] : f.mensajes_whatsapp) ?? null;

/**
 * ¿Hay que dejar de ofrecerlo a mano? Sí si salió (y el webhook no avisó que no
 * llegó) o si se está mandando / quedó a medio mandar: ante la duda, no se ofrece
 * un segundo mensaje desde un botón que no avisa (la tarjeta de Retención sí avisa).
 */
export function yaSalioOSeEstaMandando(f: FilaAuto | undefined | null): boolean {
    if (!f) return false;
    if (f.estado === 'enviando') return true;
    return f.estado === 'enviado' && mensajeDe(f)?.estado !== 'failed';
}

export type EstadoAuto = { salio: boolean; texto: string } | null;

/** Lo que dice la tarjeta de Retención. `salio` = no se ofrece el botón. */
export function estadoAutoDe(fila: FilaAuto | undefined, alert: AlertaDelCiclo, modoSolo: boolean): EstadoAuto {
    if (fila) {
        const msj = mensajeDe(fila);
        if (fila.estado === 'enviado') {
            // Meta lo aceptó y después avisó que no lo pudo entregar (webhook).
            if (msj?.estado === 'failed') {
                return { salio: false, texto: `No le llegó: ${motivoDeMeta(msj.error_codigo, msj.error_detalle).motivo}.` };
            }
            return { salio: true, texto: `Salió solo el ${instanteAR(msj?.enviado_at ?? fila.actualizado_at)}` };
        }
        if (fila.estado === 'fallo') return { salio: false, texto: `No salió solo: ${fila.motivo ?? 'WhatsApp lo rechazó'}.` };
        if (fila.estado === 'enviando') {
            // Hoy = la corrida lo está mandando (o se cortó hace un rato): no se ofrece.
            // De otro día = se cortó en el medio: se ofrece, avisando.
            return fila.dia === hoyAR()
                ? { salio: true, texto: 'Está saliendo solo ahora: en un rato se ve si llegó.' }
                : { salio: false, texto: 'No sabemos si salió solo: fijate en el chat antes de mandarlo.' };
        }
        if (fila.estado === 'omitido' && modoSolo && fila.dia === hoyAR()) return { salio: false, texto: `Hoy no salió solo: ${fila.motivo}.` };
    }
    // Prender "Salen solos" no dispara lo viejo: eso queda acá, para hacerlo a mano.
    if (modoSolo && alert.daysRemaining < -30) return { salio: false, texto: 'Venció hace más de 30 días: este no sale solo.' };
    return null;
}

// ── El store compartido (Retención + la campana) ──────────────────
interface EstadoStore {
    tallerId: string | null;
    filas: FilaAuto[];
    enCurso: Promise<void> | null;
    cargar: (tallerId: string) => Promise<void>;
    poner: (fila: FilaAuto) => void;
}

export const useRecordatoriosAutoStore = create<EstadoStore>((set, get) => ({
    tallerId: null,
    filas: [],
    enCurso: null,
    cargar: (tallerId) => {
        const en = get().enCurso;
        if (en && get().tallerId === tallerId) return en;
        const p = (async () => {
            // Lo que salió (o se intentó) en los últimos meses, y los motivos de hoy y
            // ayer. Paginado y con orden: con más de 1000 filas PostgREST corta, y un
            // corte al azar devolvería el botón a uno que ya salió.
            const desde = sumarDias(hoyAR(), -180);
            const filas: FilaAuto[] = [];
            for (let i = 0; ; i += 1000) {
                const { data, error } = await supabase.from('recordatorios_auto')
                    .select(COLUMNAS)
                    .eq('taller_id', tallerId)
                    .gte('vence_el', desde)
                    .or(`estado.neq.omitido,dia.gte.${sumarDias(hoyAR(), -1)}`)
                    .order('vence_el', { ascending: false })
                    .order('id', { ascending: true })
                    .range(i, i + 999);
                // Si la tabla no está (o falla), se queda con lo que tenía: sin estado
                // automático la pantalla sigue como siempre.
                if (error) return;
                filas.push(...((data ?? []) as FilaAuto[]));
                if (!data || data.length < 1000) break;
            }
            set({ tallerId, filas });
        })().finally(() => set({ enCurso: null }));
        set({ enCurso: p, ...(get().tallerId !== tallerId ? { tallerId, filas: [] } : {}) });
        return p;
    },
    poner: (fila) => set({
        filas: [...get().filas.filter(f => !(f.recordatorio_id === fila.recordatorio_id && String(f.vence_el).slice(0, 10) === String(fila.vence_el).slice(0, 10))), fila],
    }),
}));

/**
 * Las filas del taller logueado, cargadas al montar y otra vez cada vez que la
 * pestaña vuelve a estar a la vista (la corrida pudo pasar mientras estaba abierta).
 */
export function useRecordatoriosAuto(activo: boolean) {
    const taller_id = useAuthStore(s => s.taller_id);
    const filas = useRecordatoriosAutoStore(s => s.filas);
    const deTaller = useRecordatoriosAutoStore(s => s.tallerId);
    const cargar = useRecordatoriosAutoStore(s => s.cargar);
    useEffect(() => {
        if (!activo || !taller_id) return;
        void cargar(taller_id);
        const alVolver = () => { if (document.visibilityState === 'visible') void cargar(taller_id); };
        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener('focus', alVolver);
        return () => {
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener('focus', alVolver);
        };
    }, [activo, taller_id, cargar]);
    return useMemo(() => {
        const hoy = hoyAR();
        const propias = activo && deTaller === taller_id ? filas : [];
        return {
            porCiclo: new Map(propias.map(f => [`${f.recordatorio_id}|${String(f.vence_el).slice(0, 10)}`, f])),
            hoySalieron: propias.filter(f => f.estado === 'enviado' && f.dia === hoy).length,
        };
    }, [activo, deTaller, taller_id, filas]);
}

/**
 * Pregunta a la base, en el momento, si ESTE recordatorio ya salió solo o se está
 * mandando. Se llama antes de abrir el texto y antes de "Mandar". Si la base no
 * contesta, devuelve null y el envío a mano sigue como siempre.
 */
export async function yaSalioSolo(tallerId: string | null, alert: AlertaDelCiclo): Promise<FilaAuto | null> {
    if (!tallerId || !esDeComponente(alert)) return null;
    const { data, error } = await supabase.from('recordatorios_auto')
        .select(COLUMNAS)
        .eq('taller_id', tallerId)
        .eq('recordatorio_id', alert.id)
        .eq('vence_el', String(alert.dueDate).slice(0, 10))
        .maybeSingle();
    if (error || !data) return null;
    const fila = data as FilaAuto;
    useRecordatoriosAutoStore.getState().poner(fila);
    return yaSalioOSeEstaMandando(fila) && estadoAutoDe(fila, alert, false)?.salio ? fila : null;
}
