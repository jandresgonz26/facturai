/**
 * Objetivos (roadmap) de los agentes desde el chat: verlos con su avance, proponer uno nuevo, actualizarlo y
 * convertir sus pasos en hitos (tareas). Toda escritura pasa por la tarjeta de confirmación.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { errorMessage } from '@/lib/actions/validation'
import { DEPARTAMENTOS, type Departamento } from './shared'
import { METRICAS } from './metricas'
import { actualizarObjetivo, crearHito, crearObjetivo, listarObjetivos } from './objetivos'
import type { Alcance, ProyectoId } from './proyectos'

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try { return { ok: true, data: await fn() } } catch (e) { console.error('[objetivos tool]', e); return { ok: false, error: errorMessage(e) } }
}

const DEP = z.enum(Object.keys(DEPARTAMENTOS) as [Departamento, ...Departamento[]])
const CLAVES = ['manual', ...METRICAS.map((m) => m.key)] as [string, ...string[]]
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** `proyecto`: dónde se crean los objetivos; `lectura`: qué se lista (las rutinas leen todos los proyectos). */
export const objetivosTools = (proyecto: ProyectoId = null, lectura: Alcance = proyecto) => ({
    objetivos_listar: tool({
        description: 'Objetivos (roadmap) de un agente o de todos: meta, fecha límite, valor de hoy, avance de 0 a 1, estado e hitos (tareas). Úsala para «¿cómo van mis objetivos?», «¿qué toca ahora para llegar a la meta?» y al revisar el roadmap de un departamento.',
        inputSchema: z.object({ departamento: DEP.optional(), incluir_cerrados: z.boolean().optional() }),
        execute: async ({ departamento, incluir_cerrados }) => run(async () => (await listarObjetivos({ departamento, incluirCerrados: incluir_cerrados, alcance: lectura })).map((o) => ({
            id: o.id, departamento: o.departamento, titulo: o.titulo, ...(lectura === 'todos' ? { proyecto: o.proyecto ?? 'JAM Tech' } : {}), meta: o.valor_meta, unidad: o.unidad, inicial: o.valor_inicial, valor_hoy: o.valor,
            avance: o.avance === null ? null : Math.round(o.avance * 100) / 100, fecha_limite: o.fecha_limite, estado: o.estado,
            metrica: o.automatica ? o.etiquetaMetrica : 'manual', hitos: o.hitos.map((h) => ({ id: h.id, titulo: h.title, estado: h.status, fecha: h.due_date })),
        }))),
    }),

    objetivo_crear: tool({
        description: `Crea un objetivo en el roadmap de un agente: una meta concreta con cifra y fecha. Si existe una métrica automática que lo mide, úsala (el avance se calcula solo): ${METRICAS.map((m) => `${m.key} = ${m.etiqueta} (${DEPARTAMENTOS[m.departamento].nombre})`).join('; ')}. Si no, metrica = manual. Requiere confirmación.`,
        inputSchema: z.object({
            departamento: DEP, titulo: z.string().min(3).max(200), descripcion: z.string().max(600).optional(),
            metrica: z.enum(CLAVES).default('manual'), unidad: z.enum(['usd', 'numero', 'pct']).optional().describe('Solo para métrica manual'),
            valor_meta: z.number().optional(), valor_inicial: z.number().optional().describe('Vacío con métrica automática = el valor de hoy'),
            fecha_limite: fecha.optional(),
        }),
        execute: async (i) => run(() => crearObjetivo({ ...i, proyecto_id: proyecto })),
    }),

    objetivo_actualizar: tool({
        description: 'Cambia un objetivo: estado (activo, logrado, pausado, descartado), meta, fecha límite o el valor de hoy si es manual. Resuelve el id con objetivos_listar. Requiere confirmación.',
        inputSchema: z.object({
            objetivo_id: z.string().uuid(), titulo_actual: z.string().describe('Título del objetivo, para la confirmación'),
            estado: z.enum(['activo', 'logrado', 'pausado', 'descartado']).optional(), valor_meta: z.number().optional(),
            valor_actual: z.number().optional(), fecha_limite: fecha.optional(),
        }),
        execute: async ({ objetivo_id, estado, valor_meta, valor_actual, fecha_limite }) =>
            run(() => actualizarObjetivo(objetivo_id, { ...(estado ? { estado } : {}), ...(valor_meta !== undefined ? { valor_meta } : {}), ...(valor_actual !== undefined ? { valor_actual } : {}), ...(fecha_limite ? { fecha_limite } : {}) })),
    }),

    hito_crear: tool({
        description: 'Añade un hito a un objetivo: un paso concreto que se crea como tarea (aparece en Tareas y en el plan del día). Resuelve el id con objetivos_listar. Requiere confirmación.',
        inputSchema: z.object({ objetivo_id: z.string().uuid(), objetivo_titulo: z.string().describe('Para la confirmación'), titulo: z.string().min(3).max(200), fecha: fecha.optional() }),
        execute: async ({ objetivo_id, titulo, fecha: f }) => run(() => crearHito(objetivo_id, { titulo, fecha: f })),
    }),
})
