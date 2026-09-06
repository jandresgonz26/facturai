-- ============================================================
--  FacturAI · Sesiones del bot de Telegram
--  Guarda la conversación de cada chat para que el asistente tenga
--  contexto entre mensajes y pueda pedir confirmación con botones.
-- ============================================================
create table if not exists public.telegram_sessions (
    chat_id     text primary key,
    messages    jsonb not null default '[]'::jsonb,
    updated_at  timestamptz not null default now()
);

alter table public.telegram_sessions enable row level security;

drop policy if exists "Allow all on telegram_sessions" on public.telegram_sessions;
create policy "Allow all on telegram_sessions"
    on public.telegram_sessions
    for all
    using (true)
    with check (true);
