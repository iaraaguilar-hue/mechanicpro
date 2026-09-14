// ─────────────────────────────────────────────────────────────
// EL FILTRO DE COLUMNA, como en Excel (14-sep-2026).
//
// Pedido de Ariel Leira (Leira Bikes): filtrar la columna de entrega "como en
// Excel" y poder acomodar por fecha de entrega. Iara: "todo lo demás de los
// filtros prefiero que sea para todos".
//
// Es el gesto que un taller ya sabe hacer: abrir la columna, ver cada valor que
// aparece con cuántas veces está, y destildar lo que no quiere ver. Por eso no es
// una barra de filtros nueva con sus propias reglas: son las casillas de Excel.
//
// Los cambios se aplican al tocar, sin botón «Aceptar»: con la tabla a la vista,
// ver cómo cambia mientras se tilda es la confirmación.
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ArrowDownNarrowWide, ArrowUpWideNarrow, ChevronDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpcionFiltro {
    valor: string;
    etiqueta: string;
    cantidad: number;
}

export type Direccion = 'asc' | 'desc';

interface Props {
    titulo: string;
    opciones: OpcionFiltro[];
    /** null = sin filtro (se ven todas). */
    seleccion: Set<string> | null;
    onCambiar: (seleccion: Set<string> | null) => void;
    /** Si la columna ordena: la dirección actual, o null si hoy se ordena por otra. */
    orden?: Direccion | null;
    onOrdenar?: (dir: Direccion) => void;
    etiquetasOrden?: { asc: string; desc: string };
    /** `encabezado` va en la cabecera de la tabla; `pastilla`, arriba de las tarjetas del celular. */
    variante?: 'encabezado' | 'pastilla';
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function FiltroDeColumna({
    titulo, opciones, seleccion, onCambiar, orden = null, onOrdenar,
    etiquetasOrden = { asc: 'De menor a mayor', desc: 'De mayor a menor' },
    variante = 'encabezado',
}: Props) {
    const [busqueda, setBusqueda] = useState('');
    const activo = seleccion !== null;

    const visibles = useMemo(() => {
        const q = normalizar(busqueda.trim());
        return q ? opciones.filter(o => normalizar(o.etiqueta).includes(q)) : opciones;
    }, [opciones, busqueda]);

    const marcada = (v: string) => seleccion === null || seleccion.has(v);
    const todasMarcadas = visibles.length > 0 && visibles.every(o => marcada(o.valor));

    // Un filtro que termina con todo tildado vuelve a ser "sin filtro": si no, una
    // opción nueva (una orden que entra con otra fecha) quedaría escondida.
    const aplicar = (nueva: Set<string>) =>
        onCambiar(opciones.every(o => nueva.has(o.valor)) ? null : nueva);

    const alternar = (v: string) => {
        const nueva = new Set(seleccion ?? opciones.map(o => o.valor));
        if (nueva.has(v)) nueva.delete(v); else nueva.add(v);
        aplicar(nueva);
    };

    const alternarTodas = () => {
        const nueva = new Set(seleccion ?? opciones.map(o => o.valor));
        for (const o of visibles) {
            if (todasMarcadas) nueva.delete(o.valor); else nueva.add(o.valor);
        }
        aplicar(nueva);
    };

    const flecha = orden === 'asc'
        ? <ArrowDownNarrowWide className="h-3.5 w-3.5" />
        : orden === 'desc' ? <ArrowUpWideNarrow className="h-3.5 w-3.5" /> : null;

    return (
        <Popover onOpenChange={(abierto) => { if (!abierto) setBusqueda(''); }}>
            <PopoverTrigger asChild>
                {variante === 'encabezado' ? (
                    <button
                        type="button"
                        className={cn(
                            '-ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 font-medium transition-colors hover:bg-muted',
                            (activo || orden) && 'text-primary',
                        )}
                        title={`Filtrar u ordenar por ${titulo.toLowerCase()}`}
                    >
                        {titulo}
                        {flecha}
                        {activo ? <Filter className="h-3.5 w-3.5 fill-current" /> : <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
                    </button>
                ) : (
                    <button
                        type="button"
                        className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                            activo || orden ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-600',
                        )}
                    >
                        {titulo}
                        {activo && ` (${seleccion!.size})`}
                        {flecha}
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </button>
                )}
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
                {onOrdenar && (
                    <div className="mb-2 space-y-0.5 border-b pb-2">
                        {(['asc', 'desc'] as const).map(dir => (
                            <button
                                key={dir}
                                type="button"
                                onClick={() => onOrdenar(dir)}
                                className={cn(
                                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50',
                                    orden === dir && 'bg-primary/10 font-semibold text-primary',
                                )}
                            >
                                {dir === 'asc' ? <ArrowDownNarrowWide className="h-4 w-4" /> : <ArrowUpWideNarrow className="h-4 w-4" />}
                                {etiquetasOrden[dir]}
                            </button>
                        ))}
                    </div>
                )}
                {opciones.length > 8 && (
                    <Input
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar"
                        className="mb-2 h-8"
                    />
                )}
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-slate-50">
                    <Checkbox checked={todasMarcadas} onCheckedChange={alternarTodas} />
                    {busqueda.trim() ? 'Todos los que coinciden' : 'Seleccionar todo'}
                </label>
                <div className="max-h-60 overflow-y-auto">
                    {visibles.map(o => (
                        <label
                            key={o.valor}
                            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                        >
                            <Checkbox checked={marcada(o.valor)} onCheckedChange={() => alternar(o.valor)} />
                            <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{o.cantidad}</span>
                        </label>
                    ))}
                    {visibles.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs text-muted-foreground">No hay nada con eso.</p>
                    )}
                </div>
                {activo && (
                    <button
                        type="button"
                        onClick={() => onCambiar(null)}
                        className="mt-2 w-full rounded-md border px-2 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                        Quitar este filtro
                    </button>
                )}
            </PopoverContent>
        </Popover>
    );
}
