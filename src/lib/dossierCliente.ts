import type {
    SupabaseBike,
    SupabaseCarrera,
    SupabaseClient,
    SupabaseReminder,
    SupabaseService,
} from "@/store/dataStore";

// ─────────────────────────────────────────────────────────────
// EL DOSSIER — todo lo que el taller sabe de un cliente, junto.
//
// POR QUÉ EXISTE: el dato ya estaba (órdenes, bicis, carreras, notas del
// mecánico), pero repartido en cinco tablas y visible solo si alguien se
// ponía a bucear. El resultado era que el taller trataba a un cliente de
// seis años como a uno nuevo, y que el recordatorio automático decía
// "toca revisar la cadena" sin saber que es la tercera en dos años.
//
// Esta función es la fuente ÚNICA de "lo que sabemos". La usan dos cosas
// que no pueden contradecirse:
//   · la ficha que ve el mecánico en pantalla
//   · el prompt con el que la IA escribe el WhatsApp
// Si fueran dos armados distintos, el mensaje terminaría afirmando algo
// que la pantalla no muestra — y el que queda mal es el taller.
//
// Es 100% local: no pega a la base, arma sobre lo que el store ya trajo.
// ─────────────────────────────────────────────────────────────

export interface BiciDelCliente {
    id: string;
    marca: string;
    modelo: string;
    transmision?: string;
    categoria?: string;
    notas?: string;
    visitas: number;
    ultimoServiceFecha?: string;
    /** Días desde el último service de ESTA bici. null si nunca vino. */
    diasSinService: number | null;
}

export interface VisitaDelCliente {
    servicioId: string;
    fecha: string;
    biciId?: string;
    bici: string;
    /** Qué se le hizo, en lenguaje del taller. */
    trabajos: string[];
    notasMecanico?: string;
    precio: number;
    carrera?: string;
}

export interface ComponenteEnRiesgo {
    componente: string;
    bici: string;
    biciId?: string;
    vence: string;
    /** Negativo = ya venció. */
    diasRestantes: number;
}

export interface CarreraDelCliente {
    nombre: string;
    fecha: string;
    bici: string;
    /** true = la bici entró al taller con esa carrera asociada. */
    preparadaAca: boolean;
    /** Negativo = ya pasó. */
    diasRestantes: number;
}

export interface DossierCliente {
    cliente: {
        id: string;
        nombre: string;
        /** Solo el nombre de pila: es como se lo saluda. */
        primerNombre: string;
        telefono?: string;
        email?: string;
        tipoCiclista?: string;
        numeroCliente?: number;
        /** Meses desde que está en el taller. null si no hay fecha de alta. */
        antiguedadMeses: number | null;
    };
    bicis: BiciDelCliente[];
    historial: VisitaDelCliente[];
    carreras: CarreraDelCliente[];
    salud: ComponenteEnRiesgo[];
    plata: {
        totalHistorico: number;
        ticketPromedio: number;
        visitas: number;
    };
    ultimaVisita: {
        fecha?: string;
        diasSin: number | null;
    };
    /** Lo que el mecánico anotó y sigue siendo relevante (las 5 más recientes). */
    observaciones: string[];
}

const MS_DIA = 1000 * 60 * 60 * 24;

function diasDesde(fecha?: string | null): number | null {
    if (!fecha) return null;
    const t = new Date(fecha).getTime();
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / MS_DIA);
}

function diasHasta(fecha?: string | null): number | null {
    const d = diasDesde(fecha);
    return d === null ? null : -d;
}

/**
 * Texto del taller listo para mostrar.
 *
 * La descripción del catálogo y las notas del mecánico se cargan en un editor
 * con formato, así que llegan con etiquetas HTML adentro. Mostrarlas crudas
 * llena la ficha de `<p>` y `<strong>` — y, peor, ese ruido también viajaba
 * al mensaje que escribe la IA.
 */
function limpiarTexto(t: string, tope = 140): string {
    const plano = t
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:])/g, '$1')
        .trim();
    return plano.length > tope ? plano.slice(0, tope).trimEnd() + '…' : plano;
}

/**
 * Qué se le hizo en una orden, en las palabras que usa el taller.
 *
 * El "qué se hizo" vive repartido: el tipo de servicio, la descripción del
 * catálogo, los ítems extra y las tareas sueltas que el mecánico agregó.
 * Se juntan acá una sola vez para que nadie tenga que volver a adivinarlo.
 */
function trabajosDe(s: SupabaseService): string[] {
    const out: string[] = [];

    // El tipo de servicio es el NOMBRE del trabajo ("Service Sport"); la
    // descripción del catálogo es el detalle completo de todo lo que incluye,
    // que en la ficha se lee como un muro de texto. Va el nombre, y la
    // descripción solo si no hay nombre.
    if (s.tipo_servicio) out.push(s.tipo_servicio);
    else if (s.descripcion_catalogo) out.push(limpiarTexto(s.descripcion_catalogo));

    for (const item of s.items_extra || []) {
        if (item?.descripcion) out.push(limpiarTexto(item.descripcion, 60));
    }
    for (const t of s.tareas_extra || []) {
        if (t?.texto) out.push(limpiarTexto(t.texto, 60));
    }

    // Sin duplicados: el mismo trabajo suele aparecer como ítem y como tarea.
    return [...new Set(out.map(t => t.trim()).filter(Boolean))];
}

function nombreBici(b?: SupabaseBike): string {
    if (!b) return "su bici";
    return [b.marca, b.modelo].filter(Boolean).join(" ").trim() || "su bici";
}

interface EntradaDossier {
    cliente: SupabaseClient;
    bicicletas: SupabaseBike[];
    servicios: SupabaseService[];
    recordatorios: SupabaseReminder[];
    carreras: SupabaseCarrera[];
}

export function construirDossier({
    cliente,
    bicicletas,
    servicios,
    recordatorios,
    carreras,
}: EntradaDossier): DossierCliente {
    const misBicis = bicicletas.filter(b => b.cliente_id === cliente.id);
    const idsBicis = new Set(misBicis.map(b => b.id));

    // Las órdenes borradas no cuentan para nada: ni para la plata, ni para
    // "cuántas veces vino". Una orden borrada es una que no existió.
    const misServicios = servicios
        .filter(s => idsBicis.has(s.bicicleta_id) && !s.eliminado_en)
        .sort((a, b) =>
            new Date(b.fecha_ingreso || 0).getTime() - new Date(a.fecha_ingreso || 0).getTime()
        );

    const bicis: BiciDelCliente[] = misBicis.map(b => {
        const deEsta = misServicios.filter(s => s.bicicleta_id === b.id);
        const ultimo = deEsta[0]?.fecha_ingreso;
        return {
            id: b.id,
            marca: b.marca,
            modelo: b.modelo,
            transmision: b.transmision,
            categoria: b.categoria,
            notas: b.notas,
            visitas: deEsta.length,
            ultimoServiceFecha: ultimo,
            diasSinService: diasDesde(ultimo),
        };
    });

    const historial: VisitaDelCliente[] = misServicios.map(s => {
        const bici = misBicis.find(b => b.id === s.bicicleta_id);
        const carrera = s.carrera_id ? carreras.find(c => c.id === s.carrera_id) : undefined;
        return {
            servicioId: s.id,
            fecha: s.fecha_ingreso || "",
            biciId: bici?.id,
            bici: nombreBici(bici),
            trabajos: trabajosDe(s),
            // La nota del mecánico también sale del editor con formato.
            notasMecanico: s.notas_mecanico ? limpiarTexto(s.notas_mecanico, 200) : undefined,
            precio: s.precio_total || 0,
            carrera: carrera?.nombre,
        };
    });

    // Las carreras son el dato que más "se nota": nadie espera que el taller
    // se acuerde de en qué corrió. Se listan de la más próxima/reciente
    // hacia atrás.
    const carrerasCliente: CarreraDelCliente[] = misServicios
        .filter(s => s.carrera_id)
        .map(s => {
            const carrera = carreras.find(c => c.id === s.carrera_id);
            if (!carrera?.fecha_evento) return null;
            const bici = misBicis.find(b => b.id === s.bicicleta_id);
            return {
                nombre: carrera.nombre,
                fecha: carrera.fecha_evento,
                bici: nombreBici(bici),
                preparadaAca: true,
                diasRestantes: diasHasta(carrera.fecha_evento) ?? 0,
            };
        })
        .filter(Boolean) as CarreraDelCliente[];

    // Una misma carrera puede estar en dos órdenes (dos bicis, o reingreso).
    const carrerasUnicas = carrerasCliente.filter(
        (c, i, arr) => arr.findIndex(x => x.nombre === c.nombre && x.fecha === c.fecha) === i
    ).sort((a, b) => b.diasRestantes - a.diasRestantes);

    // Qué está por vencer. Se respetan los descartes: si el taller ocultó
    // el aviso, no vuelve a aparecer disfrazado dentro del dossier.
    const descartados = new Set(
        misServicios.flatMap(s => s.alertas_ocultas || [])
    );
    const salud: ComponenteEnRiesgo[] = recordatorios
        .filter(r => idsBicis.has(r.bicicleta_id) && !descartados.has(r.componente || ""))
        .map(r => {
            const bici = misBicis.find(b => b.id === r.bicicleta_id);
            return {
                componente: r.componente || "Sin componente",
                bici: nombreBici(bici),
                biciId: bici?.id,
                vence: r.fecha_vencimiento || "",
                diasRestantes: diasHasta(r.fecha_vencimiento) ?? 0,
            };
        })
        .sort((a, b) => a.diasRestantes - b.diasRestantes);

    const totalHistorico = misServicios.reduce((acc, s) => acc + (s.precio_total || 0), 0);

    // Las notas del mecánico son lo más humano que hay en la base: ahí está
    // el "vino con el cambio saltando en la corona chica". Se traen las
    // últimas 5, que son las que siguen siendo verdad.
    const observaciones = historial
        .map(v => v.notasMecanico)
        .filter((n): n is string => !!n && n.trim().length > 0)
        .slice(0, 5);

    return {
        cliente: {
            id: cliente.id,
            nombre: cliente.nombre,
            primerNombre: (cliente.nombre || "").trim().split(/\s+/)[0] || cliente.nombre,
            telefono: cliente.telefono,
            email: cliente.email,
            tipoCiclista: cliente.tipo_ciclista,
            numeroCliente: cliente.numero_cliente,
            // Hace cuánto es cliente = desde su primer service. La ficha no
            // guarda fecha de alta, y la primera vez que trajo la bici mide la
            // relación de verdad, no cuándo alguien lo cargó al sistema.
            antiguedadMeses: (() => {
                const primero = misServicios[misServicios.length - 1]?.fecha_ingreso;
                const d = diasDesde(primero);
                return d === null || d <= 0 ? null : Math.floor(d / 30);
            })(),
        },
        bicis,
        historial,
        carreras: carrerasUnicas,
        salud,
        plata: {
            totalHistorico,
            ticketPromedio: misServicios.length ? Math.round(totalHistorico / misServicios.length) : 0,
            visitas: misServicios.length,
        },
        ultimaVisita: {
            fecha: misServicios[0]?.fecha_ingreso,
            diasSin: diasDesde(misServicios[0]?.fecha_ingreso),
        },
        observaciones,
    };
}

// ─────────────────────────────────────────────────────────────
// El dossier, en texto, para que lo lea la IA.
//
// POR QUÉ NO SE MANDA EL JSON CRUDO: el JSON entero de un cliente de seis
// años son miles de tokens, y el 90% no cambia lo que hay que escribir.
// Peor: cuanto más ruido, más probable que la IA se agarre de un dato
// viejo. Se manda un resumen corto y ordenado por lo que importa.
//
// 🚩 Todo lo que entra acá es dato verificado de la base. La IA NO tiene
// permitido agregar nada que no esté en este texto — esa regla vive en el
// prompt de la Edge Function.
// ─────────────────────────────────────────────────────────────
export function dossierATexto(d: DossierCliente): string {
    const L: string[] = [];

    L.push(`CLIENTE: ${d.cliente.nombre}`);
    if (d.cliente.tipoCiclista) L.push(`Tipo de ciclista: ${d.cliente.tipoCiclista}`);
    if (d.cliente.antiguedadMeses !== null) {
        const años = Math.floor(d.cliente.antiguedadMeses / 12);
        L.push(`Es cliente del taller desde hace ${años >= 1 ? `${años} año(s)` : `${d.cliente.antiguedadMeses} mes(es)`}`);
    }
    L.push(`Visitas: ${d.plata.visitas}${d.ultimaVisita.diasSin !== null ? ` · última hace ${d.ultimaVisita.diasSin} días` : ""}`);

    if (d.bicis.length) {
        L.push("");
        L.push("BICIS:");
        for (const b of d.bicis) {
            const partes = [`- ${b.marca} ${b.modelo}`];
            if (b.transmision) partes.push(`(${b.transmision})`);
            if (b.visitas) partes.push(`· ${b.visitas} service(s)`);
            if (b.diasSinService !== null) partes.push(`· último hace ${b.diasSinService} días`);
            L.push(partes.join(" "));
            if (b.notas) L.push(`  Nota de la bici: ${b.notas}`);
        }
    }

    if (d.carreras.length) {
        L.push("");
        L.push("CARRERAS QUE CORRIÓ (con la bici preparada acá):");
        for (const c of d.carreras.slice(0, 4)) {
            const cuando = c.diasRestantes > 0
                ? `en ${c.diasRestantes} días`
                : `hace ${Math.abs(c.diasRestantes)} días`;
            L.push(`- ${c.nombre} (${cuando}) con la ${c.bici}`);
        }
    }

    if (d.historial.length) {
        L.push("");
        L.push("ÚLTIMOS TRABAJOS:");
        for (const v of d.historial.slice(0, 4)) {
            const fecha = v.fecha ? new Date(v.fecha).toLocaleDateString("es-AR") : "sin fecha";
            L.push(`- ${fecha} · ${v.bici} · ${v.trabajos.join(", ") || "service"}`);
            if (v.notasMecanico) L.push(`  El mecánico anotó: ${v.notasMecanico}`);
        }
    }

    if (d.salud.length) {
        L.push("");
        L.push("LO QUE ESTÁ POR VENCER:");
        for (const s of d.salud.slice(0, 5)) {
            const cuando = s.diasRestantes >= 0
                ? `vence en ${s.diasRestantes} días`
                : `venció hace ${Math.abs(s.diasRestantes)} días`;
            L.push(`- ${s.componente} de la ${s.bici} (${cuando})`);
        }
    }

    return L.join("\n");
}
