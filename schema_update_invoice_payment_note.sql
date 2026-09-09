-- ============================================================
--  FacturAI · Nota de pago por factura (override de la condición
--  estándar del cliente para una factura puntual)
--  Pega y ejecuta esto en el SQL Editor de Supabase.
-- ============================================================

-- NULL       = sin override: se usa la condición de pago del cliente (clients.payment_terms).
-- ''         = override explícito "sin nota": no se imprime nada, aunque el cliente tenga una.
-- 'texto...' = override con un texto propio de esta factura (ej. "50% ahora, 50% al finalizar").
alter table public.invoices
    add column if not exists payment_note text;
