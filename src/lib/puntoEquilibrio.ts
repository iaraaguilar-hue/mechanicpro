/**
 * Cuánto tiene que vender el taller para no perder plata.
 *
 * Pedido de Iara (10-sep-2026): «me gustaría que utilicemos los elementos de
 * administración financiera (…) en las métricas del plan Expert me gustaría
 * sumar un poco más de métricas serias para poder dar un mejor servicio».
 *
 * Las definiciones salen de la cátedra Aire de Administración Financiera
 * (UBA-FCE, Cr. Alderete), que es donde cursa Iara, bajadas al caso de una
 * bicicletería. No son inventadas acá.
 *
 * 🔴 EL LÍMITE QUE HAY QUE DECIR EN PANTALLA: Mechanic Pro sabe lo que el
 * taller COBRA (servicio_items.precio) y no lo que le CUESTA — no hay campo de
 * costo en ningún lado. Por eso el margen no se mide: lo pone el taller. Todo
 * lo demás sí sale de sus órdenes reales.
 */

export type Finanzas = {
    /** Alquiler, sueldos, luz, contador… lo que se paga aunque no entre una bici. Por mes. */
    costos_fijos: number;
    /** Lo que el taller le agrega arriba del costo del repuesto. 35 = «le pongo un 35%». */
    markup_repuestos: number;
    /** Amortizaciones mensuales. Casi siempre 0 en un taller: ver `puntoDeCaja`. */
    amortizaciones?: number;
    /** Si le paga al mecánico un % por service. 0 = está en el sueldo (costo fijo). */
    comision_mecanico?: number;
    /**
     * IVA de sus precios (21, 10.5 o 0 si es monotributista).
     *
     * 🔴 No es un detalle: la razón de contribución va sobre la venta NETA y el
     * punto de equilibrio se dice al público. Con los números medidos de
     * Probikes, ignorarlo daba $44,7 M donde el número real es $54,2 M.
     */
    iva?: number;
};

export type Periodo = {
    /** Lo facturado en mano de obra en el período. */
    mano_obra: number;
    /** Lo facturado en repuestos en el período. */
    repuestos: number;
    /** Cuántas órdenes entraron en el período. */
    ordenes: number;
    /** Días que cubre el período (para llevar los costos fijos a esa escala). */
    dias: number;
};

/**
 * Markup → margen. El error de parcial que más se repite.
 *
 * «35 por ciento de markup es 25,93 de margen». El markup se calcula SOBRE EL
 * COSTO y el margen SOBRE LA VENTA: no son el mismo número y confundirlos
 * infla la contribución.
 */
export function margenDesdeMarkup(markup: number): number {
    if (!isFinite(markup) || markup <= 0) return 0;
    return markup / (100 + markup);
}

export type Resultado = {
    facturacion: number;
    /** La facturación sin IVA. Es sobre esto que se mide la contribución. */
    ventaNeta: number;
    /** Contribución marginal en pesos: lo que queda para pagar los costos fijos. */
    contribucion: number;
    /** Razón de contribución marginal (0..1). Es por lo que se divide, nunca por el precio. */
    razon: number;
    /** Costos fijos llevados a la escala del período. */
    fijosDelPeriodo: number;
    /** Punto de equilibrio económico: resultado cero. */
    equilibrio: number;
    /** Punto de equilibrio de caja: sin lo que no se eroga. Es el punto de cierre. */
    puntoDeCaja: number;
    /** (facturación − equilibrio) / facturación. Cuánto puede caer la venta antes de perder. */
    margenSeguridad: number;
    resultado: number;
    ticketPromedio: number;
    /** Cuántas órdenes como las de este período hacen falta para llegar al equilibrio. */
    ordenesParaEquilibrio: number | null;
    /**
     * Apalancamiento operativo: por cada 1% más de venta, el resultado sube esto.
     * null cuando el resultado es cero o negativo (la palanca no está definida ahí).
     */
    palanca: number | null;
    /** A, B, C o D — las cuatro zonas de la clase, de abajo hacia arriba. */
    zona: 'A' | 'B' | 'C';
    zonaTexto: string;
};

export function calcular(p: Periodo, f: Finanzas): Resultado | null {
    const facturacion = (p.mano_obra || 0) + (p.repuestos || 0);
    const fijosMes = Number(f.costos_fijos) || 0;
    if (facturacion <= 0 || fijosMes <= 0) return null;

    const dias = p.dias > 0 ? p.dias : 30;
    // Los costos fijos son POR MES. Si el período elegido son 90 días, hay que
    // comparar contra tres meses de costos fijos, no contra uno.
    const fijosDelPeriodo = fijosMes * (dias / 30);

    // Venta NETA: el IVA que el taller cobra no es suyo, lo junta y lo deposita.
    const iva = Math.max(Number(f.iva) || 0, 0) / 100;
    const neto = (x: number) => x / (1 + iva);

    const margenRep = margenDesdeMarkup(f.markup_repuestos);
    const comision = Math.min(Math.max(Number(f.comision_mecanico) || 0, 0), 100) / 100;
    // La mano de obra casi no tiene costo variable: el sueldo del mecánico ya
    // está en los costos fijos. Si además cobra un % por service, ese % sí lo es.
    const ventaNeta = neto(facturacion);
    const contribucion = neto(p.mano_obra || 0) * (1 - comision) + neto(p.repuestos || 0) * margenRep;
    const razon = contribucion / ventaNeta;
    if (!(razon > 0)) return null;

    // El equilibrio se calcula sobre la venta neta y se devuelve AL PÚBLICO, que
    // es la cifra que el taller reconoce (la que ve en su facturación).
    const equilibrio = (fijosDelPeriodo / razon) * (1 + iva);
    const noErogables = Math.max(Number(f.amortizaciones) || 0, 0) * (dias / 30);
    const puntoDeCaja = (Math.max(fijosDelPeriodo - noErogables, 0) / razon) * (1 + iva);

    const resultado = contribucion - fijosDelPeriodo;
    const ticketPromedio = p.ordenes > 0 ? facturacion / p.ordenes : 0;

    let zona: Resultado['zona'] = 'C';
    let zonaTexto = 'Estás arriba del punto de equilibrio: el mes paga y deja.';
    if (facturacion < puntoDeCaja) {
        zona = 'A';
        zonaTexto = 'Estás debajo del punto de caja: no alcanza ni para pagar los gastos del mes.';
    } else if (facturacion < equilibrio) {
        zona = 'B';
        zonaTexto = 'Pagás los gastos del mes, pero el resultado da negativo.';
    }

    return {
        facturacion,
        ventaNeta,
        contribucion,
        razon,
        fijosDelPeriodo,
        equilibrio,
        puntoDeCaja,
        margenSeguridad: (facturacion - equilibrio) / facturacion,
        resultado,
        ticketPromedio,
        ordenesParaEquilibrio: ticketPromedio > 0 ? Math.ceil(equilibrio / ticketPromedio) : null,
        // Apalancamiento operativo = contribución / resultado. En el equilibrio
        // el resultado es cero y la palanca se va a infinito: ahí no se muestra.
        palanca: resultado > 0 ? contribucion / resultado : null,
        zona,
        zonaTexto,
    };
}

/** «$ 1.234.567» sin decimales, que es como se lee la plata de un taller. */
export function plata(n: number): string {
    return '$ ' + Math.round(n).toLocaleString('es-AR');
}
