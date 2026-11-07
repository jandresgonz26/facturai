-- ============================================================
--  FacturAI · Puente Proyectos ↔ Facturación
--  Cada cuota de un proyecto puede tener su factura. Así, al registrar un abono que completa la cuota, su
--  factura queda pagada sola, y Facturación y Proyectos cuentan lo mismo.
--  Pega y ejecuta esto en el SQL Editor de Supabase (se puede repetir).
-- ============================================================

alter table facturai.control_cuotas
    add column if not exists invoice_id uuid references facturai.invoices(id) on delete set null;

create index if not exists control_cuotas_invoice_idx on facturai.control_cuotas (invoice_id);
