-- ============================================================
--  FacturAI · Esquema para el Asistente (chat agéntico)
--  Pega y ejecuta esto en el SQL Editor de Supabase ANTES de
--  desplegar la versión con el chat.
-- ============================================================

-- 1. Trazabilidad de servicios fijos cargados por periodo.
--    Permite que "cargar servicios fijos" sea idempotente:
--    un servicio fijo solo se carga una vez por mes.
alter table public.logs
    add column if not exists recurring_service_id uuid
        references public.recurring_services(id) on delete set null;

alter table public.logs
    add column if not exists billing_period text; -- formato 'YYYY-MM'

create index if not exists logs_recurring_period_idx
    on public.logs (recurring_service_id, billing_period);

-- 2. Fecha de vencimiento en facturas (hoy "Pagar antes de" salía vacío).
alter table public.invoices
    add column if not exists due_date date;
