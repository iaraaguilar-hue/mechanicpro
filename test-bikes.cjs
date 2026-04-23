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

async function run() {
    const { data, error } = await supabase.from('bicicletas').select('modelo, categoria');

    const unknown = data.filter(b => {
        const rawModel = b.modelo ? b.modelo.toLowerCase() : '';
        const rawCat = b.categoria ? b.categoria.trim().toLowerCase() : '';
        const hasValidCategory = rawCat.length > 0 && rawCat !== 'indefinido' && rawCat !== 'otro';
        if (hasValidCategory) return false;

        const keywords = ['epic evo', 'epic', 'chisel', 'rockhopper', 'stumpjumper', 'enduro', 'fuse', 'tarmac', 'venge', 'roubaix', 'crux', 'diverge', 'turbo levo', 'vado', 'kenevo', 'madone', 'emonda', 'émonda', 'domane', 'checkpoint', 'marlin', 'roscoe', 'fuel ex', 'slash', 'powerfly', 'rail', 'fx', 'spark', 'scale', 'genius', 'addict', 'foil', 'contessa', 'aspect', 'ultimate cf', 'aeroad', 'strive', 'spectral', 'grand canyon', 'inflite', 'grail', 'neuron', 'tcr', 'propel', 'defy', 'trance', 'anthem', 'reign', 'revolt', 'talon', 'stance', 'supersix', 'topstone', 'scalpel', 'habit', 'trail neo', 'procaliber', 'crockett', 'dual sport', 'speedster', 'solace', 'cypress', 'escape', 'quick', 'trail', 'teammachine', 'fourstroke', 'speedfox', 'roadmachine', 'alpenchallenge', 'orca', 'alma', 'occam', 'rallon', 'terra', 'gain', 'wild', 'fatbike', 'bmx', 'fix', 'cargo', 'balance'];
        if (keywords.some(kw => rawModel.includes(kw))) return false;
        return true;
    });

    const freqs = {};
    unknown.forEach(u => {
        const cls = u.modelo || 'VACÍO';
        freqs[cls] = (freqs[cls] || 0) + 1;
    });

    console.log(Object.entries(freqs).sort((a, b) => b[1] - a[1]).slice(0, 50));
}
run();
