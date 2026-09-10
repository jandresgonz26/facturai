'use server'

import { ImapFlow } from 'imapflow'
import { supabase } from '@/lib/supabase'
import { ActionError, normalizeText } from './validation'
import { listClients } from './clients'

/**
 * Lectura del correo marcado con estrella, para proponerlo como tarea.
 *
 * Se lee SOLO lo destacado (no toda la bandeja) por una razón concreta: el
 * inbox real está lleno de newsletters y autorespuestas, así que filtrar por
 * remitente daría más ruido que señal. Marcar la estrella en el cliente de
 * correo es la señal explícita del usuario de que ese correo hay que atenderlo.
 *
 * Es de solo lectura: nunca marca, mueve ni borra nada en el buzón.
 */

export interface InboxSuggestion {
    /** Message-Id del correo: estable entre sesiones, sirve para no repetir. */
    id: string
    subject: string
    from_name: string | null
    from_email: string
    date: string
    snippet: string
    /** Cliente de FacturAI que coincide con el remitente, si lo hay. */
    client_id: string | null
    client_name: string | null
    /** Ya existe una tarea creada desde este correo. */
    already_task: boolean
}

function config() {
    const user = process.env.INBOX_USER
    const pass = process.env.INBOX_PASSWORD
    if (!user || !pass) {
        throw new ActionError(
            'El buzón no está configurado todavía. Falta INBOX_USER e INBOX_PASSWORD en el servidor.',
            'INBOX_NOT_CONFIGURED'
        )
    }
    return {
        host: process.env.INBOX_HOST || 'imap.gmail.com',
        port: Number(process.env.INBOX_PORT || 993),
        secure: true,
        auth: { user, pass },
        logger: false as const,
    }
}

export async function isInboxConfigured(): Promise<boolean> {
    return !!process.env.INBOX_USER && !!process.env.INBOX_PASSWORD
}

const clean = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Correos destacados recientes, cruzados con la lista de clientes y con las
 * tareas ya creadas, para no proponer dos veces lo mismo.
 */
export async function listStarredSuggestions(limit = 15): Promise<InboxSuggestion[]> {
    const client = new ImapFlow(config())
    const rows: Omit<InboxSuggestion, 'client_id' | 'client_name' | 'already_task'>[] = []

    try {
        await client.connect()
        const lock = await client.getMailboxLock('INBOX')
        try {
            const uids = await client.search({ flagged: true }, { uid: true })
            const recent = (uids || []).slice(-limit).reverse()
            if (recent.length > 0) {
                for await (const msg of client.fetch(recent, { uid: true, envelope: true, bodyStructure: false }, { uid: true })) {
                    const env = msg.envelope
                    if (!env) continue
                    const sender = env.from?.[0]
                    if (!sender?.address) continue
                    rows.push({
                        id: clean(env.messageId) || `uid-${msg.uid}`,
                        subject: clean(env.subject) || '(sin asunto)',
                        from_name: clean(sender.name) || null,
                        from_email: sender.address.toLowerCase(),
                        date: new Date(env.date ?? Date.now()).toISOString(),
                        snippet: '',
                    })
                }
            }
        } finally {
            lock.release()
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/auth/i.test(msg)) {
            throw new ActionError('El buzón rechazó las credenciales. Revisa la contraseña de aplicación.', 'INBOX_AUTH')
        }
        throw new ActionError(`No se pudo leer el buzón: ${msg}`)
    } finally {
        await client.logout().catch(() => undefined)
    }

    if (rows.length === 0) return []

    // Cruce con clientes (por correo exacto) y con tareas ya creadas.
    const [clients, { data: existing }] = await Promise.all([
        listClients().catch(() => []),
        supabase.from('tasks').select('source_email_id').in('source_email_id', rows.map((r) => r.id)),
    ])
    const byEmail = new Map(
        clients.filter((c) => c.email).map((c) => [normalizeText(c.email!), c])
    )
    const used = new Set(((existing || []) as { source_email_id: string }[]).map((t) => t.source_email_id))

    return rows.map((r) => {
        const match = byEmail.get(normalizeText(r.from_email))
        return {
            ...r,
            client_id: match?.id ?? null,
            client_name: match?.name ?? null,
            already_task: used.has(r.id),
        }
    })
}
