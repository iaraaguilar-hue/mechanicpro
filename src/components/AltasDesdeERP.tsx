// ─────────────────────────────────────────────────────────────
// Configuración del alta automática de bicis vendidas.
//
// Cuando el local vende una bici, esa bici y su dueño entran solos a Mechanic Pro
// leídos del ERP. Acá el taller decide DÓNDE atiende y a partir de cuántas bicis
// una venta es mayorista.
//
// POR QUÉ EXISTE ESTA PANTALLA (Iara, 3-sep-2026): los dos filtros vivían solo en
// la base y había que editarlos a mano. Con un taller alcanzaba; con el segundo,
// no. Textual: "construí por las dudas".
//
// LOS DOS CASOS QUE CONFIGURA, y los dos se vieron en ventas reales:
//   · Dos compradores de Río Negro entraban como clientes de un taller de Buenos
//     Aires. Iara: "si nos compra una bici en Mendoza, no nos sirve de nada
//     tenerlo en Mechanic Pro".
//   · Una S.A. se llevó tres bicis y entró como si fuera un ciclista. Pero una
//     persona que factura SU bici a SU empresa sí es cliente, así que el corte no
//     puede ser "empresa sí o no": es cuántas bicis lleva.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TallerData } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, MapPin, X, Plus } from 'lucide-react';

// Tal cual las escribe Contabilium, que es contra lo que se compara.
const PROVINCIAS_AR = [
    'Ciudad de Buenos Aires', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Cordoba',
    'Corrientes', 'Entre Rios', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza',
    'Misiones', 'Neuquen', 'Rio Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz',
    'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucuman',
];

export function AltasDesdeERP({ taller, setTaller, avisar }: {
    taller: TallerData;
    setTaller: (t: TallerData) => void;
    avisar: (tipo: 'ok' | 'error', msg: string) => void;
}) {
    const cfg = taller.config_altas_erp || {};
    const [provincias, setProvincias] = useState<string[]>(
        Array.isArray(cfg.provincias) ? cfg.provincias : []
    );
    const [maxBicis, setMaxBicis] = useState<number>(Number(cfg.max_bicis_por_venta) || 1);
    const [guardando, setGuardando] = useState(false);

    const guardar = async (prov: string[], max: number) => {
        const antes = { provincias, maxBicis };
        setProvincias(prov); setMaxBicis(max);
        try {
            setGuardando(true);
            const config_altas_erp = { provincias: prov, max_bicis_por_venta: max };
            const { error } = await supabase.from('talleres')
                .update({ config_altas_erp }).eq('id', taller.id);
            if (error) throw error;
            setTaller({ ...taller, config_altas_erp: config_altas_erp as any });
        } catch (e: any) {
            setProvincias(antes.provincias); setMaxBicis(antes.maxBicis);
            avisar('error', 'No se pudo guardar: ' + e.message);
        } finally {
            setGuardando(false);
        }
    };

    const disponibles = PROVINCIAS_AR.filter(p => !provincias.includes(p));

    return (
        <Card className="flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5" /> La bici vendida entra sola
                </CardTitle>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Cuando vendés una bicicleta, esa bici y su dueño se cargan solos acá, leídos de tu
                    sistema de facturación. Y como la bici entra sin service, el aviso de primer
                    service la levanta cuando cumple el plazo.
                </p>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col gap-4">
                <div className="space-y-2">
                    <Label>¿En qué provincias atendés?</Label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        El que compra de otra provincia no va a traerte la bici, así que no se carga
                        como cliente. {provincias.length === 0 && (
                            <strong className="text-amber-700">
                                Ahora mismo no hay ninguna elegida, así que entran todas.
                            </strong>
                        )}
                    </p>

                    {provincias.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {provincias.map(p => (
                                <span
                                    key={p}
                                    className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 rounded-full pl-2.5 pr-1 py-1"
                                >
                                    {p}
                                    <button
                                        onClick={() => guardar(provincias.filter(x => x !== p), maxBicis)}
                                        disabled={guardando}
                                        className="rounded-full p-0.5 hover:bg-slate-200 transition-colors"
                                        aria-label={`Sacar ${p}`}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {disponibles.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                            <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <select
                                className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                                value=""
                                disabled={guardando}
                                onChange={e => e.target.value && guardar([...provincias, e.target.value], maxBicis)}
                            >
                                <option value="">Agregar una provincia…</option>
                                {disponibles.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                <div className="space-y-2 pt-1 border-t">
                    <Label className="pt-2 block">¿Desde cuántas bicis es venta mayorista?</Label>
                    <div className="flex items-center gap-3">
                        <Input
                            type="number" min={1} max={20} className="w-20 text-center"
                            value={maxBicis}
                            onChange={e => setMaxBicis(Number(e.target.value))}
                            onBlur={() => guardar(provincias, maxBicis)}
                            disabled={guardando}
                        />
                        <span className="text-sm text-muted-foreground">
                            o más en una misma factura
                        </span>
                    </div>
                    {/* El matiz que hace falta explicar, porque es contraintuitivo. */}
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Si una factura tiene más bicis que eso, es venta a un negocio y no se carga.
                        Con una sola, aunque esté facturada a una empresa, se anota para que preguntes
                        de quién es la bici: <strong>mucha gente factura su bicicleta a su empresa</strong> y
                        esos sí son clientes tuyos.
                    </p>
                </div>

                {guardando && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
