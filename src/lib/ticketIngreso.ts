import { useAuthStore } from '@/store/authStore';

/**
 * Cómo está configurado el ticket de ingreso en el taller logueado.
 *
 * Default: los dos en true, que es como quedó funcionando el 19-sep antes de que fuera
 * configurable. Un taller sin la columna cargada se comporta igual que antes.
 */
export function configTicketIngreso(taller?: { config_ticket_ingreso?: { habilitado?: boolean; notas_internas?: boolean } | null } | null) {
    const t = taller ?? useAuthStore.getState().taller;
    const c = t?.config_ticket_ingreso ?? {};
    return {
        habilitado: c.habilitado !== false,
        notasInternas: c.notas_internas !== false,
    };
}
