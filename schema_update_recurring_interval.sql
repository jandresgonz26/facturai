-- Servicios fijos con frecuencia distinta de mensual (trimestral, semestral,
-- anual). Antes todo servicio fijo se cargaba TODOS los meses sin excepción;
-- ahora se puede decir "cada N meses", y el monto guardado sigue siendo el
-- que se cobra CADA VEZ que toca (si es trimestral, el total del trimestre,
-- no un promedio mensual).
--
-- next_period en null significa "siempre debido": así los servicios
-- mensuales que ya existían (interval_months queda en 1 por defecto) se
-- comportan exactamente igual que antes, sin ningún cambio de conducta.

alter table public.recurring_services add column if not exists interval_months integer not null default 1;
alter table public.recurring_services add column if not exists next_period text;

alter table public.recurring_services drop constraint if exists recurring_services_interval_check;
alter table public.recurring_services add constraint recurring_services_interval_check check (interval_months >= 1 and interval_months <= 12);
