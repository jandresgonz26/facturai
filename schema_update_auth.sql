-- Cierre de la base de datos: hasta ahora todas las políticas daban acceso
-- total al rol `public` (la clave anon del navegador). Desde aquí, solo un
-- usuario con sesión (rol `authenticated`) puede leer o escribir; los
-- procesos del servidor (Telegram, cron, Spark) usan la service role key,
-- que no pasa por RLS.
--
-- Ejecutar con: npm run migrate -- schema_update_auth.sql
-- Antes de ejecutarlo en producción, SUPABASE_SERVICE_ROLE_KEY debe estar
-- configurada en el servidor; si no, Telegram y el cron se quedan sin datos.

begin;

-- ───────────── Tablas ─────────────

drop policy if exists "Allow all on client_notes" on public.client_notes;
drop policy if exists "Enable read access for all users" on public.clients;
drop policy if exists "Enable update access for all users" on public.clients;
drop policy if exists "Enable insert access for all users" on public.clients;
drop policy if exists "Enable delete access for all users" on public.clients;
drop policy if exists "Enable update access for all users" on public.company_settings;
drop policy if exists "Enable read access for all users" on public.company_settings;
drop policy if exists "Allow all on day_availability" on public.day_availability;
drop policy if exists "Allow all on email_log" on public.email_log;
drop policy if exists "Allow all on inbox_items" on public.inbox_items;
drop policy if exists "Enable delete access for all users" on public.invoices;
drop policy if exists "Enable update access for all users" on public.invoices;
drop policy if exists "Enable read access for all users" on public.invoices;
drop policy if exists "Enable insert access for all users" on public.invoices;
drop policy if exists "Enable read access for all users" on public.logs;
drop policy if exists "Enable delete access for all users" on public.logs;
drop policy if exists "Enable insert access for all users" on public.logs;
drop policy if exists "Enable update access for all users" on public.logs;
drop policy if exists "Allow all on muted_senders" on public.muted_senders;
drop policy if exists "Allow all on nudges" on public.nudges;
drop policy if exists "Allow all on quotes" on public.quotes;
drop policy if exists "Allow all for authenticated users on recurring_services" on public.recurring_services;
drop policy if exists "Allow all on tasks" on public.tasks;
drop policy if exists "Allow all on telegram_sessions" on public.telegram_sessions;

alter table public.service_categories enable row level security;

do $$
declare
    t text;
begin
    foreach t in array array[
        'client_notes', 'clients', 'company_settings', 'day_availability', 'email_log',
        'inbox_items', 'invoices', 'logs', 'muted_senders', 'nudges', 'quotes',
        'recurring_services', 'service_categories', 'tasks', 'telegram_sessions'
    ]
    loop
        execute format('drop policy if exists "Solo usuarios autenticados" on public.%I', t);
        execute format(
            'create policy "Solo usuarios autenticados" on public.%I for all to authenticated using (true) with check (true)',
            t
        );
    end loop;
end $$;

-- ───────────── Storage (bucket de logos) ─────────────
-- La lectura sigue pública: el logo se muestra en facturas y correos.
-- Subir, cambiar o borrar exige sesión.

drop policy if exists "Allow public uploads to logos bucket" on storage.objects;
drop policy if exists "Allow public updates to logos bucket" on storage.objects;
drop policy if exists "Allow public deletes from logos bucket" on storage.objects;

drop policy if exists "Logos: subir con sesión" on storage.objects;
drop policy if exists "Logos: cambiar con sesión" on storage.objects;
drop policy if exists "Logos: borrar con sesión" on storage.objects;

create policy "Logos: subir con sesión" on storage.objects
    for insert to authenticated with check (bucket_id = 'logos');
create policy "Logos: cambiar con sesión" on storage.objects
    for update to authenticated using (bucket_id = 'logos');
create policy "Logos: borrar con sesión" on storage.objects
    for delete to authenticated using (bucket_id = 'logos');

commit;
