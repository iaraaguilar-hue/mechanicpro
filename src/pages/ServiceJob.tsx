import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, CheckSquare, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import { printServiceReport } from '@/lib/printServiceBtn';

const MAKE_WEBHOOK_URL = import.meta.env.VITE_N8N_ORDEN_WEBHOOK_URL;

export default function ServiceJob() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [job, setJob] = useState<any>(null);
    const [clientData, setClientData] = useState<any>(null);
    const [allJobsDebug, setAllJobsDebug] = useState<any[]>([]); // Para el menú de rescate
    const [bikeModel, setBikeModel] = useState('');

    const [loading, setLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('clients');
            if (stored) {
                const clients = JSON.parse(stored);

                const debugList = [];

                // Búsqueda del trabajo y recolección para debug
                for (const c of clients) {
                    if (c.jobs) {
                        for (const j of c.jobs) {
                            // Guardamos todos en la lista por si acaso
                            debugList.push({ ...j, clientName: c.name, clientId: c.id });

                            // Comparación LAXA (==) para que "9" sea igual a 9
                            if (id && (String(j.id) === String(id))) {
                                setJob(j);
                                setClientData(c);

                                const b = c.bikes?.find((bk: any) => bk.id === j.bikeId);
                                setBikeModel(b ? b.model : 'Bicicleta');

                            }
                        }
                    }
                }
                setAllJobsDebug(debugList);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [id]);





    // --- FUNCIÓN DE DIAGNÓSTICO DEL JSON ---
    const triggerMakeWebhook = async (soldItems: any[]) => {
        // Filtrar estrictamente solo productos físicos (excluir ML/Mercado Libre)
        const esML = (desc: string) => /\(ml\)|\(mercado libre\)/i.test(desc);
        const productosFisicos = soldItems.filter((i: any) => i.category === 'part' && !esML(i.description || ''));

        if (!productosFisicos || productosFisicos.length === 0) {
            alert("⚠️ ATENCIÓN: Este service NO tiene repuestos (categoría 'part'). No se enviará webhook.");
            return;
        }

        const productosListos = productosFisicos.map((i: any) => ({
            descripcion: i.description,
            precio: Number(i.price) || 0
        }));

        const totalProductos = productosListos.reduce((sum: number, p: any) => sum + p.precio, 0);

        const payload = {
            numero_orden: `#${String(job?.id ?? 'S/N').padStart(4, '0')}`,
            dni_cliente: clientData?.dni || "Sin DNI",
            nombre_cliente: clientData?.name || "Cliente",
            fecha_finalizacion: new Date().toISOString(),
            nombre_producto: productosListos.map((p: any) => p.descripcion).join(", "),
            productos: productosListos,
            total_service: totalProductos,
        };

        // PASO CRÍTICO: MOSTRAR DATOS ANTES DE ENVIAR
        const jsonString = JSON.stringify(payload, null, 2);
        const confirmacion = window.confirm(
            `CONFIRMA EL JSON A ENVIAR:\n\n${jsonString}\n\n¿Enviar esto a Make?`
        );

        if (!confirmacion) return;

        setIsSending(true); // START LOADING


        try {
            const response = await fetch(MAKE_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                alert(`✅ ¡ENVIADO! Revisa Make ahora. Texto respuesta: ${await response.text()}`);
            } else {
                alert(`❌ ERROR: Código ${response.status}`);
            }

        } catch (error: any) {
            alert(`❌ ERROR DE RED: ${error.message}`);
        } finally {
            setIsSending(false); // STOP LOADING
        }
    };

    const handleFinishJob = async () => {
        if (!job) return;
        // Solo para probar el webhook sin cerrar
        const soldProducts = job.extraItems?.filter((i: any) => i.category === 'part') || [];
        await triggerMakeWebhook(soldProducts);
    };

    const handleDownloadPDF = () => {
        if (!job || !clientData) return alert("Faltan datos.");
        printServiceReport(job, clientData.name, bikeModel, clientData.dni, clientData.phone);
    };

    if (loading) return <div>Cargando...</div>;

    // --- MENÚ DE RESCATE (Si no encuentra el ID) ---
    if (!job) {
        return (
            <div className="min-h-screen bg-slate-50 p-10 flex flex-col items-center">
                <Card className="w-full max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-red-600 flex items-center gap-2">
                            <Wrench className="w-6 h-6" />
                            No encontré el ID "{id}"
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-slate-600">
                            Parece que el ID de la URL no coincide con ninguno en la base de datos local.
                            Pero encontré estos <strong>{allJobsDebug.length} trabajos</strong> disponibles. Haz click en uno para entrar:
                        </p>
                        <div className="grid gap-2 max-h-[400px] overflow-y-auto border p-2 rounded">
                            {allJobsDebug.map((j) => (
                                <Button
                                    key={j.id}
                                    variant="outline"
                                    className="justify-start h-auto py-3 px-4"
                                    onClick={() => window.location.href = `/service/${j.id}`}
                                >
                                    <div className="text-left">
                                        <div className="font-bold">Service #{j.id} - {j.serviceType}</div>
                                        <div className="text-sm text-slate-500">Cliente: {j.clientName} | Total: ${j.totalPrice}</div>
                                    </div>
                                </Button>
                            ))}
                        </div>
                        <Button onClick={() => navigate('/')} className="w-full mt-4">Volver al Inicio</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }



    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-5xl mx-auto flex items-center justify-between mb-6">
                <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2"><ArrowLeft className="w-4 h-4" /> Volver</Button>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleDownloadPDF} className="gap-2 bg-white text-primary border-primary/30"><FileText className="w-4 h-4" /> PDF</Button>

                    {/* BOTÓN MORADO DE PRUEBA */}
                    <Button onClick={handleFinishJob} disabled={isSending} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold border-2 border-purple-400">
                        {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                        PROBAR WEBHOOK (DEBUG)
                    </Button>
                </div>
            </div>

            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="pb-4 border-b">
                            <CardTitle className="flex justify-between">
                                <div>{clientData?.name}<div className="text-sm text-gray-500 font-normal">{bikeModel}</div></div>
                                <Badge>{job.serviceType}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div>
                                <h3 className="font-semibold mb-2">Detalle de Costos</h3>
                                <div className="border rounded-lg divide-y">
                                    <div className="flex justify-between p-3 bg-gray-50 font-medium"><span>Service Base</span><span>$ {(job.basePrice || 0).toLocaleString('es-AR')}</span></div>
                                    {job.extraItems?.map((i: any, x: number) => (
                                        <div key={x} className="flex justify-between p-3 text-sm">
                                            <span className="flex items-center gap-2">
                                                {i.description}
                                                {i.category === 'part' && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">Producto</Badge>}
                                            </span>
                                            <span>$ {Number(i.price).toLocaleString('es-AR')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <div><Card className="bg-primary/10 border-primary/20"><CardContent className="pt-6"><div className="flex justify-between items-end"><span className="font-bold text-lg">TOTAL</span><span className="text-3xl font-black text-primary">$ {(job.totalPrice || 0).toLocaleString('es-AR')}</span></div></CardContent></Card></div>
            </div>
        </div>
    );
}