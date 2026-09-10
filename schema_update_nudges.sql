-- ============================================================
--  FacturAI · Memoria de lo que el asistente ya te dijo
--  Sin esto, "insistir" degenera en repetir el mismo mensaje cada
--  día hasta que lo silencias. Con esto puede escalar: mencionarlo,
--  luego decir cuántos días lleva, y luego preguntar si se suelta.
-- ============================================================

create table if not exists public.nudges (
    id           uuid primary key default gen_random_uuid(),
    -- Qué se está recordando: tarea estancada, factura vencida, cotización
    -- sin respuesta, plan del día sin armar, etc.
    kind         text not null,
    -- A qué se refiere (id de la tarea, factura o cotización). Puede ir vacío
    -- para avisos generales que no apuntan a una fila concreta.
    ref_id       text not null default '',
    times_sent   integer not null default 0,
    last_sent_at timestamptz,
    -- El usuario pidió no molestar con esto hasta cierta fecha.
    snoozed_until timestamptz,
    -- El usuario dijo que lo suelte: no se vuelve a mencionar.
    dismissed    boolean not null default false,
    created_at   timestamptz not null default now()
);

alter table public.nudges enable row level security;
drop policy if exists "Allow all on nudges" on public.nudges;
create policy "Allow all on nudges" on public.nudges for all using (true) with check (true);

create unique index if not exists nudges_kind_ref_uniq on public.nudges (kind, ref_id);
create index if not exists nudges_last_sent_idx on public.nudges (last_sent_at);
