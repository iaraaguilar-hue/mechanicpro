// Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/puntoEquilibrio.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { calcular, margenDesdeMarkup } from './puntoEquilibrio';

let ok = 0, fail = 0;
const eq = (n: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) === JSON.stringify(b)) ok++;
    else { fail++; console.error(`  ✗ ${n}\n      esperaba ${JSON.stringify(b)}\n      recibí   ${JSON.stringify(a)}`); }
};
const cerca = (n: string, a: number, b: number, tolPct = 1) => {
    const d = Math.abs(a - b) / Math.abs(b || 1) * 100;
    if (d <= tolPct) ok++;
    else { fail++; console.error(`  ✗ ${n}: esperaba ~${b}, recibí ${a} (${d.toFixed(1)}% de diferencia)`); }
};

// ── markup ≠ margen: el error de parcial que más se repite ───────────────────
// «35 por ciento de markup es 25,93 de margen» (cátedra Aire, clase del 2/9).
cerca('35% de markup son 25,93% de margen', margenDesdeMarkup(35) * 100, 25.93, 0.5);
cerca('100% de markup son 50% de margen', margenDesdeMarkup(100) * 100, 50, 0.1);
eq('un markup de 0 no da margen', margenDesdeMarkup(0), 0);
eq('un markup negativo tampoco', margenDesdeMarkup(-20), 0);

// ── EL CONTROL EXTERNO: los números medidos de Probikes ──────────────────────
// De `context/probikes/finanzas/README.md`, base abril-agosto 2026 auditada:
//   costos fijos 8.748.577/mes · razón de contribución 19,54% · punto de
//   equilibrio 54.172.132 al público · facturación 56.953.724 · margen de
//   seguridad 4,9%.
// Si mis fórmulas no reproducen ESO, están mal. No es un caso inventado por mí.
{
    // Se arma un período de 30 días cuya contribución da la razón medida.
    // 19,54% sobre venta neta, con IVA 21 y todo tratado como "repuestos"
    // (mercadería), implica un markup tal que el margen sea 19,54%.
    const markup = (0.1954 / (1 - 0.1954)) * 100;   // margen → markup
    cerca('el markup que corresponde a 19,54% de margen', margenDesdeMarkup(markup) * 100, 19.54, 0.1);

    const r = calcular(
        { mano_obra: 0, repuestos: 56_953_724, ordenes: 300, dias: 30 },
        { costos_fijos: 8_748_577, markup_repuestos: markup, iva: 21 },
    )!;
    cerca('la razón de contribución da 19,54%', r.razon * 100, 19.54, 0.5);
    cerca('el punto de equilibrio da 54.172.132 al público', r.equilibrio, 54_172_132, 1);
    cerca('el margen de seguridad da 4,9%', r.margenSeguridad * 100, 4.9, 12);
    eq('y con esa facturación está arriba del equilibrio', r.zona, 'C');
}

// ── El punto de caja ─────────────────────────────────────────────────────────
// «En Probikes da IGUAL al económico, y hay que saber explicar por qué: no hay
// NINGUNA amortización que sacar.» Las herramientas ya están amortizadas.
{
    const base = { mano_obra: 2_000_000, repuestos: 3_000_000, ordenes: 50, dias: 30 };
    const sin = calcular(base, { costos_fijos: 1_000_000, markup_repuestos: 35 })!;
    eq('sin amortizaciones, el punto de caja es el económico', Math.round(sin.puntoDeCaja), Math.round(sin.equilibrio));

    const con = calcular(base, { costos_fijos: 1_000_000, markup_repuestos: 35, amortizaciones: 300_000 })!;
    eq('con amortizaciones, el de caja queda a la IZQUIERDA', con.puntoDeCaja < con.equilibrio, true);
    eq('y el económico no se mueve', Math.round(con.equilibrio), Math.round(sin.equilibrio));
}

// ── Las cuatro zonas ─────────────────────────────────────────────────────────
{
    const f = { costos_fijos: 2_000_000, markup_repuestos: 35, amortizaciones: 500_000 };
    // Facturando muy poco: ni para pagar.
    const a = calcular({ mano_obra: 500_000, repuestos: 200_000, ordenes: 10, dias: 30 }, f)!;
    eq('facturando poco, zona A', a.zona, 'A');
    eq('y el resultado es negativo', a.resultado < 0, true);
    eq('y ahí la palanca no se muestra', a.palanca, null);
}

// ── El período no siempre es un mes ──────────────────────────────────────────
// Comparar 90 días de facturación contra UN mes de costos fijos diría que el
// taller gana tres veces más de lo que gana.
{
    const mes = calcular({ mano_obra: 1_000_000, repuestos: 1_000_000, ordenes: 20, dias: 30 }, { costos_fijos: 500_000, markup_repuestos: 35 })!;
    const tri = calcular({ mano_obra: 3_000_000, repuestos: 3_000_000, ordenes: 60, dias: 90 }, { costos_fijos: 500_000, markup_repuestos: 35 })!;
    eq('los costos fijos se escalan al período', Math.round(tri.fijosDelPeriodo), 1_500_000);
    cerca('y el margen de seguridad da lo mismo', tri.margenSeguridad, mes.margenSeguridad, 0.5);
    cerca('el equilibrio del trimestre es 3 veces el del mes', tri.equilibrio, mes.equilibrio * 3, 0.5);
}

// ── La comisión al mecánico baja la contribución ─────────────────────────────
{
    const sin = calcular({ mano_obra: 1_000_000, repuestos: 0, ordenes: 20, dias: 30 }, { costos_fijos: 100_000, markup_repuestos: 35 })!;
    const con = calcular({ mano_obra: 1_000_000, repuestos: 0, ordenes: 20, dias: 30 }, { costos_fijos: 100_000, markup_repuestos: 35, comision_mecanico: 30 })!;
    cerca('sin comisión la mano de obra contribuye entera', sin.razon, 1, 0.1);
    cerca('con 30% de comisión, contribuye el 70%', con.razon, 0.7, 0.5);
    eq('y el equilibrio se corre a la derecha', con.equilibrio > sin.equilibrio, true);
}

// ── La palanca ───────────────────────────────────────────────────────────────
// «de un lado hacés fuerza de 10 kilos y del otro salen 20».
{
    const r = calcular({ mano_obra: 2_000_000, repuestos: 0, ordenes: 40, dias: 30 }, { costos_fijos: 1_000_000, markup_repuestos: 35 })!;
    // contribución 2.000.000, resultado 1.000.000 → palanca 2
    cerca('la palanca es contribución sobre resultado', r.palanca!, 2, 0.1);
}

// ── Ticket y órdenes ─────────────────────────────────────────────────────────
{
    const r = calcular({ mano_obra: 500_000, repuestos: 500_000, ordenes: 20, dias: 30 }, { costos_fijos: 400_000, markup_repuestos: 35 })!;
    eq('el ticket promedio', r.ticketPromedio, 50_000);
    eq('las órdenes para llegar al equilibrio se redondean para arriba', r.ordenesParaEquilibrio, Math.ceil(r.equilibrio / 50_000));
}

// ── Entradas que no se pueden calcular: devuelven null, no un número inventado ──
eq('sin facturación no hay cuenta', calcular({ mano_obra: 0, repuestos: 0, ordenes: 0, dias: 30 }, { costos_fijos: 100, markup_repuestos: 35 }), null);
eq('sin costos fijos tampoco', calcular({ mano_obra: 100, repuestos: 0, ordenes: 1, dias: 30 }, { costos_fijos: 0, markup_repuestos: 35 }), null);
eq('con markup 0 y todo repuestos, no hay contribución', calcular({ mano_obra: 0, repuestos: 100, ordenes: 1, dias: 30 }, { costos_fijos: 10, markup_repuestos: 0 }), null);
eq('días en 0 se toma como un mes', calcular({ mano_obra: 100, repuestos: 0, ordenes: 1, dias: 0 }, { costos_fijos: 10, markup_repuestos: 35 })!.fijosDelPeriodo, 10);

console.log(`\n${fail === 0 ? '✅' : '❌'} puntoEquilibrio: ${ok} ok, ${fail} fallaron`);
if (fail > 0) process.exit(1);
