/**
 * BuscadorProducto — el campo con el que se carga un repuesto en una orden.
 *
 * Reemplaza al input de texto pelado donde el mecánico escribía el repuesto
 * letra por letra. Ahora escribe dos o tres, elige de la lista, y el precio se
 * completa solo.
 *
 * Sirve a los dos tipos de taller sin cambiar nada:
 *   · CON ERP (Contabilium): busca sobre el catálogo importado, con SKU.
 *   · SIN integración: busca sobre lo que ese taller viene cargando. La lista
 *     se ordena por lo que MÁS usa, así que a las pocas semanas acierta igual.
 *
 * Tres decisiones de producto que vale la pena dejar escritas:
 *
 * 1. NUNCA BLOQUEA. Abajo de todo siempre está la opción de usar el texto tal
 *    como se escribió. Un buscador que obliga a elegir de una lista frena al
 *    mecánico justo cuando el repuesto no está cargado — y ahí se deja de usar
 *    la app. El campo sigue siendo de texto libre; el buscador es una ayuda,
 *    no una aduana.
 *
 * 2. CON EL CAMPO VACÍO YA SUGIERE. Hacer foco y ver los repuestos habituales
 *    del taller es lo que más tiempo ahorra, y sale gratis.
 *
 * 3. TODO CON TECLADO. El mecánico carga órdenes con las dos manos: ↑ ↓ para
 *    moverse, Enter para elegir, Esc para volver al texto libre.
 *
 * POR QUÉ EL PANEL NO USA <Popover> (Radix), que es lo que usa el resto de la
 * app: Radix cierra el panel cuando el foco está fuera de él, y acá el foco
 * tiene que quedarse en el input para poder seguir escribiendo. Además el
 * cuerpo del modal de la orden tiene scroll propio, que recorta cualquier
 * desplegable posicionado adentro. Por eso el panel se dibuja en un portal a
 * `body`, con posición calculada a partir del input.
 */
import { useMemo, useRef, useState, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { useDataStore } from '@/store/dataStore';
import { buscarProductos, resaltar, claveProducto, type ProductoTaller } from '@/lib/buscadorProductos';
import { Search, Package, Wrench, CornerDownLeft, TrendingUp, EyeOff, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuscadorProductoProps {
    value: string;
    onChange: (nombre: string) => void;
    /** Se dispara al elegir del catálogo: sirve para autocompletar el precio. */
    onSeleccionar?: (producto: ProductoTaller) => void;
    categoria: 'part' | 'labor';
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

const MAX_RESULTADOS = 7;
const ALTO_PANEL = 340;   // alto máximo estimado, para decidir si abre hacia arriba
const ANCHO_MINIMO = 340;

export function BuscadorProducto({
    value,
    onChange,
    onSeleccionar,
    categoria,
    placeholder = 'Buscá un repuesto o escribilo',
    className,
    disabled,
}: BuscadorProductoProps) {
    const productos = useDataStore(s => s.productos);
    const ocultarProducto = useDataStore(s => s.ocultarProducto);

    const [abierto, setAbierto] = useState(false);
    const [activo, setActivo] = useState(0);
    const [caja, setCaja] = useState<{ top: number; left: number; width: number; arriba: boolean } | null>(null);

    const campoRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();

    const resultados = useMemo(
        () => buscarProductos(productos, value, { categoria, limite: MAX_RESULTADOS }),
        [productos, value, categoria]
    );

    const sinConsulta = !claveProducto(value);
    // La fila de "usar lo que escribí" solo aparece si el texto no es ya,
    // exactamente, alguno de los resultados: repetirlo sería ruido.
    const mostrarTextoLibre =
        !!value.trim() && !resultados.some(r => r.clave === claveProducto(value));
    const totalFilas = resultados.length + (mostrarTextoLibre ? 1 : 0);

    // ── Posición del panel ───────────────────────────────────────────────────
    const recalcular = useCallback(() => {
        const r = campoRef.current?.getBoundingClientRect();
        if (!r) return;
        const espacioAbajo = window.innerHeight - r.bottom;
        const arriba = espacioAbajo < ALTO_PANEL && r.top > espacioAbajo;
        setCaja({
            top: arriba ? r.top - 6 : r.bottom + 6,
            left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, ANCHO_MINIMO) - 8)),
            width: Math.max(r.width, ANCHO_MINIMO),
            arriba,
        });
    }, []);

    useEffect(() => {
        if (!abierto) return;
        recalcular();
        // `capture` para enterarse también del scroll del cuerpo del modal, que
        // es un contenedor interno y no dispara el evento en window por burbujeo.
        window.addEventListener('scroll', recalcular, true);
        window.addEventListener('resize', recalcular);
        return () => {
            window.removeEventListener('scroll', recalcular, true);
            window.removeEventListener('resize', recalcular);
        };
    }, [abierto, recalcular]);

    // ── Cerrar al hacer clic afuera ──────────────────────────────────────────
    useEffect(() => {
        if (!abierto) return;
        const alClic = (e: MouseEvent) => {
            const t = e.target as Node;
            if (campoRef.current?.contains(t) || panelRef.current?.contains(t)) return;
            setAbierto(false);
        };
        document.addEventListener('mousedown', alClic);
        return () => document.removeEventListener('mousedown', alClic);
    }, [abierto]);

    // ── Escape ───────────────────────────────────────────────────────────────
    // Escape con la lista abierta cierra SOLO la lista. Sin esto cierra el modal
    // de la orden entero y se pierde todo lo cargado (verificado en la app).
    //
    // Va en `window` y en fase de CAPTURA, que es lo único que gana: el modal
    // (Radix Dialog) escucha Escape en captura sobre `document`, y como se
    // registró antes que nosotros, ahí llegaría primero. La captura empieza en
    // window, así que frenamos el evento un escalón antes de que `document` lo vea.
    useEffect(() => {
        if (!abierto) return;
        const alTeclado = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            setAbierto(false);
            inputRef.current?.focus();
        };
        window.addEventListener('keydown', alTeclado, true);
        return () => window.removeEventListener('keydown', alTeclado, true);
    }, [abierto]);

    // Cada vez que cambia lo que se escribe, el resaltado vuelve arriba.
    useEffect(() => { setActivo(0); }, [value, categoria]);

    // Mantener a la vista la fila resaltada cuando se navega con el teclado.
    useEffect(() => {
        if (!abierto) return;
        panelRef.current
            ?.querySelector<HTMLElement>(`[data-fila="${activo}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [activo, abierto]);

    const elegir = (p: ProductoTaller) => {
        onChange(p.nombre);
        onSeleccionar?.(p);
        setAbierto(false);
        inputRef.current?.focus();
    };

    const usarTextoLibre = () => {
        setAbierto(false);
        inputRef.current?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!abierto) { setAbierto(true); return; }
            if (!totalFilas) return;
            e.preventDefault();
            const paso = e.key === 'ArrowDown' ? 1 : -1;
            setActivo(a => (a + paso + totalFilas) % totalFilas);
            return;
        }
        if (e.key === 'Enter' && abierto && totalFilas) {
            e.preventDefault();
            if (activo < resultados.length) elegir(resultados[activo]);
            else usarTextoLibre();
            return;
        }
        if (e.key === 'Tab') setAbierto(false);
    };

    const Icono = categoria === 'labor' ? Wrench : Package;

    return (
        <div ref={campoRef} className={cn('relative flex-1', className)}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
                ref={inputRef}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                autoComplete="off"
                role="combobox"
                aria-expanded={abierto}
                aria-controls={listboxId}
                aria-autocomplete="list"
                className="pl-9"
                onChange={e => { onChange(e.target.value); setAbierto(true); }}
                onFocus={() => setAbierto(true)}
                // También al clic, no solo al foco: si el campo YA tiene el foco
                // (por ejemplo después de cerrar la lista con Escape) el evento
                // de foco no vuelve a dispararse y el campo quedaría mudo.
                onClick={() => setAbierto(true)}
                onKeyDown={onKeyDown}
            />

            {abierto && !disabled && caja && createPortal(
                <div
                    ref={panelRef}
                    id={listboxId}
                    role="listbox"
                    style={{
                        position: 'fixed',
                        top: caja.arriba ? undefined : caja.top,
                        bottom: caja.arriba ? window.innerHeight - caja.top : undefined,
                        left: caja.left,
                        width: caja.width,
                        // El modal de la orden apaga los eventos del resto de la
                        // página; el panel vive fuera de él y tiene que reactivarlos.
                        pointerEvents: 'auto',
                        zIndex: 60,
                    }}
                    // Evita que el clic saque el foco del input antes de elegir.
                    onMouseDown={e => e.preventDefault()}
                    className="overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95"
                >
                    {totalFilas === 0 ? (
                        <div className="px-4 py-6 text-center">
                            <p className="text-sm font-medium text-muted-foreground">
                                {sinConsulta
                                    ? `Todavía no cargaste ${categoria === 'labor' ? 'trabajos' : 'repuestos'}`
                                    : 'No encontré nada con eso'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground/80">
                                {sinConsulta
                                    ? `Escribí ${categoria === 'labor' ? 'el trabajo' : 'el repuesto'} y queda guardado para la próxima.`
                                    : 'Escribilo igual: se guarda y la próxima vez aparece acá.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {sinConsulta
                                    ? <><TrendingUp className="h-3 w-3" /> Lo que más usás</>
                                    : <><Search className="h-3 w-3" /> {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}</>}
                            </div>

                            <div className="max-h-[260px] overflow-y-auto py-1">
                                {resultados.map((p, i) => (
                                    <FilaProducto
                                        key={p.id}
                                        producto={p}
                                        consulta={value}
                                        indice={i}
                                        activo={i === activo}
                                        Icono={Icono}
                                        onElegir={() => elegir(p)}
                                        onApuntar={() => setActivo(i)}
                                        onOcultar={
                                            p.veces_usado > 0 && !p.id.startsWith('nuevo:')
                                                ? () => { void ocultarProducto(p.id).catch(() => { }); }
                                                : undefined
                                        }
                                    />
                                ))}
                            </div>

                            {/* FUERA del scroll, a propósito: es la salida para cuando el
                                repuesto no está en el catálogo, y si queda debajo del
                                pliegue de la lista el mecánico no la ve y cree que el
                                buscador lo está frenando. */}
                            {mostrarTextoLibre && (
                                <button
                                    type="button"
                                    data-fila={resultados.length}
                                    role="option"
                                    aria-selected={activo === resultados.length}
                                    onMouseMove={() => setActivo(resultados.length)}
                                    onClick={usarTextoLibre}
                                    className={cn(
                                        'flex w-full items-center gap-2.5 border-t px-3 py-2.5 text-left transition-colors',
                                        activo === resultados.length ? 'bg-primary/10' : 'bg-muted/20 hover:bg-muted/60'
                                    )}
                                >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 text-muted-foreground">
                                        <CornerDownLeft className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                                        Usar <span className="font-semibold text-foreground">{value.trim()}</span>
                                    </span>
                                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                                        nuevo
                                    </span>
                                </button>
                            )}
                        </>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

function FilaProducto({
    producto, consulta, indice, activo, Icono, onElegir, onApuntar, onOcultar,
}: {
    producto: ProductoTaller;
    consulta: string;
    indice: number;
    activo: boolean;
    Icono: typeof Package;
    onElegir: () => void;
    onApuntar: () => void;
    onOcultar?: () => void;
}) {
    const tramos = resaltar(producto.nombre, consulta);

    return (
        <div
            data-fila={indice}
            role="option"
            aria-selected={activo}
            onMouseMove={onApuntar}
            onClick={onElegir}
            className={cn(
                'group flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors',
                activo ? 'bg-primary/10' : 'hover:bg-muted/60'
            )}
        >
            <span className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                activo ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            )}>
                <Icono className="h-3.5 w-3.5" />
            </span>

            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-tight text-foreground" title={producto.nombre}>
                    {tramos.map((t, i) => (
                        <span key={i} className={t.match ? 'font-bold text-primary' : undefined}>{t.texto}</span>
                    ))}
                </span>
                {(producto.veces_usado > 0 || producto.sku) && (
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] leading-tight text-muted-foreground">
                        {producto.veces_usado > 0 && (
                            <span className="flex shrink-0 items-center gap-1 font-medium text-secondary">
                                <TrendingUp className="h-2.5 w-2.5" />
                                {producto.veces_usado === 1 ? 'usado 1 vez' : `usado ${producto.veces_usado} veces`}
                            </span>
                        )}
                        {producto.sku && (
                            <span className="flex min-w-0 items-center gap-1 font-mono">
                                <Tag className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{producto.sku}</span>
                            </span>
                        )}
                    </span>
                )}
            </span>

            {onOcultar && (
                <button
                    type="button"
                    title="No sugerir más este producto"
                    aria-label={`No sugerir más ${producto.nombre}`}
                    onClick={e => { e.stopPropagation(); onOcultar(); }}
                    className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                >
                    <EyeOff className="h-3.5 w-3.5" />
                </button>
            )}

            <span className={cn(
                'shrink-0 font-mono text-sm tabular-nums',
                producto.precio ? 'font-semibold text-foreground' : 'text-muted-foreground/50'
            )}>
                {/* Redondeado a pesos enteros: el ERP guarda centavos porque el
                    precio sale de un costo, pero en el mostrador se cobra
                    redondo y "$ 17.893,4" se lee como un error. */}
                {producto.precio ? `$ ${Math.round(producto.precio).toLocaleString('es-AR')}` : '—'}
            </span>
        </div>
    );
}
