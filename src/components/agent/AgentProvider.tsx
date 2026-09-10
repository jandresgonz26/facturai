'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

interface AgentContextValue {
    open: boolean
    setOpen: (open: boolean) => void
    toggle: () => void
    /** Abre el asistente y le manda ese mensaje, para arrancar desde una pantalla concreta. */
    openWith: (prompt: string) => void
    /** El panel lo consume una sola vez al abrirse; devuelve null si no hay nada pendiente. */
    consumePrompt: () => string | null
}

const AgentContext = createContext<AgentContextValue | null>(null)

/** Estado global del panel del asistente + atajo ⌘K / Ctrl+K. */
export function AgentProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false)
    const pending = useRef<string | null>(null)
    const toggle = useCallback(() => setOpen((v) => !v), [])

    const openWith = useCallback((prompt: string) => {
        pending.current = prompt
        setOpen(true)
    }, [])

    const consumePrompt = useCallback(() => {
        const p = pending.current
        pending.current = null
        return p
    }, [])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                toggle()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [toggle])

    const value = useMemo(() => ({ open, setOpen, toggle, openWith, consumePrompt }), [open, toggle, openWith, consumePrompt])
    return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgent(): AgentContextValue {
    const ctx = useContext(AgentContext)
    if (!ctx) throw new Error('useAgent debe usarse dentro de AgentProvider')
    return ctx
}
