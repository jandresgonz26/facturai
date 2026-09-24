-- ============================================================
--  FacturAI · Clientes que se facturan en bolívares
--  El precio se acuerda y se registra en USD ("el servicio cuesta $40"),
--  pero a estos clientes la factura se les emite solo en Bs. Cada factura
--  guarda su propia tasa: por defecto la del BCV del día en que se crea,
--  y se puede cambiar, o poner directamente el total en Bs que pagaron.
-- ============================================================

-- USD = factura en dólares (como siempre). VES = factura en bolívares.
alter table public.clients add column if not exists invoice_currency text not null default 'USD';
alter table public.clients drop constraint if exists clients_invoice_currency_check;
alter table public.clients add constraint clients_invoice_currency_check check (invoice_currency in ('USD', 'VES'));

-- Si ves_total tiene valor, la factura es en bolívares. ves_rate = Bs por USD.
alter table public.invoices add column if not exists ves_rate numeric(16, 4);
alter table public.invoices add column if not exists ves_total numeric(18, 2);

-- Tasa Bs/USD manual: si se define, manda sobre la del BCV (igual que la de EUR).
alter table public.company_settings add column if not exists ves_usd_rate numeric(16, 4);
