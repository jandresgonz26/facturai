import { supabase } from '@/lib/supabase'
import { Client } from '@/types'
import { z } from 'zod'
import { ActionError, errorMessage, normalizeText, parseInput, uuidSchema } from './validation'

export async function listClients(): Promise<Client[]> {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error) throw new ActionError(`No se pudieron cargar los clientes: ${error.message}`)
    return (data || []) as Client[]
}

export async function getClient(id: string): Promise<Client> {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
    if (error) throw new ActionError(`No se pudo consultar el cliente: ${error.message}`)
    if (!data) throw new ActionError('El cliente indicado no existe', 'NOT_FOUND')
    return data as Client
}

export async function getSubClients(parentId: string): Promise<Client[]> {
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('parent_client_id', parentId)
        .order('name')
    if (error) throw new ActionError(`No se pudieron cargar los subclientes: ${error.message}`)
    return (data || []) as Client[]
}

/** Ids del cliente y de sus subclientes (los subclientes se facturan al padre). */
export async function getBillableClientIds(clientId: string): Promise<string[]> {
    const subs = await getSubClients(clientId)
    return [clientId, ...subs.map((s) => s.id)]
}

/**
 * Búsqueda tolerante por nombre: exacta, luego por prefijo, luego contiene.
 * Devuelve varios resultados si hay ambigüedad para que quien llame pregunte.
 */
export async function findClients(query: string): Promise<Client[]> {
    const q = normalizeText(query)
    if (!q) return []
    const all = await listClients()
    const exact = all.filter((c) => normalizeText(c.name) === q)
    if (exact.length) return exact
    const starts = all.filter((c) => normalizeText(c.name).startsWith(q))
    if (starts.length) return starts
    return all.filter((c) => {
        const n = normalizeText(c.name)
        return n.includes(q) || q.includes(n)
    })
}

export function describeClientError(e: unknown): string {
    return errorMessage(e)
}

// ───────────── Alta / edición / baja con validación ─────────────

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const optionalText = z.preprocess(blank, z.string().trim().max(200).optional())

export const clientInputSchema = z.object({
    name: z.string('El nombre es obligatorio').trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
    preferred_input_currency: z.enum(['USD', 'EUR'], 'Moneda inválida'),
    billing_modality: z.enum(['standard', 'hour_bag'], 'Modalidad inválida'),
    parent_client_id: z.preprocess(blank, uuidSchema.optional()),
    hour_bag_price: z.preprocess(
        (v) => (v === '' || v == null ? undefined : typeof v === 'string' ? Number(v) : v),
        z.number('El precio de la bolsa debe ser un número').positive('El precio de la bolsa debe ser mayor que 0').optional()
    ),
    tax_id: optionalText,
    contact_name: optionalText,
    billing_address: optionalText,
    postal_code: optionalText,
    city: optionalText,
    email: z.preprocess(blank, z.email('Correo electrónico inválido').optional()),
})
export type ClientInput = z.infer<typeof clientInputSchema>

function toRow(input: ClientInput) {
    const isHourBag = input.billing_modality === 'hour_bag'
    if (isHourBag && !input.parent_client_id) {
        throw new ActionError('Un cliente por bolsa de horas debe tener un cliente padre al que facturar.')
    }
    if (isHourBag && !input.hour_bag_price) {
        throw new ActionError('Indica el precio de la bolsa de 10 horas.')
    }
    return {
        name: input.name,
        preferred_input_currency: input.preferred_input_currency,
        billing_modality: input.billing_modality,
        parent_client_id: input.parent_client_id ?? null,
        hour_bag_price: isHourBag ? input.hour_bag_price! : null,
        tax_id: input.tax_id ?? null,
        contact_name: input.contact_name ?? null,
        billing_address: input.billing_address ?? null,
        postal_code: input.postal_code ?? null,
        city: input.city ?? null,
        email: input.email ?? null,
    }
}

export async function createClient(raw: ClientInput): Promise<Client> {
    const input = parseInput(clientInputSchema, raw)
    const existing = await findClients(input.name)
    if (existing.some((c) => normalizeText(c.name) === normalizeText(input.name))) {
        throw new ActionError(`Ya existe un cliente llamado "${input.name}".`)
    }
    if (input.parent_client_id) await getClient(input.parent_client_id)
    const { data, error } = await supabase.from('clients').insert(toRow(input)).select('*').single()
    if (error) throw new ActionError(`No se pudo crear el cliente: ${error.message}`)
    return data as Client
}

export async function updateClient(id: string, raw: ClientInput): Promise<Client> {
    const input = parseInput(clientInputSchema, raw)
    await getClient(id)
    if (input.parent_client_id === id) throw new ActionError('Un cliente no puede ser su propio cliente padre.')
    if (input.parent_client_id) await getClient(input.parent_client_id)
    const { data, error } = await supabase.from('clients').update(toRow(input)).eq('id', id).select('*').single()
    if (error) throw new ActionError(`No se pudo actualizar el cliente: ${error.message}`)
    return data as Client
}

/** Elimina el cliente. Sus registros y facturas se eliminan en cascada (así está definida la base de datos). */
export async function deleteClient(id: string): Promise<void> {
    await getClient(id)
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw new ActionError(`No se pudo eliminar el cliente: ${error.message}`)
}

/** Resumen por cliente para la lista: pendientes sin facturar y última factura. */
export async function getClientStats(): Promise<Record<string, { pending_total: number; pending_count: number; last_invoice_date: string | null }>> {
    const [{ data: logs }, { data: invoices }] = await Promise.all([
        supabase.from('logs').select('client_id, value').eq('status', 'pending'),
        supabase.from('invoices').select('client_id, issue_date').order('issue_date', { ascending: false }),
    ])
    const stats: Record<string, { pending_total: number; pending_count: number; last_invoice_date: string | null }> = {}
    for (const l of (logs || []) as { client_id: string; value: number | null }[]) {
        stats[l.client_id] ??= { pending_total: 0, pending_count: 0, last_invoice_date: null }
        stats[l.client_id].pending_total += Number(l.value || 0)
        stats[l.client_id].pending_count += 1
    }
    for (const i of (invoices || []) as { client_id: string; issue_date: string }[]) {
        stats[i.client_id] ??= { pending_total: 0, pending_count: 0, last_invoice_date: null }
        if (!stats[i.client_id].last_invoice_date) stats[i.client_id].last_invoice_date = i.issue_date
    }
    return stats
}
