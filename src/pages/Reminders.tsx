import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing } from "lucide-react";

export default function Reminders() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <BellRing className="h-8 w-8 text-primary" />
                    Motor de Retención
                </h1>
                <p className="text-muted-foreground mt-1">Sistema de recordatorios automáticos (En Construcción)</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Próximos Vencimientos</CardTitle>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center border-dashed border-2 rounded-lg m-4">
                    <p className="text-muted-foreground">El panel de alertas aparecerá aquí pronto.</p>
                </CardContent>
            </Card>
        </div>
    );
}
