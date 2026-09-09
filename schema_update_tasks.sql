-- ============================================================
--  FacturAI · Tareas (To-Do tipo tablero) enlazadas al CRM
-- ============================================================

create table if not exists public.tasks (
    id           uuid primary key default gen_random_uuid(),
    title        text not null,
    notes        text,
    -- todo = por hacer · doing = en curso · done = hecha
    status       text not null default 'todo' check (status in ('todo', 'doing', 'done')),
    position     numeric not null default 0,          -- orden dentro de su columna
    client_id    uuid references public.clients(id) on delete set null,   -- opcional
    due_date     date,                                 -- opcional
    hours        numeric,                              -- opcional: horas de trabajo
    amount       numeric,                              -- opcional: monto a cobrar
    -- Ítem facturable generado desde esta tarea. Si se borra el ítem, vuelve a null
    -- y la tarea se puede registrar otra vez.
    log_id       uuid references public.logs(id) on delete set null,
    completed_at timestamptz,
    created_at   timestamptz not null default now()
);

alter table public.tasks enable row level security;
drop policy if exists "Allow all on tasks" on public.tasks;
create policy "Allow all on tasks" on public.tasks for all using (true) with check (true);

create index if not exists tasks_status_idx on public.tasks (status, position);
create index if not exists tasks_client_idx on public.tasks (client_id);
create index if not exists tasks_due_idx on public.tasks (due_date);

-- Migra las "próximas acciones" que ya existían en la ficha del cliente a tareas
-- reales, para no perderlas. Idempotente: no duplica si ya se migró.
insert into public.tasks (title, client_id, due_date, status)
select c.next_action, c.id, c.next_action_at, 'todo'
from public.clients c
where c.next_action is not null
  and trim(c.next_action) <> ''
  and not exists (
      select 1 from public.tasks t
      where t.client_id = c.id and t.title = c.next_action
  );

-- Las columnas next_action / next_action_at se dejan en la tabla (no se borran
-- para no perder nada), pero la app ya no las usa: ahora todo pasa por tasks.
