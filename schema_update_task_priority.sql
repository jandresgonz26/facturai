-- ============================================================
--  FacturAI · Prioridad automática de tareas
--  Dos preguntas al crear la tarea, de las que sale la prioridad
--  calculada (no se etiqueta a mano), más medición de estimado vs real.
-- ============================================================

-- Pregunta 1: "Si esto no se hace esta semana, ¿qué pasa?"
--   none            = nada realmente
--   client_waiting  = un cliente se queda esperando
--   payment_delayed = se retrasa un cobro
--   client_at_risk  = puedo perder el cliente o el trabajo
alter table public.tasks
    add column if not exists consequence text
        check (consequence in ('none', 'client_waiting', 'payment_delayed', 'client_at_risk'));

-- Pregunta 2: "¿Ya sabes exactamente cómo hacerlo?"
--   known   = sí, es mecánico
--   partial = más o menos, hay que investigar
--   unknown = no, hay que averiguar por dónde empezar
alter table public.tasks
    add column if not exists clarity text
        check (clarity in ('known', 'partial', 'unknown'));

-- Medición: cuánto creías que tomaba vs cuánto tomó de verdad (en minutos).
-- Ambos opcionales: sin ellos el resto sigue funcionando igual.
alter table public.tasks add column if not exists estimated_minutes integer;
alter table public.tasks add column if not exists actual_minutes integer;

create index if not exists tasks_consequence_idx on public.tasks (consequence);
