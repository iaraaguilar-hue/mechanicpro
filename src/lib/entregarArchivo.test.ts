// Tests de CÓMO llega un PDF a las manos del que lo pidió.
//   ./node_modules/.bin/esbuild src/lib/entregarArchivo.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/t.cjs && node /tmp/t.cjs
//
// 🔴 POR QUÉ EXISTEN: el defecto que reportó Alejo ("desde el celu no hace nada") NO se puede
// medir con el navegador de esta máquina. Playwright corre Chromium, y lo que falla es el
// teléfono: iOS guarda el archivo sin mostrar nada, y adentro de un navegador embebido
// (el de WhatsApp) `download` no hace absolutamente nada. Lo que sí se puede probar acá es
// la DECISIÓN: con este teléfono y estas capacidades, ¿qué camino toma? Cada test de abajo
// es un teléfono distinto.
import { entregarArchivo, esCelular, type EntornoDeEntrega } from './entregarArchivo';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const PDF = new Blob(['%PDF-1.4 hola'], { type: 'application/pdf' });

/** Un entorno de mentira que anota qué se hizo. */
function armar(opciones: Partial<EntornoDeEntrega> & { compartirFalla?: Error } = {}) {
    const hecho: string[] = [];
    const entorno: EntornoDeEntrega = {
        esCelular: false,
        puedeCompartirArchivos: () => false,
        compartir: async () => { hecho.push('compartir'); if (opciones.compartirFalla) throw opciones.compartirFalla; },
        descargar: () => { hecho.push('descargar'); },
        hacerUrl: () => 'blob:mentira',
        ...opciones,
    };
    return { entorno, hecho };
}

(async () => {
    // ── LA COMPU: se descarga, como siempre. Nadie quiere una hoja de compartir en el mostrador.
    {
        const { entorno, hecho } = armar({ esCelular: false, puedeCompartirArchivos: () => true });
        const r = await entregarArchivo(PDF, 'ingreso.pdf', entorno);
        eq('compu: descarga', r.modo, 'descargado');
        eq('compu: NO abre la hoja de compartir aunque el navegador la tenga', hecho, ['descargar']);
    }

    // ── EL IPHONE DE ALEJO: hoja de compartir. Ahí adentro está Imprimir, Guardar en Archivos
    //    y mandárselo al cliente por WhatsApp, que es lo que el taller hace con el papel.
    {
        const { entorno, hecho } = armar({ esCelular: true, puedeCompartirArchivos: () => true });
        const r = await entregarArchivo(PDF, 'ingreso.pdf', entorno);
        eq('iPhone: comparte', r.modo, 'compartido');
        eq('iPhone: no baja nada a escondidas', hecho, ['compartir']);
    }

    // ── EL QUE ABRE Y CIERRA LA HOJA: la tuvo en la mano y decidió. No se le baja el archivo
    //    por atrás ni se le muestra un error.
    {
        const abort = new Error('cancelado'); abort.name = 'AbortError';
        const { entorno, hecho } = armar({ esCelular: true, puedeCompartirArchivos: () => true, compartirFalla: abort });
        const r = await entregarArchivo(PDF, 'ingreso.pdf', entorno);
        eq('cancelar la hoja de compartir no es una falla', r.modo, 'compartido');
        eq('cancelar no dispara una descarga', hecho, ['compartir']);
    }

    // ── SAFARI QUE NIEGA EL PERMISO (el PDF tardó y se perdió el gesto): se intenta bajar,
    //    pero como es un teléfono NO se declara entregado: la pantalla tiene que ofrecer el enlace.
    {
        const noPermitido = new Error('sin gesto'); noPermitido.name = 'NotAllowedError';
        const { entorno, hecho } = armar({ esCelular: true, puedeCompartirArchivos: () => true, compartirFalla: noPermitido });
        const r = await entregarArchivo(PDF, 'ingreso.pdf', entorno);
        eq('Safari que niega compartir: cae a descargar', hecho, ['compartir', 'descargar']);
        eq('y como es un celular, queda el enlace a mano', r.modo, 'a_mano');
        eq('el enlace tiene URL', r.url, 'blob:mentira');
    }

    // ── EL NAVEGADOR DE ADENTRO DE WHATSAPP: no tiene hoja de compartir y su `download` es
    //    un agujero negro. Este es EXACTAMENTE el caso que dejaba la pantalla muda.
    {
        const { entorno } = armar({ esCelular: true, puedeCompartirArchivos: () => false });
        const r = await entregarArchivo(PDF, 'ingreso.pdf', entorno);
        eq('navegador embebido: nunca se da por entregado en silencio', r.modo, 'a_mano');
    }

    // ── SI HASTA LA DESCARGA EXPLOTA, se devuelve el enlace igual. Nunca una excepción:
    //    el que llama tiene que poder mostrar algo en pantalla siempre.
    {
        const { entorno } = armar({
            esCelular: false,
            descargar: () => { throw new Error('el navegador dijo que no'); },
        });
        const r = await entregarArchivo(PDF, 'ingreso.pdf', entorno);
        eq('si la descarga explota, queda el enlace', r.modo, 'a_mano');
    }

    // ── QUIÉN ES UN CELULAR ──────────────────────────────────────────────────
    // En Node `navigator` ya existe y es de solo lectura: se reemplaza con defineProperty,
    // o la asignación se pierde sin decir nada y los cinco casos de abajo dan siempre lo mismo.
    const conUA = (ua: string, touch = 0) => {
        Object.defineProperty(globalThis, 'navigator', {
            value: { userAgent: ua, maxTouchPoints: touch }, configurable: true, writable: true,
        });
        return esCelular();
    };
    eq('iPhone', conUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari'), true);
    eq('Android', conUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome'), true);
    // El iPad se declara "Macintosh" desde iPadOS 13: se lo reconoce por el dedo.
    eq('iPad disfrazado de Mac', conUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5), true);
    eq('Mac de escritorio', conUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome', 0), false);
    eq('Windows', conUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome', 0), false);

    console.log(fail ? `\n❌ ${fail} test(s) en rojo, ${ok} en verde` : `\n✅ ${ok} tests en verde: el PDF llega o se avisa, nunca se pierde en silencio`);
    process.exit(fail ? 1 : 0);
})();
