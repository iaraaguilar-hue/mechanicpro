import { calculateDaysRemaining } from "@/lib/utils";
import { prediccionComponente, type Prediccion } from "@/lib/motorConCabeza";
import type {
    SupabaseService,
    SupabaseReminder,
    SupabaseBike,
    SupabaseClient,
    SupabaseCarrera,
} from "@/store/dataStore";

// ─────────────────────────────────────────────────────────────
// Fuente ÚNICA de las alertas de retención.
// Antes esta lógica vivía duplicada: RetentionEngine (la respetaba
// bien, con alertas_ocultas) y la campana (NotificationBell, que NO
// filtraba alertas_ocultas → descartar en Retención no bajaba el
// número). Ahora ambos consumen buildRetentionAlerts() → el mismo
// listado, el mismo alertas_ocultas → actuar en un lado baja el
// contador en el otro y queda coherente al recargar.
//
// Reglas de descarte (alertas_ocultas vive por-orden en servicios):
//  · Recordatorio de componente → se guarda el `componente` en
//    alertas_ocultas de alguna orden de esa bici.
//  · Alerta de carrera → se guarda `carrera-{id}` en la orden.
// ─────────────────────────────────────────────────────────────

export interface RetentionAlert {
    id: string;
    servicioId?: string;
    alertIdentity?: string;
    // Para el acceso rápido al perfil del cliente desde la alerta: con bikeId
    // se abre la bici puntual (y ahí están las demás en pestañas); si la bici
    // no está, se cae al perfil del cliente.
    clientId?: string;
    bikeId?: string;
    clientName: string;
    clientPhone: string;
    bikeModel: string;
    component: string;
    dueDate: string;
    daysRemaining: number;
    isPostCarrera: boolean;
    isPreCarrera: boolean;
    carreraName: string;
    /** Idea 5 (Pro/Expert): la fecha salió del historial de ESE ciclista, no
     *  del plazo fijo. Ausente = plazo fijo de siempre (y eso SE DICE en la
     *  tarjeta: nunca una predicción sin base). */
    prediccion?: Prediccion;
}

interface RetentionInput {
    recordatorios: SupabaseReminder[];
    bicicletas: SupabaseBike[];
    clientes: SupabaseClient[];
    servicios: SupabaseService[];
    carreras: SupabaseCarrera[];
    /** Idea 5 (Pro/Expert): cuando el historial de la bici da base (2+
     *  eventos del componente), la fecha del aviso sale de cuánto le dura a
     *  ESE ciclista, no del plazo fijo. Lo pasan los llamadores desde
     *  tieneFeature(taller, 'motor_predictivo'). */
    predictivo?: boolean;
}

export function buildRetentionAlerts({
    recordatorios,
    bicicletas,
    clientes,
    servicios,
    carreras,
    predictivo = false,
}: RetentionInput): RetentionAlert[] {
    const baseAlerts: RetentionAlert[] = recordatorios
        .filter(r => {
            const bike = bicicletas.find(b => b.id === r.bicicleta_id);
            const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

            // Todos los descartes de esta bici, a través de todas sus órdenes.
            const dismissedAlerts = bike
                ? servicios.filter(s => s.bicicleta_id === bike.id).flatMap(s => s.alertas_ocultas || [])
                : [];

            return !client?.eliminado_en && !dismissedAlerts.includes(r.componente || '');
        })
        .map(r => {
            const bike = bicicletas.find(b => b.id === r.bicicleta_id);
            const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

            // Idea 5: si el historial de esta bici tiene base para este
            // componente, la fecha del aviso es la de SU ritmo real.
            const serviciosDeBici = servicios.filter(s => s.bicicleta_id === r.bicicleta_id);
            const prediccion = predictivo
                ? prediccionComponente(serviciosDeBici, r.componente || '') ?? undefined
                : undefined;

            const dueDate = prediccion?.fecha ?? r.fecha_vencimiento ?? "";
            const daysRemaining = calculateDaysRemaining(dueDate);

            // Orden más reciente de la bici → ahí se guarda el descarte si hace falta.
            const mostRecentService = serviciosDeBici
                .sort((a, b) => new Date(b.fecha_ingreso || 0).getTime() - new Date(a.fecha_ingreso || 0).getTime())[0];

            return {
                id: r.id,
                servicioId: mostRecentService?.id,
                alertIdentity: r.componente,
                clientId: client?.id,
                bikeId: bike?.id,
                clientName: client?.nombre || "Desconocido",
                clientPhone: client?.telefono || "",
                bikeModel: bike?.modelo || "Desconocida",
                component: r.componente || "Sin componente",
                dueDate,
                daysRemaining,
                isPostCarrera: false,
                isPreCarrera: false,
                carreraName: "",
                prediccion,
            };
        });

    const postCarreraAlerts = servicios
        .filter(s => s.carrera_id != null)
        .map(s => {
            const carrera = carreras.find(c => c.id === s.carrera_id);
            const bike = bicicletas.find(b => b.id === s.bicicleta_id);
            const client = bike ? clientes.find(c => c.id === bike.cliente_id) : null;

            if (!carrera || !carrera.fecha_evento || !client || client.eliminado_en) return null;

            const dismissedAlerts = s.alertas_ocultas || [];
            const carreraAlertIdentity = `carrera-${carrera.id}`;
            if (dismissedAlerts.includes(carreraAlertIdentity)) return null;

            const daysUntilEvent = calculateDaysRemaining(carrera.fecha_evento);
            const daysSinceEvent = -daysUntilEvent;

            if (daysSinceEvent >= 1 && daysSinceEvent <= 2) {
                return {
                    id: `carrera-urgent-${s.id}`,
                    servicioId: s.id,
                    alertIdentity: carreraAlertIdentity,
                    clientId: client.id,
                    bikeId: bike?.id,
                    clientName: client.nombre,
                    clientPhone: client.telefono || "",
                    bikeModel: bike?.modelo || "Desconocida",
                    component: `¿Cómo le fue en ${carrera.nombre}?`,
                    dueDate: carrera.fecha_evento,
                    daysRemaining: -daysSinceEvent, // Negativo → cae en "urgente"
                    isPostCarrera: true,
                    isPreCarrera: false,
                    carreraName: carrera.nombre,
                };
            }

            // PRE-CARRERA (el evento es a futuro): daysSinceEvent < 0
            if (daysSinceEvent < 0) {
                return {
                    id: `pre-carrera-${s.id}`,
                    servicioId: s.id,
                    alertIdentity: carreraAlertIdentity,
                    clientId: client.id,
                    bikeId: bike?.id,
                    clientName: client.nombre,
                    clientPhone: client.telefono || "",
                    bikeModel: bike?.modelo || "Desconocida",
                    component: `🏁 Carrera: ${carrera.nombre}`,
                    dueDate: carrera.fecha_evento,
                    daysRemaining: -daysSinceEvent, // Días que faltan para el evento
                    isPostCarrera: false,
                    isPreCarrera: true,
                    carreraName: carrera.nombre,
                };
            }

            return null;
        })
        .filter(Boolean) as RetentionAlert[];

    return [...baseAlerts, ...postCarreraAlerts];
}
