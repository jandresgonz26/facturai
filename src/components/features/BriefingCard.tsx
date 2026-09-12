'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, Sparkles } from 'lucide-react'
import { getBriefing, type Briefing } from '@/lib/actions/briefing'
import { useDataChanged } from '@/lib/events'
import { useAgent } from '@/components/agent/AgentProvider'

const severityDot: Record<string, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-sky-500',
}

/** "Qué toca hoy": alertas accionables al abrir el dashboard. */
export function BriefingCard() {
    const [briefing, setBriefing] = useState<Briefing | null>(null)
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const { setOpen } = useAgent()

    const load = async () => {
        try {
            setBriefing(await getBriefing())
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])
    useDataChanged(load)

    if (loading) {
        return <div className="h-16 rounded-2xl border border-dashed border-border animate-pulse" />
    }
    if (!briefing) return null

    const alerts = briefing.alerts
    const important = alerts.filter((a) => a.severity !== 'low')
    const visible = expanded ? alerts : alerts.slice(0, 4)

    return (
        <section className="rounded-2xl bg-card border border-border/70 card-soft overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-border/70">
                <div className="flex items-center gap-3 min-w-0">
                    <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            alerts.length === 0
                                ? 'bg-brand-green/15 text-brand-green'
                                : important.length
                                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300'
                                  : 'bg-accent text-brand-blue dark:text-brand-cyan'
                        }`}
                    >
                        {alerts.length === 0 ? <CircleCheck className="w-4 h-4" /> : <CircleAlert className="w-4 h-4" />}
                    </span>
                    <h2 className="font-display text-base font-semibold truncate">
                        {alerts.length === 0 ? 'Todo al día' : `${alerts.length} cosa${alerts.length === 1 ? '' : 's'} pendiente${alerts.length === 1 ? '' : 's'}`}
                    </h2>
                    {briefing.unpaid_total > 0 && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                            · por cobrar ${briefing.unpaid_total.toFixed(2)}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="shrink-0 text-xs font-semibold text-brand-blue dark:text-brand-cyan hover:underline flex items-center gap-1"
                >
                    <Sparkles className="w-3.5 h-3.5" /> Pedir al asistente
                </button>
            </div>
            {alerts.length > 0 && (
                <ul className="divide-y divide-border/70">
                    {visible.map((a, i) => (
                        <li key={i}>
                            <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/50 transition-colors">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${severityDot[a.severity]}`} />
                                <span className="text-sm font-medium truncate">{a.title}</span>
                                <span className="text-xs text-muted-foreground ml-auto shrink-0 truncate max-w-[50%]">{a.detail}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            {alerts.length > 4 && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="w-full px-5 py-2 text-xs text-muted-foreground hover:bg-muted/50 flex items-center justify-center gap-1 border-t border-border/70"
                >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {expanded ? 'Ver menos' : `Ver ${alerts.length - 4} más`}
                </button>
            )}
        </section>
    )
}
