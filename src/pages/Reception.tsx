import { useState } from "react";
import { ServiceModal } from "@/components/ServiceModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench, Search, History, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Reception() {
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    return (
        <div className="max-w-4xl mx-auto space-y-12 py-10">
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 lg:text-5xl flex items-center justify-center gap-3">
                    <UserPlus className="h-8 w-8 text-primary" />
                    Recepción de Clientes
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    Gestión eficiente de ingresos. Todo comienza con un nuevo service.
                </p>
            </div>

            <div className="flex justify-center transform scale-125 my-10">
                <Button
                    size="lg"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 h-14 shadow-lg shadow-primary/20"
                    onClick={() => setIsWizardOpen(true)}
                >
                    <Wrench className="mr-2 h-5 w-5" /> NUEVO SERVICE
                </Button>
            </div>

            <ServiceModal
                isOpen={isWizardOpen}
                onClose={() => setIsWizardOpen(false)}
            />

            <div className="grid gap-8 md:grid-cols-3 text-center">
                <FeatureCard icon={<Wrench />} title="Ingreso Rápido" desc="Identificar, seleccionar bici y definir service en segundos." />
                <FeatureCard icon={<Search />} title="Historial" desc="Acceso inmediato al historial de cada bicicleta." />
                <FeatureCard icon={<History />} title="Seguimiento" desc="Trazabilidad completa de trabajos anteriores." />
            </div>
        </div>
    );
}

function FeatureCard({ icon, title, desc }: { icon: any, title: string, desc: string }) {
    return (
        <Card className="bg-muted/30 border-none shadow-none">
            <CardHeader>
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                    {icon}
                </div>
                <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">{desc}</p>
            </CardContent>
        </Card>
    )
}
