-- Fuentes del cerebro: enlaces, PDF, imágenes o notas de las que la IA extrae el cerebro de la empresa o de un
-- proyecto. Se guarda el texto ya extraído (un PDF se lee una vez), para poder volver a generar sin re-subirlo.
set search_path = facturai;

create table if not exists cerebro_fuentes (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    proyecto_id uuid references proyectos(id) on delete cascade,
    tipo text not null check (tipo in ('url', 'archivo', 'nota')),
    nombre text not null,
    url text,
    contenido text not null check (length(contenido) <= 60000)
);
create index if not exists cerebro_fuentes_proyecto_idx on cerebro_fuentes (proyecto_id, created_at);
alter table cerebro_fuentes enable row level security;
