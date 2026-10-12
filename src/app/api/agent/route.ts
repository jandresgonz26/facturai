import { NextRequest } from 'next/server'
import type { UIMessage } from 'ai'
import { createAgentStream } from '@/lib/agent/run'
import { proveedorActivo } from '@/lib/agent/modelo'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
    if (!proveedorActivo()) {
        return Response.json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor.' }, { status: 500 })
    }

    let messages: UIMessage[]
    try {
        ;({ messages } = (await req.json()) as { messages: UIMessage[] })
    } catch {
        return Response.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
    }

    const result = await createAgentStream(messages)
    return result.toUIMessageStreamResponse({
        onError: (error) => (error instanceof Error ? error.message : 'Error inesperado del asistente'),
    })
}
