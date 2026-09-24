import { supabase } from '@/lib/supabase'
import { ActionError, USER_TIMEZONE, parseInput, uuidSchema } from './validation'

/**
 * Recordatorios a una hora concreta. El asistente los crea ("recuérdame a
 * las 3…") y el cron /api/cron/reminders los manda por Telegram cuando toca.
 */

export interface Reminder {
    id: string
    text: string
    remind_at: string
    task_id: string | null
    sent_at: string | null
    cancelled: boolean
    created_at: string
    tasks?: { title: string; status: string } | null
}

/** Minutos que la zona del usuario va por delante de UTC en ese instante (Caracas: -240). */
function tzOffsetMinutes(at: Date): number {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: USER_TIMEZONE,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
            .formatToParts(at)
            .map((p) => [p.type, p.value])
    )
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
    return Math.round((asUtc - at.getTime()) / 60000)
}

/** "2026-09-24T15:00" en la hora del usuario → instante real. */
export function localDateTimeToUtc(local: string): Date {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(local.trim())
    if (!m) throw new ActionError('La hora del recordatorio tiene que ser YYYY-MM-DDTHH:mm', 'VALIDATION')
    const guess = new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`)
    return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000)
}

/** Instante → "jueves 24/09, 3:00 p. m." en la hora del usuario. */
export function formatReminderTime(iso: string): string {
    return new Intl.DateTimeFormat('es-VE', {
        timeZone: USER_TIMEZONE,
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(iso))
}

/**
 * Cuándo avisar: a una hora local ("a las 3") o dentro de X minutos ("en 10
 * minutos"). Lo relativo se calcula aquí y no en el modelo: el modelo puede
 * equivocarse de hora actual (p. ej. tomar la de un aviso viejo del chat).
 */
export type ReminderWhen = { at: string; in_minutes?: undefined } | { in_minutes: number; at?: undefined }

export async function createReminder(input: { text: string; task_id?: string | null } & ReminderWhen): Promise<Reminder> {
    const text = input.text.trim()
    if (text.length < 2) throw new ActionError('Falta de qué quieres que te recuerde', 'VALIDATION')
    if (input.task_id) parseInput(uuidSchema, input.task_id)
    const when = input.in_minutes != null ? new Date(Date.now() + Math.round(input.in_minutes) * 60000) : localDateTimeToUtc(input.at!)
    // Un minuto de margen: "recuérdame ahora en un rato" dicho justo en el borde.
    if (when.getTime() < Date.now() - 60000) {
        throw new ActionError(
            `Esa hora ya pasó (${formatReminderTime(when.toISOString())}); ahora mismo son las ${formatReminderTime(new Date().toISOString())}. Vuelve a calcularla desde la hora actual o usa in_minutes.`,
            'VALIDATION'
        )
    }
    const { data, error } = await supabase
        .from('reminders')
        .insert({ text, remind_at: when.toISOString(), task_id: input.task_id ?? null })
        .select('*, tasks(title, status)')
        .single()
    if (error) throw new ActionError(`No se pudo guardar el recordatorio (¿falta schema_update_reminders.sql?): ${error.message}`)
    return data as Reminder
}

/** Los que aún no se han mandado, del más próximo al más lejano. */
export async function listPendingReminders(): Promise<Reminder[]> {
    const { data, error } = await supabase
        .from('reminders')
        .select('*, tasks(title, status)')
        .is('sent_at', null)
        .eq('cancelled', false)
        .order('remind_at')
        .limit(50)
    if (error) throw new ActionError(`No se pudieron cargar los recordatorios: ${error.message}`)
    return (data || []) as Reminder[]
}

export async function cancelReminder(id: string): Promise<Reminder> {
    parseInput(uuidSchema, id)
    const { data, error } = await supabase.from('reminders').update({ cancelled: true }).eq('id', id).select('*, tasks(title, status)').maybeSingle()
    if (error) throw new ActionError(`No se pudo cancelar el recordatorio: ${error.message}`)
    if (!data) throw new ActionError('Ese recordatorio no existe', 'NOT_FOUND')
    return data as Reminder
}

/**
 * Toma los recordatorios que ya tocan y los marca como mandados en el mismo
 * paso. Marcar antes de mandar evita que dos pasadas del cron que se solapen
 * manden el mismo aviso dos veces; a cambio, si Telegram falla, ese aviso se
 * pierde (el cron lo registra en el log).
 */
export async function claimDueReminders(now = new Date()): Promise<Reminder[]> {
    const { data, error } = await supabase
        .from('reminders')
        .select('id')
        .is('sent_at', null)
        .eq('cancelled', false)
        .lte('remind_at', now.toISOString())
        .order('remind_at')
        .limit(20)
    if (error) throw new ActionError(`No se pudieron leer los recordatorios: ${error.message}`)
    const ids = ((data || []) as { id: string }[]).map((r) => r.id)
    if (ids.length === 0) return []

    const { data: claimed, error: claimError } = await supabase
        .from('reminders')
        .update({ sent_at: now.toISOString() })
        .in('id', ids)
        .is('sent_at', null)
        .select('*, tasks(title, status)')
    if (claimError) throw new ActionError(`No se pudieron marcar los recordatorios: ${claimError.message}`)
    return (claimed || []) as Reminder[]
}
