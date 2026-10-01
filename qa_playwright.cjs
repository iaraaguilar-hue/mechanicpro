/**
 * De dónde sacan Playwright los qa_*.cjs (1-oct-2026).
 *
 * Antes cada candado tenía escrita la carpeta de npx donde estaba instalado
 * (`~/.npm/_npx/e41f203b7505f1fb/...`). Esa carpeta cambia de nombre cada vez
 * que se limpia el caché de npm, y el 1-oct-2026 ya no existía: no arrancaba
 * ninguno de los 9 candados que la usaban, y nadie se había enterado.
 * Ahora se BUSCA: PW_CORE si está, si no el paquete instalado, si no la carpeta
 * de npx más nueva que lo tenga. Con el navegador pasaba lo mismo: 7 candados
 * pedían la revisión 1234 de chrome-headless-shell, que tampoco estaba.
 *
 *   const { chromium, devices, navegador } = require('./qa_playwright.cjs');
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function buscar() {
    if (process.env.PW_CORE) return require(process.env.PW_CORE);
    try { return require('playwright-core'); } catch { }
    const npx = path.join(os.homedir(), '.npm/_npx');
    const candidatos = fs.existsSync(npx) ? fs.readdirSync(npx)
        .map(d => path.join(npx, d, 'node_modules/playwright-core'))
        .filter(d => fs.existsSync(d))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs) : [];
    if (!candidatos.length) {
        console.error('No encuentro playwright-core. Instalalo con `npx playwright-core --version` o pasá PW_CORE=<carpeta>.');
        process.exit(2);
    }
    return require(candidatos[0]);
}

// El chrome-headless-shell más nuevo de los instalados (PW_CHROME manda).
function navegador() {
    if (process.env.PW_CHROME) return process.env.PW_CHROME;
    const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
    const dirs = fs.existsSync(base) ? fs.readdirSync(base)
        .filter(d => d.startsWith('chromium_headless_shell-'))
        .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop())) : [];
    for (const d of dirs) {
        const exe = path.join(base, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
        if (fs.existsSync(exe)) return exe;
    }
    return undefined;   // que Playwright use el suyo
}

const pw = buscar();
module.exports = { chromium: pw.chromium, devices: pw.devices, navegador: navegador() };
