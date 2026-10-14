// Tests de "El precio que no baja". Mini-harness propio (no hay vitest), igual que el resto.
import { pisoDelRenglon, avisoPrecioBajo, sinPrecioDeLista, textoPisoBajo, traducirErrorDePiso, type PisoOrden } from './precioQueNoBaja';
import { claveProducto } from './buscadorProductos';

let ok = 0, fail = 0;
const eq = (nombre: string, a: unknown, b: unknown) => {
    const av = JSON.stringify(a), bv = JSON.stringify(b);
    if (av === bv) { ok++; } else { fail++; console.error(`  ✗ ${nombre}\n      esperaba ${bv}\n      recibí   ${av}`); }
};

const catalogo = new Map<string, { precio?: number | null }>([
    [claveProducto('Cubierta Alfa'), { precio: 10000 }],
    [claveProducto('Sin precio'), { precio: null }],
    [claveProducto('Centavos'), { precio: 12500.4 }],
]);
const sinPisos = new Map<string, PisoOrden>();
const base = { activo: true, pisosDeLaOrden: sinPisos, catalogo };

// Apagado: nada se controla
eq('apagado no aplica', pisoDelRenglon({ ...base, activo: false, descripcion: 'Cubierta Alfa', categoria: 'part' }).aplica, false);
// Menor / igual / mayor
const r = pisoDelRenglon({ ...base, descripcion: 'Cubierta Alfa', categoria: 'part' });
eq('piso = lista del catálogo', [r.aplica, r.lista, r.piso], [true, 10000, 10000]);
eq('menor: avisa con el texto exacto', avisoPrecioBajo(r, 9999), 'El precio de lista es $10.000. Podés cobrar más, no menos. Un descuento lo hace el administrador.');
eq('igual: no avisa', avisoPrecioBajo(r, 10000), null);
eq('mayor: no avisa', avisoPrecioBajo(r, 12000), null);
eq('precio 0 (sin cargar): avisa', avisoPrecioBajo(r, 0) !== null, true);
// Redondeo a pesos enteros (el campo no admite centavos)
eq('lista con centavos se redondea', pisoDelRenglon({ ...base, descripcion: 'Centavos', categoria: 'part' }).piso, 12500);
// Sin precio de lista / a mano / vacío
const s = pisoDelRenglon({ ...base, descripcion: 'Sin precio', categoria: 'part' });
eq('sin precio: sin piso, se marca', [avisoPrecioBajo(s, 1), sinPrecioDeLista(s)], [null, true]);
const m = pisoDelRenglon({ ...base, descripcion: 'Escrito a mano', categoria: 'part' });
eq('a mano: sin piso, se marca', [avisoPrecioBajo(m, 1), sinPrecioDeLista(m)], [null, true]);
eq('sin nombre: no aplica ni se marca', [pisoDelRenglon({ ...base, descripcion: '  ', categoria: 'part' }).aplica], [false]);
// Mano de obra: no se toca
const l = pisoDelRenglon({ ...base, descripcion: 'Cubierta Alfa', categoria: 'labor' });
eq('mano de obra no aplica', [l.aplica, avisoPrecioBajo(l, 1), sinPrecioDeLista(l)], [false, null, false]);
// Piso congelado de la orden: manda sobre el catálogo de hoy
const congelado = new Map<string, PisoOrden>([[claveProducto('Cubierta Alfa'), { precio_lista: 10000, piso: 10000 }]]);
const catSube = new Map(catalogo); catSube.set(claveProducto('Cubierta Alfa'), { precio: 15000 });
const e = pisoDelRenglon({ activo: true, descripcion: 'Cubierta Alfa', categoria: 'part', pisosDeLaOrden: congelado, catalogo: catSube });
eq('el catálogo sube y la orden vieja sigue con su piso', [e.piso, avisoPrecioBajo(e, 12000)], [10000, null]);
// Descuento del admin baja el piso
const conDescuento = new Map<string, PisoOrden>([[claveProducto('Cubierta Alfa'), { precio_lista: 10000, piso: 8000 }]]);
const d = pisoDelRenglon({ ...base, pisosDeLaOrden: conDescuento, descripcion: 'Cubierta Alfa', categoria: 'part' });
eq('descuento del admin: el mecánico no rompe el descuento, pero no baja más', [avisoPrecioBajo(d, 8000), avisoPrecioBajo(d, 7999) !== null, d.lista], [null, true, 10000]);
// Pasarlo a mano de obra no lo libera si ya entró como repuesto
const fuga = pisoDelRenglon({ ...base, pisosDeLaOrden: congelado, descripcion: 'Cubierta Alfa', categoria: 'labor' });
eq('ya entró como repuesto: sigue con piso aunque lo pasen a mano de obra', avisoPrecioBajo(fuga, 100) !== null, true);
// Piso sin precio de lista congelado: no hay piso aunque el catálogo tenga precio hoy
const sinLista = new Map<string, PisoOrden>([[claveProducto('Cubierta Alfa'), { precio_lista: null, piso: null }]]);
eq('entró sin lista: queda sin piso y marcado', [avisoPrecioBajo(pisoDelRenglon({ ...base, pisosDeLaOrden: sinLista, descripcion: 'Cubierta Alfa', categoria: 'part' }), 1), sinPrecioDeLista(pisoDelRenglon({ ...base, pisosDeLaOrden: sinLista, descripcion: 'Cubierta Alfa', categoria: 'part' }))], [null, true]);
// Piso congelado MENOR que la lista (la orden ya lo cobraba bajo la lista): no se dice "precio de lista"
const pisoBajo = new Map<string, PisoOrden>([[claveProducto('Cubierta Alfa'), { precio_lista: 10000, piso: 4000 }]]);
const rb = pisoDelRenglon({ ...base, pisosDeLaOrden: pisoBajo, descripcion: 'Cubierta Alfa', categoria: 'part' });
eq('piso 4.000 con lista 10.000: texto de «ya tenía»', avisoPrecioBajo(rb, 3999), 'Esta orden ya tenía este repuesto a $4.000. Podés cobrar eso o más. Un descuento lo hace el administrador.');
eq('piso 4.000: cobrar 4.000 no avisa', avisoPrecioBajo(rb, 4000), null);
eq('piso = lista: sigue el texto de siempre', textoPisoBajo(10000, 10000), 'El precio de lista es $10.000. Podés cobrar más, no menos. Un descuento lo hace el administrador.');
eq('sin lista conocida: texto de siempre', textoPisoBajo(4000, null), 'El precio de lista es $4.000. Podés cobrar más, no menos. Un descuento lo hace el administrador.');
eq('traduce el error nuevo de la base', traducirErrorDePiso('Esta orden ya tenía este repuesto a $4.000. Podés cobrar eso o más. Un descuento lo hace el administrador.'), textoPisoBajo(4000, 10000));
// Traducción del error de la base
eq('traduce el error de la base', traducirErrorDePiso('El precio de lista es $10.000. Podés cobrar más, no menos. Un descuento lo hace el administrador.'), textoPisoBajo(10000));
eq('no toca otros errores', traducirErrorDePiso('duplicate key value violates unique constraint'), null);
eq('null no rompe', traducirErrorDePiso(null), null);
eq('con coma decimal', traducirErrorDePiso('Error: El precio de lista es $12.500,50. Podés cobrar más, no menos. Otra cosa'), 'El precio de lista es $12.500,50. Podés cobrar más, no menos. Un descuento lo hace el administrador.');

console.log(`precioQueNoBaja: ${ok} ok, ${fail} fallan`);
if (fail) process.exit(1);
