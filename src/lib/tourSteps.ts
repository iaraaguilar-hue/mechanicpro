// ─────────────────────────────────────────────────────────────
// Guion del recorrido guiado de Mechanic Pro , UN solo tour con TODO
// (pedido de Iara 3-ago: "quiero que estén todos los pasos ahí, más
// interactivo: que avance cuando el mecánico selecciona lo que tiene
// que seleccionar"). Tono FORMAL: reemplaza la reunión de capacitación.
//
// Dos tipos de paso:
//  · informativos → botón "Siguiente".
//  · interactivos (`avanza`) → la persona hace la acción REAL (apretar
//    "Recibir Bici", elegir el cliente, cerrar la orden) y el tour
//    avanza solo al detectarla. Siempre hay "Saltear paso" de escape.
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
     * Paso INTERACTIVO: no hay botón "Siguiente" — la persona realiza la acción
     * real en la pantalla (el velo deja pasar los clics) y el tour avanza solo
     * cuando `aparece` un elemento data-tour o cuando `desaparece` uno que
     * estaba (ej: se cerró el modal). Siempre queda el atajo "Saltear paso".
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
        titulo: 'Bienvenido a Mechanic Pro',
        cuerpo:
            'Este recorrido te muestra todo el sistema, y en varios pasos lo vas a usar vos sobre la pantalla de verdad. Son unos minutos. Lo podés repetir cuando quieras desde Configuración, en Preferencias.',
        botonSiguiente: 'Comenzar recorrido',
    },
    {
        id: 'navegacion',
        ruta: '/',
        selector: 'nav',
        selectorMobile: 'menu-mobile',
        titulo: 'Por dónde te vas a mover',
        cuerpo:
            'Todo está en estas secciones: el trabajo del día, tus clientes, el historial, la retención, los números y la configuración. Las vamos a ver en ese orden.',
    },
    {
        id: 'taller-activo',
        ruta: '/',
        selector: 'taller-activo',
        titulo: 'Taller Activo: tu mesa de trabajo',
        cuerpo:
            'Es la pantalla principal y donde vas a caer cada vez que entres. Muestra todas las bicis que están adentro del taller ahora y cómo viene cada una.',
    },
    {
        id: 'contadores',
        ruta: '/',
        selector: 'contadores',
        titulo: 'Cómo viene el día, de un vistazo',
        cuerpo:
            'Cuántas bicis están en proceso y cuántas ya están listas esperando que las vengan a buscar.',
    },
    {
        id: 'mesa-trabajo',
        ruta: '/',
        selector: 'mesa-trabajo',
        titulo: 'Tus órdenes',
        cuerpo:
            'Cada orden en curso vive acá y la podés abrir y editar cuando quieras: trabajos, precios, notas. Adentro también le escribís al cliente y ves todo lo que se habló por esa bici. Y si una orden quedó esperando que el cliente conteste, la fila te lo muestra: una bici frenada deja de parecerse a una en la que estás trabajando.',
    },

    // ═══ Recibir una bici, DE VERDAD (interactivo) ═══
    {
        id: 'recibir-bici',
        ruta: '/',
        selector: 'recibir-bici',
        avanza: { aparece: 'sm-cliente' },
        titulo: 'Ahora recibí una bici',
        cuerpo:
            'Así se carga cada ingreso. Hacelo vos: apretá el botón iluminado "Recibir Bici". Si tenés las manos ocupadas, adentro podés DICTAR la orden hablando y se arma sola: el tipo de service, los repuestos y las tareas.',
    },
    {
        id: 'sm-cliente',
        selector: 'sm-cliente',
        avanza: { aparece: 'sm-bici' },
        opcional: true,
        titulo: 'Primero, el cliente',
        cuerpo:
            'Buscalo por nombre o teléfono y elegilo. Si es la primera vez que viene, lo creás acá mismo: se carga una sola vez y queda para siempre.',
    },
    {
        id: 'sm-bici',
        selector: 'sm-bici',
        avanza: { aparece: 'service-tipo' },
        opcional: true,
        titulo: 'La bici que entra',
        cuerpo:
            'Elegí cuál de sus bicis entra al taller, o sumala al garage si es nueva. Cada bici lleva su propio historial y su propio estado.',
    },
    {
        id: 'service-tipo',
        selector: 'service-tipo',
        opcional: true,
        titulo: 'El tipo de service',
        cuerpo:
            'Tu lista de services con tus precios: elegís uno y el precio base se carga solo. La lista la armás en Configuración, en Menú de Services.',
    },
    {
        id: 'service-items',
        selector: 'service-items',
        opcional: true,
        titulo: 'Repuestos y trabajos extra',
        cuerpo:
            'Con "+ Agregar" sumás cada repuesto o mano de obra con su precio. Al escribir, el buscador te sugiere lo que tu taller ya usó antes, con el precio de la última vez: cuanto más lo usás, menos tipeás. Todo queda detallado en la orden y en el comprobante.',
    },
    {
        id: 'service-carrera',
        selector: 'service-carrera',
        opcional: true,
        titulo: 'Corre alguna carrera?',
        cuerpo:
            'Si la bici tiene una carrera cerca, atala a la orden: la buscás por nombre o la creás con su fecha. Después vas a saber qué bicis tenés con fecha encima.',
    },
    {
        id: 'service-diagnostico',
        selector: 'service-diagnostico',
        opcional: true,
        titulo: 'Lo que ves mientras trabajás',
        cuerpo:
            'Anotá acá lo que le encuentres: cada componente con su fecha de vencimiento se convierte solo en un aviso en Retención.',
    },
    {
        id: 'service-confirmar',
        selector: 'service-confirmar',
        avanza: { desaparece: 'service-confirmar' },
        opcional: true,
        titulo: 'Creá la orden',
        cuerpo:
            'Cargá lo que tengas y apretá "CONFIRMAR INGRESO". Si preferís no guardarla ahora, cerrala con la X: el recorrido sigue igual.',
    },
    {
        id: 'orden-creada',
        ruta: '/',
        libre: true,
        titulo: 'La orden ya está en tu mesa',
        cuerpo:
            'Cada orden hace este camino: se trabaja, apretás "Finalizar" cuando el trabajo terminó y queda lista para entregar, y "Entregar" cuando el cliente la retira, que la manda al Historial. Vamos al paso que más importa: la finalización.',
    },

    // ═══ Avisarle al cliente sin salir de la orden (8-sep-2026) ═══
    // Es lo que pidió Ariel Leira y resuelve el agujero más caro del taller: la
    // bici parada esperando un sí, y la conversación que no queda escrita en
    // ningún lado. Va ACÁ y no al final: pasa mientras se trabaja la bici, que
    // es exactamente donde está el mecánico en este punto del recorrido.
    {
        id: 'abrir-la-orden',
        ruta: '/',
        selector: 'mesa-trabajo',
        avanza: { aparece: 'aviso-al-cliente' },
        titulo: 'Abrí la orden que acabás de cargar',
        cuerpo:
            'Apretá sobre la fila de cualquier orden. Adentro está lo que se usa mientras la bici está en el banco: escribirle al cliente y ver todo lo que se habló con él. Y abajo, el botón del comprobante de ingreso: la hoja A4 que se corta al medio, arriba lo que se lleva el cliente y abajo tu checklist.',
    },
    {
        id: 'aviso-al-cliente',
        selector: 'aviso-al-cliente',
        opcional: true,
        libre: true,
        avanza: { desaparece: 'aviso-al-cliente' },
        titulo: 'Escribirle sin salir de la orden',
        cuerpo:
            'Abriste la bici y encontraste algo que no estaba en la orden. Desde acá le escribís: elegí "Preguntarle algo" si necesitás un sí para seguir (la orden queda marcada como que espera respuesta, y si no te contestan te avisa que conviene llamarlo) o "Contarle cómo va" si es solo para tenerlo al tanto. Y el teléfono lo tenés ahí arriba, con un botón para copiarlo.',
    },

    // ═══ Finalizar un service (interactivo) ═══
    {
        id: 'finalizar-abrir',
        ruta: '/',
        selector: 'mesa-trabajo',
        avanza: { aparece: 'finalizar-resumen' },
        titulo: 'Abrí la finalización de un service',
        cuerpo:
            'Apretá el botón verde "Finalizar" de cualquier orden para ver cómo es el cierre. Tranquilo: no se guarda nada hasta que confirmes.',
    },
    {
        id: 'finalizar-resumen',
        selector: 'finalizar-resumen',
        opcional: true,
        titulo: 'El resumen de lo que se cobra',
        cuerpo:
            'Mirá el detalle antes de cerrar: service base, adicionales y el total, tal cual lo va a ver el cliente. Si algo no cierra, un repuesto cargado sin la mano de obra o un precio lejos del habitual, te lo marca antes de cobrar.',
    },
    {
        id: 'finalizar-obs',
        selector: 'finalizar-obs',
        opcional: true,
        titulo: 'Las notas para el cliente',
        cuerpo:
            'Lo que quieras contarle del trabajo. Queda en la orden y sale en el comprobante. Lo que es para adentro va en las notas internas, que el cliente no ve nunca.',
    },
    {
        id: 'finalizar-diagnostico',
        selector: 'finalizar-diagnostico',
        opcional: true,
        titulo: 'Lo que va a necesitar más adelante',
        cuerpo:
            'Anotá los componentes que van a pedir atención y para cuándo. Cada uno se convierte en un aviso en Retención, así lo llamás en el momento justo. Y acá mismo podés dejar programado un "avisale en tantos días".',
    },
    {
        id: 'finalizar-cerrar',
        selector: 'finalizar-boton',
        avanza: { desaparece: 'finalizar-resumen' },
        opcional: true,
        titulo: 'Confirmá, o volvé sin cambios',
        cuerpo:
            'Si la orden está lista de verdad, confirmá. Si solo estabas mirando, apretá "Cancelar": el recorrido sigue igual.',
    },

    // ═══ Clientes y la ficha (interactivo) ═══
    {
        id: 'clientes',
        ruta: '/clientes',
        selector: 'clientes',
        seccion: 'Clientes',
        nav: 'nav-clientes',
        titulo: 'Tus clientes',
        cuerpo:
            'Cada uno queda con sus bicis y todos sus services. Con "Nuevo Cliente" el alta te va llevando: sus datos, su bici y, si querés, el primer service en el mismo paso.',
    },
    {
        id: 'buscador-clientes',
        ruta: '/clientes',
        selector: 'buscador-clientes',
        titulo: 'Encontralo al toque',
        cuerpo:
            'Escribí un nombre o un modelo de bici y aparece. También sirve para saber si ya lo tenés cargado antes de crearlo dos veces.',
    },
    {
        id: 'ficha-abrir',
        ruta: '/clientes',
        selector: 'clientes-grilla',
        avanza: { aparece: 'garage-header' },
        opcional: true,
        titulo: 'Abrí la ficha de un cliente',
        cuerpo:
            'Apretá cualquier cliente de la lista para ver su perfil completo.',
    },
    {
        id: 'garage-bicis',
        selector: 'garage-bicis',
        opcional: true,
        titulo: 'El garage',
        cuerpo:
            'Cada solapa es una bici de ese cliente. Con "Nueva Bici" sumás las que hagan falta: el historial de cada una va por separado.',
    },
    {
        id: 'garage-iniciar',
        selector: 'garage-iniciar',
        opcional: true,
        titulo: 'Arrancar un service desde acá',
        cuerpo:
            'Con la bici elegida, este botón crea la orden directo, sin volver a buscar al cliente.',
    },
    {
        id: 'garage-salud',
        selector: 'garage-salud',
        opcional: true,
        titulo: 'Cómo viene esa bici',
        cuerpo:
            'Acá están los vencimientos que fuiste anotando en los diagnósticos de cada service. Es lo que alimenta Retención y los avisos de la campana.',
    },
    {
        id: 'garage-historial',
        selector: 'garage-historial',
        opcional: true,
        titulo: 'Todo lo que le hiciste a esta bici',
        cuerpo:
            'Cada service, con sus trabajos y sus precios. Cuando el cliente pregunta si eso ya se lo cambiaste, la respuesta está acá.',
    },

    // ═══ Historial ═══
    {
        id: 'historial',
        ruta: '/history',
        selector: 'historial',
        seccion: 'Historial',
        nav: 'nav-historial',
        titulo: 'Historial: la memoria del taller',
        cuerpo:
            'Todo lo entregado queda guardado: qué se hizo, cuándo y por cuánto. No se borra ni se pierde.',
    },
    {
        id: 'historial-buscador',
        ruta: '/history',
        selector: 'historial-buscador',
        titulo: 'Buscar en el historial',
        cuerpo:
            'Filtrá por tipo o marca de bici, o buscá por cliente, modelo o trabajo hecho, por ejemplo "horquilla".',
    },

    // ═══ Retención: el círculo se cierra ═══
    {
        id: 'retencion',
        ruta: '/reminders',
        selector: 'retencion',
        seccion: 'Retención',
        nav: 'nav-retencion',
        titulo: 'Retención: los que tienen que volver',
        cuerpo:
            'Los diagnósticos que anotaste al cerrar cada service viven acá: el sistema te dice qué componentes están por vencer y a quién conviene llamar. Es la pantalla que te trae trabajo sin que salgas a buscarlo.',
    },
    {
        id: 'retencion-urgentes',
        selector: 'retencion-urgentes',
        opcional: true,
        titulo: 'Los de ahora',
        cuerpo:
            'Componentes vencidos o que vencen hoy: estos son los primeros que conviene contactar.',
    },
    {
        id: 'retencion-contactar',
        selector: 'retencion-contactar',
        opcional: true,
        titulo: 'El mensaje ya escrito',
        cuerpo:
            'Con "Contactar por WhatsApp" se abre el chat con el mensaje armado para ese cliente y ese componente. Con "Copiar Mensaje" lo llevás a donde quieras. Lo leés, lo cambiás si querés, y lo mandás.',
    },
    {
        id: 'retencion-proximos',
        selector: 'retencion-proximos',
        opcional: true,
        titulo: 'Lo que viene',
        cuerpo:
            'Lo que vence en los próximos días, ordenado por urgencia, también con el WhatsApp a un toque.',
    },

    // ═══ Lo que Retención ganó desde agosto ═══
    // El Motor ya estaba en el recorrido; estas tres pantallas no. La de retorno
    // es la mas importante de las tres, y quiza del producto: es la unica que
    // le muestra al taller un RESULTADO y no más trabajo por hacer.
    {
        id: 'retencion-retorno',
        ruta: '/reminders',
        selector: 'retencion-retorno',
        opcional: true,
        titulo: 'Qué te trajeron tus mensajes',
        cuerpo:
            'A cuántos les escribiste, cuántos volvieron con la bici y cuánta plata entró por esas vueltas, en los últimos 90 días. Va en dos partes: los mensajes que salieron del sistema y, aparte, los que escribiste a mano desde tu celular.',
    },
    {
        id: 'retencion-bandeja',
        ruta: '/reminders',
        titulo: 'Lo que te contestaron',
        cuerpo:
            'El recontacto no termina cuando sale el mensaje: termina cuando alguien contesta y le respondés. En cuanto un cliente conteste, va a aparecer en esta misma pantalla, con el tiempo que te queda para responderle por WhatsApp.',
    },
    {
        id: 'retencion-campanas',
        ruta: '/reminders',
        titulo: 'Escribirle a un grupo entero',
        cuerpo:
            'Cuando quieras avisarle a muchos a la vez, los que hace rato no vienen, los de una marca, acá preparás la tanda y ves el texto EXACTO que le llega a cada uno, con su nombre y su bici. No sale nada hasta que lo aprobás.',
    },

    // ═══ Métricas, notificaciones y configuración ═══
    {
        id: 'metricas',
        ruta: '/metrics',
        selector: 'metricas',
        seccion: 'Métricas',
        nav: 'nav-metricas',
        titulo: 'Los números del taller',
        cuerpo:
            'Facturación, mano de obra, repuestos y ticket promedio, en el período que elijas.',
    },
    {
        id: 'notificaciones',
        ruta: '/metrics',
        selector: 'notificaciones',
        selectorMobile: 'notificaciones-mobile',
        titulo: 'La campana',
        cuerpo:
            'Acá te caen los avisos del sistema y las novedades. Cuando tiene un punto, hay algo nuevo.',
    },
    {
        id: 'configuracion',
        ruta: '/configuracion',
        selector: 'configuracion',
        seccion: 'Configuración',
        nav: 'nav-config',
        titulo: 'El sistema con tu marca',
        cuerpo:
            'En Configuración cargás tu logo y tus colores, que se aplican a toda la app y al comprobante, tu lista de services con tus precios, y cómo quiere trabajar tu equipo.',
    },
    {
        id: 'config-whatsapp',
        ruta: '/configuracion',
        selector: 'config-whatsapp',
        opcional: true,
        titulo: 'Tu propio número de WhatsApp',
        cuerpo:
            'Los avisos pueden salir del número que tu taller ya usa, no de uno nuevo: el cliente ve el contacto que ya tiene agendado. Antes de conectarlo hay dos cosas que conviene que sepas, y te las decimos ahora y no después: las listas de difusión dejan de funcionar en ese número, y WhatsApp Web se desvincula hasta que termine de sincronizar, que puede tardar 24 horas. Ese día el mostrador atiende desde el celular, que anda normal.',
    },
    {
        id: 'config-automaticos',
        ruta: '/configuracion',
        selector: 'config-automaticos',
        opcional: true,
        titulo: 'Los mensajes que salen solos',
        cuerpo:
            'Acá decidís qué se manda sin que nadie apriete un botón: el comprobante cuando termina el service, el aviso cuando el cliente retira la bici, o un seguimiento a los días para saber cómo la viene sintiendo. Elegís quién los firma, el nombre de pila del que atiende, que es lo que hace que te contesten. Y si te falta un aviso que no está en la lista, lo escribís con tus palabras y se crea solo.',
    },
    // ═══ Las tres pantallas que el recorrido nunca abría ═══
    // Estaban en el menú desde hace semanas y el tour pasaba de largo: una
    // sección que nadie visita en la capacitación es una sección que no existe.
    // Van cortas y al final, porque no son del uso diario.
    {
        id: 'bicis-paradas',
        ruta: '/bicis-paradas',
        seccion: 'Bicis paradas',
        nav: 'nav-paradas',
        opcional: true,
        titulo: 'Las bicis frenadas',
        cuerpo:
            'Las que llevan demasiado tiempo adentro y las que ya están listas y el cliente no vino a buscar. Es la lista que te evita el reclamo de las tres semanas.',
    },
    {
        id: 'preguntale',
        ruta: '/preguntale',
        seccion: 'Preguntale',
        nav: 'nav-preguntale',
        opcional: true,
        titulo: 'Preguntarle al sistema en criollo',
        cuerpo:
            'Escribí lo que querés saber como se lo preguntarías a un empleado: cuántas Specialized atendimos este año, a quién no veo hace seis meses. Te contesta con los datos de TU taller.',
    },
    {
        id: 'auditoria',
        ruta: '/auditoria',
        seccion: 'Auditoría',
        nav: 'nav-auditoria',
        opcional: true,
        titulo: 'Nada se borra para siempre',
        cuerpo:
            'Todo lo que se elimina queda acá y se puede recuperar, con quién lo hizo y cuándo. Es la red para trabajar sin miedo a apretar el botón equivocado.',
    },

    {
        id: 'cierre',
        ruta: '/',
        seccion: 'Taller Activo',
        nav: 'nav-taller',
        titulo: 'Listo, ya está',
        cuerpo:
            'Recorriste todo Mechanic Pro y además lo usaste con tus propias manos. Cualquier cosa que no te cierre, lo repetís desde Configuración, en Preferencias.',
        botonSiguiente: 'Finalizar',
    },
];

export const TOURS: Record<ContextoTour, PasoTour[]> = {
    bienvenida: BIENVENIDA,
};
