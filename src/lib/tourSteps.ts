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
            'Cada orden en curso vive aquí, y puede abrirse y editarse en cualquier momento con «Editar» (trabajos, precios, notas). Al terminar, «Finalizar» la deja «Lista para entregar» y con «Avisar por WhatsApp» el cliente se entera con un toque; «Entregar Bici» la archiva en el Historial. Nada se pierde ni se traspapela.',
    },
    {
        id: 'clientes',
        ruta: '/clientes',
        selector: 'clientes',
        seccion: 'Clientes',
        nav: 'nav-clientes',
        titulo: 'Su cartera de clientes',
        cuerpo:
            'Cada cliente queda registrado con sus bicicletas y todos sus services. Con «Nuevo Cliente» el alta es guiada: sus datos, su bicicleta y, si lo desea, su primer service en el mismo paso. Se carga una sola vez; el sistema lo recuerda para siempre.',
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
            'El sistema le anticipa qué componentes están por vencer y le indica a qué clientes conviene contactar. Los avisos nacen de los diagnósticos que se registran al finalizar cada service; cada uno es una oportunidad concreta de reventa, con el mensaje para el cliente ya preparado.',
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
            'Ya conoce las secciones principales. Además, la primera vez que reciba una bicicleta, abra la ficha de un cliente, finalice un service o entre a Retención con avisos activos, aparecerá una guía breve de esa pantalla, paso a paso. Le sugerimos comenzar con «Recibir Bici». Puede repetir todo desde Configuración → Preferencias.',
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

// ── Recibir Bici, fase 1: identificar (o crear) al cliente ──
const SERVICE_CLIENTE: PasoTour[] = [
    {
        id: 'sm-cliente',
        selector: 'sm-cliente',
        titulo: 'Todo empieza por el cliente',
        cuerpo:
            'Busque al cliente por nombre o teléfono. Si es la primera vez que viene al taller, créelo desde aquí mismo: se carga una sola vez y el sistema lo recuerda para siempre, con sus bicicletas y todo su historial.',
        botonSiguiente: 'Entendido',
    },
];

// ── Recibir Bici, fase 2: elegir (o agregar) la bicicleta ──
const SERVICE_BICI: PasoTour[] = [
    {
        id: 'sm-bici',
        selector: 'sm-bici',
        titulo: 'La bicicleta que ingresa',
        cuerpo:
            'Seleccione la bicicleta que entra al taller, o agréguela al garage si es nueva. Cada bicicleta lleva su propio historial y su propio estado de salud, separados del resto.',
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

// ── Retención con avisos activos: cómo se convierte el aviso en visita ──
const RETENCION: PasoTour[] = [
    {
        id: 'retencion-intro',
        titulo: 'Convierta avisos en visitas',
        cuerpo:
            'Estos avisos nacieron de los diagnósticos registrados en los services. Veamos cómo transformarlos en la próxima visita del cliente, en menos de un minuto.',
        botonSiguiente: 'Ver cómo',
    },
    {
        id: 'retencion-urgentes',
        selector: 'retencion-urgentes',
        opcional: true,
        titulo: 'Atención inmediata',
        cuerpo:
            'Componentes vencidos o que vencen hoy: a estos clientes conviene contactarlos primero.',
    },
    {
        id: 'retencion-contactar',
        selector: 'retencion-contactar',
        opcional: true,
        titulo: 'El mensaje, ya escrito',
        cuerpo:
            'Con «Contactar por WhatsApp» se abre el chat con el mensaje preparado para ese cliente y su componente; con «Copiar Mensaje» lo lleva al canal que prefiera. Solo debe revisarlo y enviarlo.',
    },
    {
        id: 'retencion-proximos',
        selector: 'retencion-proximos',
        opcional: true,
        titulo: 'Próximos vencimientos',
        cuerpo:
            'Lo que vence en los próximos días, ordenado por urgencia: su agenda de reventa para anticiparse, también con el WhatsApp a un clic.',
        botonSiguiente: 'Entendido',
    },
];

export type ContextoTour =
    | 'bienvenida'
    | 'garage'
    | 'service-cliente'
    | 'service-bici'
    | 'service'
    | 'finalizar'
    | 'retencion';

export const TOURS: Record<ContextoTour, PasoTour[]> = {
    bienvenida: BIENVENIDA,
    garage: GARAGE,
    'service-cliente': SERVICE_CLIENTE,
    'service-bici': SERVICE_BICI,
    service: SERVICE,
    finalizar: FINALIZAR,
    retencion: RETENCION,
};
