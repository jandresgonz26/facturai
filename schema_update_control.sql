-- ============================================================
--  FacturAI · Control interno de proyectos
--  Solo para José: lo que se cobra al cliente (plan de cuotas, abonos, cobros sueltos) y lo que se
--  paga a cada programador (acuerdos con su propuesta, pagos), con saldos y margen.
--  No toca facturas ni nada que vea el cliente.
--  Pega y ejecuta esto en el SQL Editor de Supabase.
-- ============================================================

create table if not exists facturai.control_proyectos (
    id           uuid primary key default gen_random_uuid(),
    nombre       text not null,
    client_id    uuid references facturai.clients(id) on delete set null,
    propuesta_id uuid references facturai.proposals(id) on delete set null,
    estado       text not null default 'activo' check (estado in ('activo', 'cerrado')),
    moneda       text not null default 'USD' check (moneda in ('USD', 'EUR')),
    notas        text,
    created_at   timestamptz not null default now()
);

-- Lo que se cobra al cliente: el plan de cuotas y los cobros sueltos (extra = true).
create table if not exists facturai.control_cuotas (
    id          uuid primary key default gen_random_uuid(),
    proyecto_id uuid not null references facturai.control_proyectos(id) on delete cascade,
    orden       integer not null default 0,
    concepto    text not null,
    monto       numeric not null check (monto >= 0),
    vence       date,
    detalle     text,
    extra       boolean not null default false,
    created_at  timestamptz not null default now()
);
create index if not exists control_cuotas_idx on facturai.control_cuotas (proyecto_id, orden);

-- Lo que se acuerda con cada programador (su propuesta: texto y/o archivo).
create table if not exists facturai.control_acuerdos (
    id             uuid primary key default gen_random_uuid(),
    proyecto_id    uuid not null references facturai.control_proyectos(id) on delete cascade,
    proveedor      text not null,
    concepto       text not null,
    monto          numeric not null check (monto >= 0),
    estado         text not null default 'acordado' check (estado in ('acordado', 'por_confirmar')),
    fecha          date not null default current_date,
    detalle        text,
    archivo_path   text,
    archivo_nombre text,
    created_at     timestamptz not null default now()
);
create index if not exists control_acuerdos_idx on facturai.control_acuerdos (proyecto_id, proveedor);

-- Dinero que entra (abonos del cliente) y que sale (pagos a programadores).
create table if not exists facturai.control_movimientos (
    id          uuid primary key default gen_random_uuid(),
    proyecto_id uuid not null references facturai.control_proyectos(id) on delete cascade,
    lado        text not null check (lado in ('cliente', 'proveedor')),
    proveedor   text,
    fecha       date not null default current_date,
    monto       numeric not null check (monto > 0),
    metodo      text,
    nota        text,
    created_at  timestamptz not null default now(),
    check (lado = 'cliente' or proveedor is not null)
);
create index if not exists control_movimientos_idx on facturai.control_movimientos (proyecto_id, fecha);

-- Igual que el resto del esquema: solo la sesión de José (authenticated) y el servidor (service role).
do $$
declare t text;
begin
    foreach t in array array['control_proyectos', 'control_cuotas', 'control_acuerdos', 'control_movimientos'] loop
        execute format('alter table facturai.%I enable row level security', t);
        execute format('drop policy if exists %I on facturai.%I', t || '_auth', t);
        execute format('create policy %I on facturai.%I for all to authenticated using (true) with check (true)', t || '_auth', t);
        execute format('grant select, insert, update, delete on facturai.%I to authenticated, service_role', t);
    end loop;
end $$;

-- Propuestas de los programadores (PDF, imágenes): bucket PRIVADO, se abren con enlace firmado desde FacturAI.
insert into storage.buckets (id, name, public, file_size_limit)
values ('control', 'control', false, 15728640)
on conflict (id) do nothing;
