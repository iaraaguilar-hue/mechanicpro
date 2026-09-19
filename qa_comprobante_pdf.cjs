// EL COMPROBANTE QUE RECIBE EL CLIENTE, MEDIDO (19-sep-2026).
//
// 🔴 POR QUE EXISTE: el bloque CLIENTE / BICICLETA no tenia ancho por columna, asi que con un
// nombre largo de un lado y un modelo largo del otro los dos textos crecian hasta PISARSE. Salio
// asi el service #0374 (Veronica Natalia Baccaro sobre una Tarmac SL8) y se le mando al cliente.
// Nadie lo vio porque el PDF no lo miraba ningun candado: se probaba con nombres cortos, que es
// justamente el caso que nunca falla.
//
// QUE MIDE: renderiza el comprobante con los PEORES casos reales y mira los pixeles.
//   1. que no haya tinta en el hueco entre las dos columnas (eso es solape);
//   2. que ninguna palabra quede cortada con guion (react-pdf hifena en ingles por defecto);
//   3. control positivo: que las dos columnas SI tengan tinta, para saber que mide algo.
//
// CONTROL NEGATIVO, y no es teorico: recien escrito, este candado dio ROJO en el caso de la
// palabra sola larguisima (254 px de tinta en el hueco) cuando el fix del ancho por columna ya
// estaba puesto. O sea que mide de verdad y encontro un caso que el arreglo no cubria. El
// control positivo va adentro de cada corrida: si las dos columnas no tienen tinta, avisa que
// la medicion no esta mirando donde cree.
//
// Uso:  node qa_comprobante_pdf.cjs        (necesita poppler: brew install poppler)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-comprobante-'));

const CASOS = [
  { nombre: 'el caso que fallo (#0374)', clientName: 'VERONICA NATALIA BACCARO', bikeModel: 'Tarmac SL8 SW Frmset Demi Collection' },
  { nombre: 'el peor caso de los dos lados', clientName: 'MARIA DE LOS ANGELES RODRIGUEZ FERNANDEZ', bikeModel: 'Specialized S-Works Tarmac SL8 Dura-Ace Di2 Team Edition 2026' },
  { nombre: 'una sola palabra larguisima', clientName: 'ESTEBANQUITOADMINISTRACIONES', bikeModel: 'Rockhoppersportcomplarguisimomodelo' },
  { nombre: 'control: nombres cortos', clientName: 'Ana Paz', bikeModel: 'Epic 8' },
];

// El entry vive DENTRO del frontend y se borra al final: un archivo en /tmp no encuentra
// los node_modules de aca (primer intento, 19-sep).
const entry = path.join(RAIZ, '.qa_comprobante_entry.tsx');
const bundle = path.join(TMP, 'entry.cjs');

fs.writeFileSync(entry, `
import React from 'react';
import { renderToFile } from '@react-pdf/renderer';
import { ServiceTicketPDF } from ${JSON.stringify(path.join(RAIZ, 'src/components/ServiceTicketPDF'))};
const casos = ${JSON.stringify(CASOS)};
(async () => {
  for (let i = 0; i < casos.length; i++) {
    const c = casos[i];
    await renderToFile(<ServiceTicketPDF data={{
      logoUrl: '', primaryColor: '#F4511E', politicaPago: '(SOLO EFECTIVO O TRANSFERENCIA)',
      jobNo: '#0374', dateIn: '19/09/2026', dateOut: '19/09/2026', dateOutLabel: 'Entregada el',
      clientName: c.clientName, clientDni: '', clientPhone: '', bikeModel: c.bikeModel,
      serviceType: 'ARMADO DE BICICLETA', basePrice: 80000, laborLines: [], extraLabor: [],
      products: [{ description: 'CADENA 12V SHIMANO CN-M7100', price: 73180 }],
      totalLabor: 80000, totalProducts: 73180, grandTotal: 153180, notes: '', tallerName: 'Probikes',
    }} />, ${JSON.stringify(TMP)} + '/caso' + i + '.pdf');
  }
})();
`);

try {
  execFileSync(path.join(RAIZ, 'node_modules/.bin/esbuild'),
    [entry, '--bundle', '--platform=node', '--format=cjs', '--outfile=' + bundle,
     '--jsx=automatic', '--log-level=error'], { cwd: RAIZ });
  execFileSync('node', [bundle], { cwd: RAIZ });
} finally {
  fs.rmSync(entry, { force: true });
}

// El texto del PDF, para cazar palabras cortadas con guion.
const textoDe = (pdf) => {
  try { return execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' }); } catch { return ''; }
};

let fallos = 0;
for (let i = 0; i < CASOS.length; i++) {
  const c = CASOS[i];
  const pdf = path.join(TMP, `caso${i}.pdf`);
  execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', pdf, path.join(TMP, `caso${i}`)]);
  const png = path.join(TMP, `caso${i}-1.png`);

  // Se mide con python+PIL, que es lo que hay en la Mac.
  const medicion = execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(png)}).convert('L')
w, h = im.size
franja = im.crop((0, int(h*0.19), w, int(h*0.32)))   # el bloque CLIENTE / BICICLETA
def tinta(a, b):
    c = franja.crop((int(w*a), 0, int(w*b), franja.height))
    return sum(1 for p in c.get_flattened_data() if p < 128)
print(tinta(0.07, 0.55), tinta(0.565, 0.60), tinta(0.61, 0.94))
`], { encoding: 'utf8' }).trim().split(' ').map(Number);

  const [izq, hueco, der] = medicion;
  const texto = textoDe(pdf);
  const cortadas = (texto.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]-\n/g) || []).length;

  const okHueco = hueco === 0;
  const okPositivo = izq > 0 && der > 0;          // control positivo: mide algo de verdad
  const okCorte = cortadas === 0;
  const ok = okHueco && okPositivo && okCorte;
  if (!ok) fallos++;
  console.log(`${ok ? '✅' : '🔴'} ${c.nombre}`);
  if (!okHueco) console.log(`     🔴 SE PISAN: ${hueco} px de tinta en el hueco entre las columnas`);
  if (!okPositivo) console.log(`     🔴 el control positivo falla (izq=${izq} der=${der}): la medicion no esta mirando el bloque`);
  if (!okCorte) console.log(`     🔴 ${cortadas} palabra(s) cortadas con guion`);
}

fs.rmSync(TMP, { recursive: true, force: true });
if (fallos) { console.error(`\n🔴 ${fallos} caso(s) rotos en el comprobante.`); process.exit(1); }
console.log('\n✅ El comprobante aguanta los nombres largos: sin solape y sin palabras cortadas.');
