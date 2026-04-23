const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    if (line.includes('=')) {
        const [k, v] = line.split('=');
        env[k.trim()] = v.trim();
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function getSemanticCategory(rawDesc) {
    const lower = rawDesc.toLowerCase();

    const dic = {
        'Transmisión': ['piñon', 'piñón', 'cadena', 'plato', 'palanca', 'caja pedalera', 'cambio', 'fusible', 'descarrilador', 'polea', 'hg', 'sram', 'shimano', 'cassette', 'shifter', 'bottom bracket', 'crank', 'descarrilador'],
        'Frenos': ['pastilla', 'patin', 'disco', 'freno', 'purgado', 'ducto', 'liquido de freno', 'avid', 'cable', 'caliper', 'maneta', 'rotor', 'b05s'],
        'Neumáticos y Ruedas': ['tubeless', 'tubelizado', 'camara', 'cámara', 'cubierta', 'aro', 'maza', 'centrado', 'rayo', 'roval', 'parche', 'valvula', 'válvula', 'cinta tubeless', 'maxxis', 'schwalbe', 'fast trak', 'ground control'],
        'Suspensión': ['horquilla', 'shock', 'brain', 'rockshox', 'reten', 'retén', 'fox', 'suspensión', 'resorte'],
        'Cockpit y Componentes': ['stem', 'manubrio', 'asiento', 'tija', 'pedal', 'cinta', 'puño', 'grip', 'silla', 'sillín', 'saddle'],
        'Mantenimiento General': ['lubricante', 'm.o.', 'limpieza', 'service', 'ajuste', 'lavado', 'grasa', 'aceite', 'mano de obra', 'mantenimiento']
    };

    for (const [category, keywords] of Object.entries(dic)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return category;
        }
    }

    return 'Otros';
}

async function run() {
    const { data, error } = await supabase.from('servicios').select('*, servicio_items(*)');

    if (error) console.error(error);

    const otrosDesc = {};

    for (const row of Object.values(data || [])) {
        const items = Array.isArray(row.servicio_items) ? row.servicio_items : (Array.isArray(row.items_extra) ? row.items_extra : []);
        for (const item of items) {
            if (item.categoria === 'part' || item.categoria === 'producto' || item.categoria === 'repuesto') {
                const desc = (item.descripcion || '').trim();
                if (getSemanticCategory(desc) === 'Otros') {
                    otrosDesc[desc] = (otrosDesc[desc] || 0) + 1;
                }
            }
        }
    }

    console.log("=== DESCRIPCIONES EN 'OTROS' ===");
    console.log(Object.entries(otrosDesc).sort((a, b) => b[1] - a[1]).slice(0, 50));
}
run();
