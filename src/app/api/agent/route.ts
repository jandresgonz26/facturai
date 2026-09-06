import { NextRequest } from 'next/server'
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { agentTools, toolApproval } from '@/lib/agent/tools'
import { buildSystemPrompt } from '@/lib/agent/system-prompt'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        return Response.json(
            { error: 'Falta configurar OPENAI_API_KEY en el servidor.' },
            { status: 500 }
        )
    }

    let messages: UIMessage[]
    try {
        ;({ messages } = (await req.json()) as { messages: UIMessage[] })
    } catch {
        return Response.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
    }

    const openai = createOpenAI({ apiKey })
    const modelId = process.env.OPENAI_MODEL || 'gpt-5.4-mini'
    const system = await buildSystemPrompt()

    const result = streamText({
        model: openai(modelId),
        system,
        messages: await convertToModelMessages(messages),
        tools: agentTools,
        toolApproval,
        stopWhen: stepCountIs(8),
        experimental_toolApprovalSecret: process.env.AGENT_APPROVAL_SECRET || undefined,
        onError: ({ error }) => console.error('[agent]', error),
    })

    return result.toUIMessageStreamResponse({
        onError: (error) => (error instanceof Error ? error.message : 'Error inesperado del asistente'),
    })
}
