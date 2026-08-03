import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { PASOS_TOUR } from '@/lib/tourSteps';
import { marcarTourVisto, tourVisto } from '@/lib/tourSeen';
import { useAuthStore } from '@/store/authStore';

// ─────────────────────────────────────────────────────────────
// Recorrido de bienvenida (onboarding) — pedido de Iara, ago-2026.
// Objetivo: que un taller nuevo aprenda a usar TODO el sistema sin
// necesitar una reunión de capacitación. Técnica de foco: se ilumina
// el elemento real de la pantalla (el resto queda oscurecido) y un
// globo explica su valor en tono formal; se avanza con «Siguiente».
//
// Motor propio, sin dependencias nuevas: el "agujero" de luz es un
// div posicionado sobre el elemento con un box-shadow gigante que
// oscurece todo lo demás. Si un elemento no existe en este viewport
// o plan, el paso degrada a globo centrado: nunca se rompe.
// Se muestra una vez por dispositivo (localStorage, ver tourSeen.ts)
// y se puede repetir desde Configuración → Preferencias.
// ─────────────────────────────────────────────────────────────

interface TourState {
    activo: boolean;
    paso: number;
    iniciar: () => void;
    terminar: () => void;
    setPaso: (paso: number) => void;
}

export const useTourStore = create<TourState>((set) => ({
    activo: false,
    paso: 0,
    iniciar: () => set({ activo: true, paso: 0 }),
    terminar: () => {
        marcarTourVisto();
        set({ activo: false, paso: 0 });
    },
    setPaso: (paso) => set({ paso }),
}));

interface Rect { top: number; left: number; width: number; height: number; }

const MARGEN_FOCO = 8;       // aire entre el elemento y el borde iluminado
const ANCHO_GLOBO = 400;     // máximo; en mobile se achica al viewport

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
    const { activo, paso, iniciar, terminar, setPaso } = useTourStore();
    const session = useAuthStore((s) => s.session);
    const taller = useAuthStore((s) => s.taller);
    const rol = useAuthStore((s) => s.rol);
    const navigate = useNavigate();
    const location = useLocation();

    const [targetRect, setTargetRect] = useState<Rect | null>(null);
    const [buscando, setBuscando] = useState(false);
    const globoRef = useRef<HTMLDivElement>(null);
    const [globoStyle, setGloboStyle] = useState<React.CSSProperties>({});

    const pasoActual = PASOS_TOUR[paso];
    const esUltimo = paso === PASOS_TOUR.length - 1;

    // ── Auto-arranque: primera vez que un usuario del taller abre la app
    // en este dispositivo. El super_admin (Iara) no lo necesita.
    useEffect(() => {
        if (!session || !taller || activo) return;
        if (rol?.toLowerCase()?.trim() === 'super_admin') return;
        if (tourVisto()) return;
        // Pequeña espera para que la pantalla termine de hidratar datos.
        const t = setTimeout(() => iniciar(), 1200);
        return () => clearTimeout(t);
    }, [session, taller, rol, activo, iniciar]);

    // ── Al cambiar de paso: navegar a la ruta del paso y buscar el elemento.
    useEffect(() => {
        if (!activo || !pasoActual) return;
        let cancelado = false;

        if (pasoActual.ruta && location.pathname !== pasoActual.ruta) {
            navigate(pasoActual.ruta);
        }

        const esMobile = window.innerWidth < 768;
        const selector =
            (esMobile && pasoActual.selectorMobile) || pasoActual.selector;

        if (!selector) {
            setTargetRect(null);
            setBuscando(false);
            return;
        }

        // El elemento puede tardar en montarse tras navegar (hidratación):
        // se lo busca hasta 3 s; si no aparece, globo centrado y a seguir.
        setBuscando(true);
        const inicio = Date.now();
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
                // Medimos después del scroll para que el rect quede firme.
                requestAnimationFrame(() => {
                    if (cancelado) return;
                    const r = el.getBoundingClientRect();
                    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
                    setBuscando(false);
                });
            } else if (Date.now() - inicio < 3000) {
                setTimeout(intento, 120);
            } else {
                setTargetRect(null);
                setBuscando(false);
            }
        };
        intento();

        return () => { cancelado = true; };
        // location.pathname a propósito NO está en las deps: navegar es parte
        // del efecto; re-correrlo al llegar duplicaría la búsqueda.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activo, paso]);

    // ── Seguir al elemento si la página se reacomoda (resize, imágenes, scroll).
    useEffect(() => {
        if (!activo || !pasoActual) return;
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
    }, [activo, paso, pasoActual]);

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

    const avanzar = useCallback(() => {
        if (esUltimo) {
            terminar();
            return;
        }
        setPaso(paso + 1);
    }, [esUltimo, paso, setPaso, terminar]);

    const retroceder = useCallback(() => {
        if (paso > 0) setPaso(paso - 1);
    }, [paso, setPaso]);

    // ── Teclado: → / Enter avanza, ← retrocede, Esc omite.
    useEffect(() => {
        if (!activo) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); avanzar(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); retroceder(); }
            if (e.key === 'Escape') { e.preventDefault(); terminar(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [activo, avanzar, retroceder, terminar]);

    if (!activo || !pasoActual) return null;

    return (
        <div
            className="fixed inset-0 z-[150]"
            role="dialog"
            aria-modal="true"
            aria-label="Recorrido de bienvenida"
        >
            {/* Capa que bloquea la interacción con la app durante el recorrido. */}
            <div className="absolute inset-0" />

            {/* El foco: recuadro de luz sobre el elemento; su box-shadow gigante
                oscurece todo el resto de la pantalla. Sin foco → velo completo. */}
            {focoRect && !buscando ? (
                <div
                    className="absolute rounded-xl pointer-events-none transition-all duration-300 ease-out ring-2 ring-primary/80"
                    style={{
                        top: focoRect.top,
                        left: focoRect.left,
                        width: focoRect.width,
                        height: focoRect.height,
                        boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.72)',
                    }}
                />
            ) : (
                <div className="absolute inset-0 transition-opacity duration-300" style={{ backgroundColor: 'rgba(2, 6, 23, 0.72)' }} />
            )}

            {/* Globo de información: título + texto conciso + controles. */}
            <div
                ref={globoRef}
                className="absolute bg-white rounded-2xl shadow-2xl p-5 transition-all duration-300 ease-out animate-in fade-in"
                style={globoStyle}
            >
                <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
                        Paso {paso + 1} de {PASOS_TOUR.length}
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
                    {PASOS_TOUR.map((p, i) => (
                        <div
                            key={p.id}
                            className={`h-1 rounded-full transition-all duration-300 ${i === paso ? 'w-5 bg-primary' : 'w-2 bg-slate-200'}`}
                        />
                    ))}
                </div>

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
            </div>
        </div>
    );
}
