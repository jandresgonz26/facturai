-- ============================================================
--  FacturAI · Disponibilidad del día, para armar el horario
--  Se guardan las ventanas LIBRES, no las ocupadas: es lo que el
--  algoritmo necesita para repartir las tareas, y una reunión se
--  representa partiendo la ventana en dos.
-- ============================================================

create table if not exists public.day_availability (
    id         uuid primary key default gen_random_uuid(),
    day        date not null,
    start_time time not null,
    end_time   time not null,
    -- Para recordar por qué el día quedó así ("vuelvo de una diligencia").
    note       text,
    created_at timestamptz not null default now(),
    constraint day_availability_order check (end_time > start_time)
);

alter table public.day_availability enable row level security;
drop policy if exists "Allow all on day_availability" on public.day_availability;
create policy "Allow all on day_availability" on public.day_availability for all using (true) with check (true);

create index if not exists day_availability_day_idx on public.day_availability (day, start_time);
