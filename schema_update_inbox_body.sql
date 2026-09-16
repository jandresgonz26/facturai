-- Cuerpo del correo (opcional, con vencimiento). Antes solo se guardaban
-- cabeceras; ahora el puente de Spark también sube el texto del hilo para
-- los correos que no sean ruido automático, con las contraseñas que pueda
-- traer ya tachadas en el propio Mac antes de subir nada.
--
-- body_synced_at es la fecha de referencia para el vencimiento: distinta de
-- synced_at (que se toca en cada re-sincronización aunque no haya cuerpo
-- nuevo), para poder borrar solo cuerpos viejos sin afectar el resto del
-- registro.

alter table public.inbox_items add column if not exists body text;
alter table public.inbox_items add column if not exists body_synced_at timestamptz;
