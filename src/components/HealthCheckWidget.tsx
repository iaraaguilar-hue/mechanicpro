import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HeartPulse, Check, CalendarDays } from "lucide-react";
import { diaCalendario } from "@/lib/fechaAR";
import { useAuthStore } from "@/store/authStore";
import { configMantenimiento, hoyAR, sumarMeses, PLAZOS_MESES, mesesEnPalabras } from "@/lib/mantenimiento";

// ─────────────────────────────────────────────────────────────
// EL DIAGNÓSTICO: cuánto le queda a cada componente.
//
// 14-sep-2026, pedido de Ariel Leira (Leira Bikes): los plazos eran cuatro fijos
// (1, 3, 6 y 12 meses) y él los quiere "por 1 mes, 2 meses, 3, 4, 5, etc.". Y la
// lista de componentes ya no es la misma para todos: la arma cada taller en
// Configuración, con el plazo que suele sugerir para cada uno (`lib/mantenimiento.ts`).
//
// El plazo sugerido NO se tilda solo: marcarlo lo pondría como aviso en Retención
// aunque nadie haya mirado ese componente. Se ve resaltado para tildarlo de un toque.
// ─────────────────────────────────────────────────────────────

export interface HealthCheckData {
    component: string;
    health: number;
    dueDate: string; // YYYY-MM-DD
}

interface HealthCheckWidgetProps {
    onChange: (data: HealthCheckData[]) => void;
}

// La "salud" es una estimación a partir del plazo. `recordatorios` no tiene dónde
// guardarla, así que hoy no sale de acá; se conservan los valores de siempre para
// 1, 3, 6 y 12 meses y se completan los del medio.
const SALUD: Record<number, number> = { 1: 90, 2: 80, 3: 70, 4: 65, 5: 55, 6: 50, 9: 35, 12: 20, 18: 15, 24: 10 };

export function HealthCheckWidget({ onChange }: HealthCheckWidgetProps) {
    const taller = useAuthStore(s => s.taller);
    const { componentes } = configMantenimiento(taller);
    const [selections, setSelections] = useState<Record<string, { meses: number; date: string }>>({});

    const elegir = (component: string, meses: number) => {
        const actual = selections[component];
        const nuevas = { ...selections };
        // Tocar el mismo plazo otra vez lo destilda.
        if (actual?.meses === meses) delete nuevas[component];
        else nuevas[component] = { meses, date: sumarMeses(hoyAR(), meses) };
        setSelections(nuevas);
        onChange(Object.entries(nuevas).map(([comp, v]) => ({
            component: comp,
            health: SALUD[v.meses] ?? 50,
            dueDate: v.date,
        })));
    };

    return (
        <Card className="border-l-4 border-green-500 shadow-sm">
            <CardHeader className="pb-3 bg-green-50/50">
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-green-800">
                    <HeartPulse className="h-5 w-5" />
                    Diagnóstico de Estado (Health Check)
                </CardTitle>
                <p className="text-sm text-muted-foreground">En cuántos meses hay que volver a mirar cada componente.</p>
            </CardHeader>
            <CardContent className="space-y-2 pt-4">
                <div className="grid gap-2">
                    {componentes.map(({ nombre, meses: sugerido }) => {
                        const sel = selections[nombre];
                        return (
                            <div key={nombre} className={cn(
                                "flex flex-col gap-2 p-3 rounded-lg border transition-all",
                                sel ? "bg-green-50 border-green-200" : "bg-card border-border hover:bg-muted/30"
                            )}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {sel ? <Check className="h-4 w-4 shrink-0 text-green-600" /> : <div className="w-4 shrink-0" />}
                                        <span className={cn("text-base", sel && "font-bold text-green-800")}>{nombre}</span>
                                        {sugerido && !sel && (
                                            <span className="text-[11px] text-green-700 whitespace-nowrap">sugerido: {mesesEnPalabras(sugerido)}</span>
                                        )}
                                    </div>
                                    {sel && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                                            <CalendarDays className="h-3 w-3" />
                                            {diaCalendario(sel.date)}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 pl-6">
                                    <span className="text-[11px] text-muted-foreground mr-0.5">meses</span>
                                    {PLAZOS_MESES.map(m => {
                                        const elegido = sel?.meses === m;
                                        return (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => elegir(nombre, m)}
                                                title={mesesEnPalabras(m)}
                                                className={cn(
                                                    "h-8 min-w-[2.25rem] px-2 rounded-md border text-xs font-semibold tabular-nums transition-colors",
                                                    elegido
                                                        ? "bg-green-600 border-green-600 text-white hover:bg-green-700"
                                                        : m === sugerido
                                                            ? "border-green-400 bg-green-50 text-green-800 hover:bg-green-100"
                                                            : "border-border bg-background hover:border-green-300 hover:text-green-700"
                                                )}
                                            >
                                                {m}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
