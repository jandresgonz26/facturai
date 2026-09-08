'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CalendarClock, Mail, Plus, UserRound } from 'lucide-react'
import type { ClientStage } from '@/types'
import { Button } from '@/components/ui/button'
import { CLIENT_STAGES, getPipeline, setClientStage, type PipelineCard } from '@/lib/actions/crm'
import { emitDataChanged, useDataChanged } from '@/lib/events'

const COLUMN_CLASS: Record<ClientStage, string> = {
    lead: 'border-sky-500/40 [&_.col-head]:text-sky-700 dark:[&_.col-head]:text-sky-300',
    quoted: 'border-amber-500/40 [&_.col-head]:text-amber-700 dark:[&_.col-head]:text-amber-300',
    active: 'border-emerald-500/40 [&_.col-head]:text-emerald-700 dark:[&_.col-head]:text-emerald-300',
    inactive: 'border-border [&_.col-head]:text-muted-foreground',
}
const usd = (n: number) => `$${n.toFixed(2)}`
const today = () => new Date().toISOString().split('T')[0]

export default function PipelinePage() {
    const [board, setBoard] = useState<Record<ClientStage, PipelineCard[]> | null>(null)
    const [dragging, setDragging] = useState<string | null>(null)
    const [over, setOver] = useState<ClientStage | null>(null)

    const load = () =>
        getPipeline()
            .then(setBoard)
            .catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo cargar el pipeline'))

    useEffect(() => {
        let active = true
        getPipeline()
            .then((b) => active && setBoard(b))
            .catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo cargar el pipeline'))
        return () => {
            active = false
        }
    }, [])
    useDataChanged(load)

    const move = async (clientId: string, stage: ClientStage) => {
        if (!board) return
        const from = (Object.keys(board) as ClientStage[]).find((k) => board[k].some((c) => c.client.id === clientId))
        if (!from || from === stage) return
        // Optimista
        const card = board[from].find((c) => c.client.id === clientId)!
        setBoard({ ...board, [from]: board[from].filter((c) => c.client.id !== clientId), [stage]: [{ ...card, client: { ...card.client, stage } }, ...board[stage]] })
        try {
            await setClientStage(clientId, stage)
            toast.success(`${card.client.name} → ${CLIENT_STAGES.find((s) => s.id === stage)?.label}`)
            emitDataChanged()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo mover')
            load()
        }
    }

    const total = board ? (Object.values(board) as PipelineCard[][]).reduce((s, col) => s + col.length, 0) : 0

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-2xl font-bold">Pipeline</h1>
                    <p className="text-sm text-muted-foreground mt-1">{total} clientes · arrastra una tarjeta para cambiar de etapa, o usa el menú de cada tarjeta</p>
                </div>
                <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white">
                    <Link href="/clients?new=lead"><Plus /> Nuevo lead</Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {CLIENT_STAGES.map((stage) => {
                    const cards = board?.[stage.id] ?? []
                    const sum = cards.reduce((s, c) => s + (stage.id === 'lead' || stage.id === 'quoted' ? c.quoted_total : c.unpaid_total + c.pending_total), 0)
                    return (
                        <section
                            key={stage.id}
                            onDragOver={(e) => {
                                e.preventDefault()
                                setOver(stage.id)
                            }}
                            onDragLeave={() => setOver(null)}
                            onDrop={(e) => {
                                e.preventDefault()
                                setOver(null)
                                const id = e.dataTransfer.getData('text/plain') || dragging
                                if (id) move(id, stage.id)
                                setDragging(null)
                            }}
                            className={`rounded-xl border-t-4 bg-card shadow-sm min-h-[240px] flex flex-col transition-colors ${COLUMN_CLASS[stage.id]} ${over === stage.id ? 'ring-2 ring-teal-500/50' : ''}`}
                        >
                            <header className="px-3 py-2.5 border-b">
                                <div className="flex items-center justify-between">
                                    <h2 className="col-head font-semibold text-sm">{stage.label}</h2>
                                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{cards.length}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    {stage.id === 'lead' || stage.id === 'quoted' ? `Cotizado ${usd(sum)}` : `Por cobrar + pendiente ${usd(sum)}`}
                                </p>
                            </header>
                            <div className="p-2 space-y-2 flex-1">
                                {!board && <p className="text-xs text-muted-foreground p-2">Cargando…</p>}
                                {board && cards.length === 0 && <p className="text-xs text-muted-foreground p-2 text-center">{stage.hint}</p>}
                                {cards.map((c) => {
                                    const due = c.client.next_action_at && c.client.next_action_at <= today()
                                    return (
                                        <article
                                            key={c.client.id}
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('text/plain', c.client.id)
                                                setDragging(c.client.id)
                                            }}
                                            onDragEnd={() => setDragging(null)}
                                            className={`rounded-lg border bg-background p-3 shadow-sm cursor-grab active:cursor-grabbing space-y-1.5 ${dragging === c.client.id ? 'opacity-50' : ''}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <Link href={`/clients?open=${c.client.id}`} className="font-semibold text-sm leading-tight hover:text-teal-600 truncate">{c.client.name}</Link>
                                                <select
                                                    value={c.client.stage ?? 'active'}
                                                    onChange={(e) => move(c.client.id, e.target.value as ClientStage)}
                                                    className="text-[10px] bg-muted rounded px-1 py-0.5 border-0 outline-none cursor-pointer"
                                                    title="Mover a…"
                                                >
                                                    {CLIENT_STAGES.map((s) => (
                                                        <option key={s.id} value={s.id}>{s.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                                                {c.client.email ? <><Mail className="w-3 h-3" /> {c.client.email}</> : <><UserRound className="w-3 h-3" /> sin correo</>}
                                            </p>
                                            <div className="flex flex-wrap gap-1 text-[10px]">
                                                {c.quoted_total > 0 && <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300">Cotizado {usd(c.quoted_total)}</span>}
                                                {c.unpaid_total > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">Por cobrar {usd(c.unpaid_total)}</span>}
                                                {c.pending_total > 0 && <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300">Sin facturar {usd(c.pending_total)}</span>}
                                            </div>
                                            {c.client.next_action && (
                                                <p className={`text-[11px] flex items-center gap-1 ${due ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                                                    <CalendarClock className="w-3 h-3" /> {c.client.next_action}
                                                    {c.client.next_action_at ? ` · ${c.client.next_action_at.split('-').reverse().join('/')}` : ''}
                                                </p>
                                            )}
                                            <p className="text-[10px] text-muted-foreground">
                                                {c.days_since_activity == null ? 'Sin actividad' : c.days_since_activity === 0 ? `Hoy · ${c.last_activity_label}` : `Hace ${c.days_since_activity} d · ${c.last_activity_label}`}
                                            </p>
                                        </article>
                                    )
                                })}
                            </div>
                        </section>
                    )
                })}
            </div>
        </div>
    )
}
