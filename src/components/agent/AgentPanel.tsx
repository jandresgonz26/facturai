'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import {
    DefaultChatTransport,
    getToolName,
    isToolUIPart,
    lastAssistantMessageIsCompleteWithApprovalResponses,
    type UIMessage,
} from 'ai'
import { toast } from 'sonner'
import { RotateCcw, Sparkles, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useAgent } from './AgentProvider'
import { ChatCuerpo, tieneConfirmacionPendiente } from './ChatCuerpo'
import { DEPARTAMENTOS, isWriteTool } from '@/lib/agent/shared'
import { departamentoActivo } from './departamentoActivo'
import { emitDataChanged } from '@/lib/events'

/** La conversación web se guarda en este navegador para que sobreviva a recargas (la memoria permanente vive en el servidor). */
const CLAVE_CHAT = 'facturai-chat-v1'
const MAX_GUARDADOS = 40

function leerChat(): UIMessage[] {
    try {
        const raw = window.localStorage.getItem(CLAVE_CHAT)
        const v = raw ? (JSON.parse(raw) as unknown) : []
        return Array.isArray(v) ? (v as UIMessage[]) : []
    } catch {
        return []
    }
}

const SUGGESTIONS = [
    'Factúrale el mes a …',
    '¿Quién me debe dinero?',
    'Registra 2 horas de soporte a …',
    '¿Cuánto facturé este mes?',
]

export function AgentPanel() {
    const { open, setOpen, consumePrompt } = useAgent()
    const [input, setInput] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const transport = useMemo(() => new DefaultChatTransport({ api: '/api/agent' }), [])

    const [inicial] = useState<UIMessage[]>(() => (typeof window === 'undefined' ? [] : leerChat()))
    const { messages, sendMessage, status, addToolApprovalResponse, setMessages, stop, error } = useChat({
        id: 'oficina-web',
        messages: inicial,
        transport,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        onError: (e) => toast.error(e.message || 'Error del asistente'),
        onFinish: ({ message }) => {
            const wrote = message.parts.some(
                (p) => isToolUIPart(p) && isWriteTool(getToolName(p)) && p.state === 'output-available'
            )
            if (wrote) emitDataChanged()
        },
    })

    const busy = status === 'submitted' || status === 'streaming'
    const dep = useMemo(() => departamentoActivo(messages), [messages])
    const info = dep ? DEPARTAMENTOS[dep] : null

    // Solo se guarda con la respuesta terminada (nunca a medio transmitir).
    useEffect(() => {
        if (busy) return
        try {
            window.localStorage.setItem(CLAVE_CHAT, JSON.stringify(messages.slice(-MAX_GUARDADOS)))
        } catch {
            /* sin espacio o almacenamiento bloqueado: la conversación sigue, solo no sobrevive a recargar */
        }
    }, [messages, busy])

    const hasPendingApproval = useMemo(() => tieneConfirmacionPendiente(messages), [messages])

    useEffect(() => {
        if (!open) return
        // Si otra pantalla lo abrió con una pregunta ya cargada (ej. el plan del
        // día desde Tareas), se manda sola; si no, solo se enfoca el campo.
        const seeded = consumePrompt()
        if (seeded?.send && !busy && !hasPendingApproval) {
            void sendMessage({ text: seeded.text })
            return
        }
        // Un borrador (ej. "Ventas: cotízale a ") se deja escrito con el cursor al final.
        if (seeded && !seeded.send) setInput(seeded.text)
        setTimeout(() => {
            const el = textareaRef.current
            if (!el) return
            el.focus()
            el.setSelectionRange(el.value.length, el.value.length)
        }, 150)
        // Solo debe dispararse al abrir, no en cada cambio de estado del chat.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right" showCloseButton={false} className="w-full sm:max-w-lg p-0 gap-0 flex flex-col">
                <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2.5">
                        <div
                            className="h-8 w-8 rounded-lg bg-gray-900 dark:bg-gray-700 text-teal-400 flex items-center justify-center text-base"
                            style={info ? { background: `${info.color}22`, boxShadow: `inset 0 0 0 1px ${info.color}66` } : undefined}
                            aria-hidden
                        >
                            {info ? info.emoji : <Sparkles className="w-4 h-4" />}
                        </div>
                        <div>
                            <SheetTitle className="text-base leading-tight" data-testid="agente-activo">{info ? `${info.persona} · ${info.nombre}` : 'Asistente'}</SheetTitle>
                            <SheetDescription className="text-xs leading-tight">{info ? `${info.descripcion} · Oficina JAM` : 'Tu equipo de IA por departamentos, por chat o por voz'}</SheetDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Nueva conversación"
                            onClick={() => {
                                void stop()
                                setMessages([])
                            }}
                            disabled={messages.length === 0}
                        >
                            <RotateCcw />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Cerrar" onClick={() => setOpen(false)}>
                            <X />
                        </Button>
                    </div>
                </SheetHeader>

                <ChatCuerpo
                    messages={messages} status={status} error={error} sendMessage={sendMessage} stop={stop}
                    addToolApprovalResponse={addToolApprovalResponse} input={input} setInput={setInput} textareaRef={textareaRef}
                    sugerencias={SUGGESTIONS}
                    vacio={{ titulo: '¿Qué hacemos hoy?', texto: 'Dime a quién facturar, qué registrar o qué consultar. Toda escritura te pedirá confirmación.' }}
                    pie="Enter envía · Shift+Enter salto de línea · ⌘K abre/cierra"
                />
            </SheetContent>
        </Sheet>
    )
}
