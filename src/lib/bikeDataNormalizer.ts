/**
 * bikeDataNormalizer.ts
 * Motor de limpieza y clasificación inteligente de datos de bicicleta.
 * Procesa strings "sucios" de la DB (ej. "Epic 8 Pro (azul)") y los
 * transforma en familias limpias (ej. "Epic") y segmentos (ej. "MTB").
 */

// ─── DICCIONARIO: Palabra clave → Familia canónica ────────────────────────────
// El orden importa: las entradas más específicas deben ir antes que las generales.
const MODEL_FAMILY_MAP: Array<{ keywords: string[]; family: string }> = [
    // Specialized
    { keywords: ['epic evo', 'epicevo'], family: 'Epic EVO' },
    { keywords: ['epic'], family: 'Epic' },
    { keywords: ['chisel'], family: 'Chisel' },
    { keywords: ['rockhopper', 'rh '], family: 'Rockhopper' },
    { keywords: ['stumpjumper', 'stump jumper'], family: 'Stumpjumper' },
    { keywords: ['enduro'], family: 'Enduro' },
    { keywords: ['fuse'], family: 'Fuse' },
    { keywords: ['pitch'], family: 'Pitch' },
    { keywords: ['hardrock'], family: 'Hardrock' },
    { keywords: ['tarmac', 'sl7', 'sl6'], family: 'Tarmac' },
    { keywords: ['venge'], family: 'Venge' },
    { keywords: ['roubaix'], family: 'Roubaix' },
    { keywords: ['allez'], family: 'Allez' },
    { keywords: ['aethos'], family: 'Aethos' },
    { keywords: ['shiv'], family: 'Shiv (Triatlón)' },
    { keywords: ['sirrus'], family: 'Sirrus (Urbana)' },
    { keywords: ['crux'], family: 'Crux' },
    { keywords: ['diverge'], family: 'Diverge' },
    { keywords: ['turbo levo', 'tubolevo', 'levo'], family: 'Levo (E-MTB)' },
    { keywords: ['turbo vado', 'vado'], family: 'Vado (E-Urban)' },
    { keywords: ['kenevo'], family: 'Kenevo' },

    // Trek
    { keywords: ['madone'], family: 'Madone' },
    { keywords: ['emonda', 'émonda'], family: 'Émonda' },
    { keywords: ['domane'], family: 'Domane' },
    { keywords: ['checkpoint'], family: 'Checkpoint' },
    { keywords: ['marlin'], family: 'Marlin' },
    { keywords: ['roscoe'], family: 'Roscoe' },
    { keywords: ['fuel ex', 'fuelex'], family: 'Fuel EX' },
    { keywords: ['slash'], family: 'Slash' },
    { keywords: ['powerfly'], family: 'Powerfly (E-MTB)' },
    { keywords: ['rail'], family: 'Rail (E-MTB)' },
    { keywords: ['fx'], family: 'FX (Urban)' },

    // Scott
    { keywords: ['spark'], family: 'Spark' },
    { keywords: ['scale'], family: 'Scale' },
    { keywords: ['genius'], family: 'Genius' },
    { keywords: ['addict'], family: 'Addict' },
    { keywords: ['foil'], family: 'Foil' },
    { keywords: ['contessa'], family: 'Contessa' },
    { keywords: ['aspect'], family: 'Aspect' },

    // Canyon
    { keywords: ['ultimate cf'], family: 'Ultimate CF' },
    { keywords: ['aeroad'], family: 'Aeroad' },
    { keywords: ['strive'], family: 'Strive' },
    { keywords: ['spectral'], family: 'Spectral' },
    { keywords: ['grand canyon', 'grand_canyon'], family: 'Grand Canyon' },
    { keywords: ['inflite'], family: 'Inflite CF (CX)' },
    { keywords: ['grail'], family: 'Grail' },
    { keywords: ['neuron'], family: 'Neuron' },

    // Giant
    { keywords: ['tcr'], family: 'TCR' },
    { keywords: ['propel'], family: 'Propel' },
    { keywords: ['defy'], family: 'Defy' },
    { keywords: ['trance'], family: 'Trance' },
    { keywords: ['anthem'], family: 'Anthem' },
    { keywords: ['reign'], family: 'Reign' },
    { keywords: ['revolt'], family: 'Revolt' },
    { keywords: ['talon'], family: 'Talon' },
    { keywords: ['stance'], family: 'Stance' },

    // Cannondale
    { keywords: ['supersix', 'super six'], family: 'SuperSix EVO' },
    { keywords: ['synapse'], family: 'Synapse' },
    { keywords: ['caad'], family: 'CAAD' },
    { keywords: ['topstone'], family: 'Topstone' },
    { keywords: ['scalpel'], family: 'Scalpel' },
    { keywords: ['habit'], family: 'Habit' },
    { keywords: ['trail neo'], family: 'Trail Neo (E-MTB)' },

    // Cervelo / Triatlón Genéricos
    { keywords: ['p5', 'p-series'], family: 'Cervélo P-Series (Triatlón)' },
    { keywords: ['trinity'], family: 'Trinity (Triatlón)' },
    { keywords: ['tria'], family: 'Bicicleta de Triatlón' },

    // Otras Marcas y Modelos Genéricos Detectados
    { keywords: ['aggressor'], family: 'Aggressor (GT)' },
    { keywords: ['matts'], family: 'Matts (Merida)' },
    { keywords: ['reaction'], family: 'Reaction (Cube)' },
    { keywords: ['aim'], family: 'Aim (Cube)' },
    { keywords: ['mojave'], family: 'Mojave (Raleigh)' },
    { keywords: ['xr 3', 'xr 4', 'xr 2'], family: 'XR (Raleigh)' },
    { keywords: ['nicasio'], family: 'Nicasio (Urban/Gravel)' },
    { keywords: ['gravel'], family: 'Gravel (Genérica)' },
    { keywords: ['mtb', 'mountain'], family: 'MTB (Genérica)' },

    // Trek (extra)
    { keywords: ['procaliber'], family: 'Procaliber' },
    { keywords: ['crockett'], family: 'Crockett (CX)' },
    { keywords: ['dual sport'], family: 'Dual Sport (Urban)' },

    // Scott (extra)
    { keywords: ['speedster'], family: 'Speedster' },
    { keywords: ['solace'], family: 'Solace' },

    // Giant (extra)
    { keywords: ['cypress'], family: 'Cypress (Urban)' },
    { keywords: ['escape'], family: 'Escape (Urban)' },

    // Cannondale (extra)
    { keywords: ['quick'], family: 'Quick (Urban)' },
    { keywords: ['trail'], family: 'Trail' },

    // BMC
    { keywords: ['teammachine', 'team machine'], family: 'Teammachine' },
    { keywords: ['fourstroke', 'four stroke'], family: 'Fourstroke' },
    { keywords: ['speedfox', 'speed fox'], family: 'Speedfox' },
    { keywords: ['roadmachine', 'road machine'], family: 'Roadmachine' },
    { keywords: ['alpenchallenge'], family: 'Alpenchallenge (Urban)' },

    // Orbea
    { keywords: ['orca'], family: 'Orca' },
    { keywords: ['alma'], family: 'Alma' },
    { keywords: ['occam'], family: 'Occam' },
    { keywords: ['rallon'], family: 'Rallon' },
    { keywords: ['terra'], family: 'Terra (Gravel)' },
    { keywords: ['gain'], family: 'Gain (E-Road)' },
    { keywords: ['wild'], family: 'Wild (E-MTB - Orbea)' },

    // Generic / Other
    { keywords: ['fatbike', 'fat bike', 'fat-bike'], family: 'Fat Bike' },
    { keywords: ['bmx'], family: 'BMX' },
    { keywords: ['fixie', 'fixed'], family: 'Fixed/Pista' },
    { keywords: ['cargo'], family: 'Cargo' },
    { keywords: ['paseo', 'playera', 'inglesa', 'retro', 'vintage', 'townie'], family: 'Paseo' },
    { keywords: ['balance', 'equilibrio'], family: 'Balance (Niño)' },
];

// ─── DICCIONARIO: Familia → Segmento de disciplina ───────────────────────────
const FAMILY_SEGMENT_MAP: Record<string, string> = {
    // MTB
    'Epic': 'MTB',
    'Epic EVO': 'MTB',
    'Chisel': 'MTB',
    'Rockhopper': 'MTB',
    'Stumpjumper': 'MTB',
    'Enduro': 'MTB',
    'Fuse': 'MTB',
    'Spark': 'MTB',
    'Scale': 'MTB',
    'Genius': 'MTB',
    'Contessa': 'MTB',
    'Aspect': 'MTB',
    'Marlin': 'MTB',
    'Roscoe': 'MTB',
    'Fuel EX': 'MTB',
    'Slash': 'MTB',
    'Strive': 'MTB',
    'Spectral': 'MTB',
    'Grand Canyon': 'MTB',
    'Neuron': 'MTB',
    'Trance': 'MTB',
    'Anthem': 'MTB',
    'Reign': 'MTB',
    'Talon': 'MTB',
    'Stance': 'MTB',
    'Scalpel': 'MTB',
    'Habit': 'MTB',
    'Fat Bike': 'MTB',
    'Hardrock': 'MTB',
    'Pitch': 'MTB',
    'Aggressor (GT)': 'MTB',
    'Matts (Merida)': 'MTB',
    'Reaction (Cube)': 'MTB',
    'Aim (Cube)': 'MTB',
    'Mojave (Raleigh)': 'MTB',
    'XR (Raleigh)': 'MTB',
    'MTB (Genérica)': 'MTB',

    // Ruta
    'Tarmac': 'Ruta',
    'Venge': 'Ruta',
    'Roubaix': 'Ruta',
    'Madone': 'Ruta',
    'Émonda': 'Ruta',
    'TCR': 'Ruta',
    'Propel': 'Ruta',
    'Defy': 'Ruta',
    'SuperSix EVO': 'Ruta',
    'Aeroad': 'Ruta',
    'Ultimate CF': 'Ruta',
    'Addict': 'Ruta',
    'Foil': 'Ruta',
    'Allez': 'Ruta',
    'Aethos': 'Ruta',
    'Synapse': 'Ruta',
    'CAAD': 'Ruta',

    // Gravel / CX
    'Crux': 'Gravel',
    'Diverge': 'Gravel',
    'Checkpoint': 'Gravel',
    'Topstone': 'Gravel',
    'Revolt': 'Gravel',
    'Domane': 'Gravel',
    'Grail': 'Gravel',
    'Inflite CF (CX)': 'Gravel',
    'Nicasio (Urban/Gravel)': 'Gravel',
    'Gravel (Genérica)': 'Gravel',

    // Triatlón
    'Shiv (Triatlón)': 'Triatlón',
    'Trinity (Triatlón)': 'Triatlón',
    'Cervélo P-Series (Triatlón)': 'Triatlón',
    'Bicicleta de Triatlón': 'Triatlón',

    // E-Bike
    'Levo (E-MTB)': 'E-Bike',
    'Kenevo': 'E-Bike',
    'Powerfly (E-MTB)': 'E-Bike',
    'Rail (E-MTB)': 'E-Bike',
    'Trail Neo (E-MTB)': 'E-Bike',
    'Vado (E-Urban)': 'E-Bike',

    // Urbana
    'FX (Urban)': 'Urbana',
    'Fixed/Pista': 'Urbana',
    'Cargo': 'Urbana',
    'Sirrus (Urbana)': 'Urbana',
    'Dual Sport (Urban)': 'Urbana',
    'Cypress (Urban)': 'Urbana',
    'Escape (Urban)': 'Urbana',
    'Quick (Urban)': 'Urbana',
    'Alpenchallenge (Urban)': 'Urbana',

    // Paseo
    'Paseo': 'Paseo',

    // Orbea
    'Orca': 'Ruta',
    'Alma': 'MTB',
    'Occam': 'MTB',
    'Rallon': 'MTB',
    'Terra (Gravel)': 'Gravel',
    'Gain (E-Road)': 'E-Bike',
    'Wild (E-MTB - Orbea)': 'E-Bike',

    // Otros
    'BMX': 'BMX',
    'Balance (Niño)': 'Infantil',
};

// ─── SERVICE TYPE SANITIZER ───────────────────────────────────────────────────
/**
 * Sanitizes raw `tipo_servicio` strings before aggregation.
 * Business rules:
 *   - Any string containing "sport" (case-insensitive) → canonical "Sport"
 *   - Any string containing "expert" (case-insensitive) → canonical "Expert"
 *   - Any string containing "pro" (word boundary) → canonical "Pro"
 *   - Otherwise: Title-case the string.
 * This ensures "Service sport", "sport", "SPORT" all merge into one bar.
 */
export function normalizeServiceType(rawType: string): string {
    if (!rawType?.trim()) return 'General';
    const lower = rawType.trim().toLowerCase();

    if (lower.includes('sport')) return 'Sport';
    if (lower.includes('expert')) return 'Expert';
    if (/\bpro\b/.test(lower)) return 'Pro';

    // Title-case fallback
    const trimmed = rawType.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// ─── MOTOR DE NORMALIZACIÓN ───────────────────────────────────────────────────

/**
 * Dado el string crudo del campo `modelo` de una bicicleta,
 * retorna la familia canónica limpia.
 * Ej: "Rockhopper Expert 29 (gris)" → "Rockhopper"
 */
export function normalizeBikeModel(rawModel: string): string {
    if (!rawModel?.trim()) return 'Desconocido';
    const lower = rawModel.toLowerCase();

    for (const entry of MODEL_FAMILY_MAP) {
        if (entry.keywords.some(kw => lower.includes(kw))) {
            return entry.family;
        }
    }

    // Fallback: devolver solo la primera palabra relevante (descarta colores, talles, etc.)
    // Elimina tokens irrelevantes: paréntesis y su contenido, tamaños, niveles de spec, años
    const cleaned = rawModel
        .replace(/\(.*?\)/g, '')                                    // elimina (azul), (2024), etc.
        .replace(/\b(comp|expert|pro|sl|s|m|l|xl|xxl|\d+)\b/gi, '') // elimina niveles y talles
        .replace(/\s+/g, ' ')
        .trim();

    const firstWord = cleaned.split(' ')[0];
    return firstWord
        ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
        : 'Indefinido';
}

/**
 * Dado el modelo crudo o la familia ya normalizada de una bicicleta,
 * retorna el segmento de disciplina.
 * Ej: "Epic" → "MTB", "Tarmac SL7 Disc" → "Ruta"
 */
export function classifyBikeSegment(rawModel: string): string {
    const family = normalizeBikeModel(rawModel);
    // Return 'Indefinido' (not 'Otros') so it never collides with the UI residual bar label "Otras".
    return FAMILY_SEGMENT_MAP[family] ?? 'Indefinido';
}

/**
 * Función principal: dado el array de bicicletas crudas de Supabase,
 * agrega `modelFamily` y `segment` a cada objeto.
 */
export function normalizeBikeData<T extends { modelo?: string; categoria?: string }>(
    bikes: T[]
): (T & { modelFamily: string; segment: string })[] {
    return bikes.map(bike => {
        const modelFamily = normalizeBikeModel(bike.modelo || '');

        // Si la BD ya tiene una categoría explícita (MTB, Ruta, etc.), la usamos.
        // Si es vacía o "Indefinido", deducimos del modelo.
        const rawCat = (bike.categoria || '').trim().toLowerCase();
        const hasValidCategory = rawCat.length > 0 && rawCat !== 'indefinido' && rawCat !== 'otro';
        const segment = hasValidCategory
            ? bike.categoria!.charAt(0).toUpperCase() + bike.categoria!.slice(1)
            : classifyBikeSegment(bike.modelo || '');

        return { ...bike, modelFamily, segment };
    });
}
