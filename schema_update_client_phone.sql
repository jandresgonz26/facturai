-- Teléfono del cliente (opcional). Sale en la factura si se rellena.
alter table public.clients add column if not exists phone text;
