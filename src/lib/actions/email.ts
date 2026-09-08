'use server'

// Este módulo usa RESEND_API_KEY y otros secretos de servidor: 'use server' obliga a que
// se ejecute en Node (Server Action), aunque EmailDialog (componente de cliente) lo llame
// como una función normal. Sin esto, Next.js lo empaquetaba en el navegador, donde las
// variables de entorno del servidor no existen (por eso el aviso de "falta RESEND_API_KEY"
// aparecía siempre, sin importar lo que estuviera configurado en el servidor real).

import { supabase } from '@/lib/supabase'
import { Client, EmailKind, EmailLog, Invoice, Quote } from '@/types'
import { getCompanySettings } from '@/lib/settings'
import { generateInvoicePdf } from '@/lib/invoice-pdf-generator'
import { generateQuotePdf } from '@/lib/quote-pdf-generator'
import { isEmailConfigured, isValidEmail, sendEmail } from '@/lib/email/resend'
import { invoiceEmail, paymentThanksEmail, quoteEmail, type EmailContent, type EmailIdentity } from '@/lib/email/templates'
import { getClient, findClients } from './clients'
import { getInvoiceWithItems } from './invoices'
import { getQuote } from './quotes'
import { ActionError } from './validation'

/** Quién firma: siempre JAM Tech (datos de Ajustes), también para cotizaciones con plantilla Asiri. */
async function identity(): Promise<EmailIdentity> {
    const s = await getCompanySettings()
    const name = s?.company_name || 'JAM Tech, C.A.'
    const email = s?.email || 'info@jamtech.cloud'
    return {
        name,
        email,
        phone: s?.phone ?? null,
        rif: s?.rif ?? null,
        logo_url: s?.logo_url ?? null,
        from: process.env.EMAIL_FROM || `${name} <${email}>`,
    }
}

export interface EmailPreview {
    kind: EmailKind
    to: string | null
    subject: string
    text: string
    html: string
    attachment_name: string
    from: string
    reply_to: string
    company: string
    client_id: string | null
    client_name: string
    invoice_id?: string
    quote_id?: string
    configured: boolean
    test_mode_to: string | null
    already_sent: { sent_at: string; to: string } | null
    warnings: string[]
}

async function lastSent(kind: EmailKind, ref: { invoice_id?: string; quote_id?: string }): Promise<EmailLog | null> {
    let q = supabase.from('email_log').select('*').eq('kind', kind).eq('status', 'sent').order('sent_at', { ascending: false }).limit(1)
    if (ref.invoice_id) q = q.eq('invoice_id', ref.invoice_id)
    if (ref.quote_id) q = q.eq('quote_id', ref.quote_id)
    const { data } = await q
    return (data?.[0] as EmailLog) ?? null
}

async function resolveQuoteClient(quote: Quote): Promise<Client | null> {
    if (quote.client_id) return getClient(quote.client_id).catch(() => null)
    const matches = await findClients(quote.client_name)
    return matches.length === 1 ? matches[0] : null
}

/**
 * Vista previa EXACTA de lo que se enviaría (mismo generador que el envío).
 * No manda nada. Sirve para la tarjeta de confirmación y el diálogo de la web.
 */
/**
 * El modelo a veces manda un valor de relleno en campos opcionales que
 * debería omitir (ya visto con horas, categorías, montos...). Si lo que llega
 * como "to" no tiene ni forma de correo (sin arroba), lo tratamos como si no
 * se hubiera indicado y usamos el de la ficha, en vez de intentar enviar a un
 * destinatario inventado. Si sí parece un intento real de correo pero está
 * mal escrito, avisamos para que el usuario lo corrija.
 */
function resolveOverride(toOverride: string | null | undefined): { override: string | null; malformedAttempt: string | null } {
    const raw = toOverride?.trim()
    if (!raw) return { override: null, malformedAttempt: null }
    const valid: boolean = isValidEmail(raw)
    if (valid) return { override: raw, malformedAttempt: null }
    return raw.includes('@') ? { override: null, malformedAttempt: raw } : { override: null, malformedAttempt: null }
}

export async function previewEmail(kind: EmailKind, id: string, toOverride?: string | null): Promise<EmailPreview> {
    const warnings: string[] = []
    const testTo = process.env.EMAIL_TEST_TO?.trim() || null
    if (!isEmailConfigured()) warnings.push('Falta configurar RESEND_API_KEY en el servidor: el envío fallará.')
    if (testTo) warnings.push(`Modo prueba activo: todos los correos se desvían a ${testTo}.`)
    const { override, malformedAttempt } = resolveOverride(toOverride)
    if (malformedAttempt) warnings.push(`El correo "${malformedAttempt}" no parece válido; se usará el de la ficha si lo tiene.`)

    if (kind === 'quote') {
        const quote = await getQuote(id)
        const client = await resolveQuoteClient(quote)
        const who = await identity()
        const to = (override || client?.email || null) ?? null
        if (!to) warnings.push(`No hay correo para ${quote.client_name}. Indícalo o agrégalo en la ficha del cliente.`)
        else if (!isValidEmail(to)) warnings.push(`El correo guardado "${to}" no parece válido. Corrígelo en la ficha del cliente.`)
        const content = quoteEmail(quote, client ?? { name: quote.client_name }, who, `${quote.quote_number}.pdf`)
        const sent = await lastSent('quote', { quote_id: quote.id })
        return { kind, to, ...content, from: who.from, reply_to: who.email, company: who.name, client_id: client?.id ?? null, client_name: quote.client_name, quote_id: quote.id, configured: isEmailConfigured(), test_mode_to: testTo, already_sent: sent ? { sent_at: sent.sent_at, to: sent.to_email } : null, warnings }
    }

    const { invoice, items, client } = await getInvoiceWithItems(id)
    const who = await identity()
    const to = (override || client.email || null) ?? null
    if (!to) warnings.push(`${client.name} no tiene correo. Indícalo o agrégalo en su ficha.`)
    else if (!isValidEmail(to)) warnings.push(`El correo guardado "${to}" no parece válido. Corrígelo en la ficha del cliente.`)
    if (kind === 'payment_thanks' && invoice.status !== 'paid') warnings.push('La factura aún no está marcada como pagada.')
    const attachment = `Factura_${invoice.invoice_number}.pdf`
    const content: EmailContent = kind === 'payment_thanks' ? paymentThanksEmail(invoice, client, who, attachment) : invoiceEmail(invoice, items, client, who, attachment)
    const sent = await lastSent(kind, { invoice_id: invoice.id })
    return { kind, to, ...content, from: who.from, reply_to: who.email, company: who.name, client_id: client.id, client_name: client.name, invoice_id: invoice.id, configured: isEmailConfigured(), test_mode_to: testTo, already_sent: sent ? { sent_at: sent.sent_at, to: sent.to_email } : null, warnings }
}

export interface SentEmail {
    to: string
    subject: string
    provider_id: string
    redirected: boolean
    sent_at: string
    kind: EmailKind
    invoice_number?: string
    quote_number?: string
    client_name: string
}

/**
 * Envía el documento por correo con el PDF adjunto y deja registro en email_log.
 * Factura: además la marca como enviada (sent_at; status draft → sent).
 */
export async function sendDocumentEmail(kind: EmailKind, id: string, toOverride?: string | null): Promise<SentEmail> {
    const preview = await previewEmail(kind, id, toOverride)
    const to = preview.to
    if (!to || !isValidEmail(to)) throw new ActionError(preview.warnings.find((w) => w.includes('correo')) ?? 'Falta un correo de destino válido.')
    if (kind === 'payment_thanks' && preview.warnings.some((w) => w.includes('no está marcada como pagada'))) {
        throw new ActionError('La factura aún no está marcada como pagada; márcala primero.')
    }

    // Adjunto: mismo generador que la descarga
    let attachment: { filename: string; content: Blob }
    let invoice: Invoice | null = null
    let quote: Quote | null = null
    if (kind === 'quote') {
        quote = await getQuote(id)
        const { blob, fileName } = await generateQuotePdf(quote)
        attachment = { filename: fileName, content: blob }
    } else {
        const full = await getInvoiceWithItems(id)
        invoice = full.invoice
        const { blob, fileName } = await generateInvoicePdf(full.invoice, full.items, full.client)
        attachment = { filename: fileName, content: blob }
    }

    const logBase = { kind, invoice_id: invoice?.id ?? null, quote_id: quote?.id ?? null, client_id: preview.client_id, to_email: to, subject: preview.subject }
    try {
        const result = await sendEmail({ from: preview.from, to, subject: preview.subject, html: preview.html, text: preview.text, replyTo: preview.reply_to, attachments: [attachment] })
        const sent_at = new Date().toISOString()
        await supabase.from('email_log').insert({ ...logBase, subject: result.subject, provider_id: result.id, status: 'sent', redirected: result.redirected, sent_at })
        if (kind === 'invoice' && invoice) {
            const patch: Record<string, unknown> = { sent_at }
            if (invoice.status === 'draft') patch.status = 'sent'
            await supabase.from('invoices').update(patch).eq('id', invoice.id)
        }
        return { to, subject: result.subject, provider_id: result.id, redirected: result.redirected, sent_at, kind, invoice_number: invoice?.invoice_number, quote_number: quote?.quote_number, client_name: preview.client_name }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await supabase.from('email_log').insert({ ...logBase, status: 'failed', error: message.slice(0, 500) })
        throw e instanceof ActionError ? e : new ActionError(message)
    }
}

export async function listEmailLog(filter: { invoice_id?: string; quote_id?: string; client_id?: string } = {}, limit = 50): Promise<EmailLog[]> {
    let q = supabase.from('email_log').select('*').order('sent_at', { ascending: false }).limit(limit)
    if (filter.invoice_id) q = q.eq('invoice_id', filter.invoice_id)
    if (filter.quote_id) q = q.eq('quote_id', filter.quote_id)
    if (filter.client_id) q = q.eq('client_id', filter.client_id)
    const { data, error } = await q
    if (error) throw new ActionError(`No se pudo leer el registro de correos: ${error.message}`)
    return (data || []) as EmailLog[]
}

/** Último envío exitoso por factura, para mostrar "enviada el…" y "agradecimiento el…". */
export async function getEmailStatusByInvoice(): Promise<Record<string, { invoice?: EmailLog; payment_thanks?: EmailLog }>> {
    const { data } = await supabase.from('email_log').select('*').eq('status', 'sent').not('invoice_id', 'is', null).order('sent_at', { ascending: false })
    const map: Record<string, { invoice?: EmailLog; payment_thanks?: EmailLog }> = {}
    for (const e of (data || []) as EmailLog[]) {
        const key = e.invoice_id!
        map[key] ??= {}
        if (e.kind === 'invoice' && !map[key].invoice) map[key].invoice = e
        if (e.kind === 'payment_thanks' && !map[key].payment_thanks) map[key].payment_thanks = e
    }
    return map
}

export async function getEmailStatusByQuote(): Promise<Record<string, EmailLog>> {
    const { data } = await supabase.from('email_log').select('*').eq('status', 'sent').eq('kind', 'quote').order('sent_at', { ascending: false })
    const map: Record<string, EmailLog> = {}
    for (const e of (data || []) as EmailLog[]) if (e.quote_id && !map[e.quote_id]) map[e.quote_id] = e
    return map
}
