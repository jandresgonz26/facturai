-- ============================================================
--  FacturAI · Puente con Spark
--  Un script en el Mac lee Spark y deja aquí lo que merece atención,
--  para que el asistente (que corre en la nube) pueda hablar de ello
--  desde Telegram sin depender de que el Mac esté encendido.
--
--  IMPORTANTE: solo se guardan cabeceras (quién, asunto, cuándo).
--  El cuerpo de los correos NUNCA sale del Mac.
-- ============================================================

create table if not exists public.inbox_items (
    id           uuid primary key default gen_random_uuid(),
    -- Identificador del mensaje en Spark, junto con la cuenta: evita duplicar
    -- en cada sincronización.
    message_id   text not null,
    account      text not null,
    from_name    text,
    from_email   text not null,
    subject      text not null,
    sent_at      timestamptz not null,
    -- Cliente de FacturAI cuyo correo coincide con el remitente, si lo hay.
    client_id    uuid references public.clients(id) on delete set null,
    -- Tarea creada a partir de este correo.
    task_id      uuid references public.tasks(id) on delete set null,
    -- El usuario dijo que no le interesa: no se vuelve a proponer.
    dismissed    boolean not null default false,
    synced_at    timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

alter table public.inbox_items enable row level security;
drop policy if exists "Allow all on inbox_items" on public.inbox_items;
create policy "Allow all on inbox_items" on public.inbox_items for all using (true) with check (true);

create unique index if not exists inbox_items_msg_uniq on public.inbox_items (account, message_id);
create index if not exists inbox_items_sent_idx on public.inbox_items (sent_at desc);
create index if not exists inbox_items_pending_idx on public.inbox_items (dismissed, task_id);
