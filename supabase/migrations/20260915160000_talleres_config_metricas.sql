-- ═════════════════════════════════════════════════════════════
-- Qué partes de Métricas ve el mecánico
-- 15-sep-2026 · pedido de Iara
--
-- Hasta hoy lo ÚNICO que el admin podía decidir sobre lo que ve su empleado era
-- Bicis paradas. Métricas la veía entera, facturación incluida. Ahora el admin
-- entra a Métricas, toca «Elegir qué ve el mecánico» (los paneles se ponen a
-- temblar, como las apps del iPhone) y apaga con el ojo los que no quiere que vea.
--
-- Guarda `{"ocultas_mecanico": ["kpi_facturacion", "por_mecanico", …]}`: los IDs
-- de los paneles apagados. Vacío o null = el mecánico ve todo, que es como venía.
--
-- ⚠️ Esconde, NO bloquea: los números se calculan en el navegador con órdenes que
-- el mecánico igual puede leer (las necesita para trabajar). Es orden y prolijidad
-- del panel, no un candado de seguridad. El candado de verdad sería RLS sobre
-- `servicios`, y eso le sacaría el trabajo.
--
-- 🚩 ESPEJO: este archivo vive en el repo del FRONTEND porque la sesión que lo
-- escribió (en la nube) no tenía acceso a `mechanicpro-producto`, que es donde
-- viven las migraciones. Copiarlo a `mechanicpro-producto/supabase/migrations/`
-- y aplicar desde ahí: `cd ~/Desktop/mechanic_pro && supabase db push`.
--
-- Es IDEMPOTENTE y ADITIVO: se aplica ANTES de deployar el frontend.
-- ═════════════════════════════════════════════════════════════

alter table public.talleres
    add column if not exists config_metricas jsonb;

comment on column public.talleres.config_metricas is
    'Preferencias del panel de Métricas. ocultas_mecanico: IDs de los paneles que el rol mecanico no ve (lo elige el admin desde Métricas). Esconde, no bloquea: los datos siguen al alcance del rol por RLS.';
