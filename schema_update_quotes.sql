-- ============================================================
--  FacturAI · Esquema para "Cotizaciones" (Quick Quotes)
--  Pega y ejecuta esto en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.quotes (
    id            uuid primary key default gen_random_uuid(),
    quote_number  text not null,                       -- Ej: COT-0001
    client_name   text not null,                       -- Nombre del cliente (texto libre)
    company_name  text,                                -- Nombre de tu empresa (texto libre)
    doc_title     text,                                -- Título del documento en el PDF (ej: COTIZACIÓN, CONTROL DE HORAS)
    quote_type    text not null default 'amount',      -- 'amount' (con importe) | 'hours' (solo horas)
    template      text not null default 'jamtech',     -- 'jamtech' (azul, con header) | 'asiri' (morado)
    currency      text not null default 'USD',         -- 'USD' | 'EUR'
    items         jsonb not null default '[]'::jsonb,  -- [{ service, description, quantity, unit_price, hours }]
    total_amount  numeric not null default 0,
    total_hours   numeric not null default 0,
    issue_date    date not null default current_date,
    created_at    timestamptz not null default now()
);

-- Si la tabla ya existía sin estas columnas, añadirlas (idempotente)
alter table public.quotes
    add column if not exists template text not null default 'jamtech';
alter table public.quotes
    add column if not exists doc_title text;

-- Habilitar Row Level Security (igual que el resto de tablas del proyecto)
alter table public.quotes enable row level security;

-- Política abierta (todas las operaciones permitidas, se puede restringir luego)
drop policy if exists "Allow all on quotes" on public.quotes;
create policy "Allow all on quotes"
    on public.quotes
    for all
    using (true)
    with check (true);
