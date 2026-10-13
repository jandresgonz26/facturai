-- Oficina JAM · 🧭 Dirección: consejos de la dirección (oportunidades, riesgos y decisiones) y qué pasó con cada uno.
-- La rutina semanal los guarda; el dueño los marca como aceptados, descartados o hechos (con su resultado)
-- desde el chat, y la siguiente revisión aprende de ese historial.
set search_path = facturai;

create table if not exists direccion_consejos (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    semana date not null default current_date,
    tipo text not null check (tipo in ('oportunidad', 'riesgo', 'decision')),
    titulo text not null,
    detalle text not null default '',
    impacto text not null default 'medio' check (impacto in ('alto', 'medio', 'bajo')),
    estado text not null default 'propuesta' check (estado in ('propuesta', 'aceptada', 'descartada', 'hecha')),
    resultado text
);
create index if not exists direccion_consejos_semana_idx on direccion_consejos (semana desc, created_at desc);

-- Solo el servidor (service role) la usa: RLS activado y sin políticas para anon/authenticated.
alter table direccion_consejos enable row level security;
