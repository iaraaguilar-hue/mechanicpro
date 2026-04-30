import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';

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
  clientBikeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  sectionLabel: {
    fontSize: 10,
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  clientName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#111111',
  },
  clientDetails: {
    fontSize: 12,
    color: '#666666',
  },
  bikeModel: {
    fontSize: 20,
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
  tableCellRight: {
    fontSize: 12,
    textAlign: 'right',
    fontFamily: 'Courier',
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
    fontFamily: 'Courier',
  },
  grandTotalContainer: {
    marginTop: 8,
    paddingTop: 15,
    borderTopWidth: 2,
    borderTopColor: '#333333',
    alignItems: 'flex-end',
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
    color: '#CCCCCC',
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
                Entrega: {data.dateOut}
              </Text>
            )}
          </View>
        </View>

        {/* Client & Bike */}
        <View style={styles.clientBikeRow}>
          <View>
            <Text style={styles.sectionLabel}>Cliente</Text>
            <Text style={styles.clientName}>{data.clientName}</Text>
            <Text style={styles.clientDetails}>
              {data.clientDni ? `DNI: ${data.clientDni}` : ''}
              {data.clientDni && data.clientPhone ? ' • ' : ''}
              {data.clientPhone ? `Tel: ${data.clientPhone}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.sectionLabel}>Bicicleta</Text>
            <Text style={styles.bikeModel}>{data.bikeModel}</Text>
          </View>
        </View>

        {/* Section 1: Mano de Obra */}
        <View style={styles.sectionTitleContainer}>
          <Text style={[styles.sectionTitle, { color: data.primaryColor }]}>MANO DE OBRA</Text>
        </View>
        
        {data.serviceType !== 'OTRO' && data.serviceType !== 'OTHER' && (
          <View style={styles.tableRow}>
            <Text style={styles.tableCellLeftBold}>{data.serviceType}</Text>
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

          <View style={styles.grandTotalContainer}>
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
        <Text style={styles.footer}>PROBIKES SERVICE CENTER</Text>

      </Page>
    </Document>
  );
};
