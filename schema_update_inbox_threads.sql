-- Antes se guardaba un registro por MENSAJE, no por HILO: un hilo con 6
-- respuestas (como el de "Consulta Optimización GEO") quedaba repartido en 6
-- filas casi idénticas, cada una con el cuerpo del hilo congelado en el
-- momento en que ESA fila se sincronizó. El asistente no tenía forma
-- confiable de saber cuál de las 6 era la más reciente, así que a veces
-- contestaba con una versión vieja del hilo aunque ya hubiera mensajes más
-- nuevos guardados en otra fila.
--
-- Ahora la identidad de la fila es el HILO (thread_key: un token estable
-- que da el propio CLI de Spark, igual sin importar qué mensaje del hilo se
-- consulte), no el mensaje: cada mensaje nuevo actualiza la misma fila en
-- vez de crear una nueva, y el cuerpo guardado (que ya era el hilo completo)
-- siempre queda al día del último mensaje visto.
--
-- Los datos actuales son de las pruebas de los últimos 2 días: se limpian y
-- se vuelven a sincronizar con el modelo correcto en vez de reconciliar a
-- mano las filas parciales que ya existían.

truncate table public.inbox_items;

alter table public.inbox_items drop column if exists thread_key;
alter table public.inbox_items add column thread_key text not null;

drop index if exists public.inbox_items_msg_uniq;
create unique index if not exists inbox_items_thread_uniq on public.inbox_items (account, thread_key);
