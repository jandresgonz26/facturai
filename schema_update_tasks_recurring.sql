-- Tareas recurrentes y subtareas.
--
-- recurrence guarda la regla como jsonb en vez de columnas sueltas (freq,
-- interval, days_of_week) porque es una sola tarea la que la usa, no se
-- necesita filtrar/ordenar por ella en SQL, y así el formulario puede crecer
-- (por ejemplo "cada 2 semanas los martes y jueves") sin otra migración.
-- Forma: {"freq":"daily"|"weekly"|"monthly","interval":1,"days_of_week"?:[0-6]}
--
-- task_subtasks es una tabla aparte (no un array en tasks) para poder marcar
-- cada paso hecho o no sin reescribir todo el JSON cada vez.

alter table public.tasks add column if not exists recurrence jsonb;

create table if not exists public.task_subtasks (
    id uuid primary key default gen_random_uuid(),
    task_id uuid not null references public.tasks(id) on delete cascade,
    title text not null,
    done boolean not null default false,
    position integer not null default 0,
    created_at timestamptz not null default now()
);
create index if not exists task_subtasks_task_id_idx on public.task_subtasks(task_id);

alter table public.task_subtasks enable row level security;
drop policy if exists "Solo usuarios autenticados" on public.task_subtasks;
create policy "Solo usuarios autenticados" on public.task_subtasks
    for all to authenticated using (true) with check (true);
