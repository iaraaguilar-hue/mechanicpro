// DATOS DE PRUEBA para la página de render de video.
//
// 🚩 REGLA DURA del sistema de edición de MP: datos de prueba SIEMPRE, nunca un cliente real.
// Filmar el dato de un cliente destruye el argumento de venta del producto. Todos los nombres,
// teléfonos y montos de acá son inventados y no corresponden a ningún taller.
//
// Los montos están puestos para que el gráfico se lea bien en video: una categoría que domina
// (Transmisión), una segunda clara y el resto en cola. Un dataset plano no se entiende en 2 s.

// ─── ExpertMetrics ────────────────────────────────────────────────────────────
// Shape que consume el componente: fecha_entrega, precio_base, tipo_servicio y
// servicio_items[{ categoria, descripcion, precio }]. La categoría del repuesto la deduce
// `getSemanticCategory` leyendo la descripción, así que las descripciones tienen que sonar
// a repuesto de verdad o todo cae en "Otros".

type Item = { categoria: string; descripcion: string; precio: number };
type Servicio = {
    fecha_entrega: string;
    tipo_servicio: string;
    precio_base: number;
    servicio_items: Item[];
};

const DIA = (d: number) => `2026-09-${String(d).padStart(2, '0')}T15:00:00.000Z`;

export const serviciosDePrueba: Servicio[] = [
    { fecha_entrega: DIA(1), tipo_servicio: 'Service completo', precio_base: 42000, servicio_items: [
        { categoria: 'part', descripcion: 'Cadena Shimano 11v', precio: 38000 },
        { categoria: 'part', descripcion: 'Pastillas de freno resina', precio: 21000 },
    ]},
    { fecha_entrega: DIA(2), tipo_servicio: 'Ajuste de cambios', precio_base: 18000, servicio_items: [
        { categoria: 'part', descripcion: 'Piñón 11-42', precio: 74000 },
    ]},
    { fecha_entrega: DIA(2), tipo_servicio: 'Purgado de frenos', precio_base: 26000, servicio_items: [
        { categoria: 'part', descripcion: 'Líquido de freno mineral', precio: 12500 },
    ]},
    { fecha_entrega: DIA(3), tipo_servicio: 'Tubelizado', precio_base: 22000, servicio_items: [
        { categoria: 'part', descripcion: 'Cinta tubeless 25 mm', precio: 16800 },
        { categoria: 'part', descripcion: 'Válvula tubeless', precio: 9400 },
    ]},
    { fecha_entrega: DIA(4), tipo_servicio: 'Service completo', precio_base: 42000, servicio_items: [
        { categoria: 'part', descripcion: 'Cubierta 29 x 2.20', precio: 96000 },
        { categoria: 'part', descripcion: 'Cámara 29', precio: 11000 },
    ]},
    { fecha_entrega: DIA(5), tipo_servicio: 'Service de horquilla', precio_base: 68000, servicio_items: [
        { categoria: 'part', descripcion: 'Retén de horquilla', precio: 43000 },
    ]},
    { fecha_entrega: DIA(5), tipo_servicio: 'Cambio de transmisión', precio_base: 35000, servicio_items: [
        { categoria: 'part', descripcion: 'Cadena 12v', precio: 52000 },
        { categoria: 'part', descripcion: 'Descarrilador trasero', precio: 128000 },
    ]},
    { fecha_entrega: DIA(6), tipo_servicio: 'Ajuste general', precio_base: 16000, servicio_items: [
        { categoria: 'part', descripcion: 'Puños de manubrio', precio: 14500 },
    ]},
];

// ─── JobCard ──────────────────────────────────────────────────────────────────
// La orden de trabajo. `extraItems` se parte en repuestos (category:'part') y mano de obra.

export const ordenDePrueba = {
    id: 'ORD-2026-0417',
    createdAt: '2026-09-03T13:20:00.000Z',
    serviceType: 'Service completo',
    status: 'FINISHED',
    basePrice: 42000,
    totalPrice: 101000,
    notes: 'Vino con ruido en el pedaleo. Era la caja pedalera, no la cadena.',
    extraItems: [
        { category: 'part', description: 'Cadena Shimano 11v', price: 38000 },
        { category: 'part', description: 'Pastillas de freno resina', price: 21000 },
    ],
};

export const clienteDePrueba = {
    name: 'Cliente de prueba',
    phone: '11 0000-0000',
    dni: '',
};
