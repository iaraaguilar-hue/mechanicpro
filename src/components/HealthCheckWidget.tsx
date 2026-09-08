import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { HeartPulse, Check, CalendarDays } from "lucide-react";

// 🔴 «Service Brain» se sumó el 8-sep-2026 a pedido de Ariel Leira (Leira Bikes).
// La horquilla ya estaba; lo que faltaba era la suspensión trasera, que en las
// Specialized es el Brain y tiene su propio service (y su propio vencimiento en
// horas de uso, distinto al de la horquilla). Sin la fila, el mecánico que hoy
// hace ese trabajo no lo puede dejar anotado y el Motor de Retención nunca lo
// vuelve a traer: la reventa más cara del taller quedaba fuera del sistema.
const COMPONENTS = [
    "Cadena",
    "Piñón/Cassette",
    "Líquido Tubeless",
    "Pastillas de Freno",
    "Service Horquilla",
    "Service Brain",
    "Cubiertas"
];

const QUICK_ACTIONS = [
    { label: "1 Mes", months: 1 },
    { label: "3 Meses", months: 3 },
    { label: "6 Meses", months: 6 },
    { label: "1 Año", months: 12 },
];

export interface HealthCheckData {
    component: string;
    health: number;
    dueDate: string; // YYYY-MM-DD
}

interface HealthCheckWidgetProps {
    onChange: (data: HealthCheckData[]) => void;
}

export function HealthCheckWidget({ onChange }: HealthCheckWidgetProps) {
    const [selections, setSelections] = useState<{ [key: string]: { health: number, date: string, active: boolean, monthsSelected?: number } }>({});

    const handleQuickSelect = (component: string, months: number) => {
        // Calculate date
        const date = getDateMonthsFromNow(months);

        // Estimate health based on time (Optional logic, but nice to have)
        // 1 month = 80%, 3 months = 60%, 6 months = 40%, 1 year = 20%
        let estimatedHealth = 100;
        if (months === 1) estimatedHealth = 90;
        if (months === 3) estimatedHealth = 70;
        if (months === 6) estimatedHealth = 50;
        if (months === 12) estimatedHealth = 20;

        const newData = {
            health: estimatedHealth,
            date,
            active: true,
            monthsSelected: months
        };

        // If clicking the same one, toggle off?
        const current = selections[component];
        if (current && current.active && current.monthsSelected === months) {
            const { [component]: removed, ...rest } = selections;
            updateSelections(rest);
        } else {
            const newSelections = { ...selections, [component]: newData };
            updateSelections(newSelections);
        }
    };

    const updateSelections = (newSelections: typeof selections) => {
        setSelections(newSelections);

        const result: HealthCheckData[] = Object.entries(newSelections)
            .filter(([_, val]) => val.active)
            .map(([comp, val]) => ({
                component: comp,
                health: val.health,
                dueDate: val.date
            }));

        onChange(result);
    };

    const getDateMonthsFromNow = (months: number) => {
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        return d.toISOString().split('T')[0];
    };

    return (
        <Card className="border-l-4 border-green-500 shadow-sm">
            <CardHeader className="pb-3 bg-green-50/50">
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-green-800">
                    <HeartPulse className="h-5 w-5" />
                    Diagnóstico de Estado (Health Check)
                </CardTitle>
                <p className="text-sm text-muted-foreground">Seleccione la vida útil restante para cada componente.</p>
            </CardHeader>
            <CardContent className="space-y-2 pt-4">
                <div className="grid gap-2">
                    {COMPONENTS.map(component => {
                        const selection = selections[component];
                        const isActive = selection?.active;

                        return (
                            <div key={component} className={cn(
                                "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-all",
                                isActive ? "bg-green-50 border-green-200" : "bg-card border-border hover:bg-muted/30"
                            )}>
                                <div className="flex items-center gap-2 min-w-[150px]">
                                    {isActive ? <Check className="h-4 w-4 text-green-600" /> : <div className="w-4" />}
                                    <Label className={cn("text-base cursor-pointer", isActive && "font-bold text-green-800")}>
                                        {component}
                                    </Label>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {QUICK_ACTIONS.map(action => {
                                        const isSelected = selection?.monthsSelected === action.months;
                                        return (
                                            <Button
                                                key={action.label}
                                                size="sm"
                                                variant={isSelected ? "default" : "outline"}
                                                onClick={() => handleQuickSelect(component, action.months)}
                                                className={cn(
                                                    "h-8 text-xs transition-colors",
                                                    isSelected ? "bg-green-600 hover:bg-green-700 text-white" : "hover:border-green-300 hover:text-green-700"
                                                )}
                                            >
                                                {action.label}
                                            </Button>
                                        )
                                    })}
                                </div>

                                {isActive && (
                                    <div className="text-xs text-muted-foreground sm:text-right min-w-[100px] flex items-center justify-end gap-1">
                                        <CalendarDays className="h-3 w-3" />
                                        {new Date(selection.date).toLocaleDateString()}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
