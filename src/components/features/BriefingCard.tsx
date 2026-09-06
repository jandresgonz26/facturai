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
        return <div className="h-16 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 animate-pulse" />
    }
    if (!briefing) return null

    const alerts = briefing.alerts
    const important = alerts.filter((a) => a.severity !== 'low')
    const visible = expanded ? alerts : alerts.slice(0, 4)

    return (
        <section className="bg-card rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    {alerts.length === 0 ? (
                        <CircleCheck className="w-5 h-5 text-emerald-500" />
                    ) : (
                        <CircleAlert className={`w-5 h-5 ${important.length ? 'text-amber-500' : 'text-sky-500'}`} />
                    )}
                    <h2 className="font-semibold text-gray-800 dark:text-white">
                        {alerts.length === 0 ? 'Todo al día' : `${alerts.length} cosa${alerts.length === 1 ? '' : 's'} pendiente${alerts.length === 1 ? '' : 's'}`}
                    </h2>
                    {briefing.unpaid_total > 0 && (
                        <span className="text-xs text-muted-foreground">
                            · por cobrar ${briefing.unpaid_total.toFixed(2)}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 flex items-center gap-1"
                >
                    <Sparkles className="w-3.5 h-3.5" /> Pedir al asistente
                </button>
            </div>
            {alerts.length > 0 && (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {visible.map((a, i) => (
                        <li key={i}>
                            <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/40 transition-colors">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${severityDot[a.severity]}`} />
                                <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{a.title}</span>
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
                    className="w-full px-5 py-2 text-xs text-muted-foreground hover:bg-muted/40 flex items-center justify-center gap-1 border-t border-gray-100 dark:border-gray-700"
                >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {expanded ? 'Ver menos' : `Ver ${alerts.length - 4} más`}
                </button>
            )}
        </section>
    )
}
