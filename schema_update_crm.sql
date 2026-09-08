-- ============================================================
--  FacturAI · CRM ligero + correos a clientes
--  Pega y ejecuta esto en el SQL Editor de Supabase.
-- ============================================================

-- 1. Etapa comercial del cliente (lead → cotizado → activo → inactivo)
alter table public.clients
    add column if not exists stage text not null default 'active'
        check (stage in ('lead', 'quoted', 'active', 'inactive'));
alter table public.clients add column if not exists source text;          -- de dónde salió el lead
alter table public.clients add column if not exists next_action text;     -- próxima acción comercial
alter table public.clients add column if not exists next_action_at date;  -- para cuándo

-- 2. Cotizaciones enlazadas al cliente (antes solo guardaban el nombre)
alter table public.quotes
    add column if not exists client_id uuid references public.clients(id) on delete set null;

-- Enlaza las cotizaciones existentes por nombre exacto (sin distinguir mayúsculas)
update public.quotes q
set client_id = c.id
from public.clients c
where q.client_id is null
  and lower(trim(q.client_name)) = lower(trim(c.name));

-- 3. Fecha de envío de la factura al cliente
alter table public.invoices add column if not exists sent_at timestamptz;

-- 4. Notas por cliente
create table if not exists public.client_notes (
    id          uuid primary key default gen_random_uuid(),
    client_id   uuid not null references public.clients(id) on delete cascade,
    body        text not null,
    created_at  timestamptz not null default now()
);
alter table public.client_notes enable row level security;
drop policy if exists "Allow all on client_notes" on public.client_notes;
create policy "Allow all on client_notes" on public.client_notes for all using (true) with check (true);
create index if not exists client_notes_client_idx on public.client_notes (client_id, created_at desc);

-- 5. Registro de correos enviados (auditoría: qué, a quién, cuándo, resultado)
create table if not exists public.email_log (
    id           uuid primary key default gen_random_uuid(),
    kind         text not null check (kind in ('invoice', 'quote', 'payment_thanks')),
    invoice_id   uuid references public.invoices(id) on delete set null,
    quote_id     uuid references public.quotes(id) on delete set null,
    client_id    uuid references public.clients(id) on delete set null,
    to_email     text not null,
    subject      text not null,
    provider_id  text,
    status       text not null check (status in ('sent', 'failed')),
    error        text,
    redirected   boolean not null default false,  -- true si EMAIL_TEST_TO desvió el envío
    sent_at      timestamptz not null default now()
);
alter table public.email_log enable row level security;
drop policy if exists "Allow all on email_log" on public.email_log;
create policy "Allow all on email_log" on public.email_log for all using (true) with check (true);
create index if not exists email_log_invoice_idx on public.email_log (invoice_id);
create index if not exists email_log_quote_idx on public.email_log (quote_id);
create index if not exists email_log_client_idx on public.email_log (client_id, sent_at desc);

-- 6. Los correos al marcar pagada ahora salen desde la app (Resend), con confirmación.
--    Se retira el aviso automático a n8n para no duplicar notificaciones.
drop trigger if exists on_invoice_paid on public.invoices;
drop function if exists public.notify_paid_invoice();
