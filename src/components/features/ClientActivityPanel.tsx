'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
    CalendarClock,
    Check,
    ChevronDown,
    ChevronUp,
    FileText,
    HeartHandshake,
    ListTodo,
    LoaderCircle,
    Mail,
    Pencil,
    Pin,
    PinOff,
    Plus,
    ReceiptText,
    RotateCcw,
    StickyNote,
    Trash2,
    Wrench,
} from 'lucide-react'
import Link from 'next/link'
import type { Client, ClientNote, ClientStage, Task } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    CLIENT_STAGES,
    addClientNote,
    convertClientNoteToTask,
    deleteClientNote,
    getClientTimeline,
    listClientNotes,
    setClientStage,
    updateClientNote,
    type TimelineEvent,
} from '@/lib/actions/crm'
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
    /** Nota en edición inline (id + texto en curso). */
    const [editingNote, setEditingNote] = useState<{ id: string; body: string } | null>(null)
    const [noteToDelete, setNoteToDelete] = useState<ClientNote | null>(null)
    const [showResolved, setShowResolved] = useState(false)
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
            afterNoteChange()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar la nota')
        } finally {
            setSaving(false)
        }
    }

    /** Todo cambio en una nota refresca la lista y avisa al resto (la franja de fijadas en la cabecera escucha). */
    const afterNoteChange = () => {
        load()
        emitDataChanged()
    }

    const patchNote = async (n: ClientNote, patch: Parameters<typeof updateClientNote>[1], okMsg?: string) => {
        try {
            await updateClientNote(n.id, patch)
            if (okMsg) toast.success(okMsg)
            afterNoteChange()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la nota')
        }
    }

    const saveEditedNote = async () => {
        if (!editingNote) return
        if (editingNote.body.trim().length < 2) {
            toast.error('La nota está vacía')
            return
        }
        setSaving(true)
        try {
            await updateClientNote(editingNote.id, { body: editingNote.body })
            setEditingNote(null)
            afterNoteChange()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
        } finally {
            setSaving(false)
        }
    }

    const noteToTask = async (n: ClientNote) => {
        try {
            const r = await convertClientNoteToTask(n.id)
            toast.success(`Ahora es una tarea: "${r.task.title}"`)
            afterNoteChange()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo convertir')
        }
    }

    const removeNote = async () => {
        if (!noteToDelete) return
        setSaving(true)
        try {
            await deleteClientNote(noteToDelete.id)
            setNoteToDelete(null)
            toast.success('Nota eliminada')
            afterNoteChange()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
        } finally {
            setSaving(false)
        }
    }

    const activeNotes = notes.filter((n) => !n.resolved_at)
    const resolvedNotes = notes.filter((n) => n.resolved_at)

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
                <p className="text-xs text-muted-foreground">
                    Lo que hay que saber de este cliente. Fija las importantes (se ven arriba de la ficha y el asistente las lee primero);
                    si una nota es en realidad algo por hacer, conviértela en tarea.
                </p>
                <form
                    onSubmit={addNote}
                    className="flex gap-2 items-start"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(e)
                    }}
                >
                    <Textarea rows={2} placeholder="Anota algo de este cliente… (⌘↵ para guardar)" value={note} onChange={(e) => setNote(e.target.value)} className="flex-1 text-sm" />
                    <Button type="submit" disabled={saving || note.trim().length < 2} className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"><Plus /></Button>
                </form>

                {activeNotes.length > 0 && (
                    <ul className="space-y-1.5">
                        {activeNotes.map((n) => {
                            const isEditing = editingNote?.id === n.id
                            return (
                                <li
                                    key={n.id}
                                    className={`rounded-lg border px-3 py-2 text-sm ${
                                        n.pinned ? 'border-l-2 border-l-amber-400 bg-amber-50/50 dark:bg-amber-900/10' : 'bg-card'
                                    }`}
                                >
                                    {isEditing ? (
                                        <div className="space-y-2">
                                            <Textarea
                                                autoFocus
                                                rows={3}
                                                value={editingNote.body}
                                                onChange={(e) => setEditingNote({ id: n.id, body: e.target.value })}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEditedNote()
                                                    if (e.key === 'Escape') setEditingNote(null)
                                                }}
                                                className="text-sm"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="ghost" onClick={() => setEditingNote(null)} disabled={saving}>Cancelar</Button>
                                                <Button size="sm" onClick={saveEditedNote} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">Guardar</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="whitespace-pre-wrap">{n.body}</p>
                                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className="text-xs text-muted-foreground">
                                                    {fmt(n.created_at)}
                                                    {n.updated_at ? ' · editada' : ''}
                                                    {n.pinned ? ' · fijada' : ''}
                                                </span>
                                                <span className="ml-auto flex items-center gap-0.5">
                                                    <Button size="icon-xs" variant="ghost" title={n.pinned ? 'Soltar' : 'Fijar arriba de la ficha'} onClick={() => patchNote(n, { pinned: !n.pinned })} className={n.pinned ? 'text-amber-600' : 'text-muted-foreground'}>
                                                        {n.pinned ? <PinOff /> : <Pin />}
                                                    </Button>
                                                    <Button size="icon-xs" variant="ghost" title="Editar" onClick={() => setEditingNote({ id: n.id, body: n.body })} className="text-muted-foreground">
                                                        <Pencil />
                                                    </Button>
                                                    <Button size="icon-xs" variant="ghost" title="Convertir en tarea" onClick={() => noteToTask(n)} className="text-muted-foreground">
                                                        <ListTodo />
                                                    </Button>
                                                    <Button size="icon-xs" variant="ghost" title="Resolver (tachar)" onClick={() => patchNote(n, { resolved: true }, 'Nota resuelta')} className="text-muted-foreground hover:text-emerald-600">
                                                        <Check />
                                                    </Button>
                                                    <Button size="icon-xs" variant="ghost" title="Eliminar" onClick={() => setNoteToDelete(n)} className="text-muted-foreground hover:text-destructive">
                                                        <Trash2 />
                                                    </Button>
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}

                {resolvedNotes.length > 0 && (
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowResolved((v) => !v)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                            {showResolved ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {resolvedNotes.length} resuelta{resolvedNotes.length === 1 ? '' : 's'}
                        </button>
                        {showResolved && (
                            <ul className="mt-1.5 space-y-1.5">
                                {resolvedNotes.map((n) => (
                                    <li key={n.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm opacity-75">
                                        <p className="whitespace-pre-wrap line-through text-muted-foreground">{n.body}</p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {fmt(n.created_at)}
                                                {n.task_id ? (
                                                    <> · <Link href="/tasks" className="text-teal-600 hover:underline">convertida en tarea</Link></>
                                                ) : (
                                                    ' · resuelta'
                                                )}
                                            </span>
                                            <span className="ml-auto flex items-center gap-0.5">
                                                {!n.task_id && (
                                                    <Button size="icon-xs" variant="ghost" title="Reabrir" onClick={() => patchNote(n, { resolved: false })} className="text-muted-foreground">
                                                        <RotateCcw />
                                                    </Button>
                                                )}
                                                <Button size="icon-xs" variant="ghost" title="Eliminar" onClick={() => setNoteToDelete(n)} className="text-muted-foreground hover:text-destructive">
                                                    <Trash2 />
                                                </Button>
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <Dialog open={!!noteToDelete} onOpenChange={(o) => !o && !saving && setNoteToDelete(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Eliminar nota</DialogTitle>
                            <DialogDescription>
                                Se borra definitivamente. Si solo dejó de aplicar, mejor márcala como resuelta: queda en el historial.
                            </DialogDescription>
                        </DialogHeader>
                        {noteToDelete && <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">{noteToDelete.body}</p>}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setNoteToDelete(null)} disabled={saving}>Cancelar</Button>
                            <Button variant="destructive" onClick={removeNote} disabled={saving}>{saving ? 'Eliminando…' : 'Eliminar'}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
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
