// ─────────────────────────────────────────────────────────────
// Guion del recorrido guiado de Mechanic Pro — UN solo tour con TODO
// (pedido de Iara 3-ago: "quiero que estén todos los pasos ahí, más
// interactivo: que avance cuando el mecánico selecciona lo que tiene
// que seleccionar"). Tono FORMAL: reemplaza la reunión de capacitación.
//
// Dos tipos de paso:
//  · informativos → botón «Siguiente».
//  · interactivos (`avanza`) → la persona hace la acción REAL (apretar
//    «Recibir Bici», elegir el cliente, cerrar la orden) y el tour
//    avanza solo al detectarla. Siempre hay «Saltear paso» de escape.
// Pasos `opcional` se saltean solos si su elemento no existe (feature
// apagada, taller sin datos): nunca se rompe.
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
    /**
     * Paso INTERACTIVO: no hay botón «Siguiente» — la persona realiza la acción
     * real en la pantalla (el velo deja pasar los clics) y el tour avanza solo
     * cuando `aparece` un elemento data-tour o cuando `desaparece` uno que
     * estaba (ej: se cerró el modal). Siempre queda el atajo «Saltear paso».
     */
    avanza?: { aparece?: string; desaparece?: string };
    /** Velo pasante (clics libres) sin condición de avance — para pasos donde
     *  la app puede mostrar carteles propios que hay que poder cerrar. */
    libre?: boolean;
    titulo: string;
    cuerpo: string;
    /** Etiqueta del botón de avance (default: "Siguiente"). */
    botonSiguiente?: string;
}

export type ContextoTour = 'bienvenida';

const BIENVENIDA: PasoTour[] = [
    // ═══ Presentación ═══
    {
        id: 'bienvenida',
        ruta: '/',
        titulo: 'Le damos la bienvenida a Mechanic Pro',
        cuerpo:
            'Su taller ya cuenta con un sistema de gestión profesional. Este recorrido le mostrará todo lo que puede hacer y, en varios pasos, lo hará usted mismo sobre la pantalla real. Puede repetirlo cuando lo desee desde Configuración → Preferencias.',
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
        id: 'mesa-trabajo',
        ruta: '/',
        selector: 'mesa-trabajo',
        titulo: 'Sus órdenes de trabajo',
        cuerpo:
            'Cada orden en curso vive aquí, y puede abrirse y editarse en cualquier momento con «Editar» (trabajos, precios, notas). Con «Avisar por WhatsApp» el cliente se entera de las novedades con un toque. Nada se pierde ni se traspapela.',
    },

    // ═══ Recibir una bici, DE VERDAD (interactivo) ═══
    {
        id: 'recibir-bici',
        ruta: '/',
        selector: 'recibir-bici',
        avanza: { aparece: 'sm-cliente' },
        titulo: 'Ahora, reciba una bicicleta',
        cuerpo:
            'Así se registra cada ingreso al taller. Hágalo usted mismo: presione el botón iluminado «Recibir Bici».',
    },
    {
        id: 'sm-cliente',
        selector: 'sm-cliente',
        avanza: { aparece: 'sm-bici' },
        opcional: true,
        titulo: 'Todo empieza por el cliente',
        cuerpo:
            'Busque al cliente por nombre o teléfono y selecciónelo. Si es la primera vez que viene, créelo desde aquí mismo: se carga una sola vez y el sistema lo recuerda para siempre.',
    },
    {
        id: 'sm-bici',
        selector: 'sm-bici',
        avanza: { aparece: 'service-tipo' },
        opcional: true,
        titulo: 'La bicicleta que ingresa',
        cuerpo:
            'Seleccione la bicicleta que entra al taller, o agréguela al garage si es nueva. Cada bicicleta lleva su propio historial y su propio estado de salud.',
    },
    {
        id: 'service-tipo',
        selector: 'service-tipo',
        opcional: true,
        titulo: 'El tipo de service',
        cuerpo:
            'Su menú de services, con los precios de su catálogo: se elige uno y el precio base se carga solo. El menú se administra desde Configuración → Menú de Services.',
    },
    {
        id: 'service-items',
        selector: 'service-items',
        opcional: true,
        titulo: 'Repuestos y trabajos adicionales',
        cuerpo:
            'Con «+ Agregar» se suma cada repuesto (📦) o mano de obra (🛠️) con su precio. Todo queda detallado en la orden y en el comprobante, y el total se calcula automáticamente.',
    },
    {
        id: 'service-carrera',
        selector: 'service-carrera',
        opcional: true,
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
        avanza: { desaparece: 'service-confirmar' },
        opcional: true,
        titulo: 'Cree la orden',
        cuerpo:
            'Complete los datos que desee y presione «CONFIRMAR INGRESO» para crear la orden. Si prefiere no guardarla ahora, ciérrela con la X: el recorrido continúa igual.',
    },
    {
        id: 'orden-creada',
        ruta: '/',
        libre: true,
        titulo: 'La orden ya está en su mesa de trabajo',
        cuerpo:
            'Cada orden sigue este ciclo: se trabaja, se presiona «Finalizar Service» cuando el trabajo terminó (queda «Lista para entregar»), y «Entregar Bici» cuando el cliente la retira (pasa al Historial). Veamos el paso más importante: la finalización.',
    },

    // ═══ Finalizar un service (interactivo) ═══
    {
        id: 'finalizar-abrir',
        ruta: '/',
        selector: 'mesa-trabajo',
        avanza: { aparece: 'finalizar-resumen' },
        titulo: 'Abra la finalización de un service',
        cuerpo:
            'Presione el botón verde «Finalizar Service» de cualquier orden para conocer el cierre. Tranquilidad: no se guardará nada sin su confirmación.',
    },
    {
        id: 'finalizar-resumen',
        selector: 'finalizar-resumen',
        opcional: true,
        titulo: 'El resumen de costos',
        cuerpo:
            'Verifique el detalle antes de cerrar: service base, adicionales y el total a cobrar, tal como lo verá el cliente.',
    },
    {
        id: 'finalizar-obs',
        selector: 'finalizar-obs',
        opcional: true,
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
        id: 'finalizar-cerrar',
        selector: 'finalizar-boton',
        avanza: { desaparece: 'finalizar-resumen' },
        opcional: true,
        titulo: 'Confirme… o vuelva sin cambios',
        cuerpo:
            'Si esta orden realmente está lista, confirme la finalización. Si solo estaba mirando, presione «Cancelar»: el recorrido continúa igual.',
    },

    // ═══ Clientes y la ficha (interactivo) ═══
    {
        id: 'clientes',
        ruta: '/clientes',
        selector: 'clientes',
        seccion: 'Clientes',
        nav: 'nav-clientes',
        titulo: 'Su cartera de clientes',
        cuerpo:
            'Cada cliente queda registrado con sus bicicletas y todos sus services. Con «Nuevo Cliente» el alta es guiada: sus datos, su bicicleta y, si lo desea, su primer service en el mismo paso.',
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
        id: 'ficha-abrir',
        ruta: '/clientes',
        selector: 'clientes-grilla',
        avanza: { aparece: 'garage-header' },
        opcional: true,
        titulo: 'Abra la ficha de un cliente',
        cuerpo:
            'Haga clic en cualquier cliente de la lista para abrir su perfil completo.',
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
    },

    // ═══ Historial ═══
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

    // ═══ Retención: el círculo se cierra ═══
    {
        id: 'retencion',
        ruta: '/reminders',
        selector: 'retencion',
        seccion: 'Retención',
        nav: 'nav-retencion',
        titulo: 'Motor de Retención: haga que vuelvan',
        cuerpo:
            'Los diagnósticos que registró al finalizar cada service viven aquí: el sistema le anticipa qué componentes están por vencer y a qué clientes conviene contactar. Cada aviso es una oportunidad concreta de reventa.',
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
    },

    // ═══ Métricas, notificaciones y configuración ═══
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
            'Ya recorrió todo Mechanic Pro e incluso operó el sistema con sus propias manos. Le sugerimos continuar con lo que quedó pendiente del día. Recuerde: puede repetir este recorrido cuando lo desee desde Configuración → Preferencias.',
        botonSiguiente: 'Finalizar',
    },
];

export const TOURS: Record<ContextoTour, PasoTour[]> = {
    bienvenida: BIENVENIDA,
};
