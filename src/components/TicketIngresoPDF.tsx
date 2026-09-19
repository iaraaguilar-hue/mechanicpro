import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { partible } from '@/components/ServiceTicketPDF';

// ─────────────────────────────────────────────────────────────
// EL TICKET DE INGRESO: una hoja A4 que se corta al medio.
//
// Lo pidió Alejo, el mecánico de 11 a Fondo (el único taller que paga), el 10-sep-2026:
// "informe tipo ticket mas resumido como comprobante para el cliente y como checklist para el
// mecanico. que imprima una hoja a 4 que tenga ambos dos para cortarlo a la mitad".
//
// Las dos mitades NO dicen lo mismo, y esa es la gracia (decisión de Iara, 19-sep):
//   · ARRIBA, el cliente: qué dejó, para cuándo está, qué se le va a hacer. Sin jerga y sin
//     casilleros. Es el papel que se lleva para quedarse tranquilo.
//   · ABAJO, el mecánico: la misma orden como CHECKLIST, con casilleros para tildar, el
//     teléfono del cliente a mano y renglones en blanco para anotar lo que aparezca.
//
// 🔴 LAS NOTAS INTERNAS VAN SOLO EN LA MITAD DE ABAJO (decisión de Iara, 19-sep). Es la única
// superficie del sistema donde salen impresas, así que la mitad del taller va rotulada
// "QUEDA EN EL TALLER" y la línea de corte es bien visible: una hoja sin cortar le entrega al
// cliente lo que el taller escribió para adentro.
// ─────────────────────────────────────────────────────────────

const GRIS = '#888888';
const TINTA = '#111111';

const styles = StyleSheet.create({
    page: { paddingVertical: 24, paddingHorizontal: 34, fontFamily: 'Helvetica', backgroundColor: '#FFFFFF' },
    mitad: { height: 372 },
    encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, paddingBottom: 10, marginBottom: 14 },
    logo: { maxWidth: 110, maxHeight: 40, objectFit: 'contain' },
    tallerTexto: { fontSize: 15, fontWeight: 'bold', color: TINTA },
    encabezadoDer: { alignItems: 'flex-end' },
    kicker: { fontSize: 8, color: GRIS, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
    orden: { fontSize: 15, fontWeight: 'bold', color: TINTA },

    fila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    col: { width: '48%' },
    etiqueta: { fontSize: 7.5, color: GRIS, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
    dato: { fontSize: 12, fontWeight: 'bold', color: TINTA },
    datoChico: { fontSize: 9.5, color: '#555555', marginTop: 2 },

    bloque: { marginBottom: 10 },
    titulo: { fontSize: 8.5, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#DDDDDD' },
    item: { fontSize: 10, color: '#333333', marginBottom: 3 },
    // 🔴 El casillero se DIBUJA, no se escribe: el caracter ☐ (U+2610) no existe en Helvetica
    // y el PDF lo renderiza como un hueco. La primera version salio con los renglones del
    // checklist sin ningun cuadradito, o sea sin checklist.
    filaChecklist: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    casillero: { width: 9, height: 9, borderWidth: 1, borderColor: '#666666', marginRight: 7 },
    itemChecklist: { fontSize: 10, color: TINTA, flex: 1 },
    renglon: { borderBottomWidth: 1, borderBottomColor: '#DDDDDD', height: 15 },

    corte: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
    corteLinea: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#BBBBBB', borderBottomDashed: true },
    corteTexto: { fontSize: 7, color: GRIS, marginHorizontal: 6, letterSpacing: 1 },

    pie: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    pieTexto: { fontSize: 8, color: GRIS },
    selloTaller: { fontSize: 7.5, fontWeight: 'bold', color: '#B0342B', textTransform: 'uppercase', letterSpacing: 1 },
});

export interface TicketIngresoProps {
    data: {
        logoUrl: string;
        primaryColor: string;
        tallerName: string;
        tallerTelefono?: string | null;
        jobNo: string;
        dateIn: string;
        /** "22/09/2026 18:00" o null si todavía no se prometió fecha. */
        entregaEstimada?: string | null;
        clientName: string;
        clientPhone: string;
        /** Lo que dejó: la bici entera, o la pieza suelta si trajo solo eso. */
        bikeModel: string;
        serviceType: string;
        /** Lo que incluye el service + lo que se agregó: es el checklist del mecánico. */
        trabajos: string[];
        /** Lo que dijo el cliente / lo que ve el cliente. Nunca las internas. */
        notasCliente: string;
        /** 🔴 Solo se dibuja en la mitad de abajo. */
        notasInternas: string;
        presupuesto?: number | null;
    };
}

const Corte: React.FC = () => (
    <View style={styles.corte}>
        <View style={styles.corteLinea} />
        <Text style={styles.corteTexto}>CORTAR POR ACA</Text>
        <View style={styles.corteLinea} />
    </View>
);

export const TicketIngresoPDF: React.FC<TicketIngresoProps> = ({ data }) => {
    const {
        logoUrl, primaryColor, tallerName, tallerTelefono, jobNo, dateIn, entregaEstimada,
        clientName, clientPhone, bikeModel, serviceType, trabajos, notasCliente, notasInternas, presupuesto,
    } = data;

    const Encabezado: React.FC<{ kicker: string; sello?: string }> = ({ kicker, sello }) => (
        <View style={[styles.encabezado, { borderBottomColor: primaryColor }]}>
            <View>
                {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : <Text style={styles.tallerTexto}>{tallerName}</Text>}
                {sello ? <Text style={[styles.selloTaller, { marginTop: 4 }]}>{sello}</Text> : null}
            </View>
            <View style={styles.encabezadoDer}>
                <Text style={styles.kicker}>{kicker}</Text>
                <Text style={styles.orden}>Orden {jobNo}</Text>
                <Text style={styles.datoChico}>Ingreso: {dateIn}</Text>
                {entregaEstimada ? (
                    <Text style={[styles.datoChico, { color: primaryColor, fontWeight: 'bold' }]}>
                        Entrega estimada: {entregaEstimada}
                    </Text>
                ) : null}
            </View>
        </View>
    );

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* ── ARRIBA: lo que se lleva el CLIENTE ───────────────────────── */}
                <View style={styles.mitad}>
                    <Encabezado kicker="Comprobante de ingreso" />

                    <View style={styles.fila}>
                        <View style={styles.col}>
                            <Text style={styles.etiqueta}>Cliente</Text>
                            <Text style={styles.dato}>{partible(clientName)}</Text>
                        </View>
                        <View style={[styles.col, { alignItems: 'flex-end' }]}>
                            <Text style={styles.etiqueta}>Lo que dejaste</Text>
                            <Text style={[styles.dato, { textAlign: 'right' }]}>{partible(bikeModel)}</Text>
                        </View>
                    </View>

                    <View style={styles.bloque}>
                        <Text style={[styles.titulo, { color: primaryColor }]}>Qué le vamos a hacer</Text>
                        <Text style={styles.item}>{serviceType}</Text>
                        {trabajos.slice(0, 6).map((t, i) => (
                            <Text key={i} style={styles.item}>· {t}</Text>
                        ))}
                    </View>

                    {notasCliente ? (
                        <View style={styles.bloque}>
                            <Text style={[styles.titulo, { color: primaryColor }]}>Lo que nos dijiste</Text>
                            <Text style={styles.item}>{notasCliente}</Text>
                        </View>
                    ) : null}

                    {presupuesto ? (
                        <View style={styles.fila}>
                            <Text style={styles.etiqueta}>Presupuesto estimado</Text>
                            <Text style={styles.dato}>$ {presupuesto.toLocaleString('es-AR')}</Text>
                        </View>
                    ) : null}

                    <View style={styles.pie}>
                        <Text style={styles.pieTexto}>
                            {tallerTelefono ? `Cualquier cosa escribinos: ${tallerTelefono}` : 'Cualquier cosa, escribinos.'}
                        </Text>
                        <Text style={styles.pieTexto}>{tallerName}</Text>
                    </View>
                </View>

                <Corte />

                {/* ── ABAJO: la copia del TALLER, que además es el checklist ───── */}
                <View style={styles.mitad}>
                    <Encabezado kicker="Checklist del taller" sello="Queda en el taller" />

                    <View style={styles.fila}>
                        <View style={styles.col}>
                            <Text style={styles.etiqueta}>Cliente</Text>
                            <Text style={styles.dato}>{partible(clientName)}</Text>
                            {clientPhone ? <Text style={styles.datoChico}>{clientPhone}</Text> : null}
                        </View>
                        <View style={[styles.col, { alignItems: 'flex-end' }]}>
                            <Text style={styles.etiqueta}>Bici</Text>
                            <Text style={[styles.dato, { textAlign: 'right' }]}>{partible(bikeModel)}</Text>
                        </View>
                    </View>

                    <View style={styles.bloque}>
                        <Text style={[styles.titulo, { color: primaryColor }]}>{serviceType}</Text>
                        {(trabajos.length > 0 ? trabajos.slice(0, 8) : ['', '', '']).map((t, i) => (
                            <View key={i} style={styles.filaChecklist}>
                                <View style={styles.casillero} />
                                {t
                                    ? <Text style={styles.itemChecklist}>{t}</Text>
                                    : <View style={[styles.renglon, { flex: 1, height: 11 }]} />}
                            </View>
                        ))}
                    </View>

                    {notasInternas ? (
                        <View style={styles.bloque}>
                            <Text style={[styles.titulo, { color: primaryColor }]}>Notas internas</Text>
                            <Text style={styles.item}>{notasInternas}</Text>
                        </View>
                    ) : null}

                    <View style={styles.bloque}>
                        <Text style={[styles.titulo, { color: primaryColor }]}>Lo que aparezca</Text>
                        <View style={styles.renglon} />
                        <View style={styles.renglon} />
                        <View style={styles.renglon} />
                    </View>
                </View>
            </Page>
        </Document>
    );
};
