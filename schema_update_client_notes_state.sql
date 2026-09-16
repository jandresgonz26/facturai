-- Notas de cliente con estado. Antes una nota solo se podía agregar y borrar:
-- ni editar, ni marcar como resuelta, ni destacar. Ahora:
--   pinned      → "lo que hay que saber" de este cliente: sube arriba, se ve
--                 en la cabecera de la ficha y es lo primero que lee el asistente.
--   resolved_at → tachada; se pliega en "resueltas" y se puede reabrir.
--   task_id     → si la nota era en realidad algo por hacer, quedó convertida
--                 en tarea y este es el enlace.
--   updated_at  → última edición del texto.

alter table public.client_notes add column if not exists pinned boolean not null default false;
alter table public.client_notes add column if not exists resolved_at timestamptz;
alter table public.client_notes add column if not exists updated_at timestamptz;
alter table public.client_notes add column if not exists task_id uuid references public.tasks(id) on delete set null;

create index if not exists client_notes_pinned_idx on public.client_notes (client_id, pinned) where pinned;
