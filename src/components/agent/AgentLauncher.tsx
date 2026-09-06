'use client'

import { Sparkles } from 'lucide-react'
import { useAgent } from './AgentProvider'

/** Botón flotante para abrir el asistente en pantallas pequeñas. */
export function AgentLauncher() {
    const { open, setOpen } = useAgent()
    if (open) return null
    return (
        <button
            type="button"
            onClick={() => setOpen(true)}
            className="lg:hidden fixed bottom-5 right-5 z-30 h-13 w-13 p-3.5 rounded-full bg-teal-600 text-white shadow-lg shadow-teal-900/30 hover:bg-teal-700 transition-colors"
            title="Abrir asistente"
            aria-label="Abrir asistente"
        >
            <Sparkles className="w-6 h-6" />
        </button>
    )
}
