import { NextRequest } from 'next/server'
import { experimental_transcribe as transcribe } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { listClients } from '@/lib/actions'

export const runtime = 'nodejs'
export const maxDuration = 60

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
 * les damos para reconocer nombres de clientes, en vez de fallar. Si el
 * texto devuelto es en gran parte ese prompt, lo tratamos como si no se
 * hubiera entendido nada, en vez de pasarle al agente instrucciones falsas.
 */
function looksLikePromptEcho(text: string, clientNames: string[]): boolean {
    const n = normalize(text)
    if (n.includes('vocabulario de facturacion') || n.includes('terminos ') || n.startsWith('clientes ')) return true
    const mentioned = clientNames.filter((name) => n.includes(normalize(name))).length
    return mentioned >= 4
}

export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        return Response.json({ error: 'Falta configurar OPENAI_API_KEY en el servidor.' }, { status: 500 })
    }

    const form = await req.formData()
    const file = form.get('audio')
    if (!(file instanceof Blob) || file.size === 0) {
        return Response.json({ error: 'No se recibió audio' }, { status: 400 })
    }
    if (file.size > 20 * 1024 * 1024) {
        return Response.json({ error: 'El audio es demasiado largo' }, { status: 413 })
    }

    const clients = await listClients().catch(() => [])
    const names = clients.map((c) => c.name)
    // Deliberadamente corto: una lista de vocabulario, no una frase completa,
    // para reducir el riesgo de que el modelo la repita como si fuera el audio.
    const prompt = `Vocabulario de facturación. Clientes: ${names.join(', ')}. Términos: factura, cotización, bolsa de horas, servicios fijos, pendientes, pagada, dólares, euros.`

    try {
        const openai = createOpenAI({ apiKey })
        const result = await transcribe({
            model: openai.transcription(process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'),
            audio: new Uint8Array(await file.arrayBuffer()),
            providerOptions: { openai: { language: 'es', prompt } },
        })
        const text = result.text.trim()
        if (text && looksLikePromptEcho(text, names)) {
            console.warn('[transcribe] descartada transcripción que repetía el prompt de contexto')
            return Response.json(
                { error: 'No se entendió el audio con claridad. Intenta de nuevo hablando cerca del micrófono.' },
                { status: 422 }
            )
        }
        return Response.json({ text })
    } catch (e) {
        console.error('[transcribe]', e)
        return Response.json(
            { error: e instanceof Error ? e.message : 'No se pudo transcribir el audio' },
            { status: 500 }
        )
    }
}
