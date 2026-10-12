-- Oficina JAM: registro de actividad de los departamentos del asistente.
-- Se ejecuta con: node --env-file=.env.local scripts/run-sql.mjs schema_update_oficina.sql
-- (run-sql ya apunta al esquema facturai).

create table if not exists agent_events (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    departamento text not null check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing')),
    tipo text not null check (tipo in ('herramienta', 'rutina', 'aviso')),
    titulo text not null,
    detalle jsonb,
    estado text not null default 'hecho' check (estado in ('en_curso', 'hecho', 'espera_aprobacion', 'cancelado', 'error')),
    fuente text not null default 'chat' check (fuente in ('chat', 'telegram', 'cron'))
);
create index if not exists agent_events_created_idx on agent_events (created_at desc);
create index if not exists agent_events_dep_idx on agent_events (departamento, created_at desc);

alter table agent_events enable row level security;
drop policy if exists "Solo usuarios autenticados" on agent_events;
create policy "Solo usuarios autenticados" on agent_events for all to authenticated using (true) with check (true);

-- Solo se conservan los últimos 30 días: es un historial de actividad, no un registro contable.
-- Con search_path fijo, porque el trigger también se dispara desde sesiones que no lo tienen en `facturai`.
create or replace function agent_events_prune() returns trigger language plpgsql set search_path = facturai as $$
begin
    delete from facturai.agent_events where created_at < now() - interval '30 days';
    return null;
end $$;
drop trigger if exists agent_events_prune_trg on agent_events;
create trigger agent_events_prune_trg after insert on agent_events
    for each statement execute function agent_events_prune();
