
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import Reception from "./pages/Reception";
import Workshop from "./pages/Workshop";
import HomePage from "./pages/Home";
import ServiceJob from "./pages/ServiceJob";
import BikeDetail from "./pages/BikeDetail";
import HistoryPage from "./pages/History";
import Admin from "./pages/Admin";
import RetentionEngine from "./pages/RetentionEngine";
import LoginScreen from "./pages/LoginScreen";
import UpdatePasswordScreen from "./pages/UpdatePasswordScreen";
import DeletedServices from "./pages/DeletedServices";
import Metrics from "./pages/Metrics";
import SuperAdmin from "./pages/SuperAdmin";
import { Button } from "@/components/ui/button";
import { Home, ClipboardList, Settings, Wrench, History, Bell, LogOut, BarChart3, Trash2 } from "lucide-react";



import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { supabase } from "@/lib/supabase";
import { hexToHslSpaceSeparated } from "@/lib/utils";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { UpdateBanner } from "@/components/UpdateBanner";

function AppContent() {
  const { updateAvailable } = useVersionCheck();
  const session = useAuthStore((state) => state.session);


  const nombre = useAuthStore((state) => state.nombre);
  const logout = useAuthStore((state) => state.logout);
  const rol = useAuthStore((state) => state.rol);
  const taller = useAuthStore((state) => state.taller);
  const setAuth = useAuthStore((state) => state.setAuth);
  const fetchDashboardData = useDataStore((state) => state.fetchDashboardData);
  const invalidateData = useDataStore((state) => state.invalidate);
  const navigate = useNavigate();

  // (localStorage migrations removed — data now comes from Supabase)

  // Inyección de Theme de Marca Blanca
  useEffect(() => {
    if (taller) {
      if (taller.color_primario) {
        document.documentElement.style.setProperty('--theme-primary', hexToHslSpaceSeparated(taller.color_primario));
      }
      if (taller.color_secundario) {
        document.documentElement.style.setProperty('--theme-secondary', hexToHslSpaceSeparated(taller.color_secundario));
      }
    } else {
      document.documentElement.style.removeProperty('--theme-primary');
      document.documentElement.style.removeProperty('--theme-secondary');
    }
  }, [taller]);

  // Global Auth Listener and Session Restoration (Hydration)
  useEffect(() => {
    let isMounted = true;

    const inicializarApp = async () => {
      try {
        // 1. Intentamos obtener la sesión
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (currentSession && isMounted) {
          // Fetch user profile to hydrate Zustand role/name
          const { data: userData } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', currentSession.user.id)
            .single();

          if (userData && isMounted) {
            let tallerData = null;
            if (userData.taller_id) {
              const { data: td } = await supabase.from('talleres').select('*').eq('id', userData.taller_id).single();
              tallerData = td;
            }
            setAuth(currentSession, userData.taller_id, userData.rol, userData.nombre, tallerData);
            // ── HIDRATACIÓN: dispara el fetch a Supabase con el taller_id confirmado ──
            console.log('[App] ✅ Auth confirmado. Disparando hidratación de datos...');
            if (userData.taller_id) fetchDashboardData(userData.taller_id);
          }
        }
      } catch (error) {
        console.error("Error al conectar con Supabase:", error);
      }
    };

    inicializarApp();

    // 3. Dejamos el escuchador activo
    const { data: listener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate("/update-password");
      }
      if (event === 'SIGNED_OUT') {
        logout();
        invalidateData(); // Limpiar todos los arrays de datos al desloguearse
        navigate("/");
      }

      // IGNORAMOS DELIBERADAMENTE EL EVENTO 'SIGNED_IN' AQUÍ.
      // Dejamos que LoginScreen.tsx termine su ciclo (Paso 1 al 7) en paz sin ser desmontado prematuramente.
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    logout();
    invalidateData();
    navigate("/");
  };

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<LoginScreen />} />
        <Route path="/update-password" element={<UpdatePasswordScreen />} />
      </Routes>
    );
  }

  // Obtenemos el nombre del usuario (o fallback al email)
  const userEmail = session.user.email || "";
  const fallbackName = userEmail.split('@')[0];
  const rawName = nombre || fallbackName;
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* 🔒 Idle-timeout guardian — active only when session exists */}
      <IdleGuard />
      {updateAvailable && <UpdateBanner />}

      {/* Sidebar / Navigation */}
      <nav className="w-full md:w-28 border-r border-border bg-card flex md:flex-col items-center py-4 space-x-4 md:space-x-0 md:space-y-4 sticky top-0 z-10 h-16 md:h-screen justify-center md:justify-start overflow-x-auto md:overflow-y-auto">
        <div className="hidden md:block mb-6 text-center w-full px-2 shrink-0">
          <div className="flex flex-col items-center justify-center mb-2 mt-2 w-full">
            {taller?.logo_url ? (
              <div className="h-16 w-full flex justify-center items-center mb-2 px-2">
                <img src={taller.logo_url} alt="Logo Taller" className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <Wrench className="h-8 w-8 text-primary mb-2" />
            )}
            <span className="font-bold text-gray-900 text-sm tracking-wide">Mechanic Pro</span>
          </div>
          {displayName && <div className="text-[10px] text-muted-foreground mt-1 font-mono uppercase tracking-widest break-all px-1">{displayName}</div>}
        </div>

        <div className="flex-1 flex md:flex-col items-center space-x-4 md:space-x-0 md:space-y-4 justify-center md:justify-start">
          <Link to="/">
            <NavButton icon={<Home />} label="Inicio" />
          </Link>
          <Link to="/reception">
            <NavButton icon={<ClipboardList />} label="Recepción" />
          </Link>
          <Link to="/workshop">
            <NavButton icon={<Wrench />} label="Taller" />
          </Link>
          <Link to="/history">
            <NavButton icon={<History />} label="Historial" />
          </Link>
          <Link to="/reminders">
            <NavButton icon={<Bell />} label="Motor Retención" />
          </Link>
          <Link to="/metrics">
            <NavButton icon={<BarChart3 />} label="Métricas" />
          </Link>
          <Link to="/admin">
            <NavButton icon={<Settings />} label="Admin" />
          </Link>
          {rol?.toLowerCase()?.trim() === 'admin' && taller?.plan_actual !== 'Sport' && (
            <Link to="/auditoria">
              <NavButton icon={<Trash2 />} label="Auditoría (Admin)" />
            </Link>
          )}
          {rol?.toLowerCase()?.trim() === 'super_admin' && (
            <Link to="/superadmin">
              <NavButton icon={<Settings />} label="Super Admin" />
            </Link>
          )}
        </div>

        {/* Logout Button */}
        <div className="md:mt-auto md:pb-8 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-full"
            title="Cerrar Sesión"
            onClick={handleLogout}
          >
            <LogOut size={20} />
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/update-password" element={<UpdatePasswordScreen />} />
          <Route path="/reception" element={<Reception />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/reminders" element={<RetentionEngine />} />
          <Route path="/bikes/:id" element={<BikeDetail />} />
          <Route path="/clients/:clientId" element={<BikeDetail />} />
          <Route path="/service/:id" element={<ServiceJob />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/auditoria" element={<DeletedServices />} />
          <Route path="/superadmin" element={<SuperAdmin />} />
        </Routes>
      </main>
    </div>
  );
}

/** Thin wrapper so useIdleTimeout is called unconditionally at a fixed
 *  component level, but the component itself is only mounted when the
 *  user is authenticated (rendered inside the protected layout above). */
function IdleGuard() {
  useIdleTimeout();
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

function NavButton({ icon, label }: { icon: any, label: string }) {
  return (
    <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10" title={label}>
      {icon}
    </Button>
  )
}

export default App
