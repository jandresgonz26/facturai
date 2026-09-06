import { NextRequest, after } from 'next/server'
import type { UIMessage } from 'ai'
import { runAgentTurn } from '@/lib/agent/run'
import { transcribeAudio } from '@/lib/agent/transcribe'
import { getInvoiceWithItems, getQuote } from '@/lib/actions'
import { generateInvoicePdf } from '@/lib/invoice-pdf-generator'
import { generateQuotePdf } from '@/lib/quote-pdf-generator'
import {
    answerCallbackQuery,
    editMessageReplyMarkup,
    editMessageText,
    getFileBytes,
    sendChatAction,
    sendDocument,
    sendMessage,
    type TgCallbackQuery,
    type TgMessage,
    type TgUpdate,
} from '@/lib/telegram/api'
import { escapeHtml, isWritePart, mdToTelegramHtml, renderConfirmation, renderResult, toolNameOf, toolParts, type ToolPartLike } from '@/lib/telegram/format'
import { loadSession, resetSession, saveSession } from '@/lib/telegram/session'

export const runtime = 'nodejs'
export const maxDuration = 120

const allowedChatIds = () =>
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

// Un turno a la vez por chat (mismo proceso). Evita que dos mensajes seguidos pisen la sesión.
const locks = new Map<string, Promise<void>>()
function withLock(chatId: string, fn: () => Promise<void>): Promise<void> {
    const prev = locks.get(chatId) ?? Promise.resolve()
    const next = prev.then(fn, fn).finally(() => {
        if (locks.get(chatId) === next) locks.delete(chatId)
    })
    locks.set(chatId, next)
    return next
}

const HELP = [
    '<b>Asistente de FacturAI</b>',
    'Escribe o manda un audio con lo que necesites, igual que en la web:',
    '• «Factúrale el mes a Asiri y agrégale soporte por 100 euros»',
    '• «Registra 2 horas de soporte a Arco Iris»',
    '• «¿Quién me debe?» · «¿Cuánto facturé en agosto?»',
    '• «¿Qué tengo pendiente hoy?»',
    '',
    'Toda escritura te pide confirmación con botones antes de tocar la base de datos.',
    '',
    '/pendiente — resumen de hoy',
    '/nuevo — empezar conversación de cero',
].join('\n')

function newUserMessage(text: string): UIMessage {
    return { id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: 'user', parts: [{ type: 'text', text }] }
}

function textOf(message: UIMessage): string {
    return message.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
        .trim()
}

/** Envía al chat solo lo nuevo de la respuesta del asistente respecto a la versión anterior del mismo mensaje. */
async function deliver(chatId: string, assistant: UIMessage, previous?: UIMessage): Promise<void> {
    const prevParts = previous ? toolParts(previous) : []
    const prevState = new Map(prevParts.map((p) => [p.toolCallId, p.state]))
    const prevTextCount = previous ? previous.parts.filter((p) => p.type === 'text').length : 0
    const parts = toolParts(assistant)

    // Texto nuevo (solo los bloques de texto que no existían antes)
    const texts = assistant.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text').slice(prevTextCount)
    const text = texts.map((t) => t.text).join('\n').trim()
    if (text) await sendMessage(chatId, mdToTelegramHtml(text))

    for (const part of parts) {
        if (!isWritePart(part)) continue
        if (prevState.get(part.toolCallId) === part.state) continue
        const tool = toolNameOf(part)
        if (part.state === 'approval-requested' && part.approval) {
            await sendMessage(chatId, renderConfirmation(tool, part.input, parts), {
                inline_keyboard: [
                    [
                        { text: '✅ Confirmar', callback_data: `apr:${part.approval.id}:1` },
                        { text: '❌ Cancelar', callback_data: `apr:${part.approval.id}:0` },
                    ],
                ],
            })
        } else if (['output-available', 'output-denied', 'output-error'].includes(part.state)) {
            await sendMessage(chatId, renderResult(tool, part))
            await sendAttachments(chatId, tool, part)
        }
    }
}

/** Tras facturar o cotizar, manda el PDF al chat. */
async function sendAttachments(chatId: string, tool: string, part: ToolPartLike): Promise<void> {
    const out = part.output as { ok?: boolean; data?: Record<string, unknown> } | undefined
    if (!out?.ok || !out.data) return
    try {
        if (tool === 'bill_client_month' && typeof out.data.invoice_id === 'string') {
            await sendChatAction(chatId, 'upload_document')
            const { invoice, items, client } = await getInvoiceWithItems(out.data.invoice_id)
            const { blob, fileName } = await generateInvoicePdf(invoice, items, client)
            await sendDocument(chatId, blob, fileName, `Factura #${invoice.invoice_number} · ${client.name}`)
        } else if (tool === 'create_quote' && typeof out.data.id === 'string') {
            await sendChatAction(chatId, 'upload_document')
            const quote = await getQuote(out.data.id)
            const { blob, fileName } = await generateQuotePdf(quote)
            await sendDocument(chatId, blob, fileName, `Cotización ${quote.quote_number} · ${quote.client_name}`)
        }
    } catch (e) {
        console.error('[telegram] no se pudo enviar el PDF', e)
        await sendMessage(chatId, 'ℹ️ No pude generar el PDF desde aquí; descárgalo desde la app.')
    }
}

async function runTurn(chatId: string, text: string): Promise<void> {
    await sendChatAction(chatId, 'typing')
    const history = await loadSession(chatId)
    const messages = [...history, newUserMessage(text)]
    try {
        const assistant = await runAgentTurn(messages)
        await saveSession(chatId, [...messages, assistant])
        await deliver(chatId, assistant)
    } catch (e) {
        console.error('[telegram] turno fallido', e)
        await sendMessage(chatId, `⚠️ ${escapeHtml(e instanceof Error ? e.message : 'El asistente no pudo responder')}`)
    }
}

async function handleApproval(cq: TgCallbackQuery): Promise<void> {
    const chatId = String(cq.message?.chat.id ?? cq.from.id)
    const m = /^apr:([^:]+):([01])$/.exec(cq.data ?? '')
    if (!m) return answerCallbackQuery(cq.id)
    const [, approvalId, flag] = m
    const approved = flag === '1'

    const history = await loadSession(chatId)
    const idx = history.findLastIndex((msg) => msg.role === 'assistant' && toolParts(msg).some((p) => p.state === 'approval-requested' && p.approval?.id === approvalId))
    if (idx === -1) {
        await answerCallbackQuery(cq.id, 'Esta confirmación ya no está vigente.')
        if (cq.message) await editMessageReplyMarkup(chatId, cq.message.message_id, null)
        return
    }

    const assistant = structuredClone(history[idx]) as UIMessage
    for (const part of assistant.parts as unknown as ToolPartLike[]) {
        if (part.approval?.id === approvalId && part.state === 'approval-requested') {
            part.state = 'approval-responded'
            part.approval = { id: approvalId, approved, ...(approved ? {} : { reason: 'Cancelado por el usuario' }) }
        }
    }
    await answerCallbackQuery(cq.id, approved ? 'Confirmado' : 'Cancelado')
    if (cq.message) {
        await editMessageReplyMarkup(chatId, cq.message.message_id, null)
        await editMessageText(chatId, cq.message.message_id, `${approved ? '✅ <b>Confirmado</b>' : '❌ <b>Cancelado</b>'}\n\n${escapeHtml((cq.message.text ?? '').replace(/^⚠️ Confirmar: /, ''))}`)
    }
    if (approved) await sendChatAction(chatId, 'typing')

    const messages = [...history.slice(0, idx), assistant]
    // readUIMessageStream fusiona la continuación en el mismo objeto: guardamos una copia previa para saber qué es nuevo.
    const before = structuredClone(assistant) as UIMessage
    try {
        const updated = await runAgentTurn(messages, assistant)
        await saveSession(chatId, [...history.slice(0, idx), updated, ...history.slice(idx + 1)])
        await deliver(chatId, updated, before)
    } catch (e) {
        console.error('[telegram] continuación fallida', e)
        await sendMessage(chatId, `⚠️ ${escapeHtml(e instanceof Error ? e.message : 'No se pudo completar la acción')}`)
    }
}

async function handleMessage(msg: TgMessage): Promise<void> {
    const chatId = String(msg.chat.id)
    const allowed = allowedChatIds()
    if (!allowed.includes(chatId)) {
        await sendMessage(chatId, `Este bot es privado. Si eres el dueño, añade este chat id a <code>TELEGRAM_ALLOWED_CHAT_IDS</code>: <code>${chatId}</code>`)
        return
    }

    let text = (msg.text ?? '').trim()

    if (msg.voice || msg.audio) {
        await sendChatAction(chatId, 'typing')
        try {
            const bytes = await getFileBytes((msg.voice ?? msg.audio)!.file_id)
            const t = await transcribeAudio(bytes)
            if (!t.ok) {
                await sendMessage(chatId, `🎙️ ${escapeHtml(t.error)}`)
                return
            }
            text = t.text
            await sendMessage(chatId, `🎙️ <i>${escapeHtml(text)}</i>`)
        } catch (e) {
            await sendMessage(chatId, `⚠️ No pude procesar el audio: ${escapeHtml(e instanceof Error ? e.message : '')}`)
            return
        }
    }

    if (!text) {
        await sendMessage(chatId, 'Solo entiendo texto o notas de voz por ahora.')
        return
    }

    if (text === '/start' || text === '/ayuda' || text === '/help') return void (await sendMessage(chatId, HELP))
    if (text === '/nuevo' || text === '/reset') {
        await resetSession(chatId)
        return void (await sendMessage(chatId, 'Conversación reiniciada. ¿Qué hacemos?'))
    }
    if (text === '/pendiente') text = '¿Qué tengo pendiente hoy?'

    await runTurn(chatId, text)
}

export async function POST(req: NextRequest) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
        return new Response('forbidden', { status: 403 })
    }
    let update: TgUpdate
    try {
        update = (await req.json()) as TgUpdate
    } catch {
        return new Response('bad request', { status: 400 })
    }

    const chatId = String(update.callback_query?.message?.chat.id ?? update.callback_query?.from.id ?? update.message?.chat.id ?? '')
    if (chatId) {
        // Respondemos a Telegram de inmediato y procesamos después (el agente puede tardar).
        after(() =>
            withLock(chatId, async () => {
                try {
                    if (update.callback_query) await handleApproval(update.callback_query)
                    else if (update.message) await handleMessage(update.message)
                } catch (e) {
                    console.error('[telegram] error procesando update', e)
                }
            })
        )
    }
    return Response.json({ ok: true })
}

export async function GET() {
    return Response.json({ ok: true, configured: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_WEBHOOK_SECRET })
}
