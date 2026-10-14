'use client'

/**
 * Cuerpo de una conversación con el asistente (mensajes, tarjetas de confirmación, voz y campo de texto).
 * Lo comparten el panel lateral y la página de cada agente en la Oficina.
 */
import { useEffect, useMemo, useRef } from 'react'
import { getToolName, isToolUIPart, type ChatStatus, type UIMessage } from 'ai'
import { Bot, LoaderCircle, Send, Square, TriangleAlert } from 'lucide-react'
import { MessageText } from './MessageText'
import { ToolCard, type AnyToolPart } from './ToolCard'
import { VoiceButton } from './VoiceButton'

/** ¿El último mensaje del asistente espera una confirmación? Mientras tanto no se puede mandar nada nuevo. */
export function tieneConfirmacionPendiente(messages: UIMessage[]): boolean {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return false
    return last.parts.some((p) => isToolUIPart(p) && p.state === 'approval-requested')
}

export function MessageBubble({
    message,
    onApprove,
    onDeny,
    busy,
}: {
    message: UIMessage
    onApprove: (id: string) => void
    onDeny: (id: string) => void
    busy: boolean
}) {
    if (message.role === 'user') {
        const text = message.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('\n')
        return (
            <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-teal-600 text-white px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm">
                    {text}
                </div>
            </div>
        )
    }

    return (
        <div className="flex gap-2.5">
            <div className="h-7 w-7 shrink-0 rounded-full bg-gray-900 dark:bg-gray-700 text-teal-400 flex items-center justify-center mt-0.5">
                <Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
                {message.parts.map((part, i) => {
                    if (part.type === 'text') {
                        return part.text.trim() ? <MessageText key={i} text={part.text} /> : null
                    }
                    if (isToolUIPart(part)) {
                        return (
                            <ToolCard
                                key={part.toolCallId}
                                toolName={getToolName(part)}
                                part={part as unknown as AnyToolPart}
                                onApprove={onApprove}
                                onDeny={onDeny}
                                busy={busy}
                                context={message.parts.filter(isToolUIPart) as unknown as AnyToolPart[]}
                            />
                        )
                    }
                    return null
                })}
            </div>
        </div>
    )
}


export type ChatCuerpoProps = {
    messages: UIMessage[]
    status: ChatStatus
    error: Error | undefined
    sendMessage: (m: { text: string }) => unknown
    stop: () => unknown
    addToolApprovalResponse: (r: { id: string; approved: boolean; reason?: string }) => unknown
    input: string
    setInput: React.Dispatch<React.SetStateAction<string>>
    textareaRef: React.RefObject<HTMLTextAreaElement | null>
    sugerencias: string[]
    vacio: { titulo: string; texto: string; icono?: React.ReactNode }
    placeholder?: string
    pie?: string
}

export function ChatCuerpo({ messages, status, error, sendMessage, stop, addToolApprovalResponse, input, setInput, textareaRef, sugerencias, vacio, placeholder, pie }: ChatCuerpoProps) {
    const endRef = useRef<HTMLDivElement>(null)
    const busy = status === 'submitted' || status === 'streaming'
    const hasPendingApproval = useMemo(() => tieneConfirmacionPendiente(messages), [messages])
    const SUGGESTIONS = sugerencias

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages, status])

    // Crece con cualquier cambio del texto (tipeo, voz, sugerencias), no solo con el teclado.
    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }, [input, textareaRef])

    const send = (text: string) => {
        const t = text.trim()
        if (!t || busy || hasPendingApproval) return
        void sendMessage({ text: t })
        setInput('')
    }
    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send(input)
        }
    }
    const onTranscript = (text: string) => {
        setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
        setTimeout(() => textareaRef.current?.focus(), 50)
    }
    const approve = (id: string) => void addToolApprovalResponse({ id, approved: true })
    const deny = (id: string) => void addToolApprovalResponse({ id, approved: false, reason: 'Cancelado por el usuario' })

    return (
        <>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
                <div className="h-full flex flex-col justify-center gap-4 text-center px-2">
                    <div className="mx-auto h-12 w-12 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
                        <Bot className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="font-semibold">{vacio.titulo}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Dime a quién facturar, qué registrar o qué consultar. Toda escritura te pedirá confirmación.
                        </p>
                    </div>
                    <div className="grid gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => {
                                    setInput(s.endsWith('…') ? s.slice(0, -1) : s)
                                    textareaRef.current?.focus()
                                }}
                                className="text-left text-sm px-3 py-2 rounded-lg border bg-card hover:border-teal-500/60 hover:bg-teal-500/5 transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onApprove={approve} onDeny={deny} busy={busy} />
            ))}

            {status === 'submitted' && (
                <div className="flex gap-2.5 items-center text-xs text-muted-foreground">
                    <div className="h-7 w-7 shrink-0 rounded-full bg-gray-900 dark:bg-gray-700 text-teal-400 flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                    </div>
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Pensando…
                </div>
            )}

            {error && status === 'error' && (
                <p className="text-xs text-destructive text-center">{error.message}</p>
            )}
            <div ref={endRef} />
        </div>

        <div className="border-t px-3 py-3 bg-background">
            {hasPendingApproval && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center mb-2 flex items-center justify-center gap-1.5">
                    <TriangleAlert className="w-3.5 h-3.5" /> Confirma o cancela la acción de arriba para poder seguir
                </p>
            )}
            <div className="flex items-end gap-2 rounded-2xl border bg-card px-2 py-1.5 focus-within:border-teal-500/60 transition-colors">
                <VoiceButton onTranscript={onTranscript} disabled={busy || hasPendingApproval} />
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    disabled={hasPendingApproval}
                    placeholder={hasPendingApproval ? 'Responde la confirmación de arriba primero…' : placeholder ?? 'Escribe o habla: «factúrale el mes a…»'}
                    className="flex-1 resize-none bg-transparent outline-none text-sm py-2 max-h-40 min-h-[36px] overflow-y-auto placeholder:text-muted-foreground disabled:cursor-not-allowed"
                />
                {busy ? (
                    <button
                        type="button"
                        onClick={() => void stop()}
                        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-muted text-foreground hover:bg-muted/70"
                        title="Detener"
                    >
                        <Square className="w-4 h-4 fill-current" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => send(input)}
                        disabled={!input.trim() || hasPendingApproval}
                        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors"
                        title="Enviar (Enter)"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">{pie ?? 'Enter envía · Shift+Enter salto de línea'}</p>
        </div>
        </>
    )
}
