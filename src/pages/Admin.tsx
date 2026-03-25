import { useMemo } from "react";
import { useDataStore } from "@/store/dataStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Settings } from "lucide-react";

export default function Admin() {
    const recordatorios = useDataStore(s => s.recordatorios);
    const bicicletas = useDataStore(s => s.bicicletas);
    const clientes = useDataStore(s => s.clientes);
    const isHydrating = useDataStore(s => s.isHydrating);

    const dueItems = useMemo(() => {
        const today = new Date();
        return recordatorios
            .filter(r => {
                const dueDate = new Date(r.fecha_vencimiento || "2099-01-01");
                return dueDate <= today;
            })
            .map(r => {
                const bike = bicicletas.find(b => b.id === r.bicicleta_id);
                const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;
                return {
                    wear_id: r.id,
                    component: r.componente || "Componente",
                    estimated_end_life: r.fecha_vencimiento || "",
                    bike_model: bike ? `${bike.marca} ${bike.modelo}` : "Desconocida",
                    client_name: client?.nombre || "Desconocido",
                    client_phone: client?.telefono || "",
                };
            });
    }, [recordatorios, bicicletas, clientes]);

    const copyMessage = (item: typeof dueItems[0]) => {
        const msg = `Hola ${item.client_name.split(" ")[0]}! Te escribimos de MechanicPro. Notamos que tu ${item.bike_model} podría necesitar revisión de ${item.component} pronto. ¿Querés agendar un service?`;
        navigator.clipboard.writeText(msg);
        alert("Mensaje copiado: " + msg);
    };

    if (isHydrating) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                <Settings className="h-8 w-8 text-primary" />
                Configuración
            </h1>
            <p className="text-muted-foreground">Clientes con componentes vencidos o próximos a vencer (Hoy).</p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {dueItems.map((item) => (
                    <Card key={item.wear_id} className="border-l-4 border-l-yellow-500">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{item.client_name}</CardTitle>
                            <p className="text-sm text-muted-foreground">{item.bike_model}</p>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-4">
                                <p className="font-semibold text-red-400">Vence: {item.component}</p>
                                <p className="text-xs text-muted-foreground">Fecha Est.: {new Date(item.estimated_end_life).toLocaleDateString("es-AR")}</p>
                            </div>
                            <Button className="w-full" size="sm" onClick={() => copyMessage(item)}>
                                <MessageSquare className="mr-2 h-4 w-4" /> Copiar Mensaje
                            </Button>
                        </CardContent>
                    </Card>
                ))}
                {dueItems.length === 0 && <p className="text-muted-foreground">No hay clientes para contactar hoy.</p>}
            </div>
        </div>
    )
}
