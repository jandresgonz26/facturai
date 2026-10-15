-- Registro de cambios de estado y aviso a FacturAI (Telegram) cuando el cliente cambia algo desde su enlace.
--
-- status_log: cada cambio de task_status con quién lo hizo: 'anon' = el cliente desde /p/<slug>,
--   'authenticated' = JAM Tech desde el admin, 'service' = scripts.
-- Cuando el cambio es del cliente, avisa a https://crm.jamtech.cloud/api/checklist/aviso (pg_net). Ese endpoint
--   no confía en lo que recibe: espera un minuto para juntar los cambios seguidos y vuelve a leer este registro.
-- Lectura: anon solo ve los cambios de proyectos públicos (como el resto del checklist); nadie de fuera escribe aquí.
-- Si pg_net falla o no está, el cambio de estado se guarda igual (el aviso llega con la revisión periódica).

create extension if not exists pg_net;

create table if not exists public.status_log (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists status_log_project_idx on public.status_log(project_id, id desc);

alter table public.status_log enable row level security;
drop policy if exists status_log_anon_read on public.status_log;
create policy status_log_anon_read on public.status_log for select to anon using (public.project_is_public(project_id));
drop policy if exists status_log_admin on public.status_log;
create policy status_log_admin on public.status_log for all to authenticated using (true) with check (true);

create or replace function public.log_task_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid   uuid;
  actor text := coalesce(nullif(auth.role(), ''), 'service');
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;
  select s.project_id into pid
    from public.tasks t join public.sections s on s.id = t.section_id
   where t.id = new.task_id;
  insert into public.status_log(task_id, project_id, from_status, to_status, actor)
  values (new.task_id, pid, case when tg_op = 'UPDATE' then old.status end, new.status, actor);
  if actor = 'anon' then
    begin
      perform net.http_post(
        url     := 'https://crm.jamtech.cloud/api/checklist/aviso',
        body    := jsonb_build_object('project_id', pid),
        headers := '{"content-type": "application/json"}'::jsonb
      );
    exception when others then
      null; -- el aviso no puede impedir el cambio de estado
    end;
  end if;
  return new;
end $$;

drop trigger if exists task_status_log on public.task_status;
create trigger task_status_log
  after insert or update on public.task_status
  for each row execute function public.log_task_status();
