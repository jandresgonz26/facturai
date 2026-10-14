import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText, type UIMessage } from 'ai'
import { agentTools, toolApproval } from './tools'
import { marketingTools } from './tools-marketing'
import { seoTools } from './tools-seo'
import { direccionTools } from './tools-direccion'
import { memoriaTools } from './tools-memoria'
import { objetivosTools } from './tools-objetivos'
import { buildSystemPrompt } from './system-prompt'
import { modeloPara } from './modelo'
import { registrarEvento, type FuenteEvento } from './eventos'
import { DEPARTAMENTOS, TOOL_LABELS, departamentoDe, isWriteTool, type Departamento } from './shared'

/** Todas las herramientas de la oficina: las de siempre más las de Marketing. */
export const oficinaTools = { ...agentTools, ...marketingTools, ...seoTools, ...direccionTools, ...memoriaTools, ...objetivosTools }

/** Configuración única del agente, compartida por el chat web y el bot de Telegram. */
/** `departamento`: el chat de la página de ese agente (habla como su persona y empieza por su área). */
export async function createAgentStream(messages: UIMessage[], fuente: FuenteEvento = 'chat', opts: { departamento?: Departamento } = {}) {
    const { model, providerOptions } = modeloPara('chat')
    await registrarDecisiones(messages, fuente)
    const base = await buildSystemPrompt()
    const d = opts.departamento ? DEPARTAMENTOS[opts.departamento] : null
    const system = d
        ? `${base}\n\nESTÁS EN LA PÁGINA DE ${d.persona.toUpperCase()} (${d.emoji} ${d.nombre}: ${d.descripcion}). Responde siempre como ${d.persona}, en primera persona, y empieza por las herramientas de tu área y por tus objetivos (objetivos_listar con departamento ${opts.departamento}). Si José pide algo de otra área, hazlo igual y menciona qué compañero lo lleva. Cuando proponga una meta, conviértela en objetivo (objetivo_crear) y sus pasos en hitos (hito_crear), siempre con su confirmación.`
        : base
    const excluir = (process.env.AGENT_TOOLS_EXCLUDE || '').split(',').filter(Boolean)
    const tools = excluir.length
        ? (Object.fromEntries(Object.entries(oficinaTools).filter(([k]) => !excluir.includes(k))) as typeof oficinaTools)
        : oficinaTools
    return streamText({
        model,
        system,
        messages: await convertToModelMessages(messages),
        tools,
        toolApproval,
        providerOptions,
        stopWhen: stepCountIs(8),
        experimental_toolApprovalSecret: process.env.AGENT_APPROVAL_SECRET || undefined,
        onError: ({ error }) => console.error('[agent]', error),
        includeRawChunks: process.env.AGENT_DEBUG_RAW === '1',
        onChunk: process.env.AGENT_DEBUG_RAW === '1' ? ({ chunk }) => { if (chunk.type === 'raw') console.log('[agent raw]', JSON.stringify(chunk.rawValue).slice(0, 600)) } : undefined,
        // Cada herramienta usada queda como evento de su departamento (alimenta la oficina).
        onStepFinish: async ({ toolCalls, toolResults }) => {
            for (const call of toolCalls) {
                const name = call.toolName
                const result = toolResults.find((r) => r.toolCallId === call.toolCallId)
                const out = result?.output as { ok?: boolean } | undefined
                const estado = !result
                    ? isWriteTool(name) ? 'espera_aprobacion' : 'en_curso'
                    : out && out.ok === false ? 'error' : 'hecho'
                await registrarEvento({
                    departamento: departamentoDe(name),
                    tipo: 'herramienta',
                    titulo: TOOL_LABELS[name] ?? name,
                    estado,
                    fuente,
                    detalle: { tool: name, input: call.input },
                })
            }
        },
        onFinish: ({ finishReason, usage, warnings }) => {
            if (finishReason !== 'stop' && finishReason !== 'tool-calls') {
                console.warn('[agent] finishReason', finishReason, JSON.stringify({ usage, warnings }))
            }
        },
    })
}

/**
 * Ejecuta un turno completo sin streaming hacia un cliente y devuelve el
 * mensaje del asistente resultante (con sus partes de texto y herramientas),
 * exactamente como lo vería el chat web. Si `continueFrom` es el último
 * mensaje del asistente (caso de aprobación), la respuesta se fusiona en él.
 */
export async function runAgentTurn(messages: UIMessage[], continueFrom?: UIMessage): Promise<UIMessage> {
    const result = await createAgentStream(messages, 'telegram')
    let last: UIMessage | undefined = continueFrom
    for await (const m of readUIMessageStream({ stream: result.toUIMessageStream(), message: continueFrom })) {
        last = m
    }
    if (!last) throw new Error('El asistente no devolvió respuesta')
    return last
}

/**
 * Cuando el usuario responde una tarjeta de confirmación, el turno siguiente llega con
 * la decisión dentro del último mensaje del asistente. Se registra para que la oficina
 * deje de mostrar al departamento "esperando" y quede constancia de qué se aprobó.
 */
async function registrarDecisiones(messages: UIMessage[], fuente: FuenteEvento): Promise<void> {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return
    for (const part of last.parts as { type: string; state?: string; approval?: { approved?: boolean } }[]) {
        if (!part.type.startsWith('tool-') || part.state !== 'approval-responded' || part.approval?.approved === undefined) continue
        const name = part.type.slice('tool-'.length)
        await registrarEvento({
            departamento: departamentoDe(name),
            tipo: 'herramienta',
            titulo: `${part.approval.approved ? 'Confirmado' : 'Cancelado'}: ${TOOL_LABELS[name] ?? name}`,
            estado: part.approval.approved ? 'en_curso' : 'cancelado',
            fuente,
            detalle: { tool: name },
        })
    }
}
