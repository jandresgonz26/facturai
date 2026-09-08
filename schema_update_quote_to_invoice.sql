-- ============================================================
--  FacturAI · Convertir cotización aprobada en factura
--  Pega y ejecuta esto en el SQL Editor de Supabase.
-- ============================================================

-- Enlace de la cotización con la factura que se generó a partir de ella.
-- Si la factura se elimina, el enlace se limpia y la cotización vuelve a
-- poder convertirse.
alter table public.quotes
    add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
alter table public.quotes
    add column if not exists invoiced_at timestamptz;

create index if not exists quotes_invoice_id_idx on public.quotes(invoice_id);
