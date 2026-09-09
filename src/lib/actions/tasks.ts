import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Log, Task, TaskStatus } from '@/types'
import { getClient } from './clients'
import { addLog } from './logs'
import { ActionError, dateSchema, descriptionSchema, parseInput, round2, todayISO, uuidSchema } from './validation'

export const TASK_SELECT = '*, clients(name, billing_modality, preferred_input_currency)'

export const TASK_COLUMNS: { id: TaskStatus; label: string }[] = [
    { id: 'todo', label: 'Por hacer' },
    { id: 'doing', label: 'En curso' },
    { id: 'done', label: 'Hechas' },
]

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

export const taskInputSchema = z.object({
    title: descriptionSchema,
    notes: z.preprocess(blankToNull, z.string().trim().max(2000).nullable().optional()),
    status: z.enum(['todo', 'doing', 'done']).default('todo'),
    client_id: z.preprocess(blankToNull, uuidSchema.nullable().optional()),
    due_date: z.preprocess(blankToNull, dateSchema.nullable().optional()),
    hours: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().positive('Las horas deben ser mayores que 0').nullable().optional()),
    amount: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().positive('El monto debe ser mayor que 0').nullable().optional()),
})
export type TaskInput = z.input<typeof taskInputSchema>

function toRow(input: z.infer<typeof taskInputSchema>) {
    return {
        title: input.title,
        notes: input.notes ?? null,
        status: input.status,
        client_id: input.client_id ?? null,
        due_date: input.due_date ?? null,
        hours: input.hours == null ? null : round2(input.hours),
        amount: input.amount == null ? null : round2(input.amount),
    }
}

export interface TaskFilters {
    status?: TaskStatus
    client_id?: string
    /** Solo tareas sin terminar (todo + doing). */
    open_only?: boolean
}

export async function listTasks(filters: TaskFilters = {}): Promise<Task[]> {
    let query = supabase.from('tasks').select(TASK_SELECT).order('position').order('created_at', { ascending: false })
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.client_id) query = query.eq('client_id', filters.client_id)
    if (filters.open_only) query = query.neq('status', 'done')
    const { data, error } = await query
    if (error) throw new ActionError(`No se pudieron cargar las tareas: ${error.message}`)
    return (data || []) as Task[]
}

export async function getTask(id: string): Promise<Task> {
    const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()
    if (error) throw new ActionError(`No se pudo consultar la tarea: ${error.message}`)
    if (!data) throw new ActionError('La tarea no existe', 'NOT_FOUND')
    return data as Task
}

/** Siguiente posición libre al final de una columna. */
async function nextPosition(status: TaskStatus): Promise<number> {
    const { data, error } = await supabase.from('tasks').select('position').eq('status', status).order('position', { ascending: false }).limit(1)
    if (error) throw new ActionError(`No se pudo calcular la posición: ${error.message}`)
    return Number(data?.[0]?.position ?? 0) + 1
}

export async function createTask(raw: TaskInput): Promise<Task> {
    const input = parseInput(taskInputSchema, raw)
    if (input.client_id) await getClient(input.client_id)
    const row = { ...toRow(input), position: await nextPosition(input.status), completed_at: input.status === 'done' ? new Date().toISOString() : null }
    const { data, error } = await supabase.from('tasks').insert(row).select(TASK_SELECT).single()
    if (error) throw new ActionError(`No se pudo crear la tarea: ${error.message}`)
    return data as Task
}

export async function updateTask(id: string, raw: TaskInput): Promise<Task> {
    const input = parseInput(taskInputSchema, raw)
    const current = await getTask(id)
    if (input.client_id) await getClient(input.client_id)
    const patch: Record<string, unknown> = toRow(input)
    // La marca de completada se mantiene alineada con el estado.
    if (input.status === 'done' && current.status !== 'done') patch.completed_at = new Date().toISOString()
    if (input.status !== 'done') patch.completed_at = null
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_SELECT).single()
    if (error) throw new ActionError(`No se pudo actualizar la tarea: ${error.message}`)
    return data as Task
}

/** Mueve una tarea de columna (arrastrar y soltar): la coloca al final de la columna destino. */
export async function moveTask(id: string, status: TaskStatus): Promise<Task> {
    const current = await getTask(id)
    if (current.status === status) return current
    const patch: Record<string, unknown> = {
        status,
        position: await nextPosition(status),
        completed_at: status === 'done' ? new Date().toISOString() : null,
    }
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_SELECT).single()
    if (error) throw new ActionError(`No se pudo mover la tarea: ${error.message}`)
    return data as Task
}

export async function deleteTask(id: string): Promise<void> {
    await getTask(id)
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw new ActionError(`No se pudo eliminar la tarea: ${error.message}`)
}

/**
 * Convierte la tarea en un ítem facturable pendiente (el mismo tipo de ítem que
 * se registra desde Actividades), para que entre en el flujo normal de
 * facturación del cliente. Deja la tarea enlazada al ítem creado, de modo que
 * no se pueda registrar dos veces por accidente.
 */
export async function registerTaskAsLog(taskId: string, category?: string): Promise<Log> {
    const task = await getTask(taskId)
    if (task.log_id) {
        throw new ActionError(`"${task.title}" ya se registró como ítem facturable.`)
    }
    if (!task.client_id) {
        throw new ActionError('La tarea no tiene cliente asignado: elige uno antes de registrarla para facturar.')
    }
    if (task.amount == null && task.hours == null) {
        throw new ActionError('La tarea no tiene monto ni horas: indica cuánto cobrar antes de registrarla.')
    }

    const log = await addLog({
        client_id: task.client_id,
        description: task.title,
        amount: task.amount ?? undefined,
        hours: task.hours ?? undefined,
        category,
        date: task.completed_at ? task.completed_at.split('T')[0] : todayISO(),
    })

    const { error } = await supabase.from('tasks').update({ log_id: log.id }).eq('id', taskId)
    if (error) {
        // El ítem ya existe y es válido; solo falló el enlace. Se avisa sin deshacerlo.
        console.warn('[tasks] ítem creado pero no se pudo enlazar a la tarea', error.message)
    }
    return log
}
