// Mini-harness propio (no hay vitest):
//   ./node_modules/.bin/esbuild src/lib/contraste.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
import { contraste, tintaSobre, tintaLegible, hexAHsl, hslAHex, hexAHslCss, luminancia, hexARgb } from './contraste';

let ok = 0, fail = 0;
const eq = (n: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) === JSON.stringify(b)) ok++;
    else { fail++; console.error(`  ✗ ${n}\n      esperaba ${JSON.stringify(b)}\n      recibí   ${JSON.stringify(a)}`); }
};
const cerca = (n: string, a: number, b: number, tol = 0.05) => {
    if (Math.abs(a - b) <= tol) ok++;
    else { fail++; console.error(`  ✗ ${n}: esperaba ~${b}, recibí ${a}`); }
};

// ── Los dos extremos conocidos de la WCAG ────────────────────────────────────
cerca('negro sobre blanco da 21:1', contraste('#000000', '#FFFFFF'), 21);
cerca('un color contra sí mismo da 1:1', contraste('#F25A30', '#F25A30'), 1);

// ── EL CASO DE ARIEL: secundario blanco ──────────────────────────────────────
// Antes: el texto encima salía casi-blanco fijo → 1,00:1, invisible.
cerca('blanco sobre blanco es 1:1 (lo que veía Ariel)', contraste('#FFFFFF', '#FFFFFF'), 1);
eq('sobre blanco, la tinta pasa a ser oscura', tintaSobre('#FFFFFF'), '#0F172A');
{
    const t = tintaSobre('#FFFFFF');
    const c = contraste(t, '#FFFFFF');
    eq('y esa tinta se lee de verdad (≥4.5:1)', c >= 4.5, true);
}

// Sobre el rojo de la marca, la tinta sigue siendo blanca: no se rompe lo que andaba.
eq('sobre el naranja de Mechanic Pro la tinta sigue clara', tintaSobre('#F25A30'), '#FFFFFF');
// El control de que la regla NO es «el que más contrasta»: sobre ese naranja el
// oscuro contrasta MÁS (4,8 contra 3,5) y aun así tiene que quedar blanco,
// porque es lo que ven hoy los 5 talleres.
eq('...aunque el oscuro contraste más', contraste('#F25A30', '#0F172A') > contraste('#F25A30', '#FFFFFF'), true);
eq('sobre el azul oscuro del default, tinta clara', tintaSobre('#1E293B'), '#FFFFFF');

// ── tintaLegible: el color de marca corrido hasta que se lee ─────────────────
{
    // Un secundario blanco usado COMO TEXTO sobre la página blanca.
    const t = tintaLegible('#FFFFFF', '#FFFFFF');
    eq('un blanco usado como texto sobre blanco se corrige', contraste(t, '#FFFFFF') >= 4.5, true);
}
{
    // Un color que YA se lee no se toca: si lo moviéramos, cambiaríamos la marca
    // de todos los talleres que hoy están bien.
    eq('un color que ya contrasta queda igual', tintaLegible('#1E293B', '#FFFFFF'), '#1E293B');
    eq('el azul del default queda igual', tintaLegible('#0EA5E9', '#FFFFFF') !== '#0EA5E9', true); // 3,0:1 → se oscurece
}
{
    // Se conserva el TINTE: un amarillo corregido sigue siendo amarillo.
    const t = tintaLegible('#FFE600', '#FFFFFF');
    const h = hexAHsl(t).h, h0 = hexAHsl('#FFE600').h;
    cerca('el amarillo corregido sigue siendo amarillo', h, h0, 2);
    eq('y ahora se lee', contraste(t, '#FFFFFF') >= 4.5, true);
}
{
    // Sobre fondo oscuro se corrige al revés: aclara en vez de oscurecer.
    const t = tintaLegible('#111111', '#0F172A');
    eq('sobre fondo oscuro, el color se aclara', hexAHsl(t).l > hexAHsl('#111111').l, true);
    eq('y se lee', contraste(t, '#0F172A') >= 4.5, true);
}

// ── Ida y vuelta hex ↔ hsl ───────────────────────────────────────────────────
for (const c of ['#F25A30', '#1E293B', '#FFFFFF', '#000000', '#0EA5E9']) {
    const { h, s, l } = hexAHsl(c);
    eq(`ida y vuelta de ${c}`, hslAHex(h, s, l).toUpperCase(), c.toUpperCase());
}
eq('el formato de la variable CSS', hexAHslCss('#FFFFFF'), '0.0 0.0% 100.0%');

// ── Entradas rotas: no pueden tirar la app ───────────────────────────────────
eq('un hex inválido no explota', hexARgb('rojo'), null);
eq('un hex inválido cae en tinta oscura', tintaLegible('rojo'), '#0F172A');
eq('contraste con basura devuelve 1', contraste('rojo', '#FFF'), 1);
eq('hex de 3 dígitos también vale', hexARgb('#fff'), { r: 255, g: 255, b: 255 });
cerca('la luminancia del blanco es 1', luminancia({ r: 255, g: 255, b: 255 }), 1);

console.log(`\n${fail === 0 ? '✅' : '❌'} contraste: ${ok} ok, ${fail} fallaron`);
if (fail > 0) process.exit(1);
