// STUB de `@/lib/supabase` — SOLO para la página de render de video (render/).
//
// El real hace `throw new Error('Faltan las variables de entorno de Supabase.')` cuando no
// hay VITE_SUPABASE_URL, así que cualquier componente que lo arrastre en su cadena de
// imports explota al montarse fuera de la app. Eso era lo que bloqueaba la mitad de los
// componentes para la capa de datos de los videos.
//
// Acá no hay base de datos ni sesión: devuelve vacío y no falla nunca. Si un componente
// necesita datos, se los pasás por props desde `render/datos.ts` (datos de PRUEBA).
//
// 🚩 Este archivo NO entra al bundle de la app: solo lo alias `vite.config.render.ts`.

const respuestaVacia = { data: [], error: null };

function cadena(): any {
    const self: any = new Proxy({}, {
        get(_t, prop) {
            if (prop === 'then') return undefined;              // no es una promesa
            if (prop === 'single' || prop === 'maybeSingle') {
                return async () => ({ data: null, error: null });
            }
            return () => self;                                   // .from().select().eq()... encadena
        },
    });
    // que un `await` sobre la cadena devuelva { data: [], error: null }
    self.then = (res: any) => Promise.resolve(respuestaVacia).then(res);
    return self;
}

export const supabase: any = {
    from: () => cadena(),
    rpc: async () => respuestaVacia,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
    auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
};
