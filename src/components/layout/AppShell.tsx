'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { AgentPanel } from '@/components/agent/AgentPanel'
import { AgentLauncher } from '@/components/agent/AgentLauncher'

/**
 * Armazón de la app (sidebar, cabecera, asistente). El login se renderiza
 * desnudo: sin sesión no hay nada que navegar ni a quién preguntarle.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    if (pathname === '/login') return <>{children}</>

    return (
        <>
            <div className="flex min-h-screen overflow-hidden">
                <Sidebar />
                <div className="flex-1 min-w-0 flex flex-col lg:ml-64 h-screen overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-8">
                        <div className="max-w-[1600px] mx-auto">{children}</div>
                    </main>
                </div>
            </div>
            <AgentPanel />
            <AgentLauncher />
        </>
    )
}
