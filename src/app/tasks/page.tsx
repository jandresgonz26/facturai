'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, Clock, Pencil, Plus, ReceiptText, Trash2, User } from 'lucide-react'
import { Client, Task, TaskStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    TASK_COLUMNS,
    createTask,
    deleteTask,
    listClients,
    listTasks,
    moveTask,
    registerTaskAsLog,
    updateTask,
    type TaskInput,
} from '@/lib/actions'
import { errorMessage } from '@/lib/actions/validation'
import { emitDataChanged, useDataChanged } from '@/lib/events'

const fmt = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '')
const todayStr = () => new Date().toISOString().split('T')[0]

const COLUMN_STYLES: Record<TaskStatus, { head: string; dot: string }> = {
    todo: { head: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
    doing: { head: 'text-sky-700 dark:text-sky-400', dot: 'bg-sky-500' },
    done: { head: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
}

type FormValues = {
    title: string
    notes: string
    client_id: string
    due_date: string
    hours: string
    amount: string
}

const emptyForm = (): FormValues => ({ title: '', notes: '', client_id: '', due_date: '', hours: '', amount: '' })

const toInput = (v: FormValues, status: TaskStatus): TaskInput => ({
    title: v.title.trim(),
    notes: v.notes.trim() || null,
    status,
    client_id: v.client_id || null,
    due_date: v.due_date || null,
    hours: v.hours ? Number(v.hours) : null,
    amount: v.amount ? Number(v.amount) : null,
})

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)

    const [newTitle, setNewTitle] = useState('')
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [newForm, setNewForm] = useState<FormValues>(emptyForm())

    const [editing, setEditing] = useState<Task | null>(null)
    const [editForm, setEditForm] = useState<FormValues>(emptyForm())
    const [editStatus, setEditStatus] = useState<TaskStatus>('todo')

    const [toDelete, setToDelete] = useState<Task | null>(null)
    const [dragOver, setDragOver] = useState<TaskStatus | null>(null)

    const load = async () => {
        try {
            const [t, c] = await Promise.all([listTasks(), listClients()])
            setTasks(t)
            setClients(c)
        } catch (e) {
            toast.error(errorMessage(e))
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => {
        load()
    }, [])
    useDataChanged(load)

    const byColumn = useMemo(() => {
        const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] }
        for (const t of tasks) map[t.status]?.push(t)
        return map
    }, [tasks])

    const billableClients = clients.filter((c) => c.billing_modality !== 'hour_bag' || c.parent_client_id)

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        const values = detailsOpen ? { ...newForm, title: newTitle } : { ...emptyForm(), title: newTitle }
        if (!values.title.trim()) {
            toast.error('Escribe de qué se trata la tarea')
            return
        }
        setWorking(true)
        try {
            const created = await createTask(toInput(values, 'todo'))
            setTasks((prev) => [...prev, created])
            setNewTitle('')
            setNewForm(emptyForm())
            setDetailsOpen(false)
            toast.success('Tarea creada')
        } catch (err) {
            toast.error(errorMessage(err))
        } finally {
            setWorking(false)
        }
    }

    const handleDrop = async (status: TaskStatus, taskId: string) => {
        setDragOver(null)
        const task = tasks.find((t) => t.id === taskId)
        if (!task || task.status === status) return
        // Optimista: se mueve en pantalla y, si falla, se revierte.
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
        try {
            const updated = await moveTask(taskId, status)
            setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)))
        } catch (e) {
            setTasks((prev) => prev.map((t) => (t.id === taskId ? task : t)))
            toast.error(errorMessage(e))
        }
    }

    const openEdit = (task: Task) => {
        setEditing(task)
        setEditStatus(task.status)
        setEditForm({
            title: task.title,
            notes: task.notes ?? '',
            client_id: task.client_id ?? '',
            due_date: task.due_date ?? '',
            hours: task.hours != null ? String(task.hours) : '',
            amount: task.amount != null ? String(task.amount) : '',
        })
    }

    const saveEdit = async () => {
        if (!editing) return
        if (!editForm.title.trim()) {
            toast.error('La tarea necesita un título')
            return
        }
        setWorking(true)
        try {
            const updated = await updateTask(editing.id, toInput(editForm, editStatus))
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
            setEditing(null)
            toast.success('Tarea actualizada')
        } catch (e) {
            toast.error(errorMessage(e))
        } finally {
            setWorking(false)
        }
    }

    const executeDelete = async () => {
        if (!toDelete) return
        setWorking(true)
        try {
            await deleteTask(toDelete.id)
            setTasks((prev) => prev.filter((t) => t.id !== toDelete.id))
            setToDelete(null)
            toast.success('Tarea eliminada')
        } catch (e) {
            toast.error(errorMessage(e))
        } finally {
            setWorking(false)
        }
    }

    const handleRegister = async (task: Task) => {
        setWorking(true)
        try {
            await registerTaskAsLog(task.id)
            toast.success(`"${task.title}" quedó pendiente de facturar a ${task.clients?.name ?? 'el cliente'}`)
            emitDataChanged()
            await load()
        } catch (e) {
            toast.error(errorMessage(e))
        } finally {
            setWorking(false)
        }
    }

    const canRegister = (t: Task) => !t.log_id && !!t.client_id && (t.amount != null || t.hours != null)

    const fields = (v: FormValues, set: (next: FormValues) => void) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
                <Label>Detalle (opcional)</Label>
                <Textarea rows={2} placeholder="Notas de la tarea…" value={v.notes} onChange={(e) => set({ ...v, notes: e.target.value })} />
            </div>
            <div className="space-y-1">
                <Label>Cliente (opcional)</Label>
                <Select value={v.client_id || 'none'} onValueChange={(x) => set({ ...v, client_id: x === 'none' ? '' : x })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Sin cliente" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Sin cliente</SelectItem>
                        {billableClients.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1">
                <Label>Para cuándo (opcional)</Label>
                <Input type="date" value={v.due_date} onChange={(e) => set({ ...v, due_date: e.target.value })} />
            </div>
            <div className="space-y-1">
                <Label>Horas (opcional)</Label>
                <Input type="number" step="0.25" min="0" placeholder="Ej: 3" value={v.hours} onChange={(e) => set({ ...v, hours: e.target.value })} />
            </div>
            <div className="space-y-1">
                <Label>Monto a cobrar (opcional)</Label>
                <Input type="number" step="0.01" min="0" placeholder="Ej: 50" value={v.amount} onChange={(e) => set({ ...v, amount: e.target.value })} />
            </div>
            <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                Con cliente y monto (u horas) podrás registrar la tarea como ítem pendiente de facturar.
            </p>
        </div>
    )

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-5">
                <h1 className="text-2xl font-bold">Tareas</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Arrastra las tarjetas entre columnas para cambiarlas de estado.
                </p>
            </div>

            {/* Alta rápida */}
            <form onSubmit={handleCreate} className="rounded-xl border bg-card shadow-sm p-4 mb-6 space-y-3">
                <div className="flex gap-2">
                    <Input
                        placeholder="Nueva tarea… (ej: llamar a Atlantic para el mantenimiento)"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={() => setDetailsOpen((o) => !o)}>
                        {detailsOpen ? 'Menos' : 'Más opciones'}
                    </Button>
                    <Button type="submit" disabled={working} className="bg-teal-600 hover:bg-teal-700 text-white">
                        <Plus className="w-4 h-4" /> Agregar
                    </Button>
                </div>
                {detailsOpen && fields(newForm, setNewForm)}
            </form>

            {/* Tablero */}
            {loading ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {TASK_COLUMNS.map((col) => {
                        const items = byColumn[col.id]
                        const isOver = dragOver === col.id
                        return (
                            <div
                                key={col.id}
                                onDragOver={(e) => {
                                    e.preventDefault()
                                    setDragOver(col.id)
                                }}
                                onDragLeave={() => setDragOver((c) => (c === col.id ? null : c))}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    handleDrop(col.id, e.dataTransfer.getData('text/plain'))
                                }}
                                className={`rounded-xl border bg-muted/30 p-3 min-h-[180px] transition-colors ${
                                    isOver ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-900/20' : ''
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-3 px-1">
                                    <span className={`w-2 h-2 rounded-full ${COLUMN_STYLES[col.id].dot}`} />
                                    <h2 className={`text-xs font-bold uppercase tracking-wider ${COLUMN_STYLES[col.id].head}`}>{col.label}</h2>
                                    <span className="text-xs text-muted-foreground ml-auto">{items.length}</span>
                                </div>

                                <div className="space-y-2">
                                    {items.map((task) => {
                                        const overdue = !!task.due_date && task.status !== 'done' && task.due_date < todayStr()
                                        return (
                                            <article
                                                key={task.id}
                                                draggable
                                                onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                                                className="rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                                            >
                                                <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                                                    {task.title}
                                                </p>
                                                {task.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.notes}</p>}

                                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                    {task.clients?.name && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                                                            <User className="w-3 h-3" /> {task.clients.name}
                                                        </span>
                                                    )}
                                                    {task.due_date && (
                                                        <span
                                                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                                                overdue
                                                                    ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                                    : 'bg-muted text-muted-foreground'
                                                            }`}
                                                        >
                                                            {overdue ? 'Vencía ' : 'Para '}
                                                            {fmt(task.due_date)}
                                                        </span>
                                                    )}
                                                    {task.hours != null && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                                            <Clock className="w-3 h-3" /> {task.hours}h
                                                        </span>
                                                    )}
                                                    {task.amount != null && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                                            <Banknote className="w-3 h-3" /> {task.amount.toFixed(2)}
                                                        </span>
                                                    )}
                                                    {task.log_id && (
                                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                                            Registrada para facturar
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1 mt-2 pt-2 border-t">
                                                    {canRegister(task) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRegister(task)}
                                                            disabled={working}
                                                            title="Registrar como ítem pendiente de facturar"
                                                            className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-40"
                                                        >
                                                            <ReceiptText className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(task)}
                                                        title="Editar"
                                                        className="p-1.5 rounded text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setToDelete(task)}
                                                        title="Eliminar"
                                                        className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </article>
                                        )
                                    })}

                                    {items.length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-6">Sin tareas aquí</p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Editar */}
            <Dialog open={!!editing} onOpenChange={(o) => !o && !working && setEditing(null)}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Editar tarea</DialogTitle>
                        <DialogDescription>Cambia lo que necesites; el estado también se puede mover desde aquí.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label>Tarea</Label>
                            <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label>Estado</Label>
                            <Select value={editStatus} onValueChange={(x) => setEditStatus(x as TaskStatus)}>
                                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {TASK_COLUMNS.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {fields(editForm, setEditForm)}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)} disabled={working}>Cancelar</Button>
                        <Button onClick={saveEdit} disabled={working} className="bg-teal-600 hover:bg-teal-700 text-white">
                            {working ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Eliminar */}
            <Dialog open={!!toDelete} onOpenChange={(o) => !o && !working && setToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar tarea</DialogTitle>
                        <DialogDescription>
                            {toDelete ? <>Se eliminará <strong>{toDelete.title}</strong>. Esta acción no se puede deshacer.</> : ''}
                            {toDelete?.log_id ? ' El ítem que ya se registró para facturar no se elimina.' : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setToDelete(null)} disabled={working}>Cancelar</Button>
                        <Button variant="destructive" onClick={executeDelete} disabled={working}>
                            {working ? 'Eliminando…' : 'Eliminar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
