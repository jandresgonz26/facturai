import { NextRequest } from 'next/server'
import type { UIMessage } from 'ai'
import { createAgentStream } from '@/lib/agent/run'
import { proveedorActivo } from '@/lib/agent/modelo'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import { guardarHilo } from '@/lib/agent/hilos'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
    if (!proveedorActivo()) {
        return Response.json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor.' }, { status: 500 })
    }

    let messages: UIMessage[]
    let departamento: Departamento | undefined
    try {
        const body = (await req.json()) as { messages: UIMessage[]; departamento?: string }
        messages = body.messages
        // Chat de la página de un agente: habla como esa persona y la conversación se guarda en el servidor.
        if (body.departamento && body.departamento in DEPARTAMENTOS) departamento = body.departamento as Departamento
    } catch {
        return Response.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
    }

    const result = await createAgentStream(messages, 'chat', { departamento })
    return result.toUIMessageStreamResponse({
        onError: (error) => (error instanceof Error ? error.message : 'Error inesperado del asistente'),
        ...(departamento ? { originalMessages: messages, onEnd: async ({ messages: todos }: { messages: UIMessage[] }) => { await guardarHilo(departamento!, todos) } } : {}),
    })
}
