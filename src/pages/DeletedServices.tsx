import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, AlertCircle, CalendarIcon, ServerCrash, Clock, UserX, RefreshCcw, Loader2 } from 'lucide-react';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';

export default function DeletedServices() {
    const rol = useAuthStore((state) => state.rol);
    const session = useAuthStore((state) => state.session);
    const navigate = useNavigate();

    const [deletedJobs, setDeletedJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [restoringId, setRestoringId] = useState<string | null>(null);

    // Protected Route Verification
    useEffect(() => {
        if (!session || rol !== 'admin') {
            navigate("/");
        }
    }, [session, rol, navigate]);

    const fetchDeletedServices = async () => {
        setLoading(true);
        setError(null);
        try {
            // EXPLICIT BACKEND CALL: Fetch soft-deleted records directly from Supabase DB
            const { data, error: supaError } = await supabase
                .from('servicios')
                .select('*, bicicletas(id, marca, modelo, clientes(id, nombre, dni))')
                .not('eliminado_en', 'is', null)
                .order('eliminado_en', { ascending: false });

            if (supaError) {
                throw new Error(supaError.message);
            }

            if (data) {
                const mappedData = data.map((item: any) => ({
                    id: item.id,
                    deletedAt: item.eliminado_en,
                    dateIn: item.fecha_ingreso || item.created_at,
                    serviceType: item.tipo_servicio || 'General',
                    status: item.estado,
                    totalPrice: item.precio_total || 0,
                    bikeBrand: item.bicicletas?.marca || 'Desconocida',
                    bikeModel: item.bicicletas?.modelo || 'Desconocido',
                    clientName: item.bicicletas?.clientes?.nombre || 'Desconocido',
                    clientDni: item.bicicletas?.clientes?.dni || '-',
                }));
                setDeletedJobs(mappedData);
            }
        } catch (err: any) {
            console.error("Error fetching deleted services:", err.message);
            setError(err.message || 'Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (rol === 'admin') {
            fetchDeletedServices();
        }
    }, [rol]);

    const handleRestore = async (id: string) => {
        try {
            setRestoringId(id);
            const { error } = await supabase.from('servicios').update({ eliminado_en: null }).eq('id', id);
            if (error) throw error;
            await fetchDeletedServices();
        } catch (err: any) {
            alert("Error al restaurar: " + err.message);
        } finally {
            setRestoringId(null);
        }
    };

    if (rol !== 'admin') {
        return <div className="p-8 text-center text-red-500 font-bold">Acceso Denegado</div>;
    }

    return (
        <div className="p-8 space-y-8 max-w-[1200px] mx-auto min-h-screen bg-transparent animate-in fade-in duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
                        <Trash2 className="h-8 w-8 text-red-500" />
                        Auditoría de Eliminados
                    </h1>
                    <p className="text-muted-foreground mt-1 text-lg">Papelera de seguridad administrativa. Registros inmutables.</p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Read-Only Table Container */}
            <Card className="border-none shadow-md bg-white overflow-hidden ring-1 ring-red-100/50 relative">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-red-50/50">
                            <TableRow className="hover:bg-transparent border-slate-100">
                                <TableHead className="py-4 pl-6 text-red-800">Fecha de Eliminación</TableHead>
                                <TableHead className="py-4 text-slate-600">ID / Ingreso</TableHead>
                                <TableHead className="py-4 text-slate-600">Cliente</TableHead>
                                <TableHead className="py-4 text-slate-600">Bicicleta</TableHead>
                                <TableHead className="py-4 text-slate-600">Monto Original</TableHead>
                                <TableHead className="py-4 pr-6 text-right text-red-800">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-20 text-slate-500">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="w-6 h-6 border-2 border-red-500 border-t-transparent flex-shrink-0 animate-spin rounded-full"></div>
                                            Conectando al servidor...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : deletedJobs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="bg-slate-100 p-4 rounded-full">
                                                <ServerCrash className="h-8 w-8 text-slate-300" />
                                            </div>
                                            <div className="text-center">
                                                <p className="font-medium text-slate-900">La papelera está vacía</p>
                                                <p className="text-sm text-slate-500 mt-1">No hay órdenes de servicio eliminadas recientemente.</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                deletedJobs.map((job) => {
                                    const delDate = job.deletedAt ? new Date(job.deletedAt) : null;
                                    const inDate = job.dateIn ? new Date(job.dateIn) : null;

                                    return (
                                        <TableRow key={job.id} className="hover:bg-red-50/30 transition-colors border-slate-100 disabled text-slate-600 cursor-not-allowed">
                                            <TableCell className="pl-6 py-4">
                                                <div className="flex items-center gap-2 text-red-600 font-medium">
                                                    <Clock className="w-4 h-4" />
                                                    {delDate ? format(delDate, "dd MMM yyyy, HH:mm", { locale: es }) : 'Desconocida'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-500 text-sm line-through decoration-slate-300">#{job.id}</span>
                                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                                        <CalendarIcon className="w-3 h-3" />
                                                        {inDate ? format(inDate, "dd/MM/yy") : '-'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="font-medium text-slate-600 flex items-center gap-2">
                                                    <UserX className="w-3 h-3 text-slate-300" />
                                                    {job.clientName}
                                                </div>
                                                <div className="text-xs text-slate-400">{job.clientDni}</div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="font-semibold text-slate-600 capitalize opacity-80">{job.bikeBrand}</div>
                                                <div className="text-sm text-slate-400">{job.bikeModel}</div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <span className="font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">
                                                    $ {job.totalPrice?.toLocaleString("es-AR")}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right pr-6 py-4 flex justify-end items-center gap-2">
                                                <Badge variant="outline" className="text-slate-400 bg-transparent border-red-200 uppercase font-normal text-[10px] tracking-wider hidden md:inline-flex">
                                                    Anulado
                                                </Badge>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                                    onClick={() => handleRestore(job.id)}
                                                    disabled={restoringId === job.id}
                                                >
                                                    {restoringId === job.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCcw className="w-4 h-4 mr-1" />}
                                                    Restaurar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
