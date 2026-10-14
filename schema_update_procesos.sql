-- Oficina JAM · procesos guiados (inspirado en cómo Vilma.AI guía a sus usuarios):
-- empresa_cerebro: lo que todos los agentes saben de la empresa (oferta, cliente ideal, voz, metas, reglas…), por secciones.
-- entregables: el resultado guardado de cada tarea guiada (propuesta, plan de contenido, guion…), reutilizable.
-- planes / plan_pasos: una meta convertida en pasos ordenados, cada uno asignado a un agente y, si aplica, a una tarea guiada.
-- proyecto_id null = JAM Tech (los proyectos llegan en la fase 2).
set search_path = facturai;

create table if not exists empresa_cerebro (
    id uuid primary key default gen_random_uuid(),
    proyecto_id uuid,
    seccion text not null check (seccion in ('empresa', 'oferta', 'cliente_ideal', 'diferencial', 'voz', 'metas', 'reglas', 'recursos')),
    contenido text not null default '' check (length(contenido) <= 6000),
    updated_at timestamptz not null default now()
);
create unique index if not exists empresa_cerebro_unico on empresa_cerebro (coalesce(proyecto_id, '00000000-0000-0000-0000-000000000000'::uuid), seccion);
alter table empresa_cerebro enable row level security;

create table if not exists planes (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    proyecto_id uuid,
    titulo text not null check (length(titulo) between 3 and 200),
    meta text not null check (length(meta) between 3 and 1000),
    resumen text,
    fecha_limite date,
    estado text not null default 'borrador' check (estado in ('borrador', 'activo', 'completado', 'pausado', 'descartado')),
    objetivo_id uuid references objetivos(id) on delete set null,
    objetivo_propuesto jsonb,
    fuente text not null default 'web' check (fuente in ('web', 'chat', 'telegram'))
);
create index if not exists planes_estado_idx on planes (estado, created_at desc);
alter table planes enable row level security;

create table if not exists plan_pasos (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid not null references planes(id) on delete cascade,
    orden integer not null,
    departamento text not null check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing', 'seo', 'direccion', 'lanzamientos')),
    titulo text not null check (length(titulo) between 3 and 200),
    descripcion text,
    tarea_guiada text,
    datos jsonb not null default '{}'::jsonb,
    fecha date,
    estado text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'omitido')),
    completado_at timestamptz,
    task_id uuid references tasks(id) on delete set null
);
create index if not exists plan_pasos_plan_idx on plan_pasos (plan_id, orden);
create index if not exists plan_pasos_dep_idx on plan_pasos (departamento, estado);
alter table plan_pasos enable row level security;

create table if not exists entregables (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    proyecto_id uuid,
    departamento text not null check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing', 'seo', 'direccion', 'lanzamientos')),
    tarea text not null,
    titulo text not null check (length(titulo) between 3 and 200),
    entradas jsonb not null default '{}'::jsonb,
    contenido text not null,
    estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'archivado')),
    plan_paso_id uuid references plan_pasos(id) on delete set null
);
create index if not exists entregables_dep_idx on entregables (departamento, created_at desc);
create index if not exists entregables_paso_idx on entregables (plan_paso_id) where plan_paso_id is not null;
alter table entregables enable row level security;
