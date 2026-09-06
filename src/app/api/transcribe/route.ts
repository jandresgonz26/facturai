import { NextRequest } from 'next/server'
import { experimental_transcribe as transcribe } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { listClients } from '@/lib/actions'

export const runtime = 'nodejs'
export const maxDuration = 60

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
    const names = clients.map((c) => c.name).join(', ')
    const prompt = `Instrucciones de facturación en español. Nombres de clientes: ${names}. Términos: factura, facturar, cotización, bolsa de horas, servicios fijos, pendientes, pagada, USD, EUR, dólares, euros.`

    try {
        const openai = createOpenAI({ apiKey })
        const result = await transcribe({
            model: openai.transcription(process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'),
            audio: new Uint8Array(await file.arrayBuffer()),
            providerOptions: { openai: { language: 'es', prompt } },
        })
        return Response.json({ text: result.text.trim() })
    } catch (e) {
        console.error('[transcribe]', e)
        return Response.json(
            { error: e instanceof Error ? e.message : 'No se pudo transcribir el audio' },
            { status: 500 }
        )
    }
}
