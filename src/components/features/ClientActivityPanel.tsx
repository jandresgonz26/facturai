'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, FileText, HeartHandshake, LoaderCircle, Mail, Plus, ReceiptText, StickyNote, Trash2, Wrench } from 'lucide-react'
import Link from 'next/link'
import type { Client, ClientNote, ClientStage, Task } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CLIENT_STAGES, addClientNote, deleteClientNote, getClientTimeline, listClientNotes, setClientStage, type TimelineEvent } from '@/lib/actions/crm'
import { createTask, listTasks, moveTask } from '@/lib/actions/tasks'
import { emitDataChanged, useDataChanged } from '@/lib/events'

const ICONS: Record<TimelineEvent['type'], React.ComponentType<{ className?: string }>> = {
    quote: FileText,
    invoice: ReceiptText,
    payment: HeartHandshake,
    email: Mail,
    note: StickyNote,
    log: Wrench,
}
const COLORS: Record<TimelineEvent['type'], string> = {
    quote: 'text-sky-600 bg-sky-500/10',
    invoice: 'text-teal-600 bg-teal-500/10',
    payment: 'text-emerald-600 bg-emerald-500/10',
    email: 'text-indigo-600 bg-indigo-500/10',
    note: 'text-amber-600 bg-amber-500/10',
    log: 'text-gray-500 bg-gray-500/10',
}
const fmt = (iso: string) => iso.split('T')[0].split('-').reverse().join('/')

/** Pestaña "Actividad" de la ficha: etapa, próxima acción, notas e historial. */
export function ClientActivityPanel({ client, onClientChanged }: { client: Client; onClientChanged?: (c: Client) => void }) {
    const [stage, setStage] = useState<ClientStage>(client.stage ?? 'active')
    const [tasks, setTasks] = useState<Task[]>([])
    const [taskTitle, setTaskTitle] = useState('')
    const [taskDue, setTaskDue] = useState('')
    const [notes, setNotes] = useState<ClientNote[]>([])
    const [timeline, setTimeline] = useState<TimelineEvent[]>([])
    const [note, setNote] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const load = () => {
        Promise.all([listClientNotes(client.id), getClientTimeline(client.id), listTasks({ client_id: client.id, open_only: true })])
            .then(([n, t, tk]) => {
                setNotes(n)
                setTimeline(t)
                setTasks(tk)
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo cargar la actividad'))
            .finally(() => setLoading(false))
    }
    useEffect(() => {
        let active = true
        Promise.all([listClientNotes(client.id), getClientTimeline(client.id), listTasks({ client_id: client.id, open_only: true })])
            .then(([n, t, tk]) => {
                if (!active) return
                setNotes(n)
                setTimeline(t)
                setTasks(tk)
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo cargar la actividad'))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [client.id])
    useDataChanged(load)

    const changeStage = async (s: ClientStage) => {
        setStage(s)
        try {
            const c = await setClientStage(client.id, s)
            toast.success(`Etapa: ${CLIENT_STAGES.find((x) => x.id === s)?.label}`)
            onClientChanged?.(c)
            emitDataChanged()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cambiar la etapa')
        }
    }

    const addTask = async (e: React.FormEvent) => {
        e.preventDefault()
        if (taskTitle.trim().length < 3) return
        setSaving(true)
        try {
            await createTask({ title: taskTitle.trim(), client_id: client.id, due_date: taskDue || null })
            setTaskTitle('')
            setTaskDue('')
            toast.success('Tarea creada')
            load()
            emitDataChanged()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo crear la tarea')
        } finally {
            setSaving(false)
        }
    }

    const completeTask = async (id: string) => {
        try {
            await moveTask(id, 'done')
            setTasks((prev) => prev.filter((t) => t.id !== id))
            emitDataChanged()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo completar')
        }
    }

    const addNote = async (e: React.FormEvent) => {
        e.preventDefault()
        if (note.trim().length < 2) return
        setSaving(true)
        try {
            await addClientNote(client.id, note)
            setNote('')
            load()
            emitDataChanged()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar la nota')
        } finally {
            setSaving(false)
        }
    }

    const removeNote = async (id: string) => {
        try {
            await deleteClientNote(id)
            load()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
        }
    }

    return (
        <div className="space-y-6">
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <Label>Etapa comercial</Label>
                    <Select value={stage} onValueChange={(v: ClientStage) => changeStage(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {CLIENT_STAGES.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{CLIENT_STAGES.find((x) => x.id === stage)?.hint}</p>
                </div>
                <div className="space-y-1">
                    <Label>Origen</Label>
                    <p className="text-sm py-2">{client.source || <span className="text-muted-foreground">Sin indicar</span>}</p>
                </div>
            </section>

            <section className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5"><CalendarClock className="w-4 h-4 text-teal-600" /> Tareas pendientes</Label>
                    <Link href="/tasks" className="text-xs text-teal-600 hover:underline">Ver tablero</Link>
                </div>

                {tasks.length > 0 && (
                    <ul className="space-y-1.5">
                        {tasks.map((t) => {
                            const overdue = !!t.due_date && t.due_date < new Date().toISOString().split('T')[0]
                            return (
                                <li key={t.id} className="flex items-center gap-2 text-sm rounded-lg border bg-card px-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => completeTask(t.id)}
                                        title="Marcar como hecha"
                                        className="w-4 h-4 rounded border-2 border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-500/10 shrink-0"
                                    />
                                    <span className="flex-1">{t.title}</span>
                                    {t.due_date && (
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${overdue ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-muted text-muted-foreground'}`}>
                                            {fmt(t.due_date)}
                                        </span>
                                    )}
                                    {t.status === 'doing' && (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">En curso</span>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}

                <form onSubmit={addTask} className="flex flex-col sm:flex-row gap-2">
                    <Input placeholder="Ej: llamar para cerrar la propuesta" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="flex-1" />
                    <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="sm:w-40" />
                    <Button type="submit" variant="outline" disabled={saving || taskTitle.trim().length < 3}>Agregar</Button>
                </form>
                <p className="text-xs text-muted-foreground">Aparecen en el tablero de Tareas y te avisan en la campana cuando llega la fecha.</p>
            </section>

            <section className="space-y-2">
                <Label className="flex items-center gap-1.5"><StickyNote className="w-4 h-4 text-amber-600" /> Notas</Label>
                <form onSubmit={addNote} className="flex gap-2">
                    <Input placeholder="Anota algo de este cliente…" value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button type="submit" disabled={saving || note.trim().length < 2} className="bg-teal-600 hover:bg-teal-700 text-white"><Plus /></Button>
                </form>
                {notes.length > 0 && (
                    <ul className="space-y-1.5">
                        {notes.map((n) => (
                            <li key={n.id} className="flex items-start gap-2 text-sm rounded-lg border px-3 py-2">
                                <span className="flex-1 whitespace-pre-wrap">{n.body}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{fmt(n.created_at)}</span>
                                <Button size="icon-xs" variant="ghost" onClick={() => removeNote(n.id)} className="text-destructive hover:text-destructive"><Trash2 /></Button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="space-y-2">
                <Label>Historial</Label>
                {loading ? (
                    <div className="flex justify-center py-4"><LoaderCircle className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin actividad todavía.</p>
                ) : (
                    <ol className="relative border-l border-border ml-3 space-y-3">
                        {timeline.slice(0, 40).map((ev, i) => {
                            const Icon = ICONS[ev.type]
                            return (
                                <li key={`${ev.type}-${ev.ref_id ?? i}`} className="ml-5">
                                    <span className={`absolute -left-3 mt-0.5 h-6 w-6 rounded-full flex items-center justify-center ${COLORS[ev.type]}`}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </span>
                                    <p className="text-sm font-medium leading-tight">{ev.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {fmt(ev.date)}
                                        {ev.detail ? ` · ${ev.detail}` : ''}
                                    </p>
                                </li>
                            )
                        })}
                    </ol>
                )}
            </section>
        </div>
    )
}
