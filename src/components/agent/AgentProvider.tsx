'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

interface AgentContextValue {
    open: boolean
    setOpen: (open: boolean) => void
    toggle: () => void
}

const AgentContext = createContext<AgentContextValue | null>(null)

/** Estado global del panel del asistente + atajo ⌘K / Ctrl+K. */
export function AgentProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false)
    const toggle = useCallback(() => setOpen((v) => !v), [])

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

    const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle])
    return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgent(): AgentContextValue {
    const ctx = useContext(AgentContext)
    if (!ctx) throw new Error('useAgent debe usarse dentro de AgentProvider')
    return ctx
}
