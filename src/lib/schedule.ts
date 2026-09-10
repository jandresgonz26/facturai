import type { Task } from '@/types'
import { scoreTask, type ClientSignals, type TaskPriority } from './task-priority'

/**
 * Reparte las tareas del día en las ventanas de tiempo libres.
 *
 * Dos criterios que no son arbitrarios:
 *  1. Lo que no tiene forma clara va lo más temprano posible dentro de lo
 *     disponible. Es el trabajo que más cabeza pide y el que más se posterga.
 *  2. Lo que no cabe se dice, no se aprieta. Un horario que finge que todo
 *     entra es exactamente lo que genera la sensación de ir siempre atrasado.
 */

/** Ventana libre, en minutos desde medianoche. */
export interface Window {
    start: number
    end: number
    note?: string | null
}

export interface ScheduledBlock {
    task: Task
    priority: TaskPriority
    start: number
    end: number
    /** Empezó antes de la hora actual: ya debería estar en marcha o hecha. */
    inProgress: boolean
    past: boolean
}

export interface DaySchedule {
    blocks: ScheduledBlock[]
    /** Tareas que no entran en el tiempo disponible. */
    overflow: { task: Task; priority: TaskPriority }[]
    availableMinutes: number
    scheduledMinutes: number
    freeMinutes: number
}

/** Jornada por defecto cuando el usuario no ha dicho nada del día. */
export const DEFAULT_WINDOWS: Window[] = [
    { start: 9 * 60, end: 13 * 60 },
    { start: 14 * 60, end: 18 * 60 },
]

/** Minutos que se reservan entre tareas para respirar y cambiar de contexto. */
const GAP = 10
/** Si una tarea no trae estimación, se asume esto para poder colocarla. */
const DEFAULT_TASK_MINUTES = 30

export const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
}

export const toHHMM = (minutes: number): string => {
    const m = Math.max(0, Math.round(minutes))
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Formato amable para mostrar: "2:30 p. m." */
export function formatTime(minutes: number): string {
    const h24 = Math.floor(minutes / 60) % 24
    const m = Math.round(minutes) % 60
    const suffix = h24 < 12 ? 'a. m.' : 'p. m.'
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Recorta las ventanas para no planificar en horas que ya pasaron. */
export function trimPastWindows(windows: Window[], nowMinutes: number): Window[] {
    return windows
        .map((w) => (w.end <= nowMinutes ? null : { ...w, start: Math.max(w.start, nowMinutes) }))
        .filter((w): w is Window => w !== null && w.end > w.start)
}

/**
 * Construye el horario. Las tareas entran por prioridad, pero las de trabajo
 * profundo se adelantan dentro de ese orden para que caigan lo más temprano
 * que permita la disponibilidad.
 */
export function buildSchedule(
    tasks: Task[],
    windows: Window[],
    opts: { signals?: ClientSignals; nowMinutes?: number } = {}
): DaySchedule {
    const now = opts.nowMinutes ?? 0
    const usable = trimPastWindows(windows, now)

    const scored = tasks
        .filter((t) => t.status !== 'done')
        .map((task) => ({ task, priority: scoreTask(task, opts.signals) }))
        .sort((a, b) => {
            // Primero lo urgente; a igualdad, lo que pide más cabeza va antes.
            if (b.priority.urgency !== a.priority.urgency) return b.priority.urgency - a.priority.urgency
            if (a.priority.deep !== b.priority.deep) return a.priority.deep ? -1 : 1
            return 0
        })

    const blocks: ScheduledBlock[] = []
    const overflow: { task: Task; priority: TaskPriority }[] = []

    // Puntero de llenado por ventana.
    const cursors = usable.map((w) => w.start)

    for (const item of scored) {
        const needed = item.task.estimated_minutes ?? DEFAULT_TASK_MINUTES
        let placed = false
        for (let i = 0; i < usable.length; i++) {
            const w = usable[i]
            const start = cursors[i]
            if (start + needed <= w.end) {
                blocks.push({
                    task: item.task,
                    priority: item.priority,
                    start,
                    end: start + needed,
                    inProgress: now >= start && now < start + needed,
                    past: now >= start + needed,
                })
                cursors[i] = start + needed + GAP
                placed = true
                break
            }
        }
        if (!placed) overflow.push(item)
    }

    blocks.sort((a, b) => a.start - b.start)

    const availableMinutes = usable.reduce((s, w) => s + (w.end - w.start), 0)
    const scheduledMinutes = blocks.reduce((s, b) => s + (b.end - b.start), 0)

    return {
        blocks,
        overflow,
        availableMinutes,
        scheduledMinutes,
        freeMinutes: Math.max(0, availableMinutes - scheduledMinutes),
    }
}

/** Minutos transcurridos hoy en la zona del usuario. */
export function nowMinutesIn(timeZone: string, now = new Date()): number {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    return h * 60 + m
}
