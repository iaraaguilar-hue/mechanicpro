import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { TOURS, type ContextoTour, type PasoTour } from '@/lib/tourSteps';
import { marcarTourVisto, tourVisto } from '@/lib/tourSeen';
import { useAuthStore } from '@/store/authStore';

// ─────────────────────────────────────────────────────────────
// Motor de los recorridos guiados (onboarding) — pedido de Iara, ago-2026.
// Objetivo: que un taller nuevo aprenda a usar TODO el sistema sin
// necesitar una reunión de capacitación. Técnica de foco: se ilumina
// el elemento real de la pantalla (el resto queda oscurecido) y un
// globo explica su valor en tono formal; se avanza con «Siguiente».
//
// Motor propio, sin dependencias nuevas: el "agujero" de luz es un
// div posicionado sobre el elemento con un box-shadow gigante.
//
// Corre VARIOS tours (ver tourSteps.ts): 'bienvenida' auto-arranca la
// 1ra vez que se abre la app; los contextuales ('garage', 'service',
// 'finalizar') se disparan la 1ra vez que se abre esa pantalla, vía
// lanzarTourContextual(). Cambios de sección → cartel de transición +
// botón del menú iluminado (feedback Iara 3-ago: "no se nota cuándo
// cambiamos de pestaña"). Pasos `opcional` se saltean solos si su
// elemento no existe (feature apagada, garage vacío): nunca se rompe.
//
// Los contextuales corren SOBRE modales Radix: el contenedor fuerza
// pointer-events auto (Radix pone none en el body) y los DialogContent
// involucrados previenen su cierre mientras el tour está activo
// (helper tourBloqueaCierreDialog).
// ─────────────────────────────────────────────────────────────

interface TourState {
    activo: boolean;
    contexto: ContextoTour;
    paso: number;
    iniciar: (contexto?: ContextoTour) => void;
    terminar: () => void;
    setPaso: (paso: number) => void;
}

export const useTourStore = create<TourState>((set, get) => ({
    activo: false,
    contexto: 'bienvenida',
    paso: 0,
    iniciar: (contexto = 'bienvenida') => set({ activo: true, contexto, paso: 0 }),
    terminar: () => {
        marcarTourVisto(get().contexto);
        set({ activo: false, paso: 0 });
    },
    setPaso: (paso) => set({ paso }),
}));

/** Para pasar a los DialogContent: evita que el clic en el globo cierre el modal. */
export function tourBloqueaCierreDialog(e: { preventDefault: () => void }) {
    if (useTourStore.getState().activo) e.preventDefault();
}

interface Rect { top: number; left: number; width: number; height: number; }

const MARGEN_FOCO = 8;       // aire entre el elemento y el borde iluminado
const ANCHO_GLOBO = 400;     // máximo; en mobile se achica al viewport
const DURACION_TRANSICION = 1400; // ms del cartel de cambio de sección

/** Devuelve el elemento data-tour visible (mobile y desktop duplican anclas). */
function buscarElemento(selector: string): HTMLElement | null {
    const candidatos = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${selector}"]`)
    );
    return (
        candidatos.find((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        }) ?? null
    );
}

export function OnboardingTour() {
    const { activo, contexto, paso, iniciar, terminar, setPaso } = useTourStore();
    const session = useAuthStore((s) => s.session);
    const taller = useAuthStore((s) => s.taller);
    const rol = useAuthStore((s) => s.rol);
    const navigate = useNavigate();
    const location = useLocation();

    const [targetRect, setTargetRect] = useState<Rect | null>(null);
    const [buscando, setBuscando] = useState(false);
    const [transicion, setTransicion] = useState<string | null>(null);
    const globoRef = useRef<HTMLDivElement>(null);
    const [globoStyle, setGloboStyle] = useState<React.CSSProperties>({});
    // Dirección del último movimiento (para que un paso opcional ausente se
    // saltee hacia donde iba la persona, también con «Anterior»).
    const direccionRef = useRef<1 | -1>(1);

    const pasos = TOURS[contexto];
    const pasoActual: PasoTour | undefined = pasos[paso];
    const esUltimo = paso === pasos.length - 1;
    // Paso "libre": el velo deja pasar los clics — o porque la persona tiene
    // que hacer una acción real (avanza) o porque la app puede mostrar
    // carteles propios que hay que poder cerrar (libre).
    const esLibre = !!(pasoActual?.avanza || pasoActual?.libre);

    // ── Auto-arranque del recorrido general: primera vez que un usuario del
    // taller abre la app en este dispositivo. El super_admin (Iara) no lo ve.
    useEffect(() => {
        if (!session || !taller || activo) return;
        if (rol?.toLowerCase()?.trim() === 'super_admin') return;
        if (tourVisto('bienvenida')) return;
        // Pequeña espera para que la pantalla termine de hidratar datos.
        const t = setTimeout(() => iniciar('bienvenida'), 1200);
        return () => clearTimeout(t);
    }, [session, taller, rol, activo, iniciar]);

    // ── Al cambiar de paso: transición de sección si corresponde, navegar
    // a la ruta del paso y buscar el elemento a iluminar.
    useEffect(() => {
        if (!activo || !pasoActual) return;
        let cancelado = false;
        let timerTransicion: ReturnType<typeof setTimeout> | undefined;

        const cambiaDeSeccion =
            !!pasoActual.seccion && !!pasoActual.ruta && location.pathname !== pasoActual.ruta;

        if (pasoActual.ruta && location.pathname !== pasoActual.ruta) {
            navigate(pasoActual.ruta);
        }

        const esMobile = window.innerWidth < 768;
        const selector =
            (esMobile && pasoActual.selectorMobile) || pasoActual.selector;

        const buscarYFijar = () => {
            if (!selector) {
                setTargetRect(null);
                setBuscando(false);
                return;
            }
            // El elemento puede tardar en montarse tras navegar (hidratación):
            // se lo busca un rato; si no aparece → opcional se saltea, si no,
            // globo centrado y a seguir.
            setBuscando(true);
            const inicio = Date.now();
            const limite = pasoActual.opcional ? 1600 : 3000;
            const intento = () => {
                if (cancelado) return;
                const el = buscarElemento(selector);
                if (el) {
                    // Elementos más altos que la pantalla (tablas largas, sidebar):
                    // mostrar desde arriba; el foco después se recorta al viewport.
                    const alto = el.getBoundingClientRect().height;
                    el.scrollIntoView({
                        block: alto > window.innerHeight * 0.8 ? 'start' : 'center',
                        behavior: 'auto',
                    });
                    requestAnimationFrame(() => {
                        if (cancelado) return;
                        const r = el.getBoundingClientRect();
                        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
                        setBuscando(false);
                    });
                } else if (Date.now() - inicio < limite) {
                    setTimeout(intento, 120);
                } else if (pasoActual.opcional) {
                    // Feature apagada o pantalla sin ese elemento → saltear el
                    // paso en la dirección en la que venía la persona.
                    const siguiente = paso + direccionRef.current;
                    if (siguiente < 0) setPaso(0);
                    else if (siguiente >= pasos.length) terminar();
                    else setPaso(siguiente);
                } else {
                    setTargetRect(null);
                    setBuscando(false);
                }
            };
            intento();
        };

        if (cambiaDeSeccion) {
            // Cartel "entrando a la sección X" + botón del menú iluminado,
            // para que el cambio de pestaña se NOTE antes de explicar nada.
            setTransicion(pasoActual.seccion!);
            setTargetRect(null);
            setBuscando(false);
            if (pasoActual.nav) {
                const navEl = buscarElemento(pasoActual.nav);
                if (navEl) {
                    const r = navEl.getBoundingClientRect();
                    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
                }
            }
            timerTransicion = setTimeout(() => {
                if (cancelado) return;
                setTransicion(null);
                buscarYFijar();
            }, DURACION_TRANSICION);
        } else {
            setTransicion(null);
            buscarYFijar();
        }

        return () => {
            cancelado = true;
            if (timerTransicion) clearTimeout(timerTransicion);
        };
        // location.pathname a propósito NO está en las deps: navegar es parte
        // del efecto; re-correrlo al llegar duplicaría la búsqueda.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activo, contexto, paso]);

    // ── Seguir al elemento si la página se reacomoda (resize, imágenes, scroll).
    useEffect(() => {
        if (!activo || !pasoActual || transicion) return;
        const esMobile = window.innerWidth < 768;
        const selector = (esMobile && pasoActual.selectorMobile) || pasoActual.selector;
        if (!selector) return;
        const intervalo = setInterval(() => {
            const el = buscarElemento(selector);
            if (!el) return;
            const r = el.getBoundingClientRect();
            setTargetRect((prev) => {
                if (
                    prev &&
                    Math.abs(prev.top - r.top) < 1 &&
                    Math.abs(prev.left - r.left) < 1 &&
                    Math.abs(prev.width - r.width) < 1 &&
                    Math.abs(prev.height - r.height) < 1
                ) return prev;
                return { top: r.top, left: r.left, width: r.width, height: r.height };
            });
        }, 250);
        return () => clearInterval(intervalo);
    }, [activo, paso, pasoActual, transicion]);

    // ── Posicionar foco + globo. El foco se recorta al viewport (un elemento
    // más alto que la pantalla se ilumina en su parte visible) y el globo
    // busca lugar SIN taparlo: debajo → arriba → al costado → si no entra en
    // ningún lado, se achica el foco para hacerle lugar debajo.
    const [focoRect, setFocoRect] = useState<Rect | null>(null);
    useEffect(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const ancho = Math.min(ANCHO_GLOBO, vw - 32);
        const alto = globoRef.current?.offsetHeight ?? 260;

        if (!targetRect) {
            setFocoRect(null);
            setGloboStyle({
                top: Math.max(16, vh / 2 - alto / 2),
                left: vw / 2 - ancho / 2,
                width: ancho,
            });
            return;
        }

        // Foco recortado al viewport
        const fTop = Math.max(targetRect.top - MARGEN_FOCO, 4);
        const fLeft = Math.max(targetRect.left - MARGEN_FOCO, 4);
        const fRight = Math.min(targetRect.left + targetRect.width + MARGEN_FOCO, vw - 4);
        let fBottom = Math.min(targetRect.top + targetRect.height + MARGEN_FOCO, vh - 4);

        const centroX = (fLeft + fRight) / 2;
        const leftCentrado = Math.min(Math.max(16, centroX - ancho / 2), vw - ancho - 16);

        let top: number;
        let left = leftCentrado;
        if (fBottom + 16 + alto <= vh) {
            top = fBottom + 16;                        // debajo del foco
        } else if (fTop - 16 - alto >= 0) {
            top = fTop - 16 - alto;                    // encima del foco
        } else if (fRight + 16 + ancho <= vw) {
            left = fRight + 16;                        // a la derecha (ej: sidebar)
            top = Math.min(Math.max(16, (fTop + fBottom) / 2 - alto / 2), vh - alto - 16);
        } else if (fLeft - 16 - ancho >= 0) {
            left = fLeft - 16 - ancho;                 // a la izquierda
            top = Math.min(Math.max(16, (fTop + fBottom) / 2 - alto / 2), vh - alto - 16);
        } else {
            // Foco enorme a lo ancho y alto: se lo recorta para que el globo
            // entre debajo sin taparlo.
            fBottom = Math.max(fTop + 80, vh - alto - 48);
            top = fBottom + 16;
        }
        setFocoRect({ top: fTop, left: fLeft, width: fRight - fLeft, height: fBottom - fTop });
        setGloboStyle({ top, left, width: ancho });
    }, [targetRect, paso, buscando]);

    // ── Avance automático de los pasos interactivos: mira el DOM cada 300 ms
    // y avanza cuando la acción real de la persona hizo `aparecer` el elemento
    // esperado o `desaparecer` el que estaba (ej: se cerró el modal).
    const avanzarRef = useRef<() => void>(() => {});
    useEffect(() => {
        if (!activo || !pasoActual?.avanza) return;
        const { aparece, desaparece } = pasoActual.avanza;
        let vistoElQueDesaparece = desaparece
            ? !!document.querySelector(`[data-tour="${desaparece}"]`)
            : false;
        const intervalo = setInterval(() => {
            if (aparece && buscarElemento(aparece)) {
                clearInterval(intervalo);
                avanzarRef.current();
                return;
            }
            if (desaparece) {
                const esta = !!document.querySelector(`[data-tour="${desaparece}"]`);
                if (esta) vistoElQueDesaparece = true;
                else if (vistoElQueDesaparece) {
                    clearInterval(intervalo);
                    avanzarRef.current();
                }
            }
        }, 300);
        return () => clearInterval(intervalo);
    }, [activo, paso, pasoActual]);

    const avanzar = useCallback(() => {
        direccionRef.current = 1;
        if (esUltimo) {
            terminar();
            return;
        }
        setPaso(paso + 1);
    }, [esUltimo, paso, setPaso, terminar]);

    const retroceder = useCallback(() => {
        direccionRef.current = -1;
        if (paso > 0) setPaso(paso - 1);
    }, [paso, setPaso]);

    // El watcher de avance necesita siempre la versión fresca de avanzar.
    useEffect(() => { avanzarRef.current = avanzar; }, [avanzar]);

    // ── Teclado: → / Enter avanza, ← retrocede, Esc omite.
    useEffect(() => {
        if (!activo) return;
        const onKey = (e: KeyboardEvent) => {
            if (transicion) return; // durante el cartel no se navega
            if (e.key === 'ArrowRight') { e.preventDefault(); avanzar(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); retroceder(); }
            if (e.key === 'Escape') { e.preventDefault(); terminar(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [activo, avanzar, retroceder, terminar, transicion]);

    if (!activo || !pasoActual) return null;

    // En pasos interactivos el velo es más suave: la persona tiene que poder
    // leer y operar la pantalla real mientras hace la acción.
    const sombraVelo = esLibre ? 'rgba(2, 6, 23, 0.45)' : 'rgba(2, 6, 23, 0.72)';

    return (
        <div
            className="fixed inset-0 z-[150]"
            style={{ pointerEvents: esLibre ? 'none' : 'auto' }}
            role="dialog"
            aria-modal={!esLibre}
            aria-label="Recorrido de bienvenida"
        >
            {/* Capa que bloquea la interacción con la app durante el recorrido
                (en pasos interactivos el contenedor entero deja pasar los clics). */}
            <div className="absolute inset-0" />

            {/* El foco: recuadro de luz sobre el elemento; su box-shadow gigante
                oscurece todo el resto de la pantalla. Sin foco → velo completo. */}
            {focoRect && (!buscando || transicion) ? (
                <div
                    className="absolute rounded-xl pointer-events-none transition-all duration-300 ease-out ring-2 ring-primary/80"
                    style={{
                        top: focoRect.top,
                        left: focoRect.left,
                        width: focoRect.width,
                        height: focoRect.height,
                        boxShadow: `0 0 0 9999px ${sombraVelo}`,
                    }}
                />
            ) : (
                <div className="absolute inset-0 transition-opacity duration-300" style={{ backgroundColor: sombraVelo }} />
            )}

            {/* Cartel de transición: "entrando a la sección X". */}
            {buscando && pasoActual.opcional ? (
                /* Paso opcional buscando su elemento: no mostrar el globo todavía —
                   si el elemento no existe, el paso se saltea sin flashear. */
                null
            ) : transicion ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center animate-in fade-in zoom-in-95 duration-300">
                        <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-white/70 mb-2">
                            Pasamos a la sección
                        </p>
                        <p className="text-4xl md:text-5xl font-black text-white drop-shadow-lg">
                            {transicion}
                        </p>
                        <div className="mt-4 h-1 w-16 bg-primary rounded-full mx-auto animate-pulse" />
                    </div>
                </div>
            ) : (
                /* Globo de información: título + texto conciso + controles. */
                <div
                    ref={globoRef}
                    className="absolute bg-white rounded-2xl shadow-2xl p-5 transition-all duration-300 ease-out animate-in fade-in"
                    style={{ ...globoStyle, pointerEvents: 'auto' }}
                >
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
                            Paso {paso + 1} de {pasos.length}
                        </p>
                        <button
                            onClick={terminar}
                            className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                        >
                            Omitir recorrido
                        </button>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 leading-snug mb-1.5">
                        {pasoActual.titulo}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                        {pasoActual.cuerpo}
                    </p>

                    {/* Progreso */}
                    <div className="flex items-center gap-1 mt-4 mb-4">
                        {pasos.map((p, i) => (
                            <div
                                key={p.id}
                                className={`h-1 rounded-full transition-all duration-300 ${i === paso ? 'w-5 bg-primary' : 'w-2 bg-slate-200'}`}
                            />
                        ))}
                    </div>

                    {pasoActual.avanza ? (
                        /* Paso interactivo: la acción real de la persona hace avanzar. */
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-xs font-semibold text-primary">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                                </span>
                                Esperando su acción…
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={avanzar}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                Saltear paso
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={retroceder}
                                className={paso === 0 ? 'invisible' : 'text-slate-500'}
                            >
                                Anterior
                            </Button>
                            <Button
                                size="sm"
                                onClick={avanzar}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6"
                            >
                                {pasoActual.botonSiguiente || 'Siguiente'}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
