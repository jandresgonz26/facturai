-- ============================================================
--  FacturAI · Origen de una tarea creada desde un correo
--  Evita que el mismo correo se proponga (o se convierta) dos veces.
-- ============================================================

alter table public.tasks add column if not exists source_email_id text;

create unique index if not exists tasks_source_email_uniq
    on public.tasks (source_email_id)
    where source_email_id is not null;
