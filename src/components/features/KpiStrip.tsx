'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CircleDollarSign, Hourglass, Receipt, Wallet, type LucideIcon } from 'lucide-react'
import { getDashboardKpis, type DashboardKpis } from '@/lib/actions/dashboard'
import { useDataChanged } from '@/lib/events'

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

/**
 * Las cuatro cifras que resumen el negocio, como tarjetas a color: el color
 * es el de la marca (azul, verde, cian, marino), no un semáforo. La primera
 * lleva la barra hacia la meta; las demás, una línea de contexto y el enlace
 * a la pantalla donde se actúa sobre esa cifra.
 */
export function KpiStrip({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
    const [data, setData] = useState<DashboardKpis | null>(null)

    useEffect(() => {
        let active = true
        getDashboardKpis()
            .then((d) => {
                if (active) setData(d)
            })
            .catch((e) => console.error(e))
        return () => {
            active = false
        }
    }, [refreshTrigger])
    useDataChanged(() => {
        getDashboardKpis().then(setData).catch((e) => console.error(e))
    })

    if (!data) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
                ))}
            </div>
        )
    }

    const { month, unbilled, receivable } = data
    const goalPct = Math.min(100, Math.round((month.invoiced / month.goal) * 100))
    const paidPct = month.invoiced > 0 ? Math.round((month.paid / month.invoiced) * 100) : 0

    const cards: { label: string; value: number; sub: string; href: string; icon: LucideIcon; tone: string; progress?: number }[] = [
        {
            label: 'Facturado este mes',
            value: month.invoiced,
            sub: `${plural(month.count, 'factura', 'facturas')} · meta ${money(month.goal)}`,
            href: '/invoices',
            icon: Receipt,
            tone: 'bg-[linear-gradient(135deg,#0F5F8C_0%,#1B86B9_100%)]',
            progress: goalPct,
        },
        {
            label: 'Cobrado este mes',
            value: month.paid,
            sub: month.invoiced > 0 ? `${paidPct}% de lo facturado` : 'Nada facturado aún',
            href: '/invoices',
            icon: Wallet,
            tone: 'bg-[linear-gradient(135deg,#55A52E_0%,#6DBE44_100%)]',
        },
        {
            label: 'Por cobrar',
            value: receivable.total,
            sub: receivable.clients > 0 ? `${plural(receivable.clients, 'cliente', 'clientes')} con factura abierta` : 'Todo cobrado',
            href: '/invoices',
            icon: CircleDollarSign,
            tone: 'bg-[linear-gradient(135deg,#1F92A8_0%,#48C0C0_100%)]',
        },
        {
            label: 'Pendiente por facturar',
            value: unbilled.total,
            sub: unbilled.clients > 0 ? `${plural(unbilled.clients, 'cliente', 'clientes')} con trabajo sin facturar` : 'Sin actividad pendiente',
            href: '/month-end',
            icon: Hourglass,
            tone: 'bg-[linear-gradient(135deg,#0B3552_0%,#155382_100%)]',
        },
    ]

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map((c) => (
                <Link
                    key={c.label}
                    href={c.href}
                    className={`group relative overflow-hidden rounded-2xl p-5 text-white shadow-[0_14px_30px_-16px_rgba(11,53,82,0.55)] transition-transform hover:-translate-y-0.5 ${c.tone}`}
                >
                    {/* Brillo suave en la esquina, como una luz sobre la tarjeta. */}
                    <span className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" aria-hidden />

                    <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-white/85">{c.label}</p>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                            <c.icon className="h-5 w-5" />
                        </span>
                    </div>

                    <p className="mt-2 font-display text-3xl font-semibold tracking-tight tabular-nums">{money(c.value)}</p>

                    {c.progress != null && (
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                            <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${c.progress}%` }} />
                        </div>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="truncate text-xs text-white/75">{c.sub}</p>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors group-hover:bg-white group-hover:text-brand-navy">
                            <ArrowUpRight className="h-4 w-4" />
                        </span>
                    </div>
                </Link>
            ))}
        </div>
    )
}
