import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Invoice, Log, Quote, QuoteItem } from '@/types'
import { getEurToUsdRate } from '@/lib/currency'
import { ActionError, dateSchema, parseInput, round2, uuidSchema } from './validation'
import { findOrCreateLead, promoteStageOnQuote } from './crm'
import { getClient } from './clients'
import { resolveCategoryId } from './categories'
import { createInvoice, getInvoice } from './invoices'

export const QUOTE_COMPANIES = [
    { name: 'JAM Tech, C.A.', template: 'jamtech' as const },
    { name: 'Asiri Marketing', template: 'asiri' as const },
]

export async function getNextQuoteNumber(): Promise<string> {
    const { data, error } = await supabase.from('quotes').select('quote_number').order('created_at', { ascending: false }).limit(1)
    if (error) throw new ActionError(`No se pudo calcular el número de cotización: ${error.message}`)
    let next = 1
    const last = data?.[0]?.quote_number
    if (last) {
        const m = String(last).match(/(\d+)\s*$/)
        if (m) next = parseInt(m[1], 10) + 1
    }
    return `COT-${String(next).padStart(4, '0')}`
}

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

export const quoteItemSchema = z.object({
    service: z.preprocess(blank, z.string().trim().max(120).optional()),
    description: z.string().trim().min(2, 'Cada ítem necesita una descripción'),
    quantity: z.number().positive().default(1),
    unit_price: z.number().min(0).default(0),
    hours: z.number().min(0).default(0),
})

export const createQuoteSchema = z.object({
    client_name: z.string().trim().min(2, 'El nombre del cliente es obligatorio'),
    company_name: z.enum(QUOTE_COMPANIES.map((c) => c.name) as [string, ...string[]]).default('JAM Tech, C.A.'),
    quote_type: z.enum(['amount', 'hours']).default('amount'),
    currency: z.enum(['USD', 'EUR']).default('USD'),
    doc_title: z.preprocess(blank, z.string().trim().max(60).optional()),
    items: z.array(quoteItemSchema).min(1, 'La cotización necesita al menos un ítem'),
    issue_date: z.preprocess(blank, dateSchema.optional()),
    client_id: z.preprocess(blank, uuidSchema.optional()),
    client_email: z.preprocess(blank, z.email('Correo electrónico inválido').optional()),
})
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>

export async function createQuote(raw: CreateQuoteInput): Promise<Quote> {
    const input = parseInput(createQuoteSchema, raw)
    const isHours = input.quote_type === 'hours'
    const items: QuoteItem[] = input.items.map((it) => ({
        service: it.service || 'Servicio Profesional',
        description: it.description,
        quantity: it.quantity,
        unit_price: isHours ? 0 : round2(it.unit_price),
        hours: isHours ? it.hours : 0,
    }))
    if (!isHours && items.every((it) => it.unit_price <= 0)) {
        throw new ActionError('Indica el precio de al menos un ítem de la cotización.')
    }
    if (isHours && items.every((it) => it.hours <= 0)) {
        throw new ActionError('Indica las horas de al menos un ítem de la cotización.')
    }
    const total_amount = isHours ? 0 : round2(items.reduce((s, it) => s + it.quantity * it.unit_price, 0))
    const total_hours = isHours ? round2(items.reduce((s, it) => s + it.hours, 0)) : 0
    const template = QUOTE_COMPANIES.find((c) => c.name === input.company_name)?.template ?? 'jamtech'
    // CRM: la cotización queda enlazada al cliente; si no existe, se crea como lead.
    let clientId: string | null = null
    let leadCreated = false
    try {
        if (input.client_id) {
            clientId = input.client_id
        } else {
            const r = await findOrCreateLead(input.client_name, input.client_email ?? null)
            clientId = r.client.id
            leadCreated = r.created
        }
        await promoteStageOnQuote(clientId)
    } catch (e) {
        // Si aún no se ejecutó schema_update_crm.sql, seguimos sin enlazar.
        console.warn('[quotes] no se pudo enlazar el cliente (¿falta schema_update_crm.sql?)', e instanceof Error ? e.message : e)
        clientId = null
    }
    void leadCreated

    const quote_number = await getNextQuoteNumber()
    const { data, error } = await supabase
        .from('quotes')
        .insert({
            quote_number,
            client_name: input.client_name,
            ...(clientId ? { client_id: clientId } : {}),
            company_name: input.company_name,
            doc_title: input.doc_title || 'COTIZACIÓN',
            quote_type: input.quote_type,
            template,
            currency: input.currency,
            items,
            total_amount,
            total_hours,
            issue_date: input.issue_date ?? new Date().toISOString().split('T')[0],
        })
        .select('*')
        .single()
    if (error) throw new ActionError(`No se pudo crear la cotización: ${error.message}`)
    return data as Quote
}

export async function listQuotes(limit = 20): Promise<Quote[]> {
    const { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(limit)
    if (error) throw new ActionError(`No se pudieron cargar las cotizaciones: ${error.message}`)
    return (data || []) as Quote[]
}

export async function getQuote(id: string): Promise<Quote> {
    const { data, error } = await supabase.from('quotes').select('*').eq('id', id).maybeSingle()
    if (error) throw new ActionError(`No se pudo consultar la cotización: ${error.message}`)
    if (!data) throw new ActionError('La cotización no existe', 'NOT_FOUND')
    return data as Quote
}

export const convertQuoteSchema = z.object({
    quote_id: uuidSchema,
    /** Cliente al que facturar; si se omite se usa el enlazado a la cotización o se busca/crea por nombre. */
    client_id: uuidSchema.optional(),
    issue_date: dateSchema.optional(),
    due_date: dateSchema.optional(),
})
export type ConvertQuoteInput = z.infer<typeof convertQuoteSchema>

/**
 * Convierte una cotización aprobada en una factura en borrador: crea un ítem
 * por cada línea de la cotización (con su monto en la moneda original y su
 * equivalente en USD) y emite la factura con ellos, reutilizando todas las
 * validaciones de createInvoice. La cotización queda enlazada a la factura
 * para que no se pueda convertir dos veces. Si algo falla después de crear
 * los ítems, se eliminan para no dejar pendientes fantasma.
 */
export async function convertQuoteToInvoice(raw: ConvertQuoteInput): Promise<{ invoice: Invoice; items: Log[]; quote: Quote }> {
    const input = parseInput(convertQuoteSchema, raw)
    const quote = await getQuote(input.quote_id)

    if (!('invoice_id' in quote)) {
        throw new ActionError('Falta ejecutar schema_update_quote_to_invoice.sql en Supabase antes de convertir cotizaciones en facturas.')
    }
    if (quote.invoice_id) {
        const existing = await getInvoice(quote.invoice_id).catch(() => null)
        if (existing) {
            throw new ActionError(`La cotización ${quote.quote_number} ya se convirtió en la factura #${existing.invoice_number}.`)
        }
        // La factura se eliminó: se permite volver a convertir.
    }
    if (quote.quote_type !== 'amount') {
        throw new ActionError(`La cotización ${quote.quote_number} es solo de horas (sin importes): no se puede convertir en factura tal cual.`)
    }
    if (!Array.isArray(quote.items) || quote.items.length === 0) {
        throw new ActionError(`La cotización ${quote.quote_number} no tiene ítems.`)
    }

    // Resolver el cliente a facturar.
    let clientId = input.client_id ?? quote.client_id ?? null
    if (!clientId) {
        const r = await findOrCreateLead(quote.client_name, null)
        clientId = r.client.id
    }
    const client = await getClient(clientId)
    if (client.billing_modality === 'hour_bag') {
        throw new ActionError(`${client.name} se factura por bolsa de horas: no se puede convertir una cotización en factura para este cliente.`)
    }
    // El cliente viene de una cotización (o de un nombre escrito a mano) y todavía no se
    // revisó como cliente real: exigimos completar su ficha antes de emitirle una factura,
    // para no arrastrar un nombre mal escrito o datos a medias a un documento formal.
    if (client.stage === 'lead' || client.stage === 'quoted') {
        throw new ActionError(
            `${client.name} todavía no tiene ficha de cliente completa (está como "${client.stage === 'lead' ? 'lead' : 'cotizado'}"). Revisa y guarda sus datos antes de convertir la cotización en factura.`,
            'CLIENT_NEEDS_REVIEW'
        )
    }

    // Un ítem por línea de la cotización.
    const rate = quote.currency === 'EUR' ? await getEurToUsdRate() : 1
    const defaultCategory = await resolveCategoryId()
    const now = new Date().toISOString()
    const rows = []
    for (const it of quote.items) {
        const amount = round2((Number(it.quantity) || 1) * (Number(it.unit_price) || 0))
        const qty = Number(it.quantity) || 1
        const description = qty > 1 ? `${it.description} (x${qty})` : it.description
        const category_id = it.service ? await resolveCategoryId(it.service).catch(() => defaultCategory) : defaultCategory
        rows.push({
            client_id: client.id,
            description,
            value: quote.currency === 'EUR' ? round2(amount * rate) : amount,
            original_amount: amount,
            currency: quote.currency,
            category_id,
            hours: null,
            created_at: now,
            status: 'pending',
        })
    }
    if (rows.every((r) => r.original_amount <= 0)) {
        throw new ActionError(`La cotización ${quote.quote_number} no tiene importes: indica los precios antes de convertirla.`)
    }

    const { data: created, error: logsError } = await supabase.from('logs').insert(rows).select('id')
    if (logsError) throw new ActionError(`No se pudieron crear los ítems de la factura: ${logsError.message}`)
    const logIds = (created || []).map((l) => l.id as string)

    let result: { invoice: Invoice; items: Log[] }
    try {
        result = await createInvoice({
            client_id: client.id,
            log_ids: logIds,
            issue_date: input.issue_date,
            due_date: input.due_date,
        })
    } catch (e) {
        await supabase.from('logs').delete().in('id', logIds)
        throw e
    }

    const { data: updatedQuote, error: quoteError } = await supabase
        .from('quotes')
        .update({ invoice_id: result.invoice.id, invoiced_at: now })
        .eq('id', quote.id)
        .select('*')
        .single()
    if (quoteError) {
        // La factura ya existe y es válida; solo falló el enlace. Se informa sin deshacer.
        console.warn('[quotes] factura creada pero no se pudo enlazar a la cotización', quoteError.message)
    }

    return { invoice: result.invoice, items: result.items, quote: (updatedQuote as Quote) ?? { ...quote, invoice_id: result.invoice.id, invoiced_at: now } }
}
