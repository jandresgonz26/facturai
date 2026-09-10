import { supabase } from '@/lib/supabase'
import { ActionError, uuidSchema, parseInput } from './validation'
import { createTask } from './tasks'
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
}

const SELECT = '*, clients(name)'

export interface InboxFilters {
    /** Excluye los descartados y los que ya son tarea. */
    pending_only?: boolean
    limit?: number
}

export async function listInboxItems(filters: InboxFilters = {}): Promise<InboxItem[]> {
    let query = supabase.from('inbox_items').select(SELECT).order('sent_at', { ascending: false })
    if (filters.pending_only) query = query.eq('dismissed', false).is('task_id', null)
    query = query.limit(filters.limit ?? 40)
    const { data, error } = await query
    if (error) throw new ActionError(`No se pudieron cargar los correos: ${error.message}`)
    return (data || []) as InboxItem[]
}

export async function getInboxItem(id: string): Promise<InboxItem> {
    const { data, error } = await supabase.from('inbox_items').select(SELECT).eq('id', id).maybeSingle()
    if (error) throw new ActionError(`No se pudo consultar el correo: ${error.message}`)
    if (!data) throw new ActionError('Ese correo no está en la lista', 'NOT_FOUND')
    return data as InboxItem
}

/** "Este no me interesa": deja de proponerse, sin borrar el registro. */
export async function dismissInboxItem(id: string): Promise<void> {
    parseInput(uuidSchema, id)
    const { error } = await supabase.from('inbox_items').update({ dismissed: true }).eq('id', id)
    if (error) throw new ActionError(`No se pudo descartar el correo: ${error.message}`)
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
