import { experimental_transcribe as transcribe } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { listClients } from '@/lib/actions'

function normalize(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

/**
 * Con audio corto, silencioso o poco claro, los modelos de transcripción
 * basados en LLM a veces "alucinan" devolviendo el prompt de contexto que
 * les damos para reconocer nombres de clientes, en vez de fallar.
 */
function looksLikePromptEcho(text: string, clientNames: string[]): boolean {
    const n = normalize(text)
    if (n.includes('vocabulario de facturacion') || n.includes('terminos ') || n.startsWith('clientes ')) return true
    return clientNames.filter((name) => n.includes(normalize(name))).length >= 4
}

export type TranscriptionResult = { ok: true; text: string } | { ok: false; error: string }

/** Transcribe audio (webm/ogg/m4a/mp3…) en español con vocabulario del negocio. */
export async function transcribeAudio(bytes: Uint8Array): Promise<TranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { ok: false, error: 'Falta configurar OPENAI_API_KEY en el servidor.' }
    const names = (await listClients().catch(() => [])).map((c) => c.name)
    const prompt = `Vocabulario de facturación. Clientes: ${names.join(', ')}. Términos: factura, cotización, bolsa de horas, servicios fijos, pendientes, pagada, dólares, euros.`
    try {
        const openai = createOpenAI({ apiKey })
        const result = await transcribe({
            model: openai.transcription(process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'),
            audio: bytes,
            providerOptions: { openai: { language: 'es', prompt } },
        })
        const text = result.text.trim()
        if (!text) return { ok: false, error: 'No se entendió el audio. Intenta de nuevo.' }
        if (looksLikePromptEcho(text, names)) {
            console.warn('[transcribe] descartada transcripción que repetía el prompt de contexto')
            return { ok: false, error: 'No se entendió el audio con claridad. Intenta de nuevo hablando cerca del micrófono.' }
        }
        return { ok: true, text }
    } catch (e) {
        console.error('[transcribe]', e)
        return { ok: false, error: e instanceof Error ? e.message : 'No se pudo transcribir el audio' }
    }
}
