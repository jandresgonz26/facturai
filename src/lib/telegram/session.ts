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

export async function saveSession(chatId: string | number, messages: UIMessage[]): Promise<void> {
    const key = String(chatId)
    let trimmed = messages.slice(-MAX_MESSAGES)
    // No empezar la ventana con un mensaje del asistente huérfano
    while (trimmed.length && trimmed[0].role !== 'user') trimmed = trimmed.slice(1)
    memory.set(key, trimmed)
    const { error } = await supabase
        .from('telegram_sessions')
        .upsert({ chat_id: key, messages: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'chat_id' })
    if (error) console.error('[telegram] no se pudo guardar la sesión (¿falta schema_update_telegram.sql?)', error.message)
}

export async function resetSession(chatId: string | number): Promise<void> {
    const key = String(chatId)
    memory.delete(key)
    await supabase.from('telegram_sessions').delete().eq('chat_id', key)
}
