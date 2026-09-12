'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { ChevronDown, Moon, Sparkles, Sun } from 'lucide-react'
import { useAgent } from '@/components/agent/AgentProvider'
import { BRAND } from '@/lib/brand'
import { AlertsBell } from './AlertsBell'
import { BrandAvatar } from './Sidebar'

function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme()
    // Los dos iconos se renderizan siempre y CSS decide cuál se ve:
    // así no hay desajuste de hidratación ni estado "mounted".
    return (
        <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Cambiar tema claro/oscuro"
            aria-label="Cambiar tema"
        >
            <Sun className="w-5 h-5 hidden dark:block" />
            <Moon className="w-5 h-5 dark:hidden" />
        </button>
    )
}

/**
 * Cabecera clara y translúcida: el peso visual lo lleva el sidebar azul, así
 * que aquí solo van la barra del asistente, las alertas y el perfil.
 */
export function Header() {
    const { setOpen } = useAgent()

    return (
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-card/80 backdrop-blur-md border-b border-border px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
            {/* Barra de comandos del asistente */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex-1 max-w-xl ml-10 lg:ml-0 flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-muted/80 border border-transparent text-muted-foreground hover:border-brand-cyan/70 hover:bg-card hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/50 transition-colors text-sm text-left"
            >
                <Sparkles className="w-4 h-4 text-brand-blue dark:text-brand-cyan shrink-0" />
                <span className="flex-1 truncate">Pregúntale al asistente: «factúrale el mes a…»</span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    ⌘K
                </kbd>
            </button>

            <div className="flex items-center gap-1.5">
                <AlertsBell />
                <ThemeToggle />
                <div className="h-6 w-px bg-border hidden sm:block mx-1" />
                <Link
                    href="/settings"
                    className="flex items-center gap-2.5 rounded-full pl-1 pr-2 py-1 hover:bg-muted transition-colors"
                    title="Ajustes"
                >
                    <BrandAvatar size="sm" />
                    <div className="text-left hidden sm:block leading-tight">
                        <p className="text-sm font-semibold text-foreground">{BRAND.owner}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{BRAND.role}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
                </Link>
            </div>
        </header>
    )
}
