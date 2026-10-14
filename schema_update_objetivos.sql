-- Oficina JAM · fase 1: página propia de cada agente.
-- agent_hilos: una conversación persistente por agente (y por proyecto en la fase 2; proyecto_id null = JAM Tech).
-- objetivos: el roadmap de cada agente (meta con cifra y fecha; avance automático desde los datos o manual).
-- tasks.objetivo_id: los hitos de un objetivo son tareas normales (aparecen en el plan del día).
set search_path = facturai;

create table if not exists agent_hilos (
    id uuid primary key default gen_random_uuid(),
    proyecto_id uuid,
    departamento text not null check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing', 'seo', 'direccion', 'lanzamientos')),
    messages jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);
create unique index if not exists agent_hilos_unico on agent_hilos (coalesce(proyecto_id, '00000000-0000-0000-0000-000000000000'::uuid), departamento);
alter table agent_hilos enable row level security;

create table if not exists objetivos (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    proyecto_id uuid,
    departamento text not null check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing', 'seo', 'direccion', 'lanzamientos')),
    titulo text not null check (length(titulo) between 3 and 200),
    descripcion text,
    metrica text not null default 'manual',
    unidad text not null default 'numero' check (unidad in ('usd', 'numero', 'pct')),
    valor_inicial numeric,
    valor_meta numeric,
    valor_actual numeric,
    fecha_limite date,
    estado text not null default 'activo' check (estado in ('activo', 'logrado', 'pausado', 'descartado')),
    orden integer not null default 0
);
create index if not exists objetivos_dep_idx on objetivos (departamento, estado);
alter table objetivos enable row level security;

alter table tasks add column if not exists objetivo_id uuid references objetivos(id) on delete set null;
create index if not exists tasks_objetivo_idx on tasks (objetivo_id) where objetivo_id is not null;
