import type { Client, Invoice, Log, Quote } from '@/types'

/** Identidad de la empresa que firma el correo. */
export interface EmailIdentity {
    name: string
    email: string
    phone?: string | null
    rif?: string | null
    logo_url?: string | null
    /** Cabecera "Nombre <correo>" que ve el destinatario. */
    from: string
}

export interface EmailContent {
    subject: string
    html: string
    text: string
    attachment_name: string
}

const money = (n: number, currency: 'USD' | 'EUR' = 'USD') => `${currency === 'EUR' ? '€' : '$'}${Number(n).toFixed(2)} ${currency}`
const fmtDate = (d?: string | null) => (d ? d.split('T')[0].split('-').reverse().join('/') : '')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function greeting(client: Pick<Client, 'name' | 'contact_name'> | { name: string; contact_name?: string | null }): string {
    const who = client.contact_name?.trim() || client.name
    return `Estimado/a ${who}:`
}

/** Envoltorio HTML sobrio: logo, cuerpo, tabla de detalle, firma. */
function layout(identity: EmailIdentity, title: string, paragraphs: string[], details: [string, string][], closing: string): string {
    const rows = details
        .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px">${esc(k)}</td><td style="padding:6px 12px;font-weight:600;font-size:13px;text-align:right">${esc(v)}</td></tr>`)
        .join('')
    const logo = identity.logo_url ? `<img src="${identity.logo_url}" alt="${esc(identity.name)}" style="max-height:48px;margin-bottom:16px" />` : `<div style="font-weight:700;font-size:18px;color:#0f172a;margin-bottom:16px">${esc(identity.name)}</div>`
    return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:32px">
<tr><td>${logo}
<h1 style="font-size:20px;margin:0 0 16px;color:#0f172a">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${esc(p)}</p>`).join('')}
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc">${rows}</table>` : ''}
<p style="font-size:14px;line-height:1.6;margin:16px 0 24px">${esc(closing)}</p>
<p style="font-size:14px;line-height:1.6;margin:0">Saludos cordiales,<br/><strong>${esc(identity.name)}</strong></p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
<p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">${[identity.rif ? `RIF ${identity.rif}` : null, identity.phone, identity.email].filter(Boolean).map((x) => esc(String(x))).join(' · ')}</p>
</td></tr></table></td></tr></table></body></html>`
}

function plain(identity: EmailIdentity, title: string, paragraphs: string[], details: [string, string][], closing: string): string {
    return [
        title,
        '',
        ...paragraphs,
        '',
        ...details.map(([k, v]) => `${k}: ${v}`),
        '',
        closing,
        '',
        'Saludos cordiales,',
        identity.name,
        [identity.rif ? `RIF ${identity.rif}` : null, identity.phone, identity.email].filter(Boolean).join(' · '),
    ].join('\n')
}

export function invoiceEmail(invoice: Invoice, items: Log[], client: Client, identity: EmailIdentity, attachmentName: string): EmailContent {
    const title = `Factura #${invoice.invoice_number}`
    const paragraphs = [
        greeting(client),
        `Le hacemos llegar la factura #${invoice.invoice_number} correspondiente a los servicios prestados, que encontrará adjunta en formato PDF.`,
    ]
    const details: [string, string][] = [
        ['Número de factura', `#${invoice.invoice_number}`],
        ['Fecha de emisión', fmtDate(invoice.issue_date)],
        ['Conceptos', `${items.length}`],
        ['Total', money(invoice.total_amount)],
    ]
    if (invoice.due_date) details.push(['Pagar antes de', fmtDate(invoice.due_date)])
    if (client.payment_terms) details.push(['Condiciones de pago', client.payment_terms])
    const closing = 'Ante cualquier consulta sobre este documento, quedamos a su entera disposición. Gracias por su confianza.'
    return {
        subject: `Factura #${invoice.invoice_number} · ${identity.name}`,
        html: layout(identity, title, paragraphs, details, closing),
        text: plain(identity, title, paragraphs, details, closing),
        attachment_name: attachmentName,
    }
}

export function paymentThanksEmail(invoice: Invoice, client: Client, identity: EmailIdentity, attachmentName: string): EmailContent {
    const title = `Pago recibido · Factura #${invoice.invoice_number}`
    const paragraphs = [
        greeting(client),
        `Le confirmamos que hemos recibido el pago de la factura #${invoice.invoice_number}. Adjuntamos la factura con sello de pagada para sus registros.`,
    ]
    const details: [string, string][] = [
        ['Número de factura', `#${invoice.invoice_number}`],
        ['Monto recibido', money(invoice.total_amount)],
        ['Fecha de pago', fmtDate(invoice.paid_at ?? null) || fmtDate(new Date().toISOString())],
    ]
    const closing = 'Muchas gracias por su confianza y por su puntualidad. Es un gusto seguir trabajando con usted.'
    return {
        subject: `Gracias por su pago · Factura #${invoice.invoice_number} · ${identity.name}`,
        html: layout(identity, title, paragraphs, details, closing),
        text: plain(identity, title, paragraphs, details, closing),
        attachment_name: attachmentName,
    }
}

export function quoteEmail(quote: Quote, client: { name: string; contact_name?: string | null }, identity: EmailIdentity, attachmentName: string): EmailContent {
    const isHours = quote.quote_type === 'hours'
    const docName = quote.doc_title?.trim() || 'Cotización'
    const title = `${docName} ${quote.quote_number}`
    const paragraphs = [
        greeting(client),
        `Conforme a lo conversado, le enviamos adjunta la ${docName.toLowerCase()} ${quote.quote_number} con el detalle de los servicios propuestos.`,
    ]
    const details: [string, string][] = [
        ['Número', quote.quote_number],
        ['Fecha', fmtDate(quote.issue_date)],
        ['Servicios', `${quote.items?.length ?? 0}`],
        isHours ? ['Total de horas', `${quote.total_hours} h`] : ['Total', money(quote.total_amount, quote.currency)],
    ]
    const closing = 'Quedamos atentos a sus comentarios y con gusto ajustamos cualquier punto que considere necesario.'
    return {
        subject: `${docName} ${quote.quote_number} · ${identity.name}`,
        html: layout(identity, title, paragraphs, details, closing),
        text: plain(identity, title, paragraphs, details, closing),
        attachment_name: attachmentName,
    }
}
