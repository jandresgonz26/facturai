-- ============================================================
--  FacturAI · Plan del día para las tareas
--  Idea tomada de las apps que sí funcionan para esto (Sunsama, Things):
--  el problema no es tener una lista, es comprometerse con un puñado
--  realista de tareas cada mañana y revisar al cerrar el día.
-- ============================================================

-- Día para el que el usuario se comprometió a hacer la tarea.
alter table public.tasks add column if not exists planned_for date;

-- Cuántas veces se ha empujado a otro día. Sirve para detectar la tarea que
-- se está evitando, que casi siempre es la que hay que partir o soltar.
alter table public.tasks add column if not exists postponed_count integer not null default 0;

create index if not exists tasks_planned_for_idx on public.tasks (planned_for);
