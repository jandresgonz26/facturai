import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/types'
import { getDayPlan, getClientSignals, listTasks } from './tasks'
import { ActionError, dateSchema, parseInput, todayISO, USER_TIMEZONE } from './validation'
import { DEFAULT_WINDOWS, buildSchedule, nowMinutesIn, toMinutes, toHHMM, type DaySchedule, type Window } from '@/lib/schedule'
import { emptySignals } from '@/lib/task-priority'

/**
 * Disponibilidad del día y horario resultante.
 *
 * Se guardan las ventanas LIBRES. Una reunión no se guarda como tal: parte el
 * día en dos ventanas. Es más simple de razonar y es justo lo que necesita el
 * algoritmo que reparte las tareas.
 */

const timeSchema = z
    .string()
    .trim()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'La hora debe ir como HH:MM (por ejemplo 14:00)')

export const availabilityWindowSchema = z
    .object({
        start: timeSchema,
        end: timeSchema,
        note: z.string().trim().max(200).nullable().optional(),
    })
    .refine((w) => toMinutes(w.end) > toMinutes(w.start), {
        message: 'La hora de fin debe ser posterior a la de inicio',
    })

export const setAvailabilitySchema = z.object({
    day: dateSchema.optional(),
    windows: z.array(availabilityWindowSchema).max(6, 'Demasiadas franjas para un día'),
})
export type SetAvailabilityInput = z.input<typeof setAvailabilitySchema>

export interface StoredWindow extends Window {
    id: string
}

/** Ventanas guardadas para un día. Vacío significa "no ha dicho nada". */
export async function getAvailability(day?: string): Promise<StoredWindow[]> {
    const d = day ? parseInput(dateSchema, day) : todayISO()
    const { data, error } = await supabase.from('day_availability').select('*').eq('day', d).order('start_time')
    if (error) throw new ActionError(`No se pudo consultar la disponibilidad: ${error.message}`)
    return ((data || []) as { id: string; start_time: string; end_time: string; note: string | null }[]).map((r) => ({
        id: r.id,
        start: toMinutes(r.start_time.slice(0, 5)),
        end: toMinutes(r.end_time.slice(0, 5)),
        note: r.note,
    }))
}

/** Reemplaza por completo la disponibilidad de un día. */
export async function setAvailability(raw: SetAvailabilityInput): Promise<StoredWindow[]> {
    const input = parseInput(setAvailabilitySchema, raw)
    const day = input.day ?? todayISO()

    const { error: delError } = await supabase.from('day_availability').delete().eq('day', day)
    if (delError) throw new ActionError(`No se pudo actualizar la disponibilidad: ${delError.message}`)

    if (input.windows.length === 0) return []

    const rows = input.windows.map((w) => ({
        day,
        start_time: `${w.start}:00`,
        end_time: `${w.end}:00`,
        note: w.note ?? null,
    }))
    const { error } = await supabase.from('day_availability').insert(rows)
    if (error) throw new ActionError(`No se pudo guardar la disponibilidad: ${error.message}`)
    return getAvailability(day)
}

/** Vuelve a la jornada por defecto (borra lo dicho para ese día). */
export async function clearAvailability(day?: string): Promise<void> {
    const d = day ? parseInput(dateSchema, day) : todayISO()
    const { error } = await supabase.from('day_availability').delete().eq('day', d)
    if (error) throw new ActionError(`No se pudo restablecer la disponibilidad: ${error.message}`)
}

export interface DayScheduleResult extends DaySchedule {
    day: string
    windows: Window[]
    /** true si son las horas por defecto porque el usuario no indicó nada. */
    usingDefaults: boolean
    nowMinutes: number
}

/**
 * Arma el horario del día con las tareas comprometidas. Si no hay plan hecho,
 * usa las abiertas más prioritarias, para que siempre haya algo que mostrar.
 */
export async function getDaySchedule(day?: string): Promise<DayScheduleResult> {
    const d = day ? parseInput(dateSchema, day) : todayISO()
    const isToday = d === todayISO()

    const [stored, plan, signals] = await Promise.all([
        getAvailability(d),
        getDayPlan(d).catch(() => null),
        getClientSignals().catch(() => emptySignals()),
    ])

    const windows: Window[] = stored.length > 0 ? stored : DEFAULT_WINDOWS
    let tasks: Task[] = plan ? [...plan.planned, ...plan.carriedOver] : []
    if (tasks.length === 0) {
        const open = await listTasks({ open_only: true }).catch(() => [] as Task[])
        tasks = open.slice(0, 8)
    }

    // Para días futuros se planifica el día entero, no desde "ahora".
    const nowMinutes = isToday ? nowMinutesIn(USER_TIMEZONE) : 0

    const schedule = buildSchedule(tasks, windows, { signals, nowMinutes })
    return { ...schedule, day: d, windows, usingDefaults: stored.length === 0, nowMinutes }
}

/** Texto corto de las ventanas, para confirmaciones y mensajes. */
export function describeWindows(windows: Window[]): string {
    if (windows.length === 0) return 'sin horas disponibles'
    return windows.map((w) => `${toHHMM(w.start)}–${toHHMM(w.end)}`).join(' y ')
}
