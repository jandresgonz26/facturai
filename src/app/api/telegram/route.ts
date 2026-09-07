import { NextRequest, after } from 'next/server'
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai'
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

/**
 * Confirmaciones sin responder en el ÚLTIMO mensaje del asistente (puede haber
 * más de una: pedir dos cosas en la misma frase, ej. "registra esto y aquello",
 * genera dos propuestas a la vez). Solo el último mensaje puede tenerlas: nunca
 * se agrega nada después de un mensaje con aprobaciones pendientes sin resolver.
 */
function pendingApprovals(history: UIMessage[]): { idx: number; ids: string[] } | null {
    const idx = history.length - 1
    const last = history[idx]
    if (!last || last.role !== 'assistant') return null
    const ids = toolParts(last)
        .filter((p) => p.state === 'approval-requested' && p.approval?.id)
        .map((p) => p.approval!.id)
    return ids.length ? { idx, ids } : null
}

/** Marca una aprobación como respondida en el mensaje (mutación local, no llama al modelo). */
function markApprovalResponded(message: UIMessage, approvalId: string, approved: boolean, reason?: string): void {
    for (const part of message.parts as unknown as ToolPartLike[]) {
        if (part.approval?.id === approvalId && part.state === 'approval-requested') {
            part.state = 'approval-responded'
            part.approval = { id: approvalId, approved, ...(approved ? {} : { reason: reason ?? 'Cancelado' }) }
        }
    }
}

/**
 * Continúa la conversación tras resolver aprobaciones. Si el mensaje tiene más
 * de una pendiente y aún falta alguna por responder, NO llama al modelo todavía
 * (igual que el chat web con lastAssistantMessageIsCompleteWithApprovalResponses):
 * solo se sigue cuando TODAS las de ese mensaje quedaron respondidas.
 */
async function continueIfComplete(chatId: string, history: UIMessage[], idx: number): Promise<UIMessage[]> {
    if (!lastAssistantMessageIsCompleteWithApprovalResponses({ messages: history.slice(0, idx + 1) })) {
        await saveSession(chatId, history)
        return history
    }
    const assistant = history[idx]
    await sendChatAction(chatId, 'typing')
    const before = structuredClone(assistant) as UIMessage
    // readUIMessageStream fusiona la continuación en el mismo objeto: antes de mutarlo guardamos una copia para saber qué es nuevo.
    const messages = [...history.slice(0, idx), assistant]
    const updated = await runAgentTurn(messages, assistant)
    const newHistory = [...history.slice(0, idx), updated, ...history.slice(idx + 1)]
    await saveSession(chatId, newHistory)
    await deliver(chatId, updated, before)
    return newHistory
}

async function runTurn(chatId: string, text: string): Promise<void> {
    await sendChatAction(chatId, 'typing')
    try {
        let history = await loadSession(chatId)
        const pending = pendingApprovals(history)
        if (pending) {
            // Un mensaje nuevo con confirmaciones sin responder rompería la conversación
            // (el modelo exige que toda llamada a herramienta quede resuelta antes de seguir).
            // Las cancelamos todas y seguimos: el asistente ve la corrección en el mismo
            // hilo y puede volver a proponer la acción ya ajustada.
            const assistant = structuredClone(history[pending.idx]) as UIMessage
            for (const id of pending.ids) markApprovalResponded(assistant, id, false, 'Reemplazada por un nuevo mensaje')
            history = [...history.slice(0, pending.idx), assistant, ...history.slice(pending.idx + 1)]
            history = await continueIfComplete(chatId, history, pending.idx)
        }
        const messages = [...history, newUserMessage(text)]
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
    const pending = pendingApprovals(history)
    if (!pending || !pending.ids.includes(approvalId)) {
        await answerCallbackQuery(cq.id, 'Esta confirmación ya no está vigente.')
        if (cq.message) await editMessageReplyMarkup(chatId, cq.message.message_id, null)
        return
    }

    await answerCallbackQuery(cq.id, approved ? 'Confirmado' : 'Cancelado')
    if (cq.message) {
        await editMessageReplyMarkup(chatId, cq.message.message_id, null)
        await editMessageText(chatId, cq.message.message_id, `${approved ? '✅ <b>Confirmado</b>' : '❌ <b>Cancelado</b>'}\n\n${escapeHtml((cq.message.text ?? '').replace(/^⚠️ Confirmar: /, ''))}`)
    }

    try {
        const assistant = structuredClone(history[pending.idx]) as UIMessage
        markApprovalResponded(assistant, approvalId, approved, 'Cancelado por el usuario')
        const newHistory = [...history.slice(0, pending.idx), assistant, ...history.slice(pending.idx + 1)]
        // Si quedan otras confirmaciones del mismo mensaje sin responder, continueIfComplete
        // solo guarda la sesión y espera; el modelo se llama cuando todas estén resueltas.
        await continueIfComplete(chatId, newHistory, pending.idx)
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

// Telegram puede reintentar la entrega de un update si no respondimos rápido o
// hubo un corte (deploy, reinicio). Como respondemos 200 antes de procesar,
// un reintento real llegaría con el MISMO update_id: lo descartamos para no
// ejecutar dos veces la misma acción (ej. registrar el mismo cargo dos veces).
const seenUpdateIds: number[] = []
const seenUpdateIdSet = new Set<number>()
function alreadyProcessed(updateId: number): boolean {
    if (seenUpdateIdSet.has(updateId)) return true
    seenUpdateIdSet.add(updateId)
    seenUpdateIds.push(updateId)
    if (seenUpdateIds.length > 500) seenUpdateIdSet.delete(seenUpdateIds.shift()!)
    return false
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
    if (alreadyProcessed(update.update_id)) return Response.json({ ok: true })

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
