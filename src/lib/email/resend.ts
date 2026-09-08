import { ActionError } from '@/lib/actions/validation'

/**
 * Envío de correo transaccional con Resend (https://resend.com), sin SDK.
 *
 * Salvaguardas:
 * - EMAIL_TEST_TO: si está definida, TODOS los correos se desvían a esa dirección
 *   (con el destinatario real en el asunto). Para probar el flujo sin riesgo.
 * - EMAIL_BCC: copia oculta a tu propio correo en cada envío, para tener constancia.
 */
export interface EmailAttachment {
    filename: string
    content: Blob | Uint8Array
}

export interface SendEmailInput {
    from: string
    to: string
    subject: string
    html: string
    text: string
    replyTo?: string
    attachments?: EmailAttachment[]
}

export interface SendEmailResult {
    id: string
    to: string
    subject: string
    redirected: boolean
}

const API_BASE = () => (process.env.RESEND_API_BASE || 'https://api.resend.com').replace(/\/$/, '')

export function isEmailConfigured(): boolean {
    return !!process.env.RESEND_API_KEY
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(s: string | null | undefined): s is string {
    return !!s && EMAIL_RE.test(s.trim())
}

async function toBase64(content: Blob | Uint8Array): Promise<string> {
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(await content.arrayBuffer())
    return Buffer.from(bytes).toString('base64')
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new ActionError('Falta configurar RESEND_API_KEY en el servidor para enviar correos.')
    if (!isValidEmail(input.to)) throw new ActionError(`El correo de destino no es válido: ${input.to}`)

    const testTo = process.env.EMAIL_TEST_TO?.trim()
    const redirected = isValidEmail(testTo)
    const to = redirected ? testTo! : input.to.trim()
    const subject = redirected ? `[PRUEBA → ${input.to.trim()}] ${input.subject}` : input.subject
    const bcc = process.env.EMAIL_BCC?.trim()

    const attachments = await Promise.all(
        (input.attachments ?? []).map(async (a) => ({ filename: a.filename, content: await toBase64(a.content) }))
    )

    const res = await fetch(`${API_BASE()}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            from: input.from,
            to: [to],
            subject,
            html: input.html,
            text: input.text,
            ...(input.replyTo ? { reply_to: input.replyTo } : {}),
            ...(isValidEmail(bcc) && bcc !== to ? { bcc: [bcc] } : {}),
            ...(attachments.length ? { attachments } : {}),
        }),
    })
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
    if (!res.ok || !json.id) {
        throw new ActionError(`No se pudo enviar el correo (Resend ${res.status}): ${json.message ?? json.name ?? 'error desconocido'}`)
    }
    return { id: json.id, to, subject, redirected }
}
