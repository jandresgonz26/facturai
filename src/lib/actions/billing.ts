import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Log } from '@/types'
import { getEurToUsdRate } from '@/lib/currency'
import { getClient, getSubClients } from './clients'
import { addLog, getPendingLogs } from './logs'
import { getRecurringLoadStatus, loadRecurringServices } from './recurring'
import { createInvoice, getNextInvoiceNumber } from './invoices'
import {
    ActionError,
    currentPeriod,
    dateSchema,
    descriptionSchema,
    moneySchema,
    parseInput,
    periodSchema,
    round2,
    uuidSchema,
} from './validation'

function logSummary(l: Log) {
    return {
        id: l.id,
        description: l.description,
        client_name: l.clients?.name ?? null,
        category: l.service_categories?.name ?? null,
        value_usd: l.value == null ? null : round2(Number(l.value)),
        original_amount: l.original_amount ?? null,
        currency: l.currency ?? 'USD',
        hours: l.hours ?? null,
        date: l.created_at?.split('T')[0] ?? null,
    }
}

/**
 * Todo lo necesario para decidir la facturación mensual de un cliente
 * en una sola llamada: pendientes, fijos cargados y por cargar, tasa,
 * próximo número y totales proyectados.
 */
export async function getBillingSnapshot(clientId: string, period?: string) {
    const client = await getClient(clientId)
    const p = period ?? currentPeriod()
    const [subClients, pendingLogs, recurring, rate, nextInvoiceNumber] = await Promise.all([
        getSubClients(clientId),
        getPendingLogs(clientId),
        getRecurringLoadStatus(clientId, p),
        getEurToUsdRate(),
        getNextInvoiceNumber(),
    ])

    const toUsd = (s: { amount: number; original_amount?: number; currency?: string }) =>
        s.currency === 'EUR' ? round2((s.original_amount ?? s.amount) * rate) : round2(s.amount)

    const pendingTotal = round2(pendingLogs.reduce((sum, l) => sum + Number(l.value || 0), 0))
    const toLoadTotal = round2(recurring.toLoad.reduce((sum, s) => sum + toUsd(s), 0))

    return {
        client: {
            id: client.id,
            name: client.name,
            currency: client.preferred_input_currency,
            billing_modality: client.billing_modality,
        },
        sub_clients: subClients.map((s) => ({ id: s.id, name: s.name, billing_modality: s.billing_modality })),
        period: p,
        eur_usd_rate: rate,
        next_invoice_number: nextInvoiceNumber,
        pending_logs: pendingLogs.map(logSummary),
        pending_total_usd: pendingTotal,
        recurring_services: {
            already_loaded_this_period: recurring.loaded.map((s) => ({
                id: s.id,
                description: s.description,
                amount_usd: toUsd(s),
            })),
            to_load: recurring.toLoad.map((s) => ({
                id: s.id,
                description: s.description,
                amount_usd: toUsd(s),
                currency: s.currency ?? 'USD',
                original_amount: s.original_amount ?? s.amount,
            })),
            to_load_total_usd: toLoadTotal,
        },
        projected_total_usd: round2(pendingTotal + toLoadTotal),
    }
}

export const extraItemSchema = z.object({
    description: descriptionSchema,
    amount: moneySchema.describe('Monto en la moneda del cliente'),
    category: z.string().trim().min(1).optional(),
})

export const billClientMonthSchema = z.object({
    client_id: uuidSchema,
    period: periodSchema,
    load_recurring: z.boolean(),
    extra_items: z.array(extraItemSchema).default([]),
    issue_date: dateSchema.optional(),
    due_date: dateSchema.optional(),
    invoice_number: z.string().trim().min(1).optional(),
})
export type BillClientMonthInput = z.infer<typeof billClientMonthSchema>

/**
 * Flujo completo de facturación mensual:
 * 1) carga los servicios fijos que falten en el periodo (idempotente),
 * 2) registra los ítems adicionales dictados,
 * 3) crea la factura con TODOS los pendientes del cliente y subclientes.
 */
export async function billClientMonth(raw: BillClientMonthInput) {
    const input = parseInput(billClientMonthSchema, raw)
    const client = await getClient(input.client_id)
    if (client.billing_modality === 'hour_bag') {
        throw new ActionError(`${client.name} es un subcliente por bolsa de horas: factura a su cliente padre.`)
    }

    const recurring = input.load_recurring
        ? await loadRecurringServices(client.id, input.period)
        : { inserted: [], skipped: [] }

    const extras: Log[] = []
    for (const item of input.extra_items) {
        extras.push(await addLog({ client_id: client.id, description: item.description, amount: item.amount, category: item.category }))
    }

    const pending = await getPendingLogs(client.id)
    if (pending.length === 0) {
        throw new ActionError(`No hay ítems pendientes para facturar a ${client.name}.`)
    }

    const { invoice, items } = await createInvoice({
        client_id: client.id,
        log_ids: pending.map((l) => l.id),
        invoice_number: input.invoice_number,
        issue_date: input.issue_date,
        due_date: input.due_date,
    })

    return {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: client.name,
        issue_date: invoice.issue_date,
        due_date: invoice.due_date ?? null,
        total_amount: invoice.total_amount,
        items_count: items.length,
        recurring_loaded: recurring.inserted.length,
        recurring_skipped: recurring.skipped.length,
        extras_added: extras.length,
        items: items.map(logSummary),
    }
}

export interface RevenueFilters {
    from?: string
    to?: string
    client_id?: string
}

/** Resumen de ingresos facturados por mes y por cliente, con cobrado y por cobrar. */
export async function getRevenueSummary(filters: RevenueFilters = {}) {
    let query = supabase.from('invoices').select('id, invoice_number, client_id, issue_date, total_amount, status, paid_at, clients(name)')
    if (filters.client_id) query = query.eq('client_id', filters.client_id)
    if (filters.from) query = query.gte('issue_date', filters.from)
    if (filters.to) query = query.lte('issue_date', filters.to)
    const { data, error } = await query.order('issue_date')
    if (error) throw new ActionError(`No se pudo calcular el resumen: ${error.message}`)

    type Row = { id: string; invoice_number: string; client_id: string; issue_date: string; total_amount: number; status: string; paid_at: string | null; clients: { name: string } | null }
    const rows = (data || []) as unknown as Row[]

    const byMonth: Record<string, { invoiced: number; paid: number; unpaid: number; count: number }> = {}
    const byClient: Record<string, { client_name: string; invoiced: number; paid: number; unpaid: number; count: number }> = {}
    let invoiced = 0
    let paid = 0

    for (const r of rows) {
        const month = r.issue_date.slice(0, 7)
        const amount = Number(r.total_amount || 0)
        const isPaid = r.status === 'paid'
        invoiced += amount
        if (isPaid) paid += amount
        byMonth[month] ??= { invoiced: 0, paid: 0, unpaid: 0, count: 0 }
        byMonth[month].invoiced = round2(byMonth[month].invoiced + amount)
        byMonth[month][isPaid ? 'paid' : 'unpaid'] = round2(byMonth[month][isPaid ? 'paid' : 'unpaid'] + amount)
        byMonth[month].count += 1
        const name = r.clients?.name ?? 'Desconocido'
        byClient[r.client_id] ??= { client_name: name, invoiced: 0, paid: 0, unpaid: 0, count: 0 }
        byClient[r.client_id].invoiced = round2(byClient[r.client_id].invoiced + amount)
        byClient[r.client_id][isPaid ? 'paid' : 'unpaid'] = round2(byClient[r.client_id][isPaid ? 'paid' : 'unpaid'] + amount)
        byClient[r.client_id].count += 1
    }

    const today = new Date()
    const unpaidInvoices = rows
        .filter((r) => r.status !== 'paid')
        .map((r) => ({
            invoice_id: r.id,
            invoice_number: r.invoice_number,
            client_name: r.clients?.name ?? 'Desconocido',
            issue_date: r.issue_date,
            total_amount: r.total_amount,
            status: r.status,
            days_since_issue: Math.floor((today.getTime() - new Date(r.issue_date).getTime()) / 86400000),
        }))

    return {
        filters,
        total_invoiced_usd: round2(invoiced),
        total_paid_usd: round2(paid),
        total_unpaid_usd: round2(invoiced - paid),
        invoices_count: rows.length,
        by_month: byMonth,
        by_client: Object.values(byClient).sort((a, b) => b.invoiced - a.invoiced),
        unpaid_invoices: unpaidInvoices,
    }
}
