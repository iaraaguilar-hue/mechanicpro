import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';

// 🔴 NADA DE PALABRAS CORTADAS (19-sep-2026). @react-pdf/renderer hifena por defecto, en
// ingles: con el nombre del cliente y el modelo de la bici en columna angosta salia
// "MARIA DE LOS ANGELES RO-DRIGUEZ" y "Specialized S-Works Tar-mac". Un apellido partido al
// medio en un comprobante que el cliente recibe por WhatsApp no lo escribe nadie. Devolver
// la palabra entera apaga el guionado: si no entra, baja de renglon completa.
Font.registerHyphenationCallback((palabra) => [palabra]);

/**
 * Una palabra sola, larguisima y sin espacios ("BICICLETERIAELPEDALDEORO", un modelo cargado
 * todo junto) no tiene donde cortarse: desborda su columna y se mete en la de al lado. Lo
 * encontro el candado `qa_comprobante_pdf.cjs` probando el peor caso, no un cliente real, que
 * es de lo que se trata. Se le meten cortes invisibles (U+200B) para que pueda bajar de
 * renglon.
 *
 * 🔴 Con U+200B (el espacio de ancho cero) NO alcanza: se probó primero y el candado siguió
 * midiendo 241 px de tinta en el hueco, porque el motor de react-pdf no lo toma como punto de
 * corte. El unico corte que respeta es un salto de linea de verdad. 14 caracteres entran
 * holgados en las dos columnas (18pt en 244pt de ancho, 16pt en 174pt).
 */
const LARGO_MAXIMO = 16;
export const partible = (texto?: string | null): string =>
    (texto ?? '')
        .split(' ')
        .map((p) => (p.length > LARGO_MAXIMO ? (p.match(/.{1,14}/g) ?? [p]).join('\n') : p))
        .join(' ');

// Importante: @react-pdf/renderer no soporta HTML, por lo que usaremos Text para todo.

// Definimos estilos
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    paddingBottom: 20,
    marginBottom: 40,
  },
  logo: {
    maxWidth: 150,
    maxHeight: 70,
    objectFit: 'contain',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerDate: {
    fontSize: 14,
    marginBottom: 2,
  },
  headerDateOut: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  // 🔴 19-sep-2026: las dos columnas no tenian ancho, asi que con un nombre largo de un
  // lado y un modelo largo del otro los dos textos crecian hasta PISARSE. Le paso a
  // Veronica Natalia Baccaro con una "Tarmac SL8 SW Frameset": el comprobante salio con el
  // nombre del cliente encima del de la bici y se lo mandamos asi. Ahora cada columna tiene
  // su ancho y el texto que no entra baja de renglon, que es lo unico que no rompe nada.
  clientBikeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 40,
  },
  clientCol: {
    width: '56%',
    paddingRight: 16,
  },
  bikeCol: {
    width: '40%',
    alignItems: 'flex-end',
  },
  sectionLabel: {
    fontSize: 10,
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#111111',
  },
  clientDetails: {
    fontSize: 12,
    color: '#666666',
  },
  bikeModel: {
    fontSize: 16,
    lineHeight: 1.3,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#111111',
    textAlign: 'right',
  },
  sectionTitleContainer: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DDDDDD',
    paddingBottom: 5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  tableCellLeft: {
    fontSize: 12,
    color: '#444444',
    flex: 1,
  },
  tableCellLeftBold: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333333',
  },
  // Una sola tipografia para TODOS los montos del comprobante (19-sep-2026): antes los de
  // mano de obra salian en Helvetica y los de repuestos y los totales en Courier, en la misma
  // pagina y a dos renglones de distancia. La columna la arma el textAlign, no la monoespaciada.
  tableCellRight: {
    fontSize: 12,
    textAlign: 'right',
  },
  tableCellRightBold: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  laborItem: {
    paddingLeft: 15,
    paddingVertical: 1,
    fontSize: 11,
    color: '#666666',
  },
  laborSubtitle: {
    paddingTop: 10,
    paddingBottom: 2,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#555555',
    textTransform: 'uppercase',
  },
  totalsContainer: {
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 2,
    borderTopColor: '#333333',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333333',
    flexDirection: 'row',
  },
  totalPolicy: {
    fontSize: 11,
    color: '#333333',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333333',
  },
  grandTotalContainer: {
    marginTop: 8,
    paddingTop: 15,
    borderTopWidth: 2,
    borderTopColor: '#333333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333333',
    letterSpacing: 1,
  },
  grandTotalValue: {
    fontSize: 30,
    fontWeight: 'black',
    color: '#333333',
  },
  notesContainer: {
    marginTop: 50,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  notesText: {
    fontSize: 12,
    color: '#555555',
  },
  footer: {
    marginTop: 60,
    textAlign: 'center',
    fontSize: 10,
    letterSpacing: 1,
    color: '#999999',
  },
});

export interface ServiceTicketPDFProps {
  data: {
    logoUrl: string;
    primaryColor: string;
    politicaPago: string;
    jobNo: string;
    dateIn: string;
    dateOut: string | null;
    /** "Entregada el" o "Entrega estimada": la fecha nunca va sin decir cuál es. */
    dateOutLabel?: string | null;
    clientName: string;
    clientDni: string;
    clientPhone: string;
    bikeModel: string;
    serviceType: string;
    basePrice: number;
    laborLines: Array<{ text: string; isSubtitle: boolean }>;
    extraLabor: Array<{ description: string; price: number }>;
    products: Array<{ description: string; price: number }>;
    totalLabor: number;
    totalProducts: number;
    grandTotal: number;
    notes: string;
    tallerName?: string;
  };
}

export const ServiceTicketPDF: React.FC<ServiceTicketPDFProps> = ({ data }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: data.primaryColor }]}>
          <View>
            {data.logoUrl && (
              <Image src={data.logoUrl} style={styles.logo} />
            )}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerSubtitle}>Informe de Servicio</Text>
            <Text style={styles.headerTitle}>Service {data.jobNo}</Text>
            <Text style={styles.headerDate}>Ingreso: {data.dateIn}</Text>
            {data.dateOut && (
              <Text style={[styles.headerDateOut, { color: data.primaryColor }]}>
                {data.dateOutLabel || 'Entrega'}: {data.dateOut}
              </Text>
            )}
          </View>
        </View>

        {/* Client & Bike */}
        <View style={styles.clientBikeRow}>
          <View style={styles.clientCol}>
            <Text style={styles.sectionLabel}>Cliente</Text>
            <Text style={styles.clientName}>{partible(data.clientName)}</Text>
            <Text style={styles.clientDetails}>
              {data.clientDni ? `DNI: ${data.clientDni}` : ''}
              {data.clientDni && data.clientPhone ? ' • ' : ''}
              {data.clientPhone ? `Tel: ${data.clientPhone}` : ''}
            </Text>
          </View>
          <View style={styles.bikeCol}>
            <Text style={styles.sectionLabel}>Bicicleta</Text>
            <Text style={styles.bikeModel}>{partible(data.bikeModel)}</Text>
          </View>
        </View>

        {/* Section 1: Mano de Obra */}
        <View style={styles.sectionTitleContainer}>
          <Text style={[styles.sectionTitle, { color: data.primaryColor }]}>MANO DE OBRA</Text>
        </View>
        
        {/* El precio base se muestra SIEMPRE que exista, aunque el tipo sea "OTRO".
            Antes se ocultaba en ese caso pero igual se sumaba al total: el cliente sumaba las
            líneas del comprobante y no le daba el total. Un taller sin catálogo cargado tiene
            TODAS sus órdenes como "OTRO", así que le pasaba en cada una. (30-jul-2026) */}
        {data.basePrice > 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.tableCellLeftBold}>
              {data.serviceType !== 'OTRO' && data.serviceType !== 'OTHER' ? data.serviceType : 'Service'}
            </Text>
            <Text style={styles.tableCellRightBold}>$ {data.basePrice.toLocaleString('es-AR')}</Text>
          </View>
        )}

        {data.laborLines.map((line, i) => (
          <View key={i}>
            {line.isSubtitle ? (
              <Text style={styles.laborSubtitle}>{line.text}</Text>
            ) : (
              <Text style={styles.laborItem}>• {line.text.replace(/^[-•]\s*/, '')}</Text>
            )}
          </View>
        ))}

        {/* Extra Labor */}
        {data.extraLabor.length > 0 && (
          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEEEEE', paddingTop: 10 }}>
            {data.extraLabor.map((item, i) => (
              <View key={i} style={[styles.tableRow, styles.tableRowBorder]}>
                <Text style={[styles.tableCellLeft, { fontWeight: 'bold', textTransform: 'uppercase', color: '#000000' }]}>
                  {item.description}
                </Text>
                <Text style={[styles.tableCellRight, { fontWeight: 'bold', color: '#000000' }]}>
                  {item.price > 0 ? `$ ${item.price.toLocaleString('es-AR')}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Section 2: Repuestos e Insumos */}
        {data.products.length > 0 && (
          <>
            <View style={[styles.sectionTitleContainer, { marginTop: 20 }]}>
              <Text style={[styles.sectionTitle, { color: data.primaryColor }]}>REPUESTOS E INSUMOS</Text>
            </View>
            {data.products.map((item, i) => (
              <View key={i} style={[styles.tableRow, styles.tableRowBorder]}>
                <Text style={styles.tableCellLeft}>{item.description}</Text>
                <Text style={styles.tableCellRight}>
                  {item.price > 0 ? `$ ${item.price.toLocaleString('es-AR')}` : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.totalLabel}>TOTAL MANO DE OBRA</Text>
              {data.politicaPago && (
                <Text style={styles.totalPolicy}> {data.politicaPago}</Text>
              )}
            </View>
            <Text style={styles.totalValue}>$ {data.totalLabor.toLocaleString('es-AR')}</Text>
          </View>
          
          <View style={[styles.totalRow, { marginBottom: 20 }]}>
            <Text style={styles.totalLabel}>TOTAL REPUESTOS</Text>
            <Text style={styles.totalValue}>$ {data.totalProducts.toLocaleString('es-AR')}</Text>
          </View>

          {/* El numero grande iba SOLO, sin decir de que era: el que lo lee tiene que
              deducirlo sumando las dos lineas de arriba. Ahora lleva su etiqueta. */}
          <View style={styles.grandTotalContainer}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotalValue}>$ {data.grandTotal.toLocaleString('es-AR')}</Text>
          </View>
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.sectionLabel}>Observaciones</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>{(data.tallerName || 'SERVICE CENTER').toUpperCase()}</Text>

      </Page>
    </Document>
  );
};
