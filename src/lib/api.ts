// Local Storage Adapter - Backend Bypass
const DB_KEY = "mechanicPro_db";

// Compatibility Mock for legacy direct usage
// We define it as a partial implementation of Axios to satisfy TS
export const api = {
    get: async <T>(_url: string, _config?: any) => ({ data: [] as unknown as T }),
    post: async <T>(_url: string, _data: any, _config?: any) => ({ data: {} as T }),
    put: async <T>(_url: string, _data: any, _config?: any) => ({ data: {} as T }),
    patch: async <T>(_url: string, _data: any, _config?: any) => ({ data: {} as T }),
    delete: async <T>(_url: string, _config?: any) => ({ data: {} as T }),
};

interface DB {
    clients: Client[];
    bikes: Bike[];
    services: ServiceRecord[];
    reminders: Reminder[];
}

const getDB = (): DB => {
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) return initializeDB();
        return JSON.parse(raw);
    } catch (error) {
        console.error("Failed to parse DB from localStorage, resetting...", error);
        return initializeDB(); // Recover by resetting
    }
};

const saveDB = (db: DB) => {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
};

const initializeDB = (): DB => {
    const initialData: DB = {
        clients: [
            { id: 1, name: "Juan Perez", phone: "1112345678", usage_tier: "B", dni: "12345678" },
            { id: 2, name: "Maria Garcia", phone: "1187654321", usage_tier: "A", dni: "87654321" },
            { id: 3, name: "Pedro Lopez", phone: "1155556666", usage_tier: "C", dni: "11223344" }
        ],
        bikes: [
            { id: 1, client_id: 1, brand: "Specialized", model: "Tarmac", transmission: "Shimano 105", notes: "Bici de ruta" },
            { id: 2, client_id: 2, brand: "Trek", model: "Marlin", transmission: "Deore 1x10", notes: "Uso urbano" },
            { id: 3, client_id: 3, brand: "Cannondale", model: "Scalpel", transmission: "XTR", notes: "Competencia" }
        ],
        services: [],
        reminders: []
    };
    saveDB(initialData);
    return initialData;
};

// Types
export const UsageTier = {
    CASUAL: "A",
    SPORT: "B",
    PRO_HEAVY: "C",
} as const;
export type UsageTier = typeof UsageTier[keyof typeof UsageTier];

export const ServiceType = {
    SPORT: "Sport",
    EXPERT: "Expert",
    OTHER: "Otro",
} as const;
export type ServiceType = typeof ServiceType[keyof typeof ServiceType];

export interface Client {
    id?: number;
    displayId?: string; // Standardized sequential ID (e.g. "1", "2")
    name: string;
    dni?: string;
    phone: string;
    email?: string;
    usage_tier: UsageTier;
    isDeleted?: boolean;
}

export interface Bike {
    id?: number;
    client_id: number;
    brand: string;
    model: string;
    transmission: string;
    notes?: string;
}

export interface ServiceRecord {
    id?: number;
    bike_id: number;
    date_in?: string; // ISO String
    date_out?: string;
    status: string;
    service_type: ServiceType;
    deleted_at?: string; // [NEW] Soft Delete flag
    checklist_data?: Record<string, boolean>;
    parts_used?: string;
    mechanic_notes?: string;
    // Financials
    basePrice?: number;
    extraItems?: { id: string, description: string, price: number, category?: 'part' | 'labor' }[];
    totalPrice?: number;
}

export interface Reminder {
    id?: number;
    client_id: number;
    bike_id: number;
    component: string;
    due_date: string; // ISO Date
    assigned_date?: string; // ISO Date (Start Date)
    current_health?: number;
    status?: "Pending" | "Contacted" | "Dismissed";
}

export interface DashboardJob {
    service_id: number;
    status: string;
    service_type: string;
    date_in: string;
    bike_brand: string;
    bike_model: string;
    client_name: string;
    client_tier: UsageTier;
    date_out?: string;
    total_price?: number;
}

export interface FleetItem {
    bike_id: number;
    client_name: string;
    client_id: number | null;
    client_display_id?: string;
    client_tier?: string;
    bike_model: string;
    bike_type: string;
    transmission: string;
    service_count: number;
    next_due_date: string | null;
    next_due_component: string | null;
}

export interface WearItem {
    id: number;
    bike_id: number;
    component: string;
    last_serviced: string;
    estimated_end_life: string;
    status: string; // 'Active' | 'Due'
}

// API Implementation Swapped for LocalStorage
export const searchClients = async (query: string) => {
    const db = getDB();
    if (!query) return [];
    const lowerQ = query.toLowerCase();
    return db.clients.filter(c =>
        !c.isDeleted &&
        (c.name.toLowerCase().includes(lowerQ) ||
            c.phone.includes(query))
    );
};

export const deleteClient = async (clientId: number) => {
    const db = getDB();
    const index = db.clients.findIndex(c => c.id === clientId);
    if (index === -1) throw new Error("Client not found");

    // Soft Delete (Mark as deleted, keep history)
    db.clients[index].isDeleted = true;

    // We do NOT cascade delete records so that History remains valid.
    // Active views will filter out isDeleted clients.

    saveDB(db);
    return true;
};

export const createClient = async (client: Client) => {
    const db = getDB();

    // Auto-Increment Display ID
    const existingIds = db.clients.map(c => parseInt(c.displayId || "0"));
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const nextDisplayId = (maxId + 1).toString();

    const newClient = { ...client, id: Date.now(), displayId: nextDisplayId }; // Simple ID gen for internal, Sequential for Display
    db.clients.push(newClient);
    saveDB(db);
    return newClient;
};

export const updateClient = async (clientId: number, data: Partial<Client>) => {
    const db = getDB();
    const index = db.clients.findIndex(c => c.id === clientId);
    if (index === -1) throw new Error("Client not found");
    db.clients[index] = { ...db.clients[index], ...data };
    saveDB(db);
    return db.clients[index];
};

export const getClientBikes = async (clientId: number) => {
    const db = getDB();
    return db.bikes.filter(b => b.client_id === clientId);
};

export const createBike = async (bike: Bike) => {
    const db = getDB();
    const newBike = { ...bike, id: Date.now() };
    db.bikes.push(newBike);
    saveDB(db);
    return newBike;
};

export const getClient = async (clientId: number) => {
    const db = getDB();
    const client = db.clients.find(c => c.id === clientId);
    if (!client) throw new Error("Client not found");
    return client;
};

export const getAllBikes = async (): Promise<Bike[]> => {
    const db = getDB();
    return db.bikes || [];
};

export const getBike = async (bikeId: number) => {
    const db = getDB();
    const bike = db.bikes.find(b => b.id === bikeId);
    if (!bike) throw new Error("Bike not found");
    return bike;
};

export const getDashboardJobs = async () => {
    const db = getDB();
    // Join services with bike and client info
    const activeServices = db.services.filter(s => s.status !== "Old_Completed" && !s.deleted_at); // Filter soft-deleted
    const jobs: DashboardJob[] = activeServices.map(s => {
        const bike = db.bikes.find(b => b.id === s.bike_id);
        const client = db.clients.find(c => c.id === bike?.client_id);
        return {
            service_id: s.id!,
            status: s.status,
            service_type: s.service_type,
            date_in: s.date_in || new Date().toISOString(),
            bike_brand: bike?.brand || "Unknown",
            bike_model: bike?.model || "Unknown",
            client_name: client?.name || "Unknown",
            client_tier: client?.usage_tier || "A",
            date_out: s.date_out,
            total_price: s.totalPrice
        };
    });
    // Filter slightly for "Active Dashboard" vs History if needed, 
    // but Workshop.tsx does client side filtering mostly or displays what is returned.
    // Workshop only shows "Active" usually? 
    // The prompt implies we need "In Progress" stuff. 
    // Let's return all non-hidden if we had a hidden flag. returning all for now.
    return jobs.filter(j => j.status !== "Completed" && j.status !== "Delivered");
};

export const getDashboardHistory = async (): Promise<DashboardJob[]> => {
    const db = getDB();

    // Filter for completed services and NOT deleted
    const historyServices = db.services.filter(s =>
        ["Completed", "Finalizado", "Entregado"].includes(s.status) && !s.deleted_at
    );

    // Sort by date_out descending
    historyServices.sort((a, b) => {
        const dateA = new Date(a.date_out || a.date_in || 0).getTime();
        const dateB = new Date(b.date_out || b.date_in || 0).getTime();
        return dateB - dateA;
    });

    const jobs: DashboardJob[] = historyServices.map(s => {
        const bike = db.bikes.find(b => b.id === s.bike_id);
        const client = db.clients.find(c => c.id === bike?.client_id);

        return {
            service_id: s.id!,
            status: s.status,
            service_type: s.service_type,
            date_in: s.date_in || new Date().toISOString(),
            bike_brand: bike?.brand || "Unknown",
            bike_model: bike?.model || "Unknown",
            client_name: client?.name || "Unknown",
            client_tier: client?.usage_tier || "A",
            date_out: s.date_out || s.date_in,
            total_price: s.totalPrice
        };
    });

    return jobs;
};

export const getFullHistory = async () => {
    const db = getDB();
    // Return full service objects for advanced analysis
    return db.services.filter(s =>
        ["Completed", "Finalizado", "Entregado"].includes(s.status) && !s.deleted_at
    );
};

// Migration for Sequential IDs
export const migrateServiceIds = () => {
    const db = getDB();
    const needsMigration = db.services.some(s => s.id && s.id > 1000000); // Check for timestamp-like IDs

    if (needsMigration) {
        console.log("Migrating Service IDs to Sequential Format...");
        // Sort by creation date (date_in)
        const sortedServices = [...db.services].sort((a, b) => {
            return new Date(a.date_in || 0).getTime() - new Date(b.date_in || 0).getTime();
        });

        // Re-assign IDs
        const idMapping: Record<number, number> = {};
        sortedServices.forEach((service, index) => {
            const oldId = service.id!;
            const newId = index + 1;
            service.id = newId;
            idMapping[oldId] = newId;
        });

        if (JSON.stringify(db.services) !== JSON.stringify(sortedServices)) {
            db.services = sortedServices;
            saveDB(db);
            console.log("Migration Complete. Converted", sortedServices.length, "services.");
            window.location.reload();
        } else {
            console.log("Migration checked, no changes needed.");
        }
    }
};

// Migration for Client Display IDs
export const migrateClientIds = () => {
    const db = getDB();

    // AGGRESSIVE FIX: Run unconditionally to clean up IDs
    console.log("Forcing Client ID Migration to Sequential Format...");

    // Sort by ID (Creation Order)
    const sortedClients = [...db.clients].sort((a, b) => (a.id || 0) - (b.id || 0));

    // Overwrite Display ID for EVERYONE
    sortedClients.forEach((client, index) => {
        client.displayId = (index + 1).toString();
    });

    db.clients = sortedClients;
    saveDB(db);
    console.log("Client Migration Complete. Updated", sortedClients.length, "clients.");
    // No reload needed usually for internal field unless displayed immediately
    // But user asked for "Self executing function ... logic ... save back"
}

export const createService = async (service: ServiceRecord) => {
    const db = getDB();

    const ids = db.services.map(s => s.id || 0);
    const maxId = ids.length > 0 ? Math.max(...ids) : 0;
    const newId = maxId + 1;

    // Explicitly destructure to ensure saving, even if 0 or empty
    const finalBasePrice = service.basePrice ?? 0;
    const finalExtraItems = service.extraItems || [];
    const finalTotalPrice = finalBasePrice + finalExtraItems.reduce((sum, item) => sum + item.price, 0);

    const newService = {
        ...service,
        id: newId,
        date_in: new Date().toISOString(),
        basePrice: finalBasePrice,
        extraItems: finalExtraItems,
        totalPrice: finalTotalPrice
    };
    db.services.push(newService);
    saveDB(db);
    return newService;
};

export const updateBike = async (bikeId: number, bike: Partial<Bike>) => {
    const db = getDB();
    const index = db.bikes.findIndex(b => b.id === bikeId);
    if (index === -1) throw new Error("Bike not found");
    db.bikes[index] = { ...db.bikes[index], ...bike };
    saveDB(db);
    return db.bikes[index];
};

export const deleteBike = async (bikeId: number) => {
    const db = getDB();
    const index = db.bikes.findIndex(b => b.id === bikeId);
    if (index === -1) throw new Error("Bike not found");

    // Remove the bike
    db.bikes.splice(index, 1);

    // Optional: Cascade delete services/reminders or keep them orphaned?
    // Usage implies we just want to remove the bike from the list.
    // Let's keep services for history but maybe mark them or just leave them.
    // For now, strict deletion of the bike entry.

    saveDB(db);
    return true;
};

export const updateServiceStatus = async (serviceId: number, status: string) => {
    const db = getDB();
    const service = db.services.find(s => s.id === serviceId);
    if (service) {
        service.status = status;
        if (status === "Completed") service.date_out = new Date().toISOString();
        saveDB(db);
    }
    return service;
};

export const updateService = async (serviceId: number, data: Partial<ServiceRecord>) => {
    const db = getDB();
    const index = db.services.findIndex(s => s.id === serviceId);
    if (index !== -1) {
        db.services[index] = { ...db.services[index], ...data };
        saveDB(db);
        return db.services[index];
    }
    throw new Error("Service not found");
};

export const deleteService = async (serviceId: number) => {
    const db = getDB();
    const index = db.services.findIndex(s => s.id === serviceId);
    if (index === -1) throw new Error("Service not found");

    const deleteTimestamp = new Date().toISOString();

    // SUPABASE HYBRID APPROACH (Soft Delete Remote)
    try {
        const { supabase } = await import('@/lib/supabase');
        await supabase.from('servicios')
            .update({ deleted_at: deleteTimestamp })
            .eq('id', serviceId);
    } catch (err) {
        console.error("Hybrid Supabase Soft Delete failed silently:", err);
    }

    // LOCAL STORAGE (Soft Delete Local)
    db.services[index].deleted_at = deleteTimestamp;
    saveDB(db);
    return true;
};

export const getService = async (serviceId: number) => {
    const db = getDB();
    const service = db.services.find(s => s.id === serviceId);
    if (!service) throw new Error("Service not found");
    return service;
};

export const createReminders = async (reminders: Reminder[]) => {
    const db = getDB();

    reminders.forEach(newR => {
        // Find existing index (Upsert Logic)
        const existingIndex = db.reminders.findIndex(r =>
            r.bike_id === newR.bike_id &&
            r.component.toLowerCase() === newR.component.toLowerCase()
        );

        if (existingIndex !== -1) {
            // Update Existing
            db.reminders[existingIndex] = {
                ...db.reminders[existingIndex],
                ...newR,
                id: db.reminders[existingIndex].id // Preserve ID
            };
        } else {
            // Insert New
            db.reminders.push({ ...newR, id: Date.now() + Math.random() });
        }
    });

    saveDB(db);
    return reminders; // Return passed reminders (ids might be missing but usually fine for caller)
};

export const deduplicateReminders = async (bikeId: number) => {
    const db = getDB();
    const bikeReminders = db.reminders.filter(r => r.bike_id === bikeId);

    // Group by component
    const groups: Record<string, Reminder[]> = {};
    bikeReminders.forEach(r => {
        const key = r.component.toLowerCase();
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    let hasChanges = false;
    const idsToRemove: number[] = [];

    Object.values(groups).forEach(group => {
        if (group.length > 1) {
            hasChanges = true;
            // Sort by assigned_date desc (most recent first)
            // If assigned_date missing, use id (assuming higher id = newer)
            group.sort((a, b) => {
                const dateA = a.assigned_date ? new Date(a.assigned_date).getTime() : 0;
                const dateB = b.assigned_date ? new Date(b.assigned_date).getTime() : 0;
                if (dateA !== dateB) return dateB - dateA;
                return (b.id || 0) - (a.id || 0);
            });

            // Keep index 0, remove others
            for (let i = 1; i < group.length; i++) {
                idsToRemove.push(group[i].id!);
            }
        }
    });

    if (hasChanges) {
        db.reminders = db.reminders.filter(r => !idsToRemove.includes(r.id!));
        saveDB(db);
    }
    return hasChanges;
};

export const getBikeServices = async (bikeId: number) => {
    const db = getDB();
    return db.services.filter(s => s.bike_id === bikeId && !s.deleted_at);
};

export const getClientServices = async (clientId: number) => {
    const db = getDB();
    // Filter services belonging to any bike owned by this client and NOT deleted
    return db.services.filter(s => {
        if (s.deleted_at) return false;
        const bike = db.bikes.find(b => b.id === s.bike_id);
        return bike?.client_id === clientId;
    });
};

export const getFleetStatus = async () => {
    const db = getDB();
    // 1. Construct fleet items from bikes (Standard)
    const fleet: FleetItem[] = db.bikes.map(bike => {
        const client = db.clients.find(c => c.id === bike.client_id);
        const bikeServices = db.services.filter(s => s.bike_id === bike.id);
        const bikeReminders = db.reminders.filter(r => r.bike_id === bike.id);

        let nextDueDate: string | null = null;
        let nextDueComponent: string | null = null;

        if (bikeReminders.length > 0) {
            bikeReminders.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
            nextDueDate = bikeReminders[0].due_date;
            nextDueComponent = bikeReminders[0].component;
        }

        return {
            bike_id: bike.id!,
            client_name: client?.name || "Unknown",
            client_id: client?.id || 0,
            client_display_id: client?.displayId || "?",
            client_tier: client?.usage_tier || "C",
            bike_model: bike.model,
            bike_type: "Standard",
            transmission: bike.transmission,
            service_count: bikeServices.length,
            next_due_date: nextDueDate,
            next_due_component: nextDueComponent
        }
    });

    // 2. Find Clients WITHOUT bikes (Visibility Fix)
    const clientIdsWithBikes = new Set(db.bikes.map(b => b.client_id));
    const clientsWithoutBikes = db.clients.filter(c => !clientIdsWithBikes.has(c.id!) && !c.isDeleted);

    const orphans: FleetItem[] = clientsWithoutBikes.map(client => ({
        bike_id: 0, // Signal for "No Bike"
        client_name: client.name,
        client_id: client.id!,
        client_display_id: client.displayId || "?",
        client_tier: client.usage_tier || "C",
        bike_model: "Sin Bicicletas", // Placeholder
        bike_type: "N/A",
        transmission: "-",
        service_count: 0,
        next_due_date: null,
        next_due_component: null
    }));

    const fleetFiltered = fleet.filter(item => {
        // Find the client for this item again or pass it down?
        // We have client_id. check if client is deleted.
        const client = db.clients.find(c => c.id === item.client_id);
        return !client?.isDeleted;
    });

    return [...fleetFiltered, ...orphans];
};

export const getBikeReminders = async (bikeId: number) => {
    await deduplicateReminders(bikeId); // Auto-clean duplicates on fetch
    const db = getDB();
    return db.reminders.filter(r => r.bike_id === bikeId);
};

export const seedDummyData = async () => {
    // Already handled by initializeDB check
    return true;
};

// Functions not fully implemented but required to avoid breakages?
export interface RetentionAlert {
    id: number;
    clientName: string;
    clientPhone: string;
    bikeModel: string;
    component: string;
    dueDate: string; // ISO
    daysRemaining: number;
}

export const getAllRemindersWithDetails = async (): Promise<RetentionAlert[]> => {
    const db = getDB();

    // Filter out invalid entries
    const validReminders = db.reminders.filter(r => r && r.id);

    return validReminders
        .filter(r => {
            const bike = db.bikes.find(b => b.id === r.bike_id);
            const client = db.clients.find(c => c.id === bike?.client_id);
            return !client?.isDeleted;
        })
        .map(r => {
            const bike = db.bikes.find(b => b.id === r.bike_id);
            const client = db.clients.find(c => c.id === bike?.client_id);

            const due = new Date(r.due_date);
            const today = new Date();
            const diffTime = due.getTime() - today.getTime();
            const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return {
                id: r.id!,
                clientName: client?.name || "Desconocido",
                clientPhone: client?.phone || "",
                bikeModel: bike?.model || "Desconocido",
                component: r.component,
                dueDate: r.due_date,
                daysRemaining
            };
        });
};
