import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Log, Task, TaskRecurrence, TaskStatus } from '@/types'
import { getClient } from './clients'
import { getPipeline } from './crm'
import { addLog } from './logs'
import { emptySignals, type ClientSignals } from '@/lib/task-priority'
import { ActionError, addDaysISO, dateSchema, descriptionSchema, parseInput, round2, todayISO, uuidSchema } from './validation'

// Las subtareas se piden anidadas: así el tablero puede mostrar "2/5" sin una
// consulta aparte por tarjeta, y el diálogo de edición ya trae el checklist.
export const TASK_SELECT = '*, clients(name, billing_modality, preferred_input_currency), task_subtasks(id, title, done, position)'

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
    // Las dos preguntas de las que sale la prioridad calculada.
    consequence: z.preprocess(blankToNull, z.enum(['none', 'client_waiting', 'payment_delayed', 'client_at_risk']).nullable().optional()),
    clarity: z.preprocess(blankToNull, z.enum(['known', 'partial', 'unknown']).nullable().optional()),
    estimated_minutes: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().nullable().optional()),
    /** Message-Id del correo del que nació la tarea, para no duplicarla. */
    source_email_id: z.preprocess(blankToNull, z.string().trim().max(500).nullable().optional()),
    /** Si se repite, la regla; null/undefined = tarea suelta, no se regenera al completarla. */
    recurrence: z.preprocess(
        blankToNull,
        z
            .object({
                freq: z.enum(['daily', 'weekly', 'monthly']),
                interval: z.number().int().min(1).max(365),
                days_of_week: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
            })
            .nullable()
            .optional()
    ),
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
        consequence: input.consequence ?? null,
        clarity: input.clarity ?? null,
        estimated_minutes: input.estimated_minutes ?? null,
        source_email_id: input.source_email_id ?? null,
        recurrence: input.recurrence ?? null,
    }
}

/** Suma meses a una fecha YYYY-MM-DD, recortando al último día del mes destino si no existe (31 ene + 1 mes = 28/29 feb). */
function addMonthsISO(iso: string, months: number): string {
    const [y, m, d] = iso.split('-').map(Number)
    const total = (m - 1) + months
    const ny = y + Math.floor(total / 12)
    const nm = ((total % 12) + 12) % 12
    const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
    const nd = Math.min(d, lastDay)
    return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}

/** Próxima fecha en que le toca a una tarea recurrente, a partir de la fecha base que tenía. */
export function computeNextOccurrenceDate(base: string, rec: TaskRecurrence): string {
    const interval = Math.max(1, rec.interval || 1)
    if (rec.freq === 'daily') return addDaysISO(base, interval)
    if (rec.freq === 'monthly') return addMonthsISO(base, interval)
    // weekly, con días concretos: el próximo de la lista después de la base.
    if (rec.days_of_week && rec.days_of_week.length > 0) {
        let d = addDaysISO(base, 1)
        for (let i = 0; i < 14; i++) {
            const dow = new Date(`${d}T00:00:00Z`).getUTCDay()
            if (rec.days_of_week.includes(dow)) return d
            d = addDaysISO(d, 1)
        }
    }
    return addDaysISO(base, 7 * interval)
}

/**
 * Al completar una tarea con regla de repetición, deja lista la siguiente. Es
 * "mejor esfuerzo": si falla, la tarea de hoy igual queda completada — no se
 * pierde el cierre por un problema al programar la próxima.
 */
async function spawnNextOccurrence(task: Task): Promise<void> {
    if (!task.recurrence) return
    const base = task.due_date ?? task.planned_for ?? todayISO()
    const nextDate = computeNextOccurrenceDate(base, task.recurrence)
    try {
        await createTask({
            title: task.title,
            notes: task.notes ?? null,
            status: 'todo',
            client_id: task.client_id ?? null,
            due_date: nextDate,
            hours: task.hours ?? null,
            amount: task.amount ?? null,
            consequence: task.consequence ?? null,
            clarity: task.clarity ?? null,
            estimated_minutes: task.estimated_minutes ?? null,
            recurrence: task.recurrence,
        })
    } catch (e) {
        console.warn('[tasks] no se pudo generar la siguiente ocurrencia recurrente', e)
    }
}

export interface TaskFilters {
    status?: TaskStatus
    client_id?: string
    /** Solo tareas sin terminar (todo + doing). */
    open_only?: boolean
}

export async function listTasks(filters: TaskFilters = {}): Promise<Task[]> {
    let query = supabase
        .from('tasks')
        .select(TASK_SELECT)
        .order('position')
        .order('created_at', { ascending: false })
        .order('position', { referencedTable: 'task_subtasks', ascending: true })
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.client_id) query = query.eq('client_id', filters.client_id)
    if (filters.open_only) query = query.neq('status', 'done')
    const { data, error } = await query
    if (error) throw new ActionError(`No se pudieron cargar las tareas: ${error.message}`)
    return (data || []) as Task[]
}

export async function getTask(id: string): Promise<Task> {
    const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('id', id)
        .order('position', { referencedTable: 'task_subtasks', ascending: true })
        .maybeSingle()
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
    const completing = input.status === 'done' && current.status !== 'done'
    if (completing) patch.completed_at = new Date().toISOString()
    if (input.status !== 'done') patch.completed_at = null
    // Empujar la fecha límite desde el editor también delata evitación, igual
    // que empujar el día planificado: antes solo contaba lo segundo, y era
    // fácil "posponer" en silencio con solo cambiar el vencimiento.
    if (current.due_date && input.due_date && input.due_date > current.due_date && current.status !== 'done') {
        patch.postponed_count = (current.postponed_count ?? 0) + 1
    }
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_SELECT).single()
    if (error) throw new ActionError(`No se pudo actualizar la tarea: ${error.message}`)
    if (completing) await spawnNextOccurrence(data as Task)
    return data as Task
}

/**
 * Mueve una tarea de columna (arrastrar y soltar): la coloca al final de la
 * columna destino. Al darla por hecha se puede registrar cuánto tomó de
 * verdad, que es lo que después permite medir la desviación del cálculo.
 */
export async function moveTask(id: string, status: TaskStatus, actualMinutes?: number | null): Promise<Task> {
    const current = await getTask(id)
    if (current.status === status && actualMinutes == null) return current
    const completing = status === 'done' && current.status !== 'done'
    const patch: Record<string, unknown> = {
        status,
        position: current.status === status ? current.position : await nextPosition(status),
        completed_at: status === 'done' ? current.completed_at ?? new Date().toISOString() : null,
    }
    if (status === 'done' && actualMinutes != null) patch.actual_minutes = Math.round(actualMinutes)
    if (status !== 'done') patch.actual_minutes = null
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_SELECT).single()
    if (error) throw new ActionError(`No se pudo mover la tarea: ${error.message}`)
    if (completing) await spawnNextOccurrence(data as Task)
    return data as Task
}

/**
 * Compromete (o saca) una tarea para un día concreto. Si ya estaba comprometida
 * para un día anterior y sigue abierta, cuenta como posposición: ese contador es
 * el que después delata la tarea que se está evitando.
 */
export async function planTask(id: string, date: string | null): Promise<Task> {
    const task = await getTask(id)
    const target = date ? parseInput(dateSchema, date) : null
    const patch: Record<string, unknown> = { planned_for: target }

    const wasPushed = !!task.planned_for && !!target && target > task.planned_for && task.status !== 'done'
    if (wasPushed) patch.postponed_count = (task.postponed_count ?? 0) + 1

    const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_SELECT).single()
    if (error) throw new ActionError(`No se pudo planificar la tarea: ${error.message}`)
    return data as Task
}

export interface DayPlan {
    date: string
    /** Comprometidas para ese día. */
    planned: Task[]
    /** Venían de días anteriores y siguen abiertas: hay que decidir qué hacer con ellas. */
    carriedOver: Task[]
    /** Abiertas sin día asignado, de donde se elige para armar el plan. */
    available: Task[]
    estimatedMinutes: number
    /** Minutos de trabajo enfocado que se consideran un día realista. */
    capacityMinutes: number
}

export const DAY_CAPACITY_MINUTES = 300 // 5 h de trabajo con cabeza, no 8

/** Plan de un día: lo comprometido, lo arrastrado y lo disponible para elegir. */
export async function getDayPlan(date?: string): Promise<DayPlan> {
    const day = date ? parseInput(dateSchema, date) : todayISO()
    const open = await listTasks({ open_only: true })

    const planned = open.filter((t) => t.planned_for === day)
    const carriedOver = open.filter((t) => !!t.planned_for && t.planned_for < day)
    const available = open.filter((t) => !t.planned_for)

    return {
        date: day,
        planned,
        carriedOver,
        available,
        estimatedMinutes: planned.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0),
        capacityMinutes: DAY_CAPACITY_MINUTES,
    }
}

/**
 * Señales que el sistema ya conoce y que suben la urgencia de una tarea sin
 * preguntarle nada al usuario: clientes con facturas vencidas y clientes cuyo
 * seguimiento comercial se está enfriando.
 */
export async function getClientSignals(): Promise<ClientSignals> {
    const signals = emptySignals()
    const today = todayISO()

    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('client_id, due_date, issue_date, status')
        .neq('status', 'paid')
    if (error) throw new ActionError(`No se pudieron revisar las facturas: ${error.message}`)

    for (const inv of (invoices || []) as { client_id: string; due_date: string | null; issue_date: string }[]) {
        const overdue = inv.due_date
            ? inv.due_date < today
            : (Date.now() - new Date(inv.issue_date).getTime()) / 86400000 > 30
        if (overdue) signals.overdueInvoice.add(inv.client_id)
    }

    // Leads y cotizados sin movimiento reciente: el pipeline ya calcula los días.
    try {
        const pipeline = await getPipeline()
        for (const c of [...pipeline.lead, ...pipeline.quoted]) {
            const stage = c.client.stage ?? 'active'
            const days = c.days_since_activity ?? 0
            if ((stage === 'lead' && days >= 7) || (stage === 'quoted' && days >= 15)) {
                signals.coldLead.add(c.client.id)
            }
        }
    } catch {
        // Sin pipeline disponible, la prioridad sigue funcionando con el resto de señales.
    }

    return signals
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
