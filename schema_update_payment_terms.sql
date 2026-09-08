-- ============================================================
--  FacturAI · Condiciones de pago por cliente
--  Pega y ejecuta esto en el SQL Editor de Supabase.
-- ============================================================
alter table public.clients
    add column if not exists payment_terms text; -- ej: "Pagar en los primeros 10 días de cada mes."
