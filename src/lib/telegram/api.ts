/** Cliente mínimo de la Bot API de Telegram (sin dependencias). */

const API_BASE = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '')
const token = () => {
    const t = process.env.TELEGRAM_BOT_TOKEN
    if (!t) throw new Error('Falta configurar TELEGRAM_BOT_TOKEN')
    return t
}

export interface InlineKeyboardButton {
    text: string
    callback_data: string
}
export type ReplyMarkup = { inline_keyboard: InlineKeyboardButton[][] }

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${API_BASE()}/bot${token()}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string }
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`)
    return json.result as T
}

const MAX_LEN = 4000

/** Divide un texto largo respetando saltos de línea (límite de Telegram: 4096). */
function chunk(text: string): string[] {
    if (text.length <= MAX_LEN) return [text]
    const parts: string[] = []
    let current = ''
    for (const line of text.split('\n')) {
        if ((current + '\n' + line).length > MAX_LEN) {
            if (current) parts.push(current)
            current = line.slice(0, MAX_LEN)
        } else {
            current = current ? `${current}\n${line}` : line
        }
    }
    if (current) parts.push(current)
    return parts
}

export async function sendMessage(chatId: string | number, html: string, replyMarkup?: ReplyMarkup): Promise<{ message_id: number } | null> {
    const pieces = chunk(html)
    let last: { message_id: number } | null = null
    for (let i = 0; i < pieces.length; i++) {
        last = await call<{ message_id: number }>('sendMessage', {
            chat_id: chatId,
            text: pieces[i],
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(i === pieces.length - 1 && replyMarkup ? { reply_markup: replyMarkup } : {}),
        })
    }
    return last
}

export async function sendChatAction(chatId: string | number, action: 'typing' | 'upload_document' = 'typing'): Promise<void> {
    await call('sendChatAction', { chat_id: chatId, action }).catch(() => undefined)
}

export async function answerCallbackQuery(id: string, text?: string): Promise<void> {
    await call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) }).catch(() => undefined)
}

export async function editMessageReplyMarkup(chatId: string | number, messageId: number, replyMarkup: ReplyMarkup | null): Promise<void> {
    await call('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup ?? { inline_keyboard: [] },
    }).catch(() => undefined)
}

export async function editMessageText(chatId: string | number, messageId: number, html: string): Promise<void> {
    await call('editMessageText', { chat_id: chatId, message_id: messageId, text: html, parse_mode: 'HTML' }).catch(() => undefined)
}

export async function getFileBytes(fileId: string): Promise<Uint8Array> {
    const file = await call<{ file_path: string }>('getFile', { file_id: fileId })
    const res = await fetch(`${API_BASE()}/file/bot${token()}/${file.file_path}`)
    if (!res.ok) throw new Error(`No se pudo descargar el archivo (${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
}

export async function sendDocument(chatId: string | number, bytes: Blob | Uint8Array, fileName: string, caption?: string): Promise<void> {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    if (caption) form.append('caption', caption)
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: 'application/pdf' })
    form.append('document', blob, fileName)
    const res = await fetch(`${API_BASE()}/bot${token()}/sendDocument`, { method: 'POST', body: form })
    const json = (await res.json()) as { ok: boolean; description?: string }
    if (!json.ok) throw new Error(`Telegram sendDocument: ${json.description ?? res.status}`)
}

export async function setWebhook(url: string, secret: string): Promise<void> {
    await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true })
}

export async function setMyCommands(commands: { command: string; description: string }[]): Promise<void> {
    await call('setMyCommands', { commands })
}

export async function getMe(): Promise<{ username: string; first_name: string }> {
    return call('getMe', {})
}

// ── Tipos de update que usamos ──
export interface TgUser {
    id: number
    first_name?: string
    username?: string
}
export interface TgMessage {
    message_id: number
    chat: { id: number; type: string }
    from?: TgUser
    text?: string
    voice?: { file_id: string; duration: number }
    audio?: { file_id: string; duration: number }
}
export interface TgCallbackQuery {
    id: string
    from: TgUser
    data?: string
    message?: TgMessage
}
export interface TgUpdate {
    update_id: number
    message?: TgMessage
    callback_query?: TgCallbackQuery
}
