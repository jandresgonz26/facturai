-- ============================================================
--  FacturAI · El veredicto de ruido se calcula al leer, no se guarda
--  Guardarlo congelaba la decisión: al mejorar las reglas, lo ya
--  sincronizado se quedaba mal clasificado para siempre.
-- ============================================================

alter table public.inbox_items drop column if exists is_noise;
alter table public.inbox_items drop column if exists noise_reason;

drop index if exists inbox_items_noise_idx;
