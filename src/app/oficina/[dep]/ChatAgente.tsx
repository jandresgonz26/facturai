'use client'

/** Chat de la página de un agente: habla como su persona y la conversación queda guardada en el servidor. */
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatCuerpo } from '@/components/agent/ChatCuerpo'
import { DEPARTAMENTOS, isWriteTool, type Departamento } from '@/lib/agent/shared'
import { emitDataChanged } from '@/lib/events'
import { borrarHiloAccion } from './acciones'

/** `semilla`: mensaje que llega ya escrito (desde un paso de un plan o la ruta de inicio), para revisarlo y enviarlo. */
export function ChatAgente({ dep, inicial, preguntas, semilla }: { dep: Departamento; inicial: UIMessage[]; preguntas: string[]; semilla?: string }) {
    const info = DEPARTAMENTOS[dep]
    const router = useRouter()
    const [input, setInput] = useState(semilla ?? '')
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const transport = useMemo(() => new DefaultChatTransport({ api: '/api/agent', body: { departamento: dep } }), [dep])
    const chat = useChat({
        id: `hilo-${dep}`,
        messages: inicial,
        transport,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        onError: (e) => toast.error(e.message || 'Error del asistente'),
        onFinish: ({ message }) => {
            const wrote = message.parts.some((p) => isToolUIPart(p) && isWriteTool(getToolName(p)) && p.state === 'output-available')
            if (wrote) { emitDataChanged(); router.refresh() } // objetivos, hitos y memoria nuevos aparecen al lado
        },
    })

    const nueva = async () => {
        void chat.stop()
        chat.setMessages([])
        await borrarHiloAccion(dep)
    }

    return (
        <section className="flex h-[calc(100dvh-13rem)] min-h-[480px] flex-col overflow-hidden rounded-2xl border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <div className="text-sm font-semibold">Conversación con {info.persona}</div>
                <Button variant="ghost" size="sm" onClick={() => void nueva()} disabled={chat.messages.length === 0} title="Empezar de cero (la anterior se borra)">
                    <RotateCcw /> Nueva
                </Button>
            </header>
            <ChatCuerpo
                messages={chat.messages} status={chat.status} error={chat.error} sendMessage={chat.sendMessage} stop={chat.stop}
                addToolApprovalResponse={chat.addToolApprovalResponse} input={input} setInput={setInput} textareaRef={textareaRef}
                sugerencias={preguntas}
                vacio={{ icono: info.emoji, titulo: `Hola, soy ${info.persona}`, texto: `${info.descripcion}. Pregúntame lo que quieras o pídeme que armemos tus objetivos. Toda escritura te pedirá confirmación.` }}
                placeholder={`Escríbele a ${info.persona}…`}
            />
        </section>
    )
}
