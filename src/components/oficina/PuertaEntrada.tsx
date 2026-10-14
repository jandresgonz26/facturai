'use client'

/**
 * Puerta de entrada de la Oficina: un solo chat con todo el equipo. José escribe sin elegir agente; responde
 * quien corresponda (el encabezado muestra quién habla) y lo largo se convierte en encargo. Se guarda en el servidor.
 */
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatCuerpo } from '@/components/agent/ChatCuerpo'
import { departamentoActivo } from '@/components/agent/departamentoActivo'
import { DEPARTAMENTOS, isWriteTool } from '@/lib/agent/shared'
import { emitDataChanged } from '@/lib/events'
import { nuevaConversacionEquipoAccion } from '@/app/oficina/clic-acciones'

const SUGERENCIAS = [
    '¿En qué están trabajando y qué esperan de mí?',
    '¿Qué es lo más importante que debería hacer hoy?',
    '¿Cómo va el mes frente a la meta?',
    'Prepárame una propuesta para …',
    'Investiga …',
]

export function PuertaEntrada({ inicial, proyecto }: { inicial: UIMessage[]; proyecto: string | null }) {
    const router = useRouter()
    const [input, setInput] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const transport = useMemo(() => new DefaultChatTransport({ api: '/api/agent', body: { departamento: 'equipo' } }), [])
    const chat = useChat({
        id: `hilo-equipo-${proyecto ?? 'jamtech'}`,
        messages: inicial,
        transport,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        onError: (e) => toast.error(e.message || 'Error del asistente'),
        onFinish: ({ message }) => {
            const cambio = message.parts.some((p) => isToolUIPart(p) && (isWriteTool(getToolName(p)) || getToolName(p).startsWith('encargo')) && p.state === 'output-available')
            if (cambio) { emitDataChanged(); router.refresh() }
        },
    })
    const habla = departamentoActivo(chat.messages)
    const info = habla ? DEPARTAMENTOS[habla] : null

    const nueva = async () => {
        void chat.stop()
        chat.setMessages([])
        await nuevaConversacionEquipoAccion()
    }

    return (
        <section className="flex h-[min(560px,70dvh)] flex-col overflow-hidden rounded-2xl border bg-card" aria-label="Habla con tu equipo">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <div className="min-w-0 text-sm">
                    <span className="font-semibold">Tu equipo</span>
                    <span className="text-muted-foreground"> · {info ? <>responde {info.emoji} <span className="font-medium text-foreground">{info.persona}</span>, {info.nombre}</> : 'escribe y responde quien corresponda'}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void nueva()} disabled={chat.messages.length === 0} title="Empezar de cero (la anterior se borra)">
                    <RotateCcw /> Nueva
                </Button>
            </header>
            <ChatCuerpo
                messages={chat.messages} status={chat.status} error={chat.error} sendMessage={chat.sendMessage} stop={chat.stop}
                addToolApprovalResponse={chat.addToolApprovalResponse} input={input} setInput={setInput} textareaRef={textareaRef}
                sugerencias={SUGERENCIAS}
                vacio={{ icono: '👋', titulo: 'Escríbele a tu equipo', texto: 'No tienes que elegir a nadie: responde quien lleve el tema. Si es algo largo, lo deja como encargo y te avisa por Telegram cuando esté.' }}
                placeholder="¿Qué necesitas?"
            />
        </section>
    )
}
