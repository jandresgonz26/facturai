-- ============================================================
--  FacturAI · Meta mensual configurable para el dashboard
--  Pega y ejecuta esto en el SQL Editor de Supabase.
-- ============================================================
alter table public.company_settings
    add column if not exists monthly_goal numeric default 5500;
