import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Client, ClientNote, ClientStage, EmailLog } from '@/types'
import { createClient, getClient, listClients } from './clients'
import { ActionError, dateSchema, normalizeText, parseInput, round2 } from './validation'

export const CLIENT_STAGES: { id: ClientStage; label: string; hint: string }[] = [
    { id: 'lead', label: 'Lead', hint: 'Contacto nuevo, aún sin propuesta' },
    { id: 'quoted', label: 'Cotizado', hint: 'Tiene una cotización enviada o en curso' },
    { id: 'active', label: 'Cliente activo', hint: 'Se le factura' },
    { id: 'inactive', label: 'Inactivo', hint: 'Sin facturación reciente o perdido' },
]
export const stageSchema = z.enum(['lead', 'quoted', 'active', 'inactive'])
export const stageLabel = (s?: ClientStage | null) => CLIENT_STAGES.find((x) => x.id === s)?.label ?? 'Cliente activo'

export async function setClientStage(clientId: string, stage: ClientStage): Promise<Client> {
    parseInput(stageSchema, stage)
    await getClient(clientId)
    const { data, error } = await supabase.from('clients').update({ stage }).eq('id', clientId).select('*').single()
    if (error) throw new ActionError(`No se pudo cambiar la etapa: ${error.message}`)
    return data as Client
}

/** Un lead es un cliente en etapa temprana: misma ficha, misma tabla. */
export const createLeadSchema = z.object({
    name: z.string().trim().min(2, 'El nombre es obligatorio'),
    email: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.email('Correo electrónico inválido').optional()),
    contact_name: z.string().trim().max(200).optional(),
    source: z.string().trim().max(120).optional(),
    note: z.string().trim().max(2000).optional(),
    preferred_input_currency: z.enum(['USD', 'EUR']).default('USD'),
})
export type CreateLeadInput = z.input<typeof createLeadSchema>

export async function createLead(raw: CreateLeadInput): Promise<Client> {
    const input = parseInput(createLeadSchema, raw)
    const client = await createClient({
        name: input.name,
        preferred_input_currency: input.preferred_input_currency,
        billing_modality: 'standard',
        email: input.email,
        contact_name: input.contact_name,
        stage: 'lead',
        source: input.source,
    })
    if (input.note) await addClientNote(client.id, input.note)
    return client
}

/** Busca un cliente por nombre exacto (normalizado); si no existe, lo crea como lead. */
export async function findOrCreateLead(name: string, email?: string | null): Promise<{ client: Client; created: boolean }> {
    const n = normalizeText(name)
    const existing = (await listClients()).find((c) => normalizeText(c.name) === n)
    if (existing) return { client: existing, created: false }
    const client = await createLead({ name, email: email ?? undefined, source: 'Cotización' })
    return { client, created: true }
}

/** Cotizar a un lead lo pasa a "Cotizado". */
export async function promoteStageOnQuote(clientId: string): Promise<void> {
    const c = await getClient(clientId)
    if ((c.stage ?? 'active') === 'lead') await setClientStage(clientId, 'quoted')
}

/** La primera factura convierte un lead/cotizado en cliente activo. */
export async function promoteStageOnInvoice(clientId: string): Promise<void> {
    const c = await getClient(clientId)
    if (c.stage === 'lead' || c.stage === 'quoted') await setClientStage(clientId, 'active')
}

export async function addClientNote(clientId: string, body: string): Promise<ClientNote> {
    const text = (body ?? '').trim()
    if (text.length < 2) throw new ActionError('La nota está vacía')
    await getClient(clientId)
    const { data, error } = await supabase.from('client_notes').insert({ client_id: clientId, body: text }).select('*').single()
    if (error) throw new ActionError(`No se pudo guardar la nota: ${error.message}`)
    return data as ClientNote
}

export async function listClientNotes(clientId: string): Promise<ClientNote[]> {
    const { data, error } = await supabase.from('client_notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
    if (error) throw new ActionError(`No se pudieron cargar las notas: ${error.message}`)
    return (data || []) as ClientNote[]
}

export async function deleteClientNote(id: string): Promise<void> {
    const { error } = await supabase.from('client_notes').delete().eq('id', id)
    if (error) throw new ActionError(`No se pudo eliminar la nota: ${error.message}`)
}

export const nextActionSchema = z.object({
    next_action: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(200).nullable()),
    next_action_at: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), dateSchema.nullable()),
})
export async function setNextAction(clientId: string, raw: z.infer<typeof nextActionSchema>): Promise<Client> {
    const input = parseInput(nextActionSchema, raw)
    await getClient(clientId)
    const { data, error } = await supabase.from('clients').update({ next_action: input.next_action, next_action_at: input.next_action_at }).eq('id', clientId).select('*').single()
    if (error) throw new ActionError(`No se pudo guardar la próxima acción: ${error.message}`)
    return data as Client
}

// ───────────── Línea de tiempo por cliente ─────────────
export interface TimelineEvent {
    type: 'quote' | 'invoice' | 'payment' | 'email' | 'note' | 'log'
    date: string
    title: string
    detail?: string
    amount?: number | null
    ref_id?: string
}

export async function getClientTimeline(clientId: string): Promise<TimelineEvent[]> {
    const client = await getClient(clientId)
    const ids = [clientId]
    const [quotes, invoices, emails, notes, logs] = await Promise.all([
        supabase.from('quotes').select('id, quote_number, total_amount, total_hours, quote_type, currency, issue_date, created_at').eq('client_id', clientId),
        supabase.from('invoices').select('id, invoice_number, total_amount, status, issue_date, paid_at, sent_at').in('client_id', ids),
        supabase.from('email_log').select('*').eq('client_id', clientId),
        supabase.from('client_notes').select('*').eq('client_id', clientId),
        supabase.from('logs').select('id, description, value, hours, status, created_at').in('client_id', ids).order('created_at', { ascending: false }).limit(30),
    ])
    const events: TimelineEvent[] = []
    for (const q of (quotes.data || []) as { id: string; quote_number: string; total_amount: number; total_hours: number; quote_type: string; currency: string; issue_date: string; created_at: string }[]) {
        events.push({ type: 'quote', date: q.created_at, title: `Cotización ${q.quote_number}`, detail: q.quote_type === 'hours' ? `${q.total_hours} h` : `${q.currency === 'EUR' ? '€' : '$'}${Number(q.total_amount).toFixed(2)}`, amount: q.total_amount, ref_id: q.id })
    }
    for (const i of (invoices.data || []) as { id: string; invoice_number: string; total_amount: number; status: string; issue_date: string; paid_at: string | null; sent_at: string | null }[]) {
        events.push({ type: 'invoice', date: `${i.issue_date}T12:00:00Z`, title: `Factura #${i.invoice_number}`, detail: `$${Number(i.total_amount).toFixed(2)} · ${i.status === 'paid' ? 'pagada' : i.status === 'sent' ? 'enviada' : 'borrador'}`, amount: i.total_amount, ref_id: i.id })
        if (i.paid_at) events.push({ type: 'payment', date: i.paid_at, title: `Pago recibido · #${i.invoice_number}`, detail: `$${Number(i.total_amount).toFixed(2)}`, amount: i.total_amount, ref_id: i.id })
    }
    for (const e of (emails.data || []) as EmailLog[]) {
        const kind = e.kind === 'invoice' ? 'Factura enviada' : e.kind === 'quote' ? 'Cotización enviada' : 'Agradecimiento de pago enviado'
        events.push({ type: 'email', date: e.sent_at, title: e.status === 'sent' ? kind : `${kind} (falló)`, detail: `${e.to_email}${e.redirected ? ' · desviado a prueba' : ''}${e.error ? ` · ${e.error}` : ''}`, ref_id: e.id })
    }
    for (const n of (notes.data || []) as ClientNote[]) {
        events.push({ type: 'note', date: n.created_at, title: 'Nota', detail: n.body, ref_id: n.id })
    }
    for (const l of (logs.data || []) as { id: string; description: string; value: number | null; hours: number | null; status: string; created_at: string }[]) {
        events.push({ type: 'log', date: l.created_at, title: l.description, detail: l.hours ? `${l.hours} h` : l.value != null ? `$${Number(l.value).toFixed(2)}` : undefined, amount: l.value, ref_id: l.id })
    }
    events.sort((a, b) => (a.date < b.date ? 1 : -1))
    void client
    return events
}

// ───────────── Pipeline ─────────────
export interface PipelineCard {
    client: Client
    quoted_total: number
    quotes_count: number
    unpaid_total: number
    pending_total: number
    last_activity_at: string | null
    days_since_activity: number | null
    last_activity_label: string | null
}

export async function getPipeline(): Promise<Record<ClientStage, PipelineCard[]>> {
    const clients = (await listClients()).filter((c) => c.billing_modality !== 'hour_bag')
    const [quotes, invoices, logs, emails, notes] = await Promise.all([
        supabase.from('quotes').select('client_id, total_amount, created_at'),
        supabase.from('invoices').select('client_id, total_amount, status, issue_date, paid_at'),
        supabase.from('logs').select('client_id, value, status, created_at'),
        supabase.from('email_log').select('client_id, sent_at, kind'),
        supabase.from('client_notes').select('client_id, created_at'),
    ])
    const today = new Date()
    const cards: PipelineCard[] = clients.map((client) => {
        let quoted = 0, quotesCount = 0, unpaid = 0, pending = 0
        let last: { at: string; label: string } | null = null
        const bump = (at: string | null | undefined, label: string) => {
            if (!at) return
            if (!last || at > last.at) last = { at, label }
        }
        for (const q of (quotes.data || []) as { client_id: string | null; total_amount: number; created_at: string }[]) {
            if (q.client_id !== client.id) continue
            quoted += Number(q.total_amount || 0); quotesCount++; bump(q.created_at, 'Cotización')
        }
        for (const i of (invoices.data || []) as { client_id: string; total_amount: number; status: string; issue_date: string; paid_at: string | null }[]) {
            if (i.client_id !== client.id) continue
            if (i.status !== 'paid') unpaid += Number(i.total_amount || 0)
            bump(`${i.issue_date}T12:00:00Z`, 'Factura'); bump(i.paid_at, 'Pago')
        }
        for (const l of (logs.data || []) as { client_id: string; value: number | null; status: string; created_at: string }[]) {
            if (l.client_id !== client.id) continue
            if (l.status === 'pending') pending += Number(l.value || 0)
            bump(l.created_at, 'Actividad')
        }
        for (const e of (emails.data || []) as { client_id: string | null; sent_at: string; kind: string }[]) if (e.client_id === client.id) bump(e.sent_at, 'Correo')
        for (const n of (notes.data || []) as { client_id: string; created_at: string }[]) if (n.client_id === client.id) bump(n.created_at, 'Nota')
        bump(client.created_at, 'Alta')
        const l = last as { at: string; label: string } | null
        return {
            client,
            quoted_total: round2(quoted),
            quotes_count: quotesCount,
            unpaid_total: round2(unpaid),
            pending_total: round2(pending),
            last_activity_at: l?.at ?? null,
            days_since_activity: l ? Math.floor((today.getTime() - new Date(l.at).getTime()) / 86400000) : null,
            last_activity_label: l?.label ?? null,
        }
    })
    const grouped: Record<ClientStage, PipelineCard[]> = { lead: [], quoted: [], active: [], inactive: [] }
    for (const c of cards) grouped[(c.client.stage ?? 'active') as ClientStage].push(c)
    for (const k of Object.keys(grouped) as ClientStage[]) grouped[k].sort((a, b) => (b.last_activity_at ?? '') > (a.last_activity_at ?? '') ? 1 : -1)
    return grouped
}

/** Guarda o corrige el correo de un cliente (lo pide el asistente antes de enviar un documento). */
export async function setClientEmail(clientId: string, email: string): Promise<Client> {
    const parsed = parseInput(z.email('Correo electrónico inválido'), (email ?? '').trim())
    await getClient(clientId)
    const { data, error } = await supabase.from('clients').update({ email: parsed }).eq('id', clientId).select('*').single()
    if (error) throw new ActionError(`No se pudo guardar el correo: ${error.message}`)
    return data as Client
}

/** Condiciones de pago visibles para el cliente: se imprimen en la factura y en el correo. */
export async function setClientPaymentTerms(clientId: string, paymentTerms: string | null): Promise<Client> {
    const text = paymentTerms?.trim() || null
    if (text && text.length > 300) throw new ActionError('Las condiciones de pago son demasiado largas (máximo 300 caracteres).')
    await getClient(clientId)
    const { data, error } = await supabase.from('clients').update({ payment_terms: text }).eq('id', clientId).select('*').single()
    if (error) throw new ActionError(`No se pudieron guardar las condiciones de pago: ${error.message}`)
    return data as Client
}
