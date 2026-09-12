'use client'

import { useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { getMonthlyRevenue, type MonthlyRevenue as Revenue } from '@/lib/actions/dashboard'
import { useDataChanged } from '@/lib/events'

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Meta del mes como anillo: el porcentaje se lee de un vistazo y el trazo
 * usa el degradado de la marca. La cifra facturada ya está en la tira de
 * KPIs, así que aquí el protagonista es el avance, no el monto.
 */
export function MonthlyRevenue({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
    const [data, setData] = useState<Revenue | null>(null)
    const [loading, setLoading] = useState(true)

    const load = async () => {
        try {
            setData(await getMonthlyRevenue())
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [refreshTrigger])

    useDataChanged(load)

    const invoiced = data?.invoiced ?? 0
    const goal = data?.goal ?? 5500
    const pct = Math.min((invoiced / goal) * 100, 100)

    // Anillo: r=44 → circunferencia ≈ 276.5
    const r = 44
    const c = 2 * Math.PI * r
    const dash = (pct / 100) * c

    return (
        <div className="rounded-2xl bg-card border border-border/70 card-soft p-5">
            <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-brand-blue dark:text-brand-cyan">
                        <Target className="w-4 h-4" />
                    </span>
                    Meta del mes
                </h3>
                <span className="text-xs text-muted-foreground">{money(goal)}</span>
            </div>

            <div className="flex items-center gap-5">
                <div className="relative h-28 w-28 shrink-0">
                    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                        <defs>
                            <linearGradient id="brand-ring-grad" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#106898" />
                                <stop offset="55%" stopColor="#48C0C0" />
                                <stop offset="100%" stopColor="#68B840" />
                            </linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-muted" />
                        <circle
                            cx="50"
                            cy="50"
                            r={r}
                            fill="none"
                            stroke="url(#brand-ring-grad)"
                            strokeWidth="9"
                            strokeLinecap="round"
                            strokeDasharray={`${loading ? 0 : dash} ${c}`}
                            className="transition-[stroke-dasharray] duration-700"
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-display text-2xl font-semibold tabular-nums leading-none">{loading ? '…' : `${Math.round(pct)}%`}</span>
                        <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">de la meta</span>
                    </div>
                </div>

                <div className="min-w-0 flex-1 space-y-2.5 text-sm">
                    <div>
                        <p className="text-[11px] text-muted-foreground">Facturado</p>
                        <p className="font-display text-lg font-semibold tabular-nums leading-tight">{loading ? '…' : money(invoiced)}</p>
                        <p className="text-[11px] text-muted-foreground">
                            {loading ? '' : `${data?.count ?? 0} factura${data?.count === 1 ? '' : 's'} emitida${data?.count === 1 ? '' : 's'}`}
                        </p>
                    </div>
                    {!loading && data && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/70 text-xs">
                            <div>
                                <p className="text-muted-foreground">Cobrado</p>
                                <p className="font-semibold tabular-nums text-brand-green">{money(data.paid)}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Por cobrar</p>
                                <p className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{money(data.unpaid)}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
