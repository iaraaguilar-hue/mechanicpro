import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useDataStore } from "@/store/dataStore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { construirDossier } from "@/lib/dossierCliente";
import {
    Bike, Flag, Wrench, AlertTriangle, CalendarClock, Coins, History,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// LA FICHA — lo que el taller sabe de este cliente, de un vistazo.
//
// POR QUÉ: el dato ya existía repartido en cinco tablas. Repartido, no
// se usa: el mecánico atiende a un cliente de seis años como si fuera
// nuevo porque nadie va a abrir cuatro pantallas mientras el tipo está
// parado del otro lado del mostrador.
//
// El orden no es decorativo, es el de la conversación real:
//   1. hace cuánto no viene  → lo primero que se pregunta
//   2. qué está por vencer   → la razón para escribirle hoy
//   3. qué corrió            → el detalle que demuestra que lo conocemos
//   4. qué le hicimos        → el respaldo de todo lo anterior
// ─────────────────────────────────────────────────────────────

const plata = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function Dato({ icono, valor, etiqueta, tono = "slate" }: {
    icono: React.ReactNode; valor: string; etiqueta: string; tono?: "slate" | "red" | "green";
}) {
    const colores = {
        slate: "text-slate-900",
        red: "text-red-600",
        green: "text-emerald-600",
    }[tono];
    return (
        <div className="flex-1 min-w-[120px]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {icono}{etiqueta}
            </div>
            <div className={`text-xl font-bold mt-0.5 ${colores}`}>{valor}</div>
        </div>
    );
}

export default function FichaCliente({ clienteId }: { clienteId: string }) {
    const clientes = useDataStore(s => s.clientes);
    const bicicletas = useDataStore(s => s.bicicletas);
    const servicios = useDataStore(s => s.servicios);
    const recordatorios = useDataStore(s => s.recordatorios);
    const carreras = useDataStore(s => s.carreras);

    const dossier = useMemo(() => {
        const cliente = clientes.find(c => c.id === clienteId);
        if (!cliente) return null;
        return construirDossier({ cliente, bicicletas, servicios, recordatorios, carreras });
    }, [clienteId, clientes, bicicletas, servicios, recordatorios, carreras]);

    if (!dossier) return null;

    const { plata: guita, ultimaVisita, salud, carreras: corrio, historial, bicis } = dossier;
    const vencidos = salud.filter(s => s.diasRestantes < 0);

    // Un cliente sin una sola visita todavía no tiene historia que mostrar:
    // una ficha llena de ceros no demuestra que lo conocemos, demuestra lo
    // contrario. Mejor no mostrar nada.
    if (guita.visitas === 0 && bicis.length === 0) return null;

    return (
        <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white">
            <CardContent className="p-4 space-y-4">

                {/* Los cuatro números que ubican al cliente en dos segundos. */}
                <div className="flex flex-wrap gap-4">
                    <Dato
                        icono={<History className="w-3 h-3" />}
                        etiqueta="Última visita"
                        valor={ultimaVisita.diasSin === null ? "Nunca" : `hace ${ultimaVisita.diasSin} d`}
                        tono={ultimaVisita.diasSin !== null && ultimaVisita.diasSin > 180 ? "red" : "slate"}
                    />
                    {/* "Visitas", no "Services": arriba ya hay un "Total
                        Services" que cuenta solo los terminados. Dos números
                        distintos con la misma etiqueta a tres centímetros
                        hacen que el taller no sepa a cuál creerle. Este cuenta
                        cada vez que una bici de este cliente entró al taller. */}
                    <Dato
                        icono={<Wrench className="w-3 h-3" />}
                        etiqueta="Visitas"
                        valor={String(guita.visitas)}
                    />
                    <Dato
                        icono={<Coins className="w-3 h-3" />}
                        etiqueta="Facturado"
                        valor={plata(guita.totalHistorico)}
                        tono="green"
                    />
                    <Dato
                        icono={<AlertTriangle className="w-3 h-3" />}
                        etiqueta="Por vencer"
                        valor={String(salud.length)}
                        tono={vencidos.length > 0 ? "red" : "slate"}
                    />
                </div>

                {/* Lo que está por vencer: la razón concreta para escribirle. */}
                {salud.length > 0 && (
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5" /> Salud de componentes
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                            {salud.slice(0, 6).map((s, i) => (
                                <Badge
                                    key={`${s.componente}-${i}`}
                                    variant="outline"
                                    className={s.diasRestantes < 0
                                        ? "bg-red-50 text-red-700 border-red-200"
                                        : s.diasRestantes < 30
                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                            : "bg-slate-50 text-slate-600 border-slate-200"}
                                >
                                    {s.componente}
                                    <span className="ml-1 opacity-70">
                                        {s.diasRestantes < 0 ? `venció hace ${Math.abs(s.diasRestantes)} d` : `en ${s.diasRestantes} d`}
                                    </span>
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Las carreras: el dato que ningún taller se acuerda. */}
                {corrio.length > 0 && (
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <Flag className="w-3.5 h-3.5" /> Carreras que corrió
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                            {corrio.slice(0, 5).map((c, i) => (
                                <Badge key={`${c.nombre}-${i}`} variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
                                    {c.nombre}
                                    <span className="ml-1 opacity-70">
                                        {c.diasRestantes > 0 ? `en ${c.diasRestantes} d` : `hace ${Math.abs(c.diasRestantes)} d`}
                                    </span>
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Las bicis, con cuánto hace que no pasa cada una. */}
                {bicis.length > 0 && (
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <Bike className="w-3.5 h-3.5" /> Sus bicis
                        </h4>
                        <div className="space-y-1">
                            {bicis.map(b => (
                                <div key={b.id} className="text-sm flex items-baseline gap-2">
                                    <Link to={`/bikes/${b.id}`} className="font-medium text-slate-800 hover:text-primary hover:underline underline-offset-2">
                                        {b.marca} {b.modelo}
                                    </Link>
                                    <span className="text-xs text-muted-foreground">
                                        {b.visitas} service{b.visitas === 1 ? "" : "s"}
                                        {b.diasSinService !== null && ` · última hace ${b.diasSinService} d`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Los últimos trabajos, con la nota del mecánico. Esto es lo
                    que convierte "un cliente" en "el de la Tarmac que vino con
                    el cambio saltando".

                    🔴 CADA LÍNEA DICE DE QUÉ BICI ES (Iara, 10-ago-2026). Antes
                    solo mostraba fecha + trabajos, así que en un cliente con tres
                    bicis las tres últimas órdenes se leían como el historial de
                    UNA sola: el mecánico creía que a esa bici le habían hecho
                    piñón, aro y cadena, cuando cada cosa fue a una bici distinta.
                    El dato siempre estuvo en el dossier (y el texto que lee la IA
                    sí lo decía) — faltaba en la pantalla, que es donde se decide. */}
                {historial.length > 0 && (
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5" /> Lo último que le hicimos
                        </h4>
                        <div className="space-y-1.5">
                            {historial.slice(0, 3).map(v => (
                                <div key={v.servicioId} className="text-sm border-l-2 border-slate-200 pl-2">
                                    <div className="text-xs text-muted-foreground leading-tight">
                                        {v.fecha ? new Date(v.fecha).toLocaleDateString("es-AR") : "sin fecha"}
                                        {v.bici && (
                                            <>
                                                {" · "}
                                                <span className="font-semibold text-slate-600">{v.bici}</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-slate-800">
                                        {v.trabajos.join(", ") || "Service"}
                                    </div>
                                    {v.notasMecanico && (
                                        <div className="text-xs text-muted-foreground italic mt-0.5">“{v.notasMecanico}”</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
