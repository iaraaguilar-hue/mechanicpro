import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';

export default function MigradorDatos() {
    const { taller_id } = useAuthStore();
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);

    const addLog = (message: string) => {
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setStatus('idle');
            setLogs([]);
            setProgress(0);
        }
    };

    const runMigration = async () => {
        if (!taller_id) {
            setStatus('error');
            addLog("ERROR CRÍTICO: No se encontró 'taller_id' en la sesión activa.");
            return;
        }

        if (!file) {
            setStatus('error');
            addLog("ERROR: Por favor selecciona un archivo JSON primero.");
            return;
        }

        setStatus('loading');
        addLog("Iniciando migración de datos...");

        try {
            // Leer archivo
            const fileContent = await file.text();
            const data = JSON.parse(fileContent);

            addLog("Archivo JSON parseado correctamente.");

            // Diccionarios de Mapeo
            const clientMap: Record<string, string> = {};
            const bikeMap: Record<string, string> = {};
            const serviceMap: Record<string, string> = {};

            // Arrays temporales para items
            const allExtraItems: any[] = [];

            // ==========================================
            // FASE 1: CLIENTES
            // ==========================================
            addLog("FASE 1: Iniciando migración de Clientes...");
            const clientes = Array.isArray(data.clients) ? data.clients : [];
            let clientsMigrated = 0;

            for (const client of clientes) {
                // Filtrar eliminados
                if (client.isDeleted) continue;

                // Insertar en Supabase
                const { data: newClient, error } = await supabase
                    .from('clientes')
                    .insert({
                        taller_id: taller_id,
                        nombre: client.name || client.nombre,
                        telefono: client.phone || client.telefono,
                        email: client.email,
                        dni: client.dni,
                        notas: client.notes || client.notas
                    })
                    .select('id')
                    .single();

                if (error) {
                    addLog(`Error migrando cliente ${client.name || client.id}: ${error.message}`);
                    continue;
                }

                clientMap[client.id] = newClient.id;
                clientsMigrated++;
            }
            addLog(`✅ FASE 1 completada. ${clientsMigrated} clientes migrados.`);
            setProgress(25);

            // ==========================================
            // FASE 2: BICICLETAS
            // ==========================================
            addLog("FASE 2: Iniciando migración de Bicicletas...");
            const bicicletas = Array.isArray(data.bikes) ? data.bikes : [];
            let bikesMigrated = 0;

            for (const bike of bicicletas) {
                const viejo_cliente_id = bike.clientId || bike.cliente_id;
                const nuevo_cliente_id = clientMap[viejo_cliente_id];

                if (!nuevo_cliente_id) {
                    addLog(`Advertencia: Bici ${bike.id} omitida (cliente origen no existe/migrado)`);
                    continue;
                }

                const { data: newBike, error } = await supabase
                    .from('bicicletas')
                    .insert({
                        taller_id: taller_id,
                        cliente_id: nuevo_cliente_id,
                        marca: bike.brand || bike.marca,
                        modelo: bike.model || bike.modelo,
                        color: bike.color,
                        notas: bike.notes || bike.notas
                    })
                    .select('id')
                    .single();

                if (error) {
                    addLog(`Error migrando bicicleta ${bike.model || bike.id}: ${error.message}`);
                    continue;
                }

                bikeMap[bike.id] = newBike.id;
                bikesMigrated++;
            }
            addLog(`✅ FASE 2 completada. ${bikesMigrated} bicicletas migradas.`);
            setProgress(50);

            // ==========================================
            // FASE 3: SERVICIOS
            // ==========================================
            addLog("FASE 3: Iniciando migración de Servicios...");
            const servicios = Array.isArray(data.services) ? data.services : [];
            let servicesMigrated = 0;

            for (const service of servicios) {
                const viejo_cliente_id = service.clientId || service.cliente_id;
                const viejo_bicicleta_id = service.bikeId || service.bicicleta_id;

                const nuevo_cliente_id = clientMap[viejo_cliente_id];
                const nuevo_bicicleta_id = bikeMap[viejo_bicicleta_id];

                if (!nuevo_cliente_id || !nuevo_bicicleta_id) {
                    addLog(`Advertencia: Servicio ${service.id} omitido (cliente o bici no existe)`);
                    continue;
                }

                // Extraer items temporales
                const extraItems = service.extraItems || service.items_extra || [];

                // Mapear el checklist local a healthcheck_data
                const healthcheck_data = service.checklist_data || service.healthcheck || {};

                const { data: newService, error } = await supabase
                    .from('servicios')
                    .insert({
                        taller_id: taller_id,
                        cliente_id: nuevo_cliente_id,
                        bicicleta_id: nuevo_bicicleta_id,
                        estado: service.status || service.estado || 'pending',
                        tipo_servicio: service.serviceType || service.tipo_servicio,
                        descripcion: service.description || service.descripcion,
                        costo_estimado: service.estimatedCost || service.costo_estimado,
                        fecha_ingreso: service.createdAt || service.fecha_ingreso || new Date().toISOString(),
                        healthcheck_data: healthcheck_data
                    })
                    .select('id')
                    .single();

                if (error) {
                    addLog(`Error migrando servicio ${service.id}: ${error.message}`);
                    continue;
                }

                serviceMap[service.id] = newService.id;
                servicesMigrated++;

                // Guardar items en array temporal marcando el nuevo servicio_id
                for (const item of extraItems) {
                    allExtraItems.push({
                        ...item,
                        _new_servicio_id: newService.id
                    });
                }
            }
            addLog(`✅ FASE 3 completada. ${servicesMigrated} servicios migrados.`);
            setProgress(75);

            // ==========================================
            // FASE 4: ITEMS EXTRA (Repuestos / Mano Obra)
            // ==========================================
            addLog("FASE 4: Iniciando migración de Items de Servicio...");
            let itemsMigrated = 0;

            for (const item of allExtraItems) {
                const { error } = await supabase
                    .from('servicio_items')
                    .insert({
                        taller_id: taller_id,
                        servicio_id: item._new_servicio_id,
                        descripcion: item.description || item.descripcion,
                        precio: item.price || item.precio || 0,
                        cantidad: item.quantity || item.cantidad || 1
                    });

                if (error) {
                    addLog(`Error migrando item: ${error.message}`);
                    continue;
                }
                itemsMigrated++;
            }
            addLog(`✅ FASE 4 completada. ${itemsMigrated} items guardados.`);
            setProgress(100);

            setStatus('success');
            addLog("🎉 ¡MIGRACIÓN COMPLETADA CON ÉXITO!");

        } catch (error: any) {
            setStatus('error');
            addLog(`💥 ERROR FATAL: ${error.message || 'Error desconocido'}`);
        }
    };

    return (
        <Card className="w-full max-w-3xl mx-auto shadow-md border-muted">
            <CardHeader className="bg-slate-50 border-b border-muted">
                <CardTitle className="text-xl flex items-center gap-2">
                    <Upload className="h-5 w-5 text-blue-600" />
                    Migrador de Datos a Supabase
                </CardTitle>
                <CardDescription>
                    Sube el archivo JSON local para poblar la nueva base de datos relacional.
                </CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-6">

                {/* File Input Area */}
                <div className="flex flex-col gap-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition-colors">
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-blue-700
                                hover:file:bg-blue-100 cursor-pointer mx-auto"
                        />
                    </div>

                    <Button
                        onClick={runMigration}
                        disabled={!file || status === 'loading' || status === 'success'}
                        className="w-full font-bold h-12 text-lg"
                    >
                        {status === 'loading' ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Migrando Datos ({progress}%)
                            </>
                        ) : (
                            'Iniciar Migración Secuencial'
                        )}
                    </Button>
                </div>

                {/* Status Alerts */}
                {status === 'success' && (
                    <Alert className="bg-green-50 border-green-200">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertTitle className="text-green-800">Éxito</AlertTitle>
                        <AlertDescription className="text-green-700">
                            La base de datos de Supabase ha sido poblada correctamente respetando las llaves foráneas.
                        </AlertDescription>
                    </Alert>
                )}

                {status === 'error' && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error de Migración</AlertTitle>
                        <AlertDescription>
                            Revisa el log para más detalles sobre qué falló durante el proceso.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Live Console Log */}
                {logs.length > 0 && (
                    <div className="mt-6 border rounded-md bg-black text-green-400 p-4 font-mono text-xs h-64 overflow-y-auto shadow-inner">
                        {logs.map((log, index) => (
                            <div key={index} className="py-1">
                                {log}
                            </div>
                        ))}
                    </div>
                )}

            </CardContent>
        </Card>
    );
}
