-- ============================================================
--  FacturAI · Recordatorios a una hora concreta
--  "Recuérdame a las 3 llamar a Ignacio": el asistente guarda la hora
--  y un cron cada 5 minutos manda el aviso por Telegram cuando toca.
--  Puede ir suelto o enlazado a una tarea del tablero; si la tarea ya
--  se terminó cuando llega la hora, no se manda.
-- ============================================================

create table if not exists public.reminders (
    id          uuid primary key default gen_random_uuid(),
    text        text not null,
    remind_at   timestamptz not null,
    task_id     uuid references public.tasks(id) on delete set null,
    -- Se marca al mandarlo (o al saltarlo porque la tarea ya se hizo).
    sent_at     timestamptz,
    cancelled   boolean not null default false,
    created_at  timestamptz not null default now()
);

create index if not exists reminders_due_idx on public.reminders (remind_at) where sent_at is null and not cancelled;

alter table public.reminders enable row level security;
drop policy if exists "Solo usuarios autenticados" on public.reminders;
create policy "Solo usuarios autenticados" on public.reminders for all to authenticated using (true) with check (true);
