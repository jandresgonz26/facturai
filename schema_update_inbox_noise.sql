-- ============================================================
--  FacturAI · Filtro de ruido del correo
--  Dos capas: reglas fijas para lo obviamente automático, y aprendizaje
--  de los remitentes que el usuario descarta una y otra vez.
-- ============================================================

-- Marcado como ruido por las reglas del puente. No se borra: queda auditable
-- y se puede consultar si alguna vez hace falta.
alter table public.inbox_items add column if not exists is_noise boolean not null default false;
-- Por qué se consideró ruido, para poder revisar si el filtro se pasa de listo.
alter table public.inbox_items add column if not exists noise_reason text;

create index if not exists inbox_items_noise_idx on public.inbox_items (is_noise, dismissed, task_id);

-- Remitentes que el usuario ya descartó varias veces: se silencian solos.
create table if not exists public.muted_senders (
    id           uuid primary key default gen_random_uuid(),
    from_email   text not null unique,
    -- Cuántas veces descartó correos de este remitente antes de silenciarlo.
    dismissals   integer not null default 0,
    muted        boolean not null default false,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

alter table public.muted_senders enable row level security;
drop policy if exists "Allow all on muted_senders" on public.muted_senders;
create policy "Allow all on muted_senders" on public.muted_senders for all using (true) with check (true);
