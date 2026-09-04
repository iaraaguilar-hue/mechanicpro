// Config de la PÁGINA DE RENDER (render/), no de la app.
//
// Hace dos cosas que la config normal no puede hacer:
//   1. root = render/  → la entrada es render/index.html, no la app entera.
//   2. alias de `@/lib/supabase` a un stub → los componentes que arrastran la base de datos
//      en su cadena de imports (ExpertMetrics importa getSemanticCategory de pages/Metrics,
//      que importa supabase) se pueden montar sin credenciales. El módulo real hace
//      `throw new Error('Faltan las variables de entorno de Supabase.')` y tumbaba el montaje.
//
// ⚠️ El alias específico va ANTES del genérico `@`: Vite resuelve en orden y `@` se comería
// `@/lib/supabase`.
//
// Uso:  npx vite --config vite.config.render.ts    (dev, para mirarlo a ojo)
//       node ../../Documents/estudio_iara/tools/edicion/mp_capa_datos.mjs   (captura)

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    root: path.resolve(__dirname, './render'),
    plugins: [react()],
    resolve: {
        alias: [
            { find: '@/lib/supabase', replacement: path.resolve(__dirname, './render/stubs/supabase.ts') },
            { find: '@', replacement: path.resolve(__dirname, './src') },
        ],
    },
    server: { port: 5199, strictPort: true },
});
