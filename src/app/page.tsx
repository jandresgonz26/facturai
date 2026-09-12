'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { History, ReceiptText, Sparkles } from 'lucide-react'
import { useDataChanged } from '@/lib/events'
import { BRAND } from '@/lib/brand'
import { useAgent } from '@/components/agent/AgentProvider'
import { Feed } from '@/components/features/Feed'
import { QuickEntry } from '@/components/features/QuickEntry'
import { HourBagTracker } from '@/components/features/HourBagTracker'
import { MonthlyRevenue } from '@/components/features/MonthlyRevenue'
import { PendingPayments } from '@/components/features/PendingPayments'
import { PendingInvoices } from '@/components/features/PendingInvoices'
import { BriefingCard } from '@/components/features/BriefingCard'
import { KpiStrip } from '@/components/features/KpiStrip'

/** Saludo y fecha se resuelven en el cliente para no descuadrar la hidratación. */
function useGreeting() {
    const [now, setNow] = useState<Date | null>(null)
    useEffect(() => {
        const id = setTimeout(() => setNow(new Date()), 0)
        return () => clearTimeout(id)
    }, [])
    if (!now) return { greeting: 'Hola', date: '' }
    const h = now.getHours()
    const greeting = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches'
    const raw = now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
    return { greeting, date: raw.charAt(0).toUpperCase() + raw.slice(1) }
}

export default function Home() {
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const { setOpen } = useAgent()
    const { greeting, date } = useGreeting()

    const handleActivityChange = () => {
        setRefreshTrigger((prev) => prev + 1)
    }

    useDataChanged(handleActivityChange)

    return (
        <div className="space-y-6">
            {/* Cabecera: saludo a la izquierda, las dos acciones más frecuentes a la derecha. */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl sm:text-[2.125rem] font-semibold tracking-tight text-foreground">
                        {greeting}, {BRAND.owner.split(' ')[0]} 👋
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {date ? `${date} · ` : ''}Así va {BRAND.company} hoy.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-brand-cyan hover:text-brand-blue transition-colors"
                    >
                        <Sparkles className="w-4 h-4 text-brand-blue dark:text-brand-cyan" /> Pedir al asistente
                    </button>
                    <Link
                        href="/month-end"
                        className="inline-flex items-center gap-2 rounded-full bg-brand-green px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(104,184,64,0.9)] hover:brightness-105 transition"
                    >
                        <ReceiptText className="w-4 h-4" /> Facturar pendientes
                    </Link>
                </div>
            </div>

            {/* Las cuatro cifras */}
            <KpiStrip refreshTrigger={refreshTrigger} />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Columna principal */}
                <div className="xl:col-span-2 space-y-6 min-w-0">
                    <BriefingCard />
                    <QuickEntry onEntryAdded={handleActivityChange} />
                    <HourBagTracker refreshTrigger={refreshTrigger} onPackaged={handleActivityChange} />

                    <section aria-labelledby="recent-activity-title" className="rounded-2xl bg-card border border-border/70 card-soft">
                        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
                            <h2 id="recent-activity-title" className="font-display text-base font-semibold flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-brand-blue dark:text-brand-cyan">
                                    <History className="w-4 h-4" />
                                </span>
                                Actividad reciente
                            </h2>
                            <Link href="/invoices" className="text-xs font-semibold text-brand-blue dark:text-brand-cyan hover:underline">
                                Ver todo
                            </Link>
                        </div>
                        <div className="px-5 pb-5">
                            <Feed refreshTrigger={refreshTrigger} onActivityChanged={handleActivityChange} />
                        </div>
                    </section>
                </div>

                {/* Columna lateral */}
                <aside className="space-y-6 min-w-0">
                    <MonthlyRevenue refreshTrigger={refreshTrigger} />
                    <PendingPayments refreshTrigger={refreshTrigger} />
                    <PendingInvoices refreshTrigger={refreshTrigger} />
                </aside>
            </div>
        </div>
    )
}
