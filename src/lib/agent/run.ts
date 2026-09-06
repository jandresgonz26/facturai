import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText, type UIMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { agentTools, toolApproval } from './tools'
import { buildSystemPrompt } from './system-prompt'

/** Configuración única del agente, compartida por el chat web y el bot de Telegram. */
export async function createAgentStream(messages: UIMessage[]) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('Falta configurar OPENAI_API_KEY en el servidor.')
    const openai = createOpenAI({ apiKey })
    const modelId = process.env.OPENAI_MODEL || 'gpt-5.4-mini'
    const system = await buildSystemPrompt()
    return streamText({
        model: openai(modelId),
        system,
        messages: await convertToModelMessages(messages),
        tools: agentTools,
        toolApproval,
        stopWhen: stepCountIs(8),
        experimental_toolApprovalSecret: process.env.AGENT_APPROVAL_SECRET || undefined,
        onError: ({ error }) => console.error('[agent]', error),
    })
}

/**
 * Ejecuta un turno completo sin streaming hacia un cliente y devuelve el
 * mensaje del asistente resultante (con sus partes de texto y herramientas),
 * exactamente como lo vería el chat web. Si `continueFrom` es el último
 * mensaje del asistente (caso de aprobación), la respuesta se fusiona en él.
 */
export async function runAgentTurn(messages: UIMessage[], continueFrom?: UIMessage): Promise<UIMessage> {
    const result = await createAgentStream(messages)
    let last: UIMessage | undefined = continueFrom
    for await (const m of readUIMessageStream({ stream: result.toUIMessageStream(), message: continueFrom })) {
        last = m
    }
    if (!last) throw new Error('El asistente no devolvió respuesta')
    return last
}
