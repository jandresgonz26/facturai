-- Oficina JAM · memoria de largo plazo de los agentes: reglas, preferencias y hechos que José pide recordar
-- ("en los análisis de ingresos ignora mayo y julio", "mi socia se llama…"). Se inyectan en las instrucciones
-- del chat (web y Telegram) y de los informes automáticos. Cada alta o baja pasa por confirmación en el chat.
set search_path = facturai;

create table if not exists agent_memoria (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    departamento text check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing', 'seo', 'direccion', 'lanzamientos')),
    hecho text not null check (length(hecho) between 3 and 600),
    fuente text not null default 'chat' check (fuente in ('chat', 'telegram', 'cron')),
    activo boolean not null default true,
    olvidado_at timestamptz
);
create index if not exists agent_memoria_activo_idx on agent_memoria (activo, created_at desc);
alter table agent_memoria enable row level security;
