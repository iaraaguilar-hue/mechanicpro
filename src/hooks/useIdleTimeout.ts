import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';

// ─── Configuration ───────────────────────────────────────────────────────────
/** 6 hours in milliseconds */
const IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 21 600 000 ms

/** Minimum gap between timer resets triggered by pointer/key events (ms).
 *  Prevents flooding the browser when the user moves the mouse continuously. */
const THROTTLE_MS = 1_000; // reset at most once per second

/** Activity events that prove the user is present at the keyboard/screen. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
    'mousemove',
    'mousedown',
    'keypress',
    'touchmove',
    'scroll',
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useIdleTimeout
 *
 * Watches for user inactivity and performs a full logout after IDLE_TIMEOUT_MS.
 * Should only be active when the user is authenticated (i.e., inside a
 * protected route/component — for Mechanic Pro, inject it at the top of
 * `AppContent` in App.tsx).
 *
 * Strategy:
 *  - A `setTimeout` fires the logout after 6 hours of silence.
 *  - Any activity event resets the timer (throttled to once/second).
 *  - All listeners and timer IDs are cleaned up on unmount.
 */
export function useIdleTimeout() {
    const logout = useAuthStore((s) => s.logout);
    const invalidate = useDataStore((s) => s.invalidate);

    // Refs so callbacks never go stale and we avoid re-render churn.
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastActivityTs = useRef<number>(Date.now());

    // ── Logout action ─────────────────────────────────────────────────────────
    const performLogout = useCallback(async () => {
        console.warn('[useIdleTimeout] ⏱️ Session expired due to inactivity. Logging out…');

        // 1. Server-side: invalidate the Supabase JWT / refresh token.
        await supabase.auth.signOut();

        // 2. Client-side: wipe Zustand stores so no stale data lingers.
        logout();
        invalidate();

        // 3. Redirect to login — window.location.href guarantees a full React
        //    state reset even if navigate() would be intercepted by a guard.
        window.location.href = '/';
    }, [logout, invalidate]);

    // ── Timer management ──────────────────────────────────────────────────────
    const resetTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(performLogout, IDLE_TIMEOUT_MS);
    }, [performLogout]);

    // Throttled handler — resets the timer at most once per THROTTLE_MS.
    const handleActivity = useCallback(() => {
        const now = Date.now();
        if (now - lastActivityTs.current < THROTTLE_MS) return; // too soon, skip
        lastActivityTs.current = now;
        resetTimer();
    }, [resetTimer]);

    // ── Effect: mount / unmount ───────────────────────────────────────────────
    useEffect(() => {
        // Start the initial countdown.
        resetTimer();

        // Register listeners on the window so they capture events from all children.
        ACTIVITY_EVENTS.forEach((event) =>
            window.addEventListener(event, handleActivity, { passive: true }),
        );

        // Cleanup: remove listeners and cancel any pending timeout on unmount.
        return () => {
            ACTIVITY_EVENTS.forEach((event) =>
                window.removeEventListener(event, handleActivity),
            );
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [handleActivity, resetTimer]);
}
