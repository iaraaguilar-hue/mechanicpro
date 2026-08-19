// Tests del Motor con cabeza (ideas 5+6). Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/motorConCabeza.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { prediccionComponente, clientesEnFuga } from './motorConCabeza';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const svc = (fecha: string, items: string[], tipo = 'Service') =>
    ({ fecha_ingreso: fecha, tipo_servicio: tipo, items_extra: items.map(d => ({ descripcion: d })) });

// ── Idea 5: predicción por historial ────────────────────────────────────────
// Dos cambios de cadena con 120 días de diferencia → cada ~120 días.
{
    const p = prediccionComponente([
        svc('2026-01-10', ['Cambio de cadena']),
        svc('2026-05-10', ['Cadena Shimano 12v']),
    ], 'Cadena');
    eq('cadena: 2 eventos dan base', !!p, true);
    eq('cadena: cada ~120 dias', p!.cadaDias, 120);
    eq('cadena: proyecta desde el ultimo evento', p!.fecha, '2026-09-07');
    eq('cadena: 1 intervalo declarado', p!.intervalos, 1);
}

// Un solo evento NO es base: se cae al plazo fijo (null) y se dice.
eq('un evento no predice', prediccionComponente([svc('2026-05-10', ['Cambio de cadena'])], 'Cadena'), null);

// Dos items del mismo componente en la MISMA visita no son dos reemplazos.
eq('misma semana no cuenta doble', prediccionComponente([
    svc('2026-05-10', ['Cambio de cadena']),
    svc('2026-05-12', ['Cadena KMC']),
], 'Cadena'), null);

// La mediana aguanta un intervalo raro (60, 120, 130 → 120).
{
    const p = prediccionComponente([
        svc('2025-06-01', ['Líquido tubeless']),
        svc('2025-08-01', ['Liquido Tubeless refill']),   // 61 días
        svc('2025-12-01', ['Tubeless']),                   // 122 días
        svc('2026-04-10', ['Sellador tubeless']),          // 130 días
    ], 'Líquido Tubeless');
    eq('tubeless: mediana de 3 intervalos', p!.cadaDias, 122);
}

// Componente sin keyword conocida → sin predicción (no se inventa).
eq('componente desconocido', prediccionComponente([
    svc('2026-01-01', ['x']), svc('2026-03-01', ['x']),
], 'Suspensión trasera especial'), null);

// El tipo de servicio también cuenta como evento ("Service Horquilla").
{
    const p = prediccionComponente([
        svc('2025-10-01', [], 'Service Horquilla'),
        svc('2026-04-01', [], 'Service Horquilla'),
    ], 'Service Horquilla');
    eq('service horquilla por tipo', !!p, true);
}

// ── Idea 6: el que se está yendo ────────────────────────────────────────────
const HOY = Date.now();
const hace = (dias: number) => new Date(HOY - dias * 86400000).toISOString();
{
    const r = clientesEnFuga({
        clientes: [
            { id: 'c1', nombre: 'Juan Frecuente' },      // venía cada 30, hace 90 no viene → atraso 3
            { id: 'c2', nombre: 'Ana Al Día' },          // venía cada 30, vino hace 20 → sin riesgo
            { id: 'c3', nombre: 'Pedro Nuevo' },         // 1 sola visita → sin base
            { id: 'c4', nombre: 'Borrado', eliminado_en: '2026-01-01' },
        ],
        bicicletas: [
            { id: 'b1', cliente_id: 'c1' }, { id: 'b2', cliente_id: 'c2' }, { id: 'b3', cliente_id: 'c3' },
        ],
        servicios: [
            { bicicleta_id: 'b1', fecha_ingreso: hace(150), precio_base: 10000 },
            { bicicleta_id: 'b1', fecha_ingreso: hace(120), precio_base: 10000 },
            { bicicleta_id: 'b1', fecha_ingreso: hace(90), precio_base: 50000 },
            { bicicleta_id: 'b2', fecha_ingreso: hace(80), precio_base: 10000 },
            { bicicleta_id: 'b2', fecha_ingreso: hace(50), precio_base: 10000 },
            { bicicleta_id: 'b2', fecha_ingreso: hace(20), precio_base: 10000 },
            { bicicleta_id: 'b3', fecha_ingreso: hace(200), precio_base: 5000 },
        ],
    });
    eq('en riesgo: solo Juan', r.enRiesgo.map(c => c.nombre), ['Juan Frecuente']);
    eq('juan venia cada 30', r.enRiesgo[0].veniaCadaDias, 30);
    eq('juan hace 90 que no viene', r.enRiesgo[0].diasSinVenir, 90);
    eq('con base = 2 (Juan y Ana)', r.conBase, 2);
    eq('sin base = 1 (Pedro, y se declara)', r.sinBase, 1);
    eq('el argumento cita el dato', /cada .+ y hace .+ que no aparece/.test(r.enRiesgo[0].argumento), true);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} motorConCabeza: ${ok} ok, ${fail} fallaron`);
if (fail) process.exit(1);
