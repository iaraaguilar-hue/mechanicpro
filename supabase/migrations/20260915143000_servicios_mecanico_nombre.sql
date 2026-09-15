-- ═════════════════════════════════════════════════════════════
-- Quién hizo el service, cuando esa persona NO tiene usuario propio
-- 15-sep-2026 · pedido de Ariel (Leira Bikes) por Iara
--
-- En Leira trabajan 3 personas y hay UN solo usuario (Ariel): no existe
-- pantalla para crear usuarios, así que el selector «¿Quién lo hizo?» al
-- finalizar mostraba un solo nombre y en los hechos no se podía cambiar.
--
-- Ahora el nombre puede ser texto libre: sale de la lista que el taller carga
-- en Configuración → Preferencias (`talleres.config_mecanicos.nombres`, que es
-- jsonb y no necesita migración) o se escribe cualquier cosa en el momento.
-- `mecanico_id` se mantiene para los que SÍ tienen usuario, y las dos son
-- excluyentes: si hay usuario se guarda el id y esta columna queda en null.
--
-- 🚩 ESPEJO: este archivo vive en el repo del FRONTEND porque la sesión que lo
-- escribió (en la nube) no tenía acceso a `mechanicpro-producto`, que es donde
-- viven las migraciones. Copiarlo a `mechanicpro-producto/supabase/migrations/`
-- y aplicar desde ahí: `cd ~/Desktop/mechanic_pro && supabase db push`.
--
-- Es IDEMPOTENTE y ADITIVO: se aplica ANTES de deployar el frontend sin romper
-- nada (el código que está en producción hoy ni se entera de la columna).
-- ═════════════════════════════════════════════════════════════

alter table public.servicios
    add column if not exists mecanico_nombre text;

comment on column public.servicios.mecanico_nombre is
    'Quién hizo el service cuando no es un usuario del sistema: texto libre elegido al finalizar (lista del taller en talleres.config_mecanicos.nombres, o escrito a mano). Excluyente con mecanico_id.';
