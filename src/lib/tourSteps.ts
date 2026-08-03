// ─────────────────────────────────────────────────────────────
// Guion del recorrido de bienvenida (onboarding).
// Cada paso: a qué ruta ir, qué elemento iluminar (data-tour="...")
// y el texto del globo. Tono FORMAL (pedido de Iara, ago-2026): el
// recorrido reemplaza la reunión de capacitación con cada taller nuevo.
// Sin selector → globo centrado (bienvenida / cierre). Si el selector
// no aparece (layout mobile, plan sin la sección), el motor degrada a
// globo centrado: el texto se muestra igual, nunca se rompe.
// ─────────────────────────────────────────────────────────────

export interface PasoTour {
    id: string;
    /** Ruta a la que navega el paso. Sin ruta → se queda donde está. */
    ruta?: string;
    /** Valor de data-tour del elemento a iluminar. Sin selector → centrado. */
    selector?: string;
    /** Selector alternativo para viewport mobile (< 768px). */
    selectorMobile?: string;
    titulo: string;
    cuerpo: string;
    /** Etiqueta del botón de avance (default: "Siguiente"). */
    botonSiguiente?: string;
}

export const PASOS_TOUR: PasoTour[] = [
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
        titulo: 'Motor de Retención: haga que vuelvan',
        cuerpo:
            'El sistema le anticipa qué componentes están por vencer y le indica a qué clientes conviene contactar. Cada aviso es una oportunidad concreta de reventa: el taller deja de esperar a que el cliente recuerde volver.',
    },
    {
        id: 'metricas',
        ruta: '/metrics',
        selector: 'metricas',
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
        titulo: 'Un sistema con su marca',
        cuerpo:
            'Desde Configuración se administra su logo y sus colores —que se aplican a toda la aplicación y a la orden de trabajo—, su menú de services con precios propios y las preferencias de trabajo de su equipo.',
    },
    {
        id: 'cierre',
        ruta: '/',
        titulo: 'Está todo listo para comenzar',
        cuerpo:
            'Ya conoce las herramientas principales de Mechanic Pro. Le sugerimos comenzar registrando su primer ingreso con «Recibir Bici». Recuerde que puede repetir este recorrido cuando lo desee desde Configuración → Preferencias.',
        botonSiguiente: 'Finalizar',
    },
];
