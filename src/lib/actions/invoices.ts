import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Client, Invoice, Log } from '@/types'
import { getClient, getBillableClientIds } from './clients'
import { getLogsByIds } from './logs'
import { ActionError, dateSchema, parseInput, round2, todayISO, uuidSchema } from './validation'

export async function getNextInvoiceNumber(): Promise<string> {
    const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number')
        .order('created_at', { ascending: false })
        .limit(1)
    if (error) throw new ActionError(`No se pudo calcular el número de factura: ${error.message}`)
    const last = parseInt(data?.[0]?.invoice_number ?? '', 10)
    const next = isNaN(last) ? 538 : last + 1
    return next.toString().padStart(4, '0')
}

export const createInvoiceSchema = z.object({
    client_id: uuidSchema,
    log_ids: z.array(uuidSchema).min(1, 'La factura necesita al menos un ítem'),
    invoice_number: z.string().trim().min(1).optional(),
    issue_date: dateSchema.optional(),
    due_date: dateSchema.optional(),
})
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

/**
 * Crea la factura y marca los ítems como facturados. Verifica cliente,
 * pertenencia y estado de cada ítem, montos presentes y número único.
 * Si falla el marcado de ítems, elimina la factura recién creada.
 */
export async function createInvoice(raw: CreateInvoiceInput): Promise<{ invoice: Invoice; items: Log[] }> {
    const input = parseInput(createInvoiceSchema, raw)
    const client = await getClient(input.client_id)
    if (client.billing_modality === 'hour_bag') {
        throw new ActionError(`${client.name} es un subcliente por bolsa de horas: se factura a través de su cliente padre.`)
    }

    const allowedIds = await getBillableClientIds(client.id)
    const logs = await getLogsByIds(input.log_ids)
    if (logs.length !== input.log_ids.length) {
        throw new ActionError('Alguno de los ítems indicados ya no existe.')
    }
    const invalid = logs.filter((l) => l.status !== 'pending' || !allowedIds.includes(l.client_id))
    if (invalid.length) {
        throw new ActionError(`Hay ítems que no están pendientes o no pertenecen a ${client.name}: ${invalid.map((l) => l.description).join(', ')}`)
    }
    const withoutAmount = logs.filter((l) => l.value == null || isNaN(Number(l.value)))
    if (withoutAmount.length) {
        throw new ActionError(`Hay ítems sin monto. Corrígelos antes de facturar: ${withoutAmount.map((l) => l.description).join(', ')}`)
    }

    const invoice_number = input.invoice_number ?? (await getNextInvoiceNumber())
    const { data: dup, error: dupError } = await supabase
        .from('invoices')
        .select('id')
        .eq('invoice_number', invoice_number)
        .maybeSingle()
    if (dupError) throw new ActionError(`No se pudo verificar el número de factura: ${dupError.message}`)
    if (dup) throw new ActionError(`Ya existe una factura con el número ${invoice_number}.`)

    const total_amount = round2(logs.reduce((sum, l) => sum + Number(l.value || 0), 0))
    const issue_date = input.issue_date ?? todayISO()

    const row: Record<string, unknown> = {
        invoice_number,
        client_id: client.id,
        issue_date,
        total_amount,
        status: 'draft',
    }
    if (input.due_date) row.due_date = input.due_date

    let { data: invoice, error: invError } = await supabase.from('invoices').insert(row).select('*').single()
    if (invError && input.due_date && (invError.code === '42703' || /due_date/.test(invError.message))) {
        // Migración pendiente: la columna due_date aún no existe.
        delete row.due_date
        ;({ data: invoice, error: invError } = await supabase.from('invoices').insert(row).select('*').single())
    }
    if (invError) throw new ActionError(`No se pudo crear la factura: ${invError.message}`)

    const { error: logsError } = await supabase
        .from('logs')
        .update({ invoice_id: invoice.id, status: 'billed' })
        .in('id', logs.map((l) => l.id))
    if (logsError) {
        await supabase.from('invoices').delete().eq('id', invoice.id)
        throw new ActionError(`No se pudieron marcar los ítems como facturados: ${logsError.message}`)
    }

    const items = logs.map((l) => ({ ...l, status: 'billed' as const, invoice_id: invoice.id }))
    return { invoice: { ...(invoice as Invoice), clients: client }, items }
}

export interface InvoiceFilters {
    client_id?: string
    status?: 'draft' | 'sent' | 'paid'
    from?: string
    to?: string
    limit?: number
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<Invoice[]> {
    let query = supabase
        .from('invoices')
        .select('*, clients(*)')
        .order('created_at', { ascending: false })
    if (filters.client_id) query = query.eq('client_id', filters.client_id)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.from) query = query.gte('issue_date', filters.from)
    if (filters.to) query = query.lte('issue_date', filters.to)
    if (filters.limit) query = query.limit(filters.limit)
    const { data, error } = await query
    if (error) throw new ActionError(`No se pudieron cargar las facturas: ${error.message}`)
    return (data || []) as Invoice[]
}

export async function getInvoice(id: string): Promise<Invoice> {
    const { data, error } = await supabase.from('invoices').select('*, clients(*)').eq('id', id).maybeSingle()
    if (error) throw new ActionError(`No se pudo consultar la factura: ${error.message}`)
    if (!data) throw new ActionError('La factura indicada no existe', 'NOT_FOUND')
    return data as Invoice
}

export async function getInvoiceWithItems(id: string): Promise<{ invoice: Invoice; items: Log[]; client: Client }> {
    const invoice = await getInvoice(id)
    if (!invoice.clients) throw new ActionError('La factura no tiene cliente asociado')
    const { data, error } = await supabase
        .from('logs')
        .select('*, service_categories(name)')
        .eq('invoice_id', id)
        .order('created_at')
    if (error) throw new ActionError(`No se pudieron cargar los ítems de la factura: ${error.message}`)
    return { invoice, items: (data || []) as Log[], client: invoice.clients }
}

export async function markInvoicePaid(id: string): Promise<Invoice> {
    const invoice = await getInvoice(id)
    if (invoice.status === 'paid') throw new ActionError(`La factura #${invoice.invoice_number} ya está marcada como pagada.`)
    const paid_at = new Date().toISOString()
    const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_at })
        .eq('id', id)
        .select('*, clients(*)')
        .single()
    if (error) throw new ActionError(`No se pudo marcar la factura como pagada: ${error.message}`)
    return data as Invoice
}

export async function revertInvoiceToDraft(id: string): Promise<Invoice> {
    await getInvoice(id)
    const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'draft', paid_at: null })
        .eq('id', id)
        .select('*, clients(*)')
        .single()
    if (error) throw new ActionError(`No se pudo revertir la factura: ${error.message}`)
    return data as Invoice
}

/** Elimina la factura y devuelve sus ítems a pendientes. */
export async function deleteInvoice(id: string): Promise<void> {
    await getInvoice(id)
    const { error: logsError } = await supabase
        .from('logs')
        .update({ status: 'pending', invoice_id: null })
        .eq('invoice_id', id)
    if (logsError) throw new ActionError(`No se pudieron liberar los ítems: ${logsError.message}`)
    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) throw new ActionError(`No se pudo eliminar la factura: ${error.message}`)
}
