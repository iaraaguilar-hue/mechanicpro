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
    { keywords: ['rockhopper'], family: 'Rockhopper' },
    { keywords: ['stumpjumper', 'stump jumper'], family: 'Stumpjumper' },
    { keywords: ['enduro'], family: 'Enduro' },
    { keywords: ['fuse'], family: 'Fuse' },
    { keywords: ['tarmac'], family: 'Tarmac' },
    { keywords: ['venge'], family: 'Venge' },
    { keywords: ['roubaix'], family: 'Roubaix' },
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
    { keywords: ['topstone'], family: 'Topstone' },
    { keywords: ['scalpel'], family: 'Scalpel' },
    { keywords: ['habit'], family: 'Habit' },
    { keywords: ['trail neo'], family: 'Trail Neo (E-MTB)' },

    // Generic / Other
    { keywords: ['fatbike', 'fat bike', 'fat-bike'], family: 'Fat Bike' },
    { keywords: ['bmx'], family: 'BMX' },
    { keywords: ['fixie', 'fixed'], family: 'Fixed/Pista' },
    { keywords: ['cargo'], family: 'Cargo' },
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

    // Gravel / CX
    'Crux': 'Gravel',
    'Diverge': 'Gravel',
    'Checkpoint': 'Gravel',
    'Topstone': 'Gravel',
    'Revolt': 'Gravel',
    'Domane': 'Gravel',
    'Grail': 'Gravel',
    'Inflite CF (CX)': 'Gravel',

    // E-Bike
    'Levo (E-MTB)': 'E-Bike',
    'Kenevo': 'E-Bike',
    'Powerfly (E-MTB)': 'E-Bike',
    'Rail (E-MTB)': 'E-Bike',
    'Trail Neo (E-MTB)': 'E-Bike',
    'Vado (E-Urban)': 'E-Bike',

    // Urbana / Paseo
    'FX (Urban)': 'Urbana/Paseo',
    'Fixed/Pista': 'Urbana/Paseo',
    'Cargo': 'Urbana/Paseo',

    // Otros
    'BMX': 'BMX',
    'Balance (Niño)': 'Infantil',
};

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
        : 'Otros';
}

/**
 * Dado el modelo crudo o la familia ya normalizada de una bicicleta,
 * retorna el segmento de disciplina.
 * Ej: "Epic" → "MTB", "Tarmac SL7 Disc" → "Ruta"
 */
export function classifyBikeSegment(rawModel: string): string {
    const family = normalizeBikeModel(rawModel);
    return FAMILY_SEGMENT_MAP[family] ?? 'Otros';
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
