import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Download, CheckCircle, Clock } from 'lucide-react';
import { useState } from 'react';
import { printServiceReport } from '@/lib/printServiceBtn';

interface JobCardProps {
    job: any;
    client?: any;
    bikeModel?: string;
}

export default function JobCard({ job, client, bikeModel = 'Bicicleta' }: JobCardProps) {
    const [expanded, setExpanded] = useState(false);
    const isFinished = job.status === 'FINISHED' || job.status === 'Finalizado';
    const total = job.totalPrice || 0;

    // Logic to separate parts/labor for the on-screen view (does not affect PDF)
    const parts = job.extraItems?.filter((i: any) => i.category === 'part') || [];
    const labor = job.extraItems?.filter((i: any) => i.category === 'labor' || !i.category) || [];

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        // CALL THE SHARED FUNCTION -> Identical PDF everywhere
        printServiceReport(
            job,
            client?.name || 'Cliente',
            bikeModel,
            client?.dni || '',
            client?.phone || ''
        );
    };

    return (
        <Card className="mb-4 border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="p-4 cursor-pointer bg-white" onClick={() => setExpanded(!expanded)}>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${isFinished ? 'bg-green-100' : 'bg-primary/20'}`}>
                            {isFinished ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Clock className="w-5 h-5 text-primary" />}
                        </div>
                        <div>
                            <CardTitle className="text-base font-bold text-slate-800">
                                {new Date(job.createdAt || Date.now()).toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </CardTitle>
                            <div className="flex gap-2 mt-1">
                                <Badge variant="outline" className="text-xs font-normal text-slate-500 border-slate-300 bg-slate-900 border-slate-900 text-slate-50 whitespace-nowrap w-fit px-3 py-1">
                                    {job.serviceType}
                                </Badge>
                                <span className="text-xs text-slate-400">ID: #{job.id.slice(-4)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-700">$ {total.toLocaleString('es-AR')}</span>
                        <Button variant="ghost" size="icon" onClick={handleDownload} title="Descargar PDF">
                            <Download className="w-4 h-4 text-primary" />
                        </Button>
                        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                </div>
            </CardHeader>

            {expanded && (
                <CardContent className="p-0 border-t border-slate-100 bg-slate-50">
                    <div className="p-4 grid gap-6">
                        {parts.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">📦 Repuestos</h4>
                                <div className="bg-white rounded border border-slate-200">
                                    {parts.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between p-2 text-sm border-b last:border-0 border-slate-100">
                                            <span>{item.description}</span>
                                            <span className="font-mono">$ {Number(item.price).toLocaleString('es-AR')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">🛠️ Mano de Obra</h4>
                            <div className="bg-white rounded border border-slate-200">
                                <div className="flex justify-between p-2 text-sm border-b border-slate-100">
                                    <span>Service Base ({job.serviceType})</span>
                                    <span className="font-mono">$ {(job.basePrice || 0).toLocaleString('es-AR')}</span>
                                </div>
                                {labor.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between p-2 text-sm border-b last:border-0 border-slate-100">
                                        <span>{item.description}</span>
                                        <span className="font-mono">$ {Number(item.price).toLocaleString('es-AR')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {job.notes && (
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Notas del Mecánico</h4>
                                <p className="text-sm text-slate-600 italic bg-white p-3 rounded border border-slate-200">"{job.notes}"</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
