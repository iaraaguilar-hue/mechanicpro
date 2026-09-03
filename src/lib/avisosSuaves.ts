// ─────────────────────────────────────────────────────────────
// AVISOS SUAVES — los que no son un vencimiento, pero valen una llamada.
//
// DE DÓNDE SALE (Alejo, mecánico de Once a Fondo, 3-sep-2026): están cargando
// bicis de clientes que recién compraron, para avisarles del primer service. No
// hay diagnóstico previo, así que el Motor de Retención no tiene de qué agarrarse.
// Y pidió además algo "más soft que la dura de che, se venció la cadena": un
// "fulano no viene hace tres meses, avisale, preguntale a ver qué onda".
//
// 🔴 LO QUE MOSTRARON LOS DATOS, y cambió el diseño. Se midió antes de escribir:
//
//   Once a Fondo: 74 clientes, y **66 vinieron UNA sola vez**. CERO tienen 3+
//   visitas. O sea que `clientesEnFuga` —que ya existe y hace bien su trabajo—
//   **no le muestra un solo nombre a Alejo**: necesita 3 visitas para calcular el
//   ritmo de una persona, y ahí no hay ritmo que calcular todavía.
//
// Ese es el hueco real, y no es el que se pidió: no es que a Once a Fondo se le
// estén yendo los clientes fieles. Es que **casi nadie vuelve una segunda vez**, y
// el motor entero está construido para el que ya tiene costumbre.
//
// POR ESO ESTOS AVISOS MIRAN EL PRINCIPIO DE LA RELACIÓN, no el final:
//   · `primer_service` — la bici está cargada y nunca pasó por el taller.
//   · `no_volvio`      — vino una o dos veces y no apareció más.
//
// `clientesEnFuga` sigue cubriendo al frecuente que se atrasa respecto de SU
// ritmo. Los dos no se pisan: uno mira al que ya tiene costumbre, éstos al que
// nunca la formó.
//
// SON SUAVES DE VERDAD, y eso son decisiones de diseño y no adjetivos:
//   · Van en su propia sección, NO mezclados con los vencimientos ni en la campana.
//     Un aviso opcional que tapa uno urgente deja de ser opcional.
//   · Vienen ORDENADOS POR PLATA y limitados. Probikes tiene 109 clientes que hace
//     3+ meses que no vienen: una lista de 109 no se acciona, se ignora.
//   · Se descartan igual que el resto (`alertas_ocultas`).
// ─────────────────────────────────────────────────────────────

const MS_DIA = 86_400_000;

export type MotivoSuave = 'primer_service' | 'no_volvio';

export interface AvisoSuave {
    id: string;
    motivo: MotivoSuave;
    clienteId: string;
    clienteNombre: string;
    clienteTelefono: string;
    bicicletaId: string | null;
    bicicletaModelo: string;
    /** Días desde que se cargó la bici (primer_service) o desde la última visita. */
    dias: number;
    /** Lo que gastó, para poder ordenar. 0 si nunca pasó por caja. */
    gastado: number;
    /** La frase que el mecánico lee. Dice el porqué, no solo el qué. */
    argumento: string;
}

export interface ConfigAvisosSuaves {
    habilitado: boolean;
    /** Días desde que se cargó una bici sin services para sugerir el primer service. */
    primerServiceDias: number;
    /** Días desde la última visita para sugerir el "¿qué onda?". */
    noVolvioDias: number;
    /** Cuántos mostrar. Una lista larga no se acciona. */
    limite: number;
}

export const CONFIG_SUAVES_DEFAULT: ConfigAvisosSuaves = {
    habilitado: false,
    // 30 días: es el plazo del "service de asentamiento" que casi toda marca
    // recomienda para una bici nueva (los cables y los rayos se acomodan en las
    // primeras salidas). No es un número inventado por nosotros.
    primerServiceDias: 30,
    // 120 y no 90: a 90 días Probikes daba 109 nombres, que es una lista que
    // nadie llama. Es el default y el taller lo mueve.
    noVolvioDias: 120,
    limite: 12,
};

interface Entrada {
    clientes: { id: string; nombre: string; telefono?: string | null; eliminado_en?: string | null }[];
    bicicletas: { id: string; cliente_id: string; marca?: string | null; modelo?: string | null; fecha_registro?: string | null }[];
    servicios: { id?: string; bicicleta_id?: string | null; fecha_ingreso?: string | null; precio_base?: number | null; servicio_items?: { precio?: number }[]; items_extra?: { precio?: number }[]; alertas_ocultas?: string[] | null }[];
    config: ConfigAvisosSuaves;
}

const plata = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

function enPalabras(dias: number): string {
    if (dias < 45) return `${dias} días`;
    const meses = Math.round(dias / 30);
    return meses < 12 ? `${meses} meses` : `más de un año`;
}

export interface ResultadoSuaves {
    avisos: AvisoSuave[];
    /** Cuántas bicis nuevas todavía no llegaron al plazo, y en cuántos días entra la próxima.
     *  Existe para que la pantalla pueda decir "está trabajando" en vez de no mostrar nada:
     *  el día que Alejo lo prenda, su única bici nueva tiene 8 días de cargada y el aviso
     *  recién corresponde a los 30. Sin esto, la conclusión sería "no anda". */
    enCamino: { cuantas: number; enDias: number | null };
}

export function construirAvisosSuaves({ clientes, bicicletas, servicios, config }: Entrada): ResultadoSuaves {
    if (!config.habilitado) return { avisos: [], enCamino: { cuantas: 0, enDias: null } };

    const ahora = Date.now();
    const dias = (f?: string | null) => (f ? Math.round((ahora - new Date(f).getTime()) / MS_DIA) : null);

    // Los descartes viven por-orden, igual que en el resto del motor.
    const descartados = new Set(servicios.flatMap(s => s.alertas_ocultas || []));

    const porCliente = new Map(clientes.filter(c => !c.eliminado_en).map(c => [c.id, c]));
    const conService = new Set(servicios.map(s => s.bicicleta_id).filter(Boolean) as string[]);

    // Última visita y gasto por cliente.
    const ultima = new Map<string, number>();
    const gasto = new Map<string, number>();
    const bicis = new Map(bicicletas.map(b => [b.id, b]));
    for (const s of servicios) {
        const bici = s.bicicleta_id ? bicis.get(s.bicicleta_id) : null;
        if (!bici || !s.fecha_ingreso) continue;
        const t = new Date(s.fecha_ingreso).getTime();
        if (!ultima.has(bici.cliente_id) || t > ultima.get(bici.cliente_id)!) ultima.set(bici.cliente_id, t);
        let total = Number(s.precio_base) || 0;
        for (const i of (s.servicio_items ?? s.items_extra ?? [])) total += Number(i?.precio) || 0;
        gasto.set(bici.cliente_id, (gasto.get(bici.cliente_id) ?? 0) + total);
    }

    const avisos: AvisoSuave[] = [];
    let enCaminoCuantas = 0;
    let enCaminoDias: number | null = null;

    // ── 1. PRIMER SERVICE: la bici está cargada y nunca pasó por el taller.
    for (const b of bicicletas) {
        if (conService.has(b.id)) continue;
        const cli = porCliente.get(b.cliente_id);
        if (!cli) continue;
        const d = dias(b.fecha_registro);
        if (d === null) continue;
        if (d < config.primerServiceDias) {
            // Todavía no le toca, pero está en la fila: se cuenta para poder decirlo.
            enCaminoCuantas++;
            const faltan = config.primerServiceDias - d;
            if (enCaminoDias === null || faltan < enCaminoDias) enCaminoDias = faltan;
            continue;
        }
        const identidad = `suave-primer-${b.id}`;
        if (descartados.has(identidad)) continue;
        const modelo = [b.marca, b.modelo].filter(Boolean).join(' ') || 'la bici';
        avisos.push({
            id: identidad, motivo: 'primer_service',
            clienteId: cli.id, clienteNombre: cli.nombre, clienteTelefono: cli.telefono ?? '',
            bicicletaId: b.id, bicicletaModelo: modelo,
            dias: d, gastado: gasto.get(cli.id) ?? 0,
            argumento: `Cargaron la ${modelo} hace ${enPalabras(d)} y nunca vino al taller. Si es nueva, le toca el primer service.`,
        });
    }

    // ── 2. NO VOLVIÓ: vino y no apareció más.
    // Se excluye a propósito al que tiene 3+ visitas: ése ya lo mira
    // `clientesEnFuga`, que lo hace mejor porque compara contra su propio ritmo.
    const visitas = new Map<string, number>();
    for (const s of servicios) {
        const bici = s.bicicleta_id ? bicis.get(s.bicicleta_id) : null;
        if (bici && s.fecha_ingreso) visitas.set(bici.cliente_id, (visitas.get(bici.cliente_id) ?? 0) + 1);
    }
    for (const [cid, cuando] of ultima) {
        const cli = porCliente.get(cid);
        if (!cli) continue;
        const n = visitas.get(cid) ?? 0;
        if (n >= 3) continue;
        const d = Math.round((ahora - cuando) / MS_DIA);
        if (d < config.noVolvioDias) continue;
        const identidad = `suave-novolvio-${cid}`;
        if (descartados.has(identidad)) continue;
        const suya = bicicletas.find(b => b.cliente_id === cid);
        const g = gasto.get(cid) ?? 0;
        avisos.push({
            id: identidad, motivo: 'no_volvio',
            clienteId: cid, clienteNombre: cli.nombre, clienteTelefono: cli.telefono ?? '',
            bicicletaId: suya?.id ?? null,
            bicicletaModelo: [suya?.marca, suya?.modelo].filter(Boolean).join(' ') || 'su bici',
            dias: d, gastado: g,
            argumento: n === 1
                ? `Vino una sola vez, hace ${enPalabras(d)}${g > 0 ? `, y dejó ${plata(g)}` : ''}. Nunca volvió.`
                : `Vino ${n} veces y hace ${enPalabras(d)} que no aparece${g > 0 ? `. Lleva ${plata(g)}` : ''}.`,
        });
    }

    // El que más plata dejó primero, y a igual plata el que hace más que no viene.
    // Ordenar por antigüedad sola pondría arriba al que gastó $0 hace dos años.
    avisos.sort((a, b) => (b.gastado - a.gastado) || (b.dias - a.dias));
    return {
        avisos: avisos.slice(0, config.limite),
        enCamino: { cuantas: enCaminoCuantas, enDias: enCaminoDias },
    };
}
