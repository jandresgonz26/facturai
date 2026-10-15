-- Integración con Seguimiento de Tareas (Checklists Dev, tasks.jamtech.cloud, otro proyecto de Supabase):
-- proyectos.checklist_slug: el proyecto de la Oficina enlazado con su checklist (p. ej. 'perfect-trainer').
-- checklist_avisos: hasta qué cambio del registro de estados (status_log del checklist) ya se avisó por Telegram.
set search_path = facturai;

alter table proyectos add column if not exists checklist_slug text;
create unique index if not exists proyectos_checklist_slug_idx on proyectos (checklist_slug) where checklist_slug is not null;

create table if not exists checklist_avisos (
    id integer primary key default 1 check (id = 1),
    ultimo_id bigint not null default 0,
    updated_at timestamptz not null default now()
);
insert into checklist_avisos (id) values (1) on conflict do nothing;
alter table checklist_avisos enable row level security;
