// ─────────────────────────────────────────────────────────────
// Guiones de los recorridos guiados (onboarding).
// Tono FORMAL (pedido de Iara, ago-2026): reemplazan la reunión de
// capacitación con cada taller nuevo.
//
// Hay UN recorrido general ('bienvenida', auto-arranca la 1ra vez que
// se abre la app) y TUTORIALES CONTEXTUALES que se disparan la primera
// vez que la persona entra a esa pantalla (feedback Iara 3-ago):
//   · 'garage'    → ficha del cliente (BikeDetail)
//   · 'service'   → la orden de trabajo (ServiceModal, paso final)
//   · 'finalizar' → cierre del service + diagnóstico (FinalizeJobDialog)
//
// Campos: `seccion`+`nav` marcan un cambio de sección (el motor muestra
// un cartel de transición e ilumina el botón del menú). `opcional` =
// si el elemento no está (feature apagada, garage vacío), el paso se
// saltea solo en vez de degradar a globo centrado.
// ─────────────────────────────────────────────────────────────

export interface PasoTour {
    id: string;
    /** Ruta a la que navega el paso. Sin ruta → se queda donde está. */
    ruta?: string;
    /** Valor de data-tour del elemento a iluminar. Sin selector → centrado. */
    selector?: string;
    /** Selector alternativo para viewport mobile (< 768px). */
    selectorMobile?: string;
    /** Nombre de la sección a la que se entra (dispara el cartel de transición). */
    seccion?: string;
    /** data-tour del botón del menú de esa sección (se ilumina en la transición). */
    nav?: string;
    /** Si el elemento no aparece, saltear el paso en vez de mostrarlo centrado. */
    opcional?: boolean;
    titulo: string;
    cuerpo: string;
    /** Etiqueta del botón de avance (default: "Siguiente"). */
    botonSiguiente?: string;
}

const BIENVENIDA: PasoTour[] = [
    {
        id: 'bienvenida',
        ruta: '/',
        titulo: 'Le damos la bienvenida a Mechanic Pro',
        cuerpo:
            'Su taller ya cuenta con un sistema de gestión profesional. Este breve recorrido le mostrará cómo administrar sus órdenes de trabajo, sus clientes y los números de su negocio. Le tomará menos de tres minutos y puede repetirlo cuando lo desee desde Configuración → Preferencias.',
        botonSiguiente: 'Comenzar recorrido',
    },
    {
        id: 'navegacion',
        ruta: '/',
        selector: 'nav',
        selectorMobile: 'menu-mobile',
        titulo: 'Su centro de operaciones',
        cuerpo:
            'Toda la aplicación se organiza en estas secciones: el trabajo del día, sus clientes, el historial, la retención, las métricas y la configuración. Las recorreremos en orden.',
    },
    {
        id: 'taller-activo',
        ruta: '/',
        selector: 'taller-activo',
        titulo: 'Taller Activo: su mesa de trabajo',
        cuerpo:
            'Esta es la pantalla principal. Muestra, en tiempo real, todas las bicicletas que se encuentran dentro del taller y el estado de cada una. Al abrir la aplicación, siempre comenzará aquí.',
    },
    {
        id: 'contadores',
        ruta: '/',
        selector: 'contadores',
        titulo: 'El estado del taller, de un vistazo',
        cuerpo:
            'Cuántas bicicletas están en proceso y cuántas ya están listas para ser retiradas. Comience cada jornada sabiendo con exactitud qué hay pendiente.',
    },
    {
        id: 'recibir-bici',
        ruta: '/',
        selector: 'recibir-bici',
        titulo: 'Recibir una bicicleta',
        cuerpo:
            'Desde este botón se registra cada ingreso: cliente, bicicleta y trabajos a realizar, con su precio. El sistema genera la orden de trabajo y su comprobante de forma automática.',
    },
    {
        id: 'mesa-trabajo',
        ruta: '/',
        selector: 'mesa-trabajo',
        titulo: 'Sus órdenes de trabajo',
        cuerpo:
            'Cada orden en curso vive aquí. Al terminar el trabajo, presione «Finalizar» y la orden pasará a «Lista para entregar»; con «Entregar Bici» queda archivada en el Historial. Nada se pierde ni se traspapela.',
    },
    {
        id: 'clientes',
        ruta: '/clientes',
        selector: 'clientes',
        seccion: 'Clientes',
        nav: 'nav-clientes',
        titulo: 'Su cartera de clientes',
        cuerpo:
            'Cada cliente queda registrado con sus bicicletas y todos sus services. Con «Nuevo Cliente» se realiza el alta en segundos, y desde cada ficha se consulta el historial completo de cada bicicleta.',
    },
    {
        id: 'buscador-clientes',
        ruta: '/clientes',
        selector: 'buscador-clientes',
        titulo: 'Encuentre a cualquiera al instante',
        cuerpo:
            'Escriba un nombre o un modelo de bicicleta y el sistema lo localiza de inmediato. Sin cuadernos ni planillas.',
    },
    {
        id: 'historial',
        ruta: '/history',
        selector: 'historial',
        seccion: 'Historial',
        nav: 'nav-historial',
        titulo: 'Historial: la memoria de su taller',
        cuerpo:
            'Todos los trabajos entregados quedan guardados de manera permanente: qué se hizo, cuándo y por cuánto. Ante cualquier consulta de un cliente, la respuesta está a un clic.',
    },
    {
        id: 'historial-buscador',
        ruta: '/history',
        selector: 'historial-buscador',
        titulo: 'Búsqueda profesional',
        cuerpo:
            'Filtre por tipo o marca de bicicleta, o busque por cliente, modelo o trabajo realizado (por ejemplo, «horquilla»). El historial completo responde en el momento.',
    },
    {
        id: 'retencion',
        ruta: '/reminders',
        selector: 'retencion',
        seccion: 'Retención',
        nav: 'nav-retencion',
        titulo: 'Motor de Retención: haga que vuelvan',
        cuerpo:
            'El sistema le anticipa qué componentes están por vencer y le indica a qué clientes conviene contactar. Cada aviso es una oportunidad concreta de reventa: el taller deja de esperar a que el cliente recuerde volver.',
    },
    {
        id: 'metricas',
        ruta: '/metrics',
        selector: 'metricas',
        seccion: 'Métricas',
        nav: 'nav-metricas',
        titulo: 'Los números de su negocio',
        cuerpo:
            'Facturación, mano de obra, repuestos y ticket promedio, en el período que usted elija. Decisiones basadas en datos reales, no en intuición.',
    },
    {
        id: 'notificaciones',
        ruta: '/metrics',
        selector: 'notificaciones',
        selectorMobile: 'notificaciones-mobile',
        titulo: 'Centro de notificaciones',
        cuerpo:
            'Aquí recibirá avisos importantes y novedades del sistema. Cuando la campana muestre un indicador, hay información nueva esperándolo.',
    },
    {
        id: 'configuracion',
        ruta: '/configuracion',
        selector: 'configuracion',
        seccion: 'Configuración',
        nav: 'nav-config',
        titulo: 'Un sistema con su marca',
        cuerpo:
            'Desde Configuración se administra su logo y sus colores —que se aplican a toda la aplicación y a la orden de trabajo—, su menú de services con precios propios y las preferencias de trabajo de su equipo.',
    },
    {
        id: 'cierre',
        ruta: '/',
        seccion: 'Taller Activo',
        nav: 'nav-taller',
        titulo: 'Está todo listo para comenzar',
        cuerpo:
            'Ya conoce las secciones principales. Además, la primera vez que abra la ficha de un cliente, cargue una orden de trabajo o finalice un service, aparecerá una guía breve de esa pantalla. Le sugerimos comenzar con «Recibir Bici». Puede repetir todo desde Configuración → Preferencias.',
        botonSiguiente: 'Finalizar',
    },
];

// ── Ficha del cliente (BikeDetail): garage, salud, historial ──
const GARAGE: PasoTour[] = [
    {
        id: 'garage-intro',
        titulo: 'La ficha del cliente',
        cuerpo:
            'Está viendo el perfil completo de un cliente: su garage de bicicletas, el estado de salud de sus componentes y todo su historial de trabajos. Recorrámoslo.',
        botonSiguiente: 'Ver la ficha',
    },
    {
        id: 'garage-bicis',
        selector: 'garage-bicis',
        opcional: true,
        titulo: 'El garage',
        cuerpo:
            'Cada pestaña es una bicicleta del cliente; selecciónela para ver su información. Con «Nueva Bici» se agregan las que hagan falta: el historial de cada una se mantiene separado.',
    },
    {
        id: 'garage-iniciar',
        selector: 'garage-iniciar',
        opcional: true,
        titulo: 'Iniciar un service desde aquí',
        cuerpo:
            'Con la bicicleta seleccionada, este botón crea una orden de trabajo directamente, sin volver a buscar al cliente.',
    },
    {
        id: 'garage-salud',
        selector: 'garage-salud',
        opcional: true,
        titulo: 'Estado de salud y mantenimiento',
        cuerpo:
            'Aquí viven los vencimientos de componentes registrados en los diagnósticos de cada service. Esta información alimenta el Motor de Retención y las alertas de la campana.',
    },
    {
        id: 'garage-historial',
        selector: 'garage-historial',
        opcional: true,
        titulo: 'El historial de esta bicicleta',
        cuerpo:
            'Todos los services realizados a esta bicicleta, con sus trabajos y precios. La memoria completa de la máquina, siempre disponible.',
        botonSiguiente: 'Entendido',
    },
];

// ── La orden de trabajo (ServiceModal, paso DEFINE_SERVICE) ──
const SERVICE: PasoTour[] = [
    {
        id: 'service-intro',
        titulo: 'La orden de trabajo',
        cuerpo:
            'Este formulario crea la orden completa del service. Veamos las partes importantes para cargarla de manera profesional.',
        botonSiguiente: 'Ver el formulario',
    },
    {
        id: 'service-tipo',
        selector: 'service-tipo',
        titulo: 'El tipo de service',
        cuerpo:
            'Su menú de services, con los precios de su catálogo: se elige uno y el precio base se carga solo. El menú se administra desde Configuración → Menú de Services.',
    },
    {
        id: 'service-items',
        selector: 'service-items',
        titulo: 'Repuestos y trabajos adicionales',
        cuerpo:
            'Con «+ Agregar» se suma cada repuesto (📦) o mano de obra (🛠️) con su precio. Todo queda detallado en la orden y en el comprobante, y el total se calcula automáticamente.',
    },
    {
        id: 'service-carrera',
        selector: 'service-carrera',
        titulo: '¿El cliente compite?',
        cuerpo:
            'Si la bicicleta corre una carrera próximamente, asóciela a la orden: búsquela por nombre o créela con su fecha de evento. La orden queda vinculada a esa competencia.',
    },
    {
        id: 'service-diagnostico',
        selector: 'service-diagnostico',
        opcional: true,
        titulo: 'Diagnóstico durante el trabajo',
        cuerpo:
            'Registre aquí lo que observe mientras trabaja: cada componente con su fecha de vencimiento se convierte en un aviso de mantenimiento en Retención.',
    },
    {
        id: 'service-confirmar',
        selector: 'service-confirmar',
        titulo: 'Confirmar el ingreso',
        cuerpo:
            'Al confirmar, la orden entra al Taller Activo con todos sus datos, lista para trabajar y para avisar al cliente por WhatsApp.',
        botonSiguiente: 'Entendido',
    },
];

// ── Finalizar el service (FinalizeJobDialog): cierre + diagnóstico ──
const FINALIZAR: PasoTour[] = [
    {
        id: 'finalizar-intro',
        titulo: 'Finalizar el service',
        cuerpo:
            'El trabajo está terminado: este paso cierra la orden con prolijidad y deja sembrada la próxima visita del cliente.',
        botonSiguiente: 'Ver el cierre',
    },
    {
        id: 'finalizar-resumen',
        selector: 'finalizar-resumen',
        titulo: 'El resumen de costos',
        cuerpo:
            'Verifique el detalle antes de cerrar: service base, adicionales y el total a cobrar, tal como lo verá el cliente.',
    },
    {
        id: 'finalizar-obs',
        selector: 'finalizar-obs',
        titulo: 'Observaciones finales',
        cuerpo:
            'Las notas para el cliente sobre el trabajo realizado. Quedan guardadas en la orden y salen en el comprobante.',
    },
    {
        id: 'finalizar-diagnostico',
        selector: 'finalizar-diagnostico',
        opcional: true,
        titulo: 'El diagnóstico: su próxima venta',
        cuerpo:
            'Registre los componentes que van a necesitar atención y su fecha estimada. Cada registro se convierte en un aviso del Motor de Retención: el taller contacta al cliente en el momento justo, antes que nadie.',
    },
    {
        id: 'finalizar-boton',
        selector: 'finalizar-boton',
        opcional: true,
        titulo: 'Confirmar la finalización',
        cuerpo:
            'La orden pasa a «Lista para entregar» y sigue visible en el Taller Activo; con «Entregar Bici» quedará archivada en el Historial.',
        botonSiguiente: 'Entendido',
    },
];

export type ContextoTour = 'bienvenida' | 'garage' | 'service' | 'finalizar';

export const TOURS: Record<ContextoTour, PasoTour[]> = {
    bienvenida: BIENVENIDA,
    garage: GARAGE,
    service: SERVICE,
    finalizar: FINALIZAR,
};
