import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { type SupabaseService, type SupabaseBike } from '@/store/dataStore';
import { formatOrdenNumber } from '@/lib/formatId';
import { useAuthStore } from '@/store/authStore';

const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        padding: 30,
        fontFamily: 'Helvetica',
    },
    header: {
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#000',
        paddingBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    subtitle: {
        fontSize: 12,
        color: '#666',
    },
    section: {
        margin: 10,
        padding: 10,
    },
    row: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    label: {
        width: 100,
        fontWeight: 'bold',
        fontSize: 10,
        color: '#666',
    },
    value: {
        flex: 1,
        fontSize: 11,
    },
    checklist: {
        marginTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#EEE',
        paddingTop: 10,
    },
    checklistItem: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 30,
        right: 30,
        textAlign: 'center',
        fontSize: 10,
        color: '#999',
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logo: {
        maxHeight: 40,
        maxWidth: 120,
        objectFit: 'contain',
        marginRight: 10,
    }
});

interface ServiceReportProps {
    service: SupabaseService;
    bike: SupabaseBike;
    clientName: string;
}

export const ServiceReport = ({ service, bike, clientName }: ServiceReportProps) => {
    const taller = useAuthStore((state) => state.taller);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        {taller?.logo_url && (
                            <Image src={taller.logo_url} style={styles.logo} />
                        )}
                        <View>
                            <Text style={[styles.title, { color: taller?.color_primario || '#000' }]}>
                                {taller?.nombre || 'MechanicPro'}
                            </Text>
                            <Text style={styles.subtitle}>Informe de Servicio Técnico</Text>
                        </View>
                    </View>
                    <Text style={{ fontSize: 10 }}>{formatOrdenNumber(service.numero_orden, service.id)}</Text>
                </View>

                <View style={styles.section}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Cliente:</Text>
                        <Text style={styles.value}>{clientName}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Bicicleta:</Text>
                        <Text style={styles.value}>{bike.marca} {bike.modelo}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Transmisión:</Text>
                        <Text style={styles.value}>{bike.transmision}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Tipo de Servicio:</Text>
                        <Text style={styles.value}>{service.tipo_servicio}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Fecha:</Text>
                        <Text style={styles.value}>{service.fecha_entrega ? new Date(service.fecha_entrega).toLocaleDateString("es-AR") : "En Curso"}</Text>
                    </View>
                </View>

                <View style={[styles.section, styles.checklist]}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>Trabajos Realizados</Text>
                    {service.checklist_data && Object.entries(service.checklist_data).map(([task, done]) => (
                        <View key={task} style={styles.checklistItem}>
                            <Text style={{ width: 20 }}>{done ? "[X]" : "[ ]"}</Text>
                            <Text style={{ fontSize: 11 }}>{task}</Text>
                        </View>
                    ))}
                </View>

                {service.notas_mecanico && (
                    <View style={styles.section}>
                        <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>Observaciones del Mecánico</Text>
                        <Text style={styles.value}>{service.notas_mecanico}</Text>
                    </View>
                )}

                <Text style={styles.footer}>Gracias por confiar en {taller?.nombre || 'MechanicPro'}. Mantenga su bicicleta rodando.</Text>
            </Page>
        </Document>
    );
};
