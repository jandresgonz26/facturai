import type { UIMessage } from 'ai'
import { supabase } from '@/lib/supabase'

const MAX_MESSAGES = 40

/**
 * Conversación persistida por chat de Telegram (tabla telegram_sessions).
 * Mantiene además una copia en memoria: sirve de caché y de respaldo si la
 * tabla aún no existe (antes de ejecutar schema_update_telegram.sql).
 */
const memory = new Map<string, UIMessage[]>()

export async function loadSession(chatId: string | number): Promise<UIMessage[]> {
    const key = String(chatId)
    const { data, error } = await supabase.from('telegram_sessions').select('messages').eq('chat_id', key).maybeSingle()
    if (error) {
        console.error('[telegram] no se pudo leer la sesión (¿falta schema_update_telegram.sql?)', error.message)
        return memory.get(key) ?? []
    }
    const msgs = Array.isArray(data?.messages) ? (data!.messages as UIMessage[]) : memory.get(key) ?? []
    memory.set(key, msgs)
    return msgs
}

/** Un mensaje de solo texto puede abrir la ventana; uno con llamadas a herramienta a medias, no. */
const isPlainText = (m: UIMessage) => (m.parts as { type: string }[]).every((p) => p.type === 'text')

export async function saveSession(chatId: string | number, messages: UIMessage[]): Promise<void> {
    const key = String(chatId)
    let trimmed = messages.slice(-MAX_MESSAGES)
    // No empezar la ventana con un mensaje del asistente huérfano. Se permite
    // que sea de texto puro (ej. un aviso proactivo): lo que rompe la
    // conversación es abrirla con llamadas a herramienta sin resolver.
    while (trimmed.length && trimmed[0].role !== 'user' && !isPlainText(trimmed[0])) trimmed = trimmed.slice(1)
    memory.set(key, trimmed)
    const { error } = await supabase
        .from('telegram_sessions')
        .upsert({ chat_id: key, messages: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' })
    if (error) console.error('[telegram] no se pudo guardar la sesión (¿falta schema_update_telegram.sql?)', error.message)
}

/**
 * Deja en la conversación un mensaje que el asistente mandó por su cuenta
 * (los avisos proactivos del cron). Sin esto, el usuario responde "muévelas a
 * mañana" a un mensaje que la conversación nunca vio: el asistente no tiene
 * ni idea de qué habla y pregunta cosas absurdas.
 *
 * Se salta si hay una confirmación sin responder: meter un mensaje en medio
 * partiría ese flujo de aprobación en dos.
 */
export async function appendAssistantMessage(chatId: string | number, text: string): Promise<void> {
    const history = await loadSession(chatId)
    const pendingApproval = history.some((m) =>
        (m.parts as { state?: string }[]).some((p) => p.state === 'approval-requested')
    )
    if (pendingApproval) return
    const message = { id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text }] } as unknown as UIMessage
    await saveSession(chatId, [...history, message])
}

export async function resetSession(chatId: string | number): Promise<void> {
    const key = String(chatId)
    memory.delete(key)
    await supabase.from('telegram_sessions').delete().eq('chat_id', key)
}
