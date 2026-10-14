-- Oficina JAM · fase 2 y «hacer clic»:
-- proyectos: Wapalink, un cliente o algo interno, cada uno con su cerebro, objetivos, planes, encargos y conversaciones
--   (las tablas de la fase 1 ya traían proyecto_id; aquí reciben su clave foránea).
-- encargos: trabajo de varios pasos que un agente hace en segundo plano y del que avisa al terminar o si necesita algo.
-- agent_ajustes: nivel de confianza de cada agente (lo interno sin preguntar).
-- telegram_acciones: botones de los informes de Telegram (el pedido completo, el botón solo lleva su id).
set search_path = facturai;

create table if not exists proyectos (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    nombre text not null check (length(nombre) between 2 and 80),
    tipo text not null default 'producto' check (tipo in ('producto', 'cliente', 'interno')),
    descripcion text,
    color text,
    client_id uuid references clients(id) on delete set null,
    estado text not null default 'activo' check (estado in ('activo', 'pausado', 'archivado'))
);
alter table proyectos enable row level security;

do $$ begin
    alter table empresa_cerebro add constraint empresa_cerebro_proyecto_fk foreign key (proyecto_id) references proyectos(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
    alter table objetivos add constraint objetivos_proyecto_fk foreign key (proyecto_id) references proyectos(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
    alter table planes add constraint planes_proyecto_fk foreign key (proyecto_id) references proyectos(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
    alter table entregables add constraint entregables_proyecto_fk foreign key (proyecto_id) references proyectos(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
    alter table agent_hilos add constraint agent_hilos_proyecto_fk foreign key (proyecto_id) references proyectos(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- La puerta de entrada de la Oficina es una conversación más, del «equipo».
alter table agent_hilos drop constraint if exists agent_hilos_departamento_check;
alter table agent_hilos add constraint agent_hilos_departamento_check check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing', 'seo', 'direccion', 'lanzamientos', 'equipo'));

create table if not exists encargos (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    proyecto_id uuid references proyectos(id) on delete cascade,
    departamento text not null check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing', 'seo', 'direccion', 'lanzamientos')),
    titulo text not null check (length(titulo) between 3 and 200),
    detalle text not null default '',
    estado text not null default 'pendiente' check (estado in ('pendiente', 'trabajando', 'esperando', 'listo', 'cancelado')),
    resultado text,
    pregunta text,
    fecha_compromiso date,
    fuente text not null default 'web' check (fuente in ('web', 'telegram', 'cron')),
    intentos integer not null default 0
);
create index if not exists encargos_estado_idx on encargos (estado, updated_at desc);
alter table encargos enable row level security;

create table if not exists agent_ajustes (
    departamento text primary key check (departamento in ('operaciones', 'ventas', 'finanzas', 'marketing', 'seo', 'direccion', 'lanzamientos')),
    autonomia boolean not null default true,
    updated_at timestamptz not null default now()
);
alter table agent_ajustes enable row level security;

create table if not exists telegram_acciones (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    departamento text not null,
    etiqueta text not null,
    pedido text not null,
    usada_at timestamptz
);
alter table telegram_acciones enable row level security;

alter table telegram_sessions add column if not exists proyecto_id uuid references proyectos(id) on delete set null;
