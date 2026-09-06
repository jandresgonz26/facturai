import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Quote, QuoteItem } from '@/types'
import { ActionError, dateSchema, parseInput, round2 } from './validation'

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
    const quote_number = await getNextQuoteNumber()
    const { data, error } = await supabase
        .from('quotes')
        .insert({
            quote_number,
            client_name: input.client_name,
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
