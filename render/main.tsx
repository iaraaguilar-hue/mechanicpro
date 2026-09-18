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
import RespuestaIA from '@/components/RespuestaIA';
import { serviciosDePrueba, ordenDePrueba, clienteDePrueba } from './datos';

// Las respuestas REALES que recibió Leira Bikes (preguntas_taller, 10 al 17-sep-2026),
// con los nombres cambiados. Son el material con el que hay que mirar el diseño: si se
// ve bien con una lista de cinco órdenes a las 11 de la noche, se ve bien.
const CHARLA_DE_PRUEBA = [
    {
        pregunta: 'que bicis faltan hacer',
        respuesta: 'Faltan hacer **2**, y hay **1 lista para entregar** (3 en el taller):\n\nEn proceso:\n- #19 - Jose Alvarez - la Epic Pro blanca - lavado y lubricación - prometida ayer 15/09 (vencida)\n- #21 - Ariel Rodríguez - la Epic 8 S-Works - actualización software del Turbo Levo - prometida mañana 17/09\n\nLista para entregar:\n- #22 - Ariel Rodríguez - la Epic 8 S-Works - service completo con suspensión delantera',
        herramientas: 'órdenes',
    },
    {
        pregunta: 'que numero de orden tienen las bicis de jose alvarez',
        respuesta: 'Jose Alvarez tiene dos órdenes: la **#19** (Epic Pro blanca, lavado y lubricación, en proceso) y la **#3** del 09/09, ya entregada, por $370.000.',
        herramientas: 'clientes · historial',
    },
];

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
    // El chat: se mira con el molde REAL de la pantalla (burbuja de la pregunta,
    // respuesta sin caja, pie de procedencia). 🚩 Espejo de pages/PreguntaleTaller.tsx.
    if (cual === 'chat') {
        return (
            <Marco ancho={760}>
                <div className="space-y-5 font-sans">
                    {CHARLA_DE_PRUEBA.map((t, i) => (
                        <div key={i} className="group space-y-3 pb-2">
                            <div className="flex justify-end">
                                <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm max-w-[85%]">
                                    {t.pregunta}
                                </div>
                            </div>
                            <div className="pr-4 sm:pr-10">
                                <RespuestaIA texto={t.respuesta} />
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4">
                                    <span className="text-[11px] text-muted-foreground/70">Se apoyó en {t.herramientas}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Marco>
        );
    }
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
