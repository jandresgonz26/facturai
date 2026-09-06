'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Moon, Settings, Sparkles, Sun } from 'lucide-react'
import { useAgent } from '@/components/agent/AgentProvider'

function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme()
    // Los dos iconos se renderizan siempre y CSS decide cuál se ve:
    // así no hay desajuste de hidratación ni estado "mounted".
    return (
        <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            title="Cambiar tema claro/oscuro"
            aria-label="Cambiar tema"
        >
            <Sun className="w-5 h-5 hidden dark:block" />
            <Moon className="w-5 h-5 dark:hidden" />
        </button>
    )
}

export function Header() {
    const { setOpen } = useAgent()

    return (
        <header className="sticky top-0 z-20 bg-gray-800 shadow-md px-4 sm:px-8 py-3 flex items-center justify-between gap-4 border-b border-gray-700">
            {/* Barra de comandos del asistente */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex-1 max-w-xl ml-10 lg:ml-0 flex items-center gap-3 pl-3 pr-2 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-400 hover:border-teal-500/60 hover:text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-colors text-sm text-left"
            >
                <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
                <span className="flex-1 truncate">Pregúntale al asistente: «factúrale el mes a…»</span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
                    ⌘K
                </kbd>
            </button>

            <div className="flex items-center gap-2">
                <ThemeToggle />
                <div className="h-8 w-px bg-gray-700 hidden sm:block" />
                <Link
                    href="/settings"
                    className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-gray-700 transition-colors group"
                    title="Ajustes"
                >
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Admin</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Gerencia</p>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-teal-500 to-sky-500 p-[2px] shrink-0">
                        <div className="h-full w-full rounded-full bg-gray-700 flex items-center justify-center">
                            <Settings className="w-4 h-4 text-white" />
                        </div>
                    </div>
                </Link>
            </div>
        </header>
    )
}
