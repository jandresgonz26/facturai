import type { Task, TaskClarity, TaskConsequence } from '@/types'

/**
 * Prioridad calculada de las tareas. La idea de fondo: al usuario no se le
 * pide que etiquete "urgente", porque eso solo disfraza la misma decisión que
 * no sabe tomar. Se le preguntan dos cosas concretas —qué pasa si no lo hace
 * (consecuencia) y si sabe cómo hacerlo (claridad)— y el resto se deduce de lo
 * que el sistema ya sabe: fecha, dinero en juego y estado del cliente.
 */

export const CONSEQUENCE_OPTIONS: { id: TaskConsequence; label: string; short: string }[] = [
    { id: 'none', label: 'Nada realmente', short: 'Sin consecuencia' },
    { id: 'client_waiting', label: 'Un cliente se queda esperando', short: 'Cliente esperando' },
    { id: 'payment_delayed', label: 'Se retrasa un cobro', short: 'Retrasa un cobro' },
    { id: 'client_at_risk', label: 'Puedo perder el cliente o el trabajo', short: 'Cliente en riesgo' },
]

export const CLARITY_OPTIONS: { id: TaskClarity; label: string; short: string }[] = [
    { id: 'known', label: 'Sí, es mecánico', short: 'Sé cómo hacerla' },
    { id: 'partial', label: 'Más o menos, hay que investigar', short: 'Hay que investigar' },
    { id: 'unknown', label: 'No, hay que averiguar por dónde empezar', short: 'Sin forma clara' },
]

export const ESTIMATE_OPTIONS: { minutes: number; label: string }[] = [
    { minutes: 15, label: '15 min' },
    { minutes: 30, label: '30 min' },
    { minutes: 60, label: '1 h' },
    { minutes: 120, label: '2 h' },
    { minutes: 240, label: 'Media jornada' },
    { minutes: 480, label: 'Un día o más' },
]

/** Señales por cliente que suben la urgencia sin preguntarle nada al usuario. */
export interface ClientSignals {
    /** Clientes con alguna factura vencida: conviene no acumularles más trabajo sin cobrar. */
    overdueInvoice: Set<string>
    /** Leads o cotizaciones sin movimiento: el seguimiento comercial se enfría rápido. */
    coldLead: Set<string>
}

export const emptySignals = (): ClientSignals => ({ overdueInvoice: new Set(), coldLead: new Set() })

const CONSEQUENCE_WEIGHT: Record<TaskConsequence, number> = {
    none: 0,
    client_waiting: 30,
    payment_delayed: 40,
    client_at_risk: 55,
}

export type TaskLabel = 'now' | 'frog' | 'quick' | 'later'

export interface TaskPriority {
    urgency: number
    label: TaskLabel
    /** Trabajo de cabeza: sin forma clara o largo. Rinde más temprano. */
    deep: boolean
    /** Mecánica y corta: sirve para rellenar huecos o cerrar el día. */
    quick: boolean
    /** Por qué quedó así, en una frase, para que el usuario pueda no estar de acuerdo. */
    reason: string
}

export const LABEL_META: Record<TaskLabel, { text: string; emoji: string; className: string; border: string }> = {
    now: { text: 'Hazla ya', emoji: '🔥', className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300', border: 'border-l-red-500' },
    frog: { text: 'El sapo', emoji: '🐸', className: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', border: 'border-l-violet-500' },
    quick: { text: 'Ganar rápido', emoji: '⚡', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', border: 'border-l-amber-500' },
    later: { text: 'Puede esperar', emoji: '🌱', className: 'bg-muted text-muted-foreground', border: 'border-l-transparent' },
}

function daysUntil(date: string, today: string): number {
    return Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000)
}

export function scoreTask(task: Task, signals: ClientSignals = emptySignals(), today = new Date().toISOString().split('T')[0]): TaskPriority {
    const reasons: string[] = []
    let urgency = 0

    if (task.consequence) {
        urgency += CONSEQUENCE_WEIGHT[task.consequence]
        if (task.consequence !== 'none') {
            reasons.push(CONSEQUENCE_OPTIONS.find((c) => c.id === task.consequence)!.short.toLowerCase())
        }
    }

    if (task.due_date) {
        const d = daysUntil(task.due_date, today)
        if (d < 0) {
            urgency += 35
            reasons.push(`vencida hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'}`)
        } else if (d === 0) {
            urgency += 30
            reasons.push('es para hoy')
        } else if (d <= 2) {
            urgency += 20
            reasons.push(`faltan ${d} día${d === 1 ? '' : 's'}`)
        } else if (d <= 7) {
            urgency += 10
            reasons.push('es de esta semana')
        }
    }

    if (task.client_id) {
        if (signals.overdueInvoice.has(task.client_id)) {
            urgency += 10
            reasons.push('ese cliente tiene una factura vencida')
        }
        if (signals.coldLead.has(task.client_id)) {
            urgency += 8
            reasons.push('el seguimiento con ese cliente está frío')
        }
    }

    if (task.amount != null && task.amount > 0) {
        urgency += 5
        reasons.push('tiene dinero asociado')
    }

    urgency = Math.max(0, Math.min(100, urgency))

    const est = task.estimated_minutes ?? null
    const deep = task.clarity === 'unknown' || (est != null && est >= 120)
    const quick = !deep && (task.clarity === 'known' || est != null) && (est == null || est <= 30)

    let label: TaskLabel
    if (urgency >= 55 && deep) label = 'frog'
    else if (urgency >= 55) label = 'now'
    else if (quick) label = 'quick'
    else label = 'later'

    if (deep) reasons.push('no tiene forma clara todavía')
    else if (quick) reasons.push('es mecánica y corta')

    const reason = reasons.length ? reasons.join(' · ') : 'sin señales de urgencia'
    return { urgency, label, deep, quick, reason }
}

/** Orden sugerido: primero lo más urgente; a igualdad, lo que ya tiene fecha. */
export function sortByPriority(tasks: Task[], signals?: ClientSignals): Task[] {
    return [...tasks].sort((a, b) => {
        const pa = scoreTask(a, signals)
        const pb = scoreTask(b, signals)
        if (pb.urgency !== pa.urgency) return pb.urgency - pa.urgency
        if (!!b.due_date !== !!a.due_date) return b.due_date ? 1 : -1
        return (a.due_date ?? '').localeCompare(b.due_date ?? '')
    })
}

// ───────────── Franja del día ─────────────

export type DayBlock = 'morning' | 'afternoon' | 'evening'

export const BLOCK_META: Record<DayBlock, { title: string; hint: string }> = {
    morning: {
        title: 'Es temprano',
        hint: 'La cabeza rinde ahora: ataca lo que todavía no tiene forma clara, que es justo lo que se posterga.',
    },
    afternoon: {
        title: 'Media jornada',
        hint: 'Buena hora para lo que depende de otros: llamadas, propuestas y respuestas a clientes.',
    },
    evening: {
        title: 'Cerrando el día',
        hint: 'Con menos cabeza disponible, cierra con lo mecánico y corto.',
    },
}

export function currentBlock(now = new Date()): DayBlock {
    const h = now.getHours()
    if (h < 12) return 'morning'
    if (h < 18) return 'afternoon'
    return 'evening'
}

/**
 * Qué hacer ahora mismo, según la franja del día. No reordena la lista real:
 * solo propone, y siempre explica por qué propone cada cosa.
 */
export function suggestNow(tasks: Task[], signals?: ClientSignals, now = new Date(), limit = 3): { task: Task; priority: TaskPriority }[] {
    const block = currentBlock(now)
    const open = tasks.filter((t) => t.status !== 'done')

    const fit = (t: Task, p: TaskPriority): number => {
        if (block === 'morning') return p.deep ? 2 : 0
        if (block === 'afternoon') return t.consequence === 'client_waiting' || t.client_id ? 2 : 0
        return p.quick ? 2 : 0
    }

    return open
        .map((task) => ({ task, priority: scoreTask(task, signals) }))
        .sort((a, b) => {
            const fa = fit(a.task, a.priority)
            const fb = fit(b.task, b.priority)
            // Lo vencido o de consecuencia alta pesa más que la franja horaria.
            const urgentA = a.priority.urgency >= 70 ? 1 : 0
            const urgentB = b.priority.urgency >= 70 ? 1 : 0
            if (urgentB !== urgentA) return urgentB - urgentA
            if (fb !== fa) return fb - fa
            return b.priority.urgency - a.priority.urgency
        })
        .slice(0, limit)
}

// ───────────── Medición: estimado vs real ─────────────

export interface DriftBucket {
    clarity: TaskClarity
    samples: number
    ratio: number
}

/**
 * Cuánto se desvía la estimación según lo clara que estaba la tarea al
 * empezarla. Es la única forma honesta de corregir el cálculo: medir.
 */
export function computeDrift(tasks: Task[], minSamples = 3): DriftBucket[] {
    const buckets: DriftBucket[] = []
    for (const clarity of ['known', 'partial', 'unknown'] as TaskClarity[]) {
        const rows = tasks.filter(
            (t) => t.clarity === clarity && t.estimated_minutes != null && t.estimated_minutes > 0 && t.actual_minutes != null && t.actual_minutes > 0
        )
        if (rows.length < minSamples) continue
        const ratio = rows.reduce((s, t) => s + t.actual_minutes! / t.estimated_minutes!, 0) / rows.length
        buckets.push({ clarity, samples: rows.length, ratio: Math.round(ratio * 100) / 100 })
    }
    return buckets
}
