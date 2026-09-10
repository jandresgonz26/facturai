-- ============================================================
--  FacturAI · Estado de la cotización (pendiente / aprobada / rechazada)
-- ============================================================

alter table public.quotes
    add column if not exists status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected'));
alter table public.quotes add column if not exists decided_at timestamptz;

-- Las que ya se convirtieron en factura estaban aprobadas de hecho.
update public.quotes
set status = 'approved',
    decided_at = coalesce(invoiced_at, now())
where invoice_id is not null
  and status = 'pending';

create index if not exists quotes_status_idx on public.quotes (status);
