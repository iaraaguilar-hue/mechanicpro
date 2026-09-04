// LA PÁGINA DE RENDER — monta componentes REALES de Mechanic Pro para la capa de datos
// de los videos. No es parte de la app: es el "set de filmación" del producto.
//
// Por qué esto y no un screenshot: el screenshot se pixela al agrandar, se anima a mano,
// muestra los datos que había ese día y envejece cuando cambia la app. El componente real
// se renderiza al tamaño que quieras, se anima solo y siempre es el producto de HOY.
//
// Uso:  ?c=<componente>&fondo=<transparente|claro>&escala=<n>
//   c=metrics   → ExpertMetrics (los números del taller)
//   c=orden     → JobCard (la orden de trabajo), abierta
//
// El capturador espera a que aparezca [data-listo] para saber que ya se puede fotografiar.

import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';

import ExpertMetrics from '@/components/ExpertMetrics';
import JobCard from '@/components/JobCard';
import { serviciosDePrueba, ordenDePrueba, clienteDePrueba } from './datos';

const params = new URLSearchParams(location.search);
const cual = params.get('c') || 'metrics';
const fondo = params.get('fondo') || 'transparente';
const escala = Number(params.get('escala') || 1);
// Cuánto espera antes de declararse listo. Recharts anima al montar (~1,5 s), así que una
// captura estática tiene que esperar; una secuencia de video NO (quiere ver esa animación).
const esperaMs = Number(params.get('espera') ?? 1800);

function Marco({ ancho, children }: { ancho: number; children: React.ReactNode }) {
    useEffect(() => {
        const t = setTimeout(() => document.body.setAttribute('data-listo', '1'), esperaMs);
        return () => clearTimeout(t);
    }, []);
    return (
        <div
            id="pieza"
            style={{
                width: ancho,
                transform: escala !== 1 ? `scale(${escala})` : undefined,
                transformOrigin: 'top left',
                padding: 24,
            }}
        >
            {children}
        </div>
    );
}

function App() {
    if (cual === 'orden') {
        return (
            <Marco ancho={720}>
                <JobCard job={ordenDePrueba} client={clienteDePrueba} bikeModel="Rockhopper 29" />
            </Marco>
        );
    }
    return (
        <Marco ancho={1400}>
            <ExpertMetrics
                tallerId="taller-de-prueba"
                stats={{}}
                servicios={serviciosDePrueba}
                isLoading={false}
            />
        </Marco>
    );
}

// Fondo: transparente es el default porque la capa se superpone al video con ffmpeg.
if (fondo === 'transparente') {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
} else {
    document.body.style.background = '#f8fafc';
}

// Sin StrictMode a propósito: en dev monta dos veces y re-dispara las animaciones de
// recharts justo cuando el capturador está mirando.
createRoot(document.getElementById('root')!).render(<App />);
