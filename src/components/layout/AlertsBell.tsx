'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { getBriefing, type BriefingAlert } from '@/lib/actions/briefing'
import { useDataChanged } from '@/lib/events'

const dot: Record<string, string> = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-sky-500' }

/** Campana con alertas reales: vencidas, fijos sin cargar, bolsas llenas, por cobrar. */
export function AlertsBell() {
    const [alerts, setAlerts] = useState<BriefingAlert[]>([])
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    const load = () => {
        getBriefing()
            .then((b) => setAlerts(b.alerts))
            .catch((e) => console.error(e))
    }

    useEffect(() => {
        let active = true
        getBriefing()
            .then((b) => {
                if (active) setAlerts(b.alerts)
            })
            .catch((e) => console.error(e))
        return () => {
            active = false
        }
    }, [])
    useDataChanged(load)

    useEffect(() => {
        if (!open) return
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    const important = alerts.filter((a) => a.severity !== 'low').length

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="relative h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                title="Alertas"
                aria-label="Alertas"
            >
                <Bell className="w-5 h-5" />
                {alerts.length > 0 && (
                    <span
                        className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-gray-800 ${
                            important ? 'bg-red-500 text-white' : 'bg-sky-500 text-white'
                        }`}
                    >
                        {alerts.length}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border bg-popover text-popover-foreground shadow-xl z-50">
                    <div className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {alerts.length === 0 ? 'Sin alertas' : `${alerts.length} alertas`}
                    </div>
                    {alerts.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-center text-muted-foreground">Todo al día 🎉</p>
                    ) : (
                        <ul className="divide-y">
                            {alerts.map((a, i) => (
                                <li key={i}>
                                    <Link href={a.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors">
                                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot[a.severity]}`} />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium truncate">{a.title}</span>
                                            <span className="block text-xs text-muted-foreground truncate">{a.detail}</span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}
