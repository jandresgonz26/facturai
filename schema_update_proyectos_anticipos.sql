-- ============================================================
--  FacturAI · Proyectos: facturar lo cobrado (anticipos)
--  Cada línea de factura puede decir de qué cuota del proyecto es. Así una cuota puede facturarse en partes
--  (un anticipo en una factura y el saldo en otra) y cada pago del cliente tiene su factura por lo que pagó.
--  Requiere schema_update_proyectos_facturas.sql. Pega y ejecuta esto en el SQL Editor de Supabase (se puede repetir).
-- ============================================================

alter table facturai.logs
    add column if not exists control_cuota_id uuid references facturai.control_cuotas(id) on delete set null;

create index if not exists logs_control_cuota_idx on facturai.logs (control_cuota_id);

-- Las facturas que ya estaban enlazadas a una cuota: sus líneas pasan a contar como de esa cuota.
update facturai.logs l
set control_cuota_id = c.id
from facturai.control_cuotas c
where c.invoice_id is not null
  and l.invoice_id = c.invoice_id
  and l.control_cuota_id is null;
