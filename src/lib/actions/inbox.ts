import { supabase } from '@/lib/supabase'
import { ActionError, uuidSchema, parseInput } from './validation'
import { createTask } from './tasks'
import { classifyNoise } from '@/lib/inbox-noise'
import type { Task } from '@/types'

/**
 * Correos traídos desde Spark por el puente que corre en el Mac
 * (scripts/spark-sync.mjs).
 *
 * Aquí solo hay cabeceras: quién escribió, sobre qué y cuándo. El cuerpo de los
 * correos nunca sale de la máquina del usuario, así que el asistente puede
 * mencionarlos y proponerlos como tarea, pero no leerlos.
 */

export interface InboxItem {
    id: string
    message_id: string
    account: string
    from_name: string | null
    from_email: string
    subject: string
    sent_at: string
    client_id: string | null
    task_id: string | null
    dismissed: boolean
    synced_at: string
    clients?: { name: string } | null
    /** Calculado al leer, no almacenado. */
    is_noise?: boolean
    noise_reason?: string | null
}

const SELECT = '*, clients(name)'

export interface InboxFilters {
    /** Excluye los descartados y los que ya son tarea. */
    pending_only?: boolean
    /** Incluye el correo automático que normalmente se oculta. */
    include_noise?: boolean
    limit?: number
}

/** Remitentes que el usuario silenció a fuerza de descartarlos. */
async function mutedSenders(): Promise<Set<string>> {
    const { data } = await supabase.from('muted_senders').select('from_email').eq('muted', true)
    return new Set(((data || []) as { from_email: string }[]).map((m) => m.from_email.toLowerCase()))
}

/**
 * El veredicto de ruido se calcula aquí y no se guarda: así, al afinar las
 * reglas, también se reclasifica lo que ya estaba sincronizado.
 */
export async function listInboxItems(filters: InboxFilters = {}): Promise<InboxItem[]> {
    let query = supabase.from('inbox_items').select(SELECT).order('sent_at', { ascending: false })
    if (filters.pending_only) query = query.eq('dismissed', false).is('task_id', null)
    query = query.limit(filters.limit ?? 60)
    const { data, error } = await query
    if (error) throw new ActionError(`No se pudieron cargar los correos: ${error.message}`)

    const muted = await mutedSenders().catch(() => new Set<string>())
    const rows = ((data || []) as InboxItem[]).map((i) => {
        const verdict = classifyNoise(i.from_email, i.subject, { isKnownClient: !!i.client_id, mutedSenders: muted })
        return { ...i, is_noise: verdict.isNoise, noise_reason: verdict.reason }
    })
    return filters.include_noise ? rows : rows.filter((i) => !i.is_noise)
}

export async function getInboxItem(id: string): Promise<InboxItem> {
    const { data, error } = await supabase.from('inbox_items').select(SELECT).eq('id', id).maybeSingle()
    if (error) throw new ActionError(`No se pudo consultar el correo: ${error.message}`)
    if (!data) throw new ActionError('Ese correo no está en la lista', 'NOT_FOUND')
    return data as InboxItem
}

/** A partir de cuántos descartes se silencia solo a un remitente. */
const MUTE_AFTER = 2

/**
 * "Este no me interesa": deja de proponerse, sin borrar el registro. Además
 * lleva la cuenta por remitente: si el usuario descarta lo mismo dos veces,
 * ese remitente se silencia solo y deja de aparecer en el futuro. Es la parte
 * que hace que el filtro mejore con el uso en vez de quedarse fijo.
 */
export async function dismissInboxItem(id: string): Promise<{ senderMuted: boolean; from_email: string }> {
    parseInput(uuidSchema, id)
    const item = await getInboxItem(id)

    const { error } = await supabase.from('inbox_items').update({ dismissed: true }).eq('id', id)
    if (error) throw new ActionError(`No se pudo descartar el correo: ${error.message}`)

    // A un cliente conocido nunca se le silencia por descartar un correo suyo.
    if (item.client_id) return { senderMuted: false, from_email: item.from_email }

    const email = item.from_email.toLowerCase()
    const { data: existing } = await supabase.from('muted_senders').select('id, dismissals, muted').eq('from_email', email).maybeSingle()
    const dismissals = (existing?.dismissals ?? 0) + 1
    const muted = dismissals >= MUTE_AFTER

    if (existing) {
        await supabase.from('muted_senders').update({ dismissals, muted, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
        await supabase.from('muted_senders').insert({ from_email: email, dismissals, muted })
    }
    return { senderMuted: muted, from_email: email }
}

/** Deshace el silenciado de un remitente ("vuélveme a mostrar los de X"). */
export async function unmuteSender(fromEmail: string): Promise<void> {
    const email = fromEmail.toLowerCase().trim()
    const { error } = await supabase.from('muted_senders').update({ muted: false, dismissals: 0 }).eq('from_email', email)
    if (error) throw new ActionError(`No se pudo reactivar ese remitente: ${error.message}`)
}

export async function listMutedSenders(): Promise<{ from_email: string; dismissals: number }[]> {
    const { data, error } = await supabase.from('muted_senders').select('from_email, dismissals').eq('muted', true).order('updated_at', { ascending: false })
    if (error) throw new ActionError(`No se pudieron cargar los remitentes silenciados: ${error.message}`)
    return (data || []) as { from_email: string; dismissals: number }[]
}

/**
 * Convierte un correo en tarea. Deja las dos partes enlazadas para no
 * proponerlo otra vez, y hereda el cliente si el remitente coincidía con uno.
 */
export async function createTaskFromInboxItem(
    id: string,
    input: { title?: string; due_date?: string | null; consequence?: Task['consequence']; clarity?: Task['clarity'] } = {}
): Promise<Task> {
    const item = await getInboxItem(id)
    if (item.task_id) {
        throw new ActionError(`Ese correo ya se convirtió en tarea.`)
    }

    const who = item.from_name || item.from_email
    // Solo se repite el correo entre paréntesis si aporta algo sobre el nombre.
    const quien = item.from_name ? `${item.from_name} (${item.from_email})` : item.from_email
    const task = await createTask({
        title: input.title || `Responder a ${who}: ${item.subject}`,
        client_id: item.client_id ?? undefined,
        due_date: input.due_date ?? undefined,
        consequence: input.consequence ?? undefined,
        clarity: input.clarity ?? undefined,
        notes: `Viene del correo de ${quien} del ${item.sent_at.split('T')[0]}.`,
        source_email_id: `${item.account}:${item.message_id}`,
    })

    const { error } = await supabase.from('inbox_items').update({ task_id: task.id }).eq('id', id)
    if (error) console.warn('[inbox] tarea creada pero no se pudo enlazar al correo', error.message)
    return task
}

/** Cuándo se sincronizó por última vez, para avisar si el puente lleva días parado. */
export async function getInboxFreshness(): Promise<{ last_sync: string | null; pending: number }> {
    const { data, error } = await supabase
        .from('inbox_items')
        .select('synced_at, dismissed, task_id')
        .order('synced_at', { ascending: false })
        .limit(200)
    if (error) throw new ActionError(`No se pudo revisar el estado del buzón: ${error.message}`)
    const rows = (data || []) as { synced_at: string; dismissed: boolean; task_id: string | null }[]
    return {
        last_sync: rows[0]?.synced_at ?? null,
        pending: rows.filter((r) => !r.dismissed && !r.task_id).length,
    }
}
