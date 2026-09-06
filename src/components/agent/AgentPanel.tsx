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
import { Bot, LoaderCircle, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useAgent } from './AgentProvider'
import { MessageText } from './MessageText'
import { ToolCard, type AnyToolPart } from './ToolCard'
import { VoiceButton } from './VoiceButton'
import { isWriteTool } from '@/lib/agent/shared'
import { emitDataChanged } from '@/lib/events'

const SUGGESTIONS = [
    'Factúrale el mes a …',
    '¿Quién me debe dinero?',
    'Registra 2 horas de soporte a …',
    '¿Cuánto facturé este mes?',
]

function MessageBubble({
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

export function AgentPanel() {
    const { open, setOpen } = useAgent()
    const [input, setInput] = useState('')
    const endRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const transport = useMemo(() => new DefaultChatTransport({ api: '/api/agent' }), [])

    const { messages, sendMessage, status, addToolApprovalResponse, setMessages, stop, error } = useChat({
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

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages, status])

    useEffect(() => {
        if (open) setTimeout(() => textareaRef.current?.focus(), 150)
    }, [open])

    const send = (text: string) => {
        const t = text.trim()
        if (!t || busy) return
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
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right" showCloseButton={false} className="w-full sm:max-w-lg p-0 gap-0 flex flex-col">
                <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-gray-900 dark:bg-gray-700 text-teal-400 flex items-center justify-center">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                            <SheetTitle className="text-base leading-tight">Asistente</SheetTitle>
                            <SheetDescription className="text-xs leading-tight">Facturación por chat o por voz</SheetDescription>
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

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col justify-center gap-4 text-center px-2">
                            <div className="mx-auto h-12 w-12 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
                                <Bot className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="font-semibold">¿Qué hacemos hoy?</p>
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
                    <div className="flex items-end gap-2 rounded-2xl border bg-card px-2 py-1.5 focus-within:border-teal-500/60 transition-colors">
                        <VoiceButton onTranscript={onTranscript} disabled={busy} />
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            rows={1}
                            placeholder="Escribe o habla: «factúrale el mes a…»"
                            className="flex-1 resize-none bg-transparent outline-none text-sm py-2 max-h-40 min-h-[36px] placeholder:text-muted-foreground"
                            style={{ height: 'auto' }}
                            onInput={(e) => {
                                const el = e.currentTarget
                                el.style.height = 'auto'
                                el.style.height = `${Math.min(el.scrollHeight, 160)}px`
                            }}
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
                                disabled={!input.trim()}
                                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors"
                                title="Enviar (Enter)"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center mt-1.5">Enter envía · Shift+Enter salto de línea · ⌘K abre/cierra</p>
                </div>
            </SheetContent>
        </Sheet>
    )
}
