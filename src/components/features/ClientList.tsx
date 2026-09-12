'use client'

import type { LucideIcon } from 'lucide-react'

/** Iniciales de un cliente: "Atlantic Repostería" → "AR". */
export function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Tintes de marca para los avatares, rotando por posición (sin semántica). */
const TINTS = [
    'bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/25 dark:text-sky-200',
    'bg-brand-cyan/15 text-[#1F8A8A] dark:bg-brand-cyan/20 dark:text-brand-cyan',
    'bg-brand-green/15 text-[#3F7F20] dark:bg-brand-green/20 dark:text-brand-green',
    'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white',
]

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Tarjeta con lista de clientes y monto: la usan "Pendiente por facturar" y
 * "Por cobrar". Un avatar con iniciales por fila hace que la lista se
 * escanee por cliente, no solo por cifra.
 */
export function ClientAmountCard({
    title,
    icon: Icon,
    items,
    loading,
    emptyText,
    count,
    countTone,
    actionLabel,
    onAction,
    limit = 5,
}: {
    title: string
    icon: LucideIcon
    items: { clientName: string; total: number }[]
    loading: boolean
    emptyText: string
    count?: number
    countTone?: string
    actionLabel: string
    onAction: () => void
    limit?: number
}) {
    return (
        <div className="rounded-2xl bg-card border border-border/70 card-soft p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-brand-blue dark:text-brand-cyan">
                        <Icon className="w-4 h-4" />
                    </span>
                    {title}
                </h3>
                {count != null && count > 0 && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${countTone ?? 'bg-accent text-accent-foreground'}`}>{count}</span>
                )}
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-10 rounded-xl bg-muted animate-pulse" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{emptyText}</p>
            ) : (
                <>
                    <ul className="space-y-1">
                        {items.slice(0, limit).map((item, i) => (
                            <li key={item.clientName} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60 transition-colors">
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${TINTS[i % TINTS.length]}`}>
                                    {initialsOf(item.clientName)}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.clientName}</span>
                                <span className="font-display text-sm font-semibold tabular-nums">{money(item.total)}</span>
                            </li>
                        ))}
                    </ul>
                    {items.length > limit && (
                        <p className="mt-1 px-2 text-[11px] text-muted-foreground">y {items.length - limit} más</p>
                    )}
                    <button
                        type="button"
                        onClick={onAction}
                        className="mt-4 w-full rounded-full border border-border py-2 text-xs font-semibold text-foreground hover:border-brand-cyan hover:text-brand-blue dark:hover:text-brand-cyan transition-colors"
                    >
                        {actionLabel}
                    </button>
                </>
            )}
        </div>
    )
}
