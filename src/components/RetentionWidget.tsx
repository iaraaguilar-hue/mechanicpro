import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ⚠️ Este componente hoy NO está montado en ninguna pantalla (el diagnóstico vivo
// es HealthCheckWidget). Se mantiene la lista igual a la de allá: dos listas que
// dicen cosas distintas es una trampa esperando al que lo vuelva a usar.
const COMPONENTS = [
    "Cadena",
    "Piñón/Cassette",
    "Líquido Tubeless",
    "Pastillas de Freno",
    "Service Horquilla",
    "Service Brain"
];

const TIMEFRAMES = [
    { label: "1 Mes", months: 1 },
    { label: "3 Meses", months: 3 },
    { label: "6 Meses", months: 6 },
    { label: "1 Año", months: 12 }
];

interface RetentionData {
    [component: string]: Date; // Due Date
}

interface RetentionWidgetProps {
    onChange: (data: RetentionData) => void;
}

export function RetentionWidget({ onChange }: RetentionWidgetProps) {
    const [selections, setSelections] = useState<{ [key: string]: number }>({}); // component -> months

    const handleSelect = (component: string, months: number) => {
        const newSelections = { ...selections, [component]: months };

        // Toggle off if same clicked?
        if (selections[component] === months) {
            delete newSelections[component];
        }

        setSelections(newSelections);

        // Convert to Date objects
        const data: RetentionData = {};
        Object.entries(newSelections).forEach(([comp, m]) => {
            const date = new Date();
            date.setMonth(date.getMonth() + m);
            data[comp] = date;
        });
        onChange(data);
    };

    return (
        <Card className="border-dashed border-primary/50 bg-primary/5">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    Ciclo de Vida de Componentes <span className="text-xs font-normal text-muted-foreground">(Recordatorios)</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Estimar vida útil restante para generar alertas automáticas al cliente.
                </p>
                <div className="grid gap-3">
                    {COMPONENTS.map(component => (
                        <div key={component} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2 last:border-0">
                            <Label className="w-40 font-medium">{component}</Label>
                            <div className="flex flex-wrap gap-2">
                                {TIMEFRAMES.map(tf => (
                                    <Button
                                        key={tf.label}
                                        variant="outline"
                                        size="sm"
                                        type="button" // Prevent form sub
                                        onClick={() => handleSelect(component, tf.months)}
                                        className={cn(
                                            "h-7 text-xs hover:bg-primary hover:text-white transition-colors",
                                            selections[component] === tf.months
                                                ? "bg-primary text-white border-primary"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        {tf.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
