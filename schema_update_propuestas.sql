-- ============================================================
--  FacturAI · Propuestas comerciales
--  Documento con texto libre (editor tipo Notion) + tabla de inversión flexible
--  (opciones, extras, descuentos, impuesto, plan de pagos), enlace público para
--  el cliente (/propuesta/<token>) con «Aceptar» y «Pedir cambios».
--  Pega y ejecuta esto en el SQL Editor de Supabase (esquema facturai).
-- ============================================================

create table if not exists facturai.proposals (
    id                uuid primary key default gen_random_uuid(),
    number            text not null unique,                         -- PRO-0001
    client_id         uuid not null references facturai.clients(id) on delete restrict,
    title             text not null,
    content           jsonb not null default '[]'::jsonb,           -- bloques del editor (BlockNote)
    pricing           jsonb not null default '{}'::jsonb,           -- tabla de inversión (ver src/lib/propuestas/precios.ts)
    currency          text not null default 'USD' check (currency in ('USD', 'EUR')),
    total_once        numeric not null default 0,                   -- opción recomendada, para la lista
    total_recurring   numeric not null default 0,                   -- mensualizado, para la lista
    status            text not null default 'draft'
                      check (status in ('draft', 'sent', 'viewed', 'changes_requested', 'accepted', 'rejected')),
    token             text not null unique,                         -- enlace público, imposible de adivinar
    valid_until       date,
    sent_at           timestamptz,
    first_viewed_at   timestamptz,
    last_viewed_at    timestamptz,
    view_count        integer not null default 0,
    accepted_at       timestamptz,
    accepted_by       text,
    accepted_snapshot jsonb,                                        -- lo que vio y eligió el cliente, congelado
    rejected_at       timestamptz,
    billing           jsonb not null default '{}'::jsonb,           -- cuotas facturadas, servicios fijos creados
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists proposals_client_idx on facturai.proposals (client_id, created_at desc);
create index if not exists proposals_status_idx on facturai.proposals (status, updated_at desc);

create table if not exists facturai.proposal_events (
    id           uuid primary key default gen_random_uuid(),
    proposal_id  uuid not null references facturai.proposals(id) on delete cascade,
    kind         text not null check (kind in ('created', 'sent', 'viewed', 'changes_requested', 'accepted', 'rejected', 'invoiced', 'recurring_created', 'reopened')),
    detail       jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now()
);
create index if not exists proposal_events_idx on facturai.proposal_events (proposal_id, created_at desc);

-- Igual que el resto del esquema: solo la sesión de José (authenticated) y el servidor (service role).
alter table facturai.proposals enable row level security;
alter table facturai.proposal_events enable row level security;
drop policy if exists proposals_auth on facturai.proposals;
create policy proposals_auth on facturai.proposals for all to authenticated using (true) with check (true);
drop policy if exists proposal_events_auth on facturai.proposal_events;
create policy proposal_events_auth on facturai.proposal_events for all to authenticated using (true) with check (true);
grant select, insert, update, delete on facturai.proposals, facturai.proposal_events to authenticated, service_role;

-- Imágenes de las propuestas: bucket público (nombres aleatorios), se sube desde el servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('propuestas', 'propuestas', true, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;
