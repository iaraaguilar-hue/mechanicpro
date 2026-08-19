
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import Workshop from "./pages/Workshop";
import HomePage from "./pages/Home";
import ServiceJob from "./pages/ServiceJob";
import BikeDetail from "./pages/BikeDetail";
import HistoryPage from "./pages/History";
import RetentionEngine from "./pages/RetentionEngine";
import LoginScreen from "./pages/LoginScreen";
import UpdatePasswordScreen from "./pages/UpdatePasswordScreen";
import DeletedServices from "./pages/DeletedServices";
import Metrics from "./pages/Metrics";
import SuperAdmin from "./pages/SuperAdmin";
import Configuracion from "./pages/Configuracion";
import BicisParadas from "./pages/BicisParadas";
import PreguntaleTaller from "./pages/PreguntaleTaller";
import { Button } from "@/components/ui/button";
import { Settings, Wrench, History, Repeat, LogOut, BarChart3, Trash2, Menu, User, X, Users, Bike, MessageCircleQuestion } from "lucide-react";
import { tieneFeature } from "@/lib/planFeatures";



import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { supabase } from "@/lib/supabase";
import { hexToHslSpaceSeparated } from "@/lib/utils";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { UpdateBanner } from "@/components/UpdateBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { NovedadesPopup } from "@/components/NovedadesPopup";
import { OnboardingTour } from "@/components/OnboardingTour";

function AppContent() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
    // CRITICAL: Wipe stores BEFORE signOut to prevent cross-tenant data leakage
    logout();
    invalidateData();
    await supabase.auth.signOut();
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

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* 🔒 Idle-timeout guardian — active only when session exists */}
      <IdleGuard />
      {updateAvailable && <UpdateBanner />}
      {/* Pop-up de novedades al abrir la app — 1 vez por dispositivo (Tarea C) */}
      <NovedadesPopup />
      {/* Recorrido de bienvenida — 1 vez por dispositivo; repetible desde Configuración */}
      <OnboardingTour />

      {/* ── MOBILE HEADER (visible only on < md) ── */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-50">
        <button
          data-tour="menu-mobile"
          className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md active:bg-slate-200 transition-colors"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu size={24} />
        </button>
        <div className="flex-1 flex justify-center">
          {taller?.logo_url ? (
            <img src={taller.logo_url} alt="MechanicPro" className="h-8 object-contain" />
          ) : (
            <img src="/logo-mechanic-pro-trim.png" alt="MechanicPro" className="h-8 object-contain" />
          )}
        </div>
        <div className="flex items-center gap-1 -mr-2">
          {/* Centro de notificaciones */}
          <div data-tour="notificaciones-mobile"><NotificationBell variant="mobile" /></div>

          {/* User dropdown */}
          <div className="relative">
            <button
              className="p-2 text-slate-600"
              aria-label="Perfil"
              onClick={() => { setUserMenuOpen(o => !o); }}
            >
              <User size={20} />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 z-[60] py-2 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-800 truncate">{displayName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{session?.user?.email}</p>
                </div>
                <Link
                  to="/configuracion"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User size={15} className="text-slate-400" /> Mi Perfil
                </Link>
                <Link
                  to="/configuracion"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings size={15} className="text-slate-400" /> Ajustes del Taller
                </Link>
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button
                    onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={15} /> Cerrar Sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          {/* Drawer panel */}
          <div className="relative flex flex-col w-72 max-w-[80vw] h-full bg-card shadow-2xl overflow-y-auto">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex flex-col">
                {taller?.logo_url ? (
                  <img src={taller.logo_url} alt="Logo Taller" className="h-10 object-contain mb-1" />
                ) : (
                  <img src="/logo-mechanic-pro-trim.png" alt="MechanicPro" className="h-10 object-contain mb-1" />
                )}
                {displayName && <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest">{displayName}</span>}
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                aria-label="Cerrar menú"
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
              <DrawerLink to="/" icon={<Wrench size={20} />} label="Taller Activo" onClick={closeDrawer} />
              <DrawerLink to="/clientes" icon={<Users size={20} />} label="Clientes" onClick={closeDrawer} />
              <DrawerLink to="/history" icon={<History size={20} />} label="Historial" onClick={closeDrawer} />
              <DrawerLink to="/reminders" icon={<Repeat size={20} />} label="Retención" onClick={closeDrawer} />
              <DrawerLink to="/metrics" icon={<BarChart3 size={20} />} label="Métricas" onClick={closeDrawer} />
              {tieneFeature(taller, 'bicis_paradas') && (rol?.toLowerCase()?.trim() === 'admin' || (rol?.toLowerCase()?.trim() === 'mecanico' && taller?.bicis_paradas_ve_mecanico === true)) && (
                <DrawerLink to="/bicis-paradas" icon={<Bike size={20} />} label="Bicis paradas" onClick={closeDrawer} />
              )}
              {tieneFeature(taller, 'preguntale') && rol?.toLowerCase()?.trim() !== 'super_admin' && (
                <DrawerLink to="/preguntale" icon={<MessageCircleQuestion size={20} />} label="Preguntale" onClick={closeDrawer} />
              )}
              {rol?.toLowerCase()?.trim() !== 'super_admin' && (
                <DrawerLink to="/configuracion" icon={<Settings size={20} />} label="Configuración" onClick={closeDrawer} />
              )}
              {rol?.toLowerCase()?.trim() === 'admin' && tieneFeature(taller, 'auditoria') && (
                <DrawerLink to="/auditoria" icon={<Trash2 size={20} />} label="Auditoría" onClick={closeDrawer} />
              )}
              {rol?.toLowerCase()?.trim() === 'super_admin' && (
                <DrawerLink to="/superadmin" icon={<Settings size={20} />} label="Super Admin" onClick={closeDrawer} />
              )}
            </nav>

            {/* Drawer footer — logout */}
            <div className="border-t border-border px-3 py-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <LogOut size={18} /> Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DESKTOP SIDEBAR (hidden on mobile) ── */}
      <nav data-tour="nav" className="hidden md:flex w-28 border-r border-border bg-card flex-col items-center py-4 space-y-4 sticky top-0 z-10 h-screen overflow-y-auto">
        <div className="mb-6 text-center w-full px-2 shrink-0">
          <div className="flex flex-col items-center justify-center mb-2 mt-2 w-full">
            {taller?.logo_url ? (
              <>
                <div className="h-16 w-full flex justify-center items-center mb-2 px-2">
                  <img src={taller.logo_url} alt="Logo Taller" className="max-h-full max-w-full object-contain" />
                </div>
                <span className="font-bold text-gray-900 text-sm tracking-wide">Mechanic Pro</span>
              </>
            ) : (
              /* Logo recortado (sin el aire blanco del PNG original) → la marca se ve GRANDE.
                 El wordmark ya dice MechanicPro, no hace falta repetirlo en texto. */
              <div className="w-full flex justify-center items-center mb-1 px-1">
                <img src="/logo-mechanic-pro-trim.png" alt="MechanicPro" className="w-full object-contain" />
              </div>
            )}
          </div>
          {displayName && <div className="text-[10px] text-muted-foreground mt-1 font-mono uppercase tracking-widest break-all px-1">{displayName}</div>}
        </div>

        <div className="flex-1 flex flex-col items-center space-y-4 justify-start">
          <div data-tour="notificaciones"><NotificationBell variant="desktop" /></div>
          <Link to="/" data-tour="nav-taller"><NavButton icon={<Wrench />} label="Taller Activo" /></Link>
          <Link to="/clientes" data-tour="nav-clientes"><NavButton icon={<Users />} label="Clientes" /></Link>
          <Link to="/history" data-tour="nav-historial"><NavButton icon={<History />} label="Historial" /></Link>
          <Link to="/reminders" data-tour="nav-retencion"><NavButton icon={<Repeat />} label="Retención" /></Link>
          <Link to="/metrics" data-tour="nav-metricas"><NavButton icon={<BarChart3 />} label="Métricas" /></Link>
          {tieneFeature(taller, 'bicis_paradas') && (rol?.toLowerCase()?.trim() === 'admin' || (rol?.toLowerCase()?.trim() === 'mecanico' && taller?.bicis_paradas_ve_mecanico === true)) && (
            <Link to="/bicis-paradas"><NavButton icon={<Bike />} label="Bicis paradas" /></Link>
          )}
          {tieneFeature(taller, 'preguntale') && rol?.toLowerCase()?.trim() !== 'super_admin' && (
            <Link to="/preguntale"><NavButton icon={<MessageCircleQuestion />} label="Preguntale" /></Link>
          )}
          {rol?.toLowerCase()?.trim() !== 'super_admin' && (
            <Link to="/configuracion" data-tour="nav-config"><NavButton icon={<Settings />} label="Configuración" /></Link>
          )}
          {rol?.toLowerCase()?.trim() === 'admin' && tieneFeature(taller, 'auditoria') && (
            <Link to="/auditoria"><NavButton icon={<Trash2 />} label="Auditoría" /></Link>
          )}
          {rol?.toLowerCase()?.trim() === 'super_admin' && (
            <Link to="/superadmin"><NavButton icon={<Settings />} label="Super Admin" /></Link>
          )}
        </div>

        <div className="mt-auto pb-8 shrink-0">
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
          {/* Feedback 11 a Fondo (jul-2026): la página principal es el Taller Activo.
              /workshop se mantiene como alias (IntakeWizard y hábitos navegan ahí). */}
          <Route path="/" element={<Workshop />} />
          <Route path="/clientes" element={<HomePage />} />
          <Route path="/update-password" element={<UpdatePasswordScreen />} />
          <Route path="/workshop" element={<Workshop />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/reminders" element={<RetentionEngine />} />
          <Route path="/bikes/:id" element={<BikeDetail />} />
          <Route path="/clients/:clientId" element={<BikeDetail />} />
          <Route path="/service/:id" element={<ServiceJob />} />
          <Route path="/metrics" element={<Metrics />} />
          {/* "Contactar" (Admin) se unificó dentro de Retención → redirect por si
              queda algún link/bookmark viejo apuntando acá (Tarea A). */}
          <Route path="/admin" element={<Navigate to="/reminders" replace />} />
          <Route path="/bicis-paradas" element={<BicisParadas />} />
          <Route path="/preguntale" element={<PreguntaleTaller />} />
          <Route path="/configuracion" element={<Configuracion />} />
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

function DrawerLink({ to, icon, label, onClick }: { to: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-primary/10 hover:text-primary rounded-xl transition-colors"
    >
      <span className="text-slate-500">{icon}</span>
      {label}
    </Link>
  );
}

// Feedback 11 a Fondo (jul-2026): nombre visible debajo del ícono — Alejo no
// asociaba los íconos y pasaba por todos hasta encontrar el que buscaba.
function NavButton({ icon, label }: { icon: any, label: string }) {
  return (
    <Button variant="ghost" className="h-auto w-24 py-2 px-1 flex flex-col items-center gap-1 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10" title={label}>
      {icon}
      <span className="text-[10px] font-semibold leading-tight text-center whitespace-normal">{label}</span>
    </Button>
  )
}

export default App
