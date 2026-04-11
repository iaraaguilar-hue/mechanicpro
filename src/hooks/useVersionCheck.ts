import { useEffect, useRef, useState, useCallback } from 'react';

const POLL_INTERVAL = 5 * 60 * 1000;       // chequea cada 5 minutos
const INACTIVITY_THRESHOLD = 10 * 60 * 1000; // recarga silenciosa si 10 min sin actividad

export function useVersionCheck() {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const currentEtag = useRef<string | null>(null);
    const lastActivity = useRef<number>(Date.now());

    // Rastrear actividad del usuario
    useEffect(() => {
        const recordActivity = () => { lastActivity.current = Date.now(); };
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        events.forEach(e => window.addEventListener(e, recordActivity, { passive: true }));
        return () => events.forEach(e => window.removeEventListener(e, recordActivity));
    }, []);

    const checkForUpdate = useCallback(async () => {
        try {
            const res = await fetch('/', { method: 'HEAD', cache: 'no-store' });
            const etag = res.headers.get('etag') || res.headers.get('last-modified');
            if (!etag) return;

            if (currentEtag.current === null) {
                // Primera vez: guardamos la versión actual
                currentEtag.current = etag;
                return;
            }

            if (etag !== currentEtag.current) {
                const isInactive = Date.now() - lastActivity.current > INACTIVITY_THRESHOLD;
                if (isInactive) {
                    window.location.reload();
                } else {
                    setUpdateAvailable(true);
                }
            }
        } catch {
            // Error de red — ignorar silenciosamente
        }
    }, []);

    useEffect(() => {
        checkForUpdate();
        const interval = setInterval(checkForUpdate, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [checkForUpdate]);

    return { updateAvailable };
}
