#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// CANDADO: comillas latinas « » en lo que se ve.
//
// Regla de Iara (24-jul-2026), en `estudio_iara/context/_calidad/reglas_duras_cross.txt`:
// "Comillas angulares/latinas « » PROHIBIDAS TERMINANTEMENTE → usar comillas rectas,
// toda marca". El candado de copy del estudio la cuidaba en los textos de marketing,
// pero la app no tenía candado: el 14-sep-2026 había 48 líneas con « » en pantallas,
// en el recorrido guiado y en los errores que ve el taller, más 13 en las funciones
// (algunas en las instrucciones de la IA que arma plantillas, que se las contagiaba
// a los borradores).
//
// Mira las líneas que NO son comentario de frontend/src y supabase/functions.
//   node qa_comillas.cjs          → lista y sale con 1 si encuentra alguna
// Control negativo incluido: si el detector no caza una línea con « », el candado
// no prueba nada y sale con 2.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const RAICES = [path.join(__dirname, 'src'), path.join(__dirname, '..', 'supabase', 'functions')];
const COMENTARIO = /^\s*(\/\/|\*|\/\*|\{\/\*)/;
const tieneComillas = (linea) => /[«»]/.test(linea) && !COMENTARIO.test(linea);

// Control negativo: el detector tiene que cazar esto, y no cazar un comentario.
if (!tieneComillas(`    ayuda: 'Tocá «Guardar».',`) || tieneComillas(`    // «esto es un comentario»`)) {
    console.error('❌ el detector no anda: el candado no prueba nada');
    process.exit(2);
}

const hallazgos = [];
const recorrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') recorrer(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
            if (tieneComillas(l)) hallazgos.push(`${path.relative(path.join(__dirname, '..'), p)}:${i + 1}: ${l.trim().slice(0, 110)}`);
        });
    }
};
RAICES.forEach(recorrer);

if (hallazgos.length) {
    console.log(`❌ ${hallazgos.length} línea(s) con comillas latinas « » en lo que se ve (usá comillas rectas):`);
    hallazgos.forEach(h => console.log('  ' + h));
    process.exit(1);
}
console.log('✅ control negativo OK · ninguna comilla latina « » en pantallas ni funciones');
