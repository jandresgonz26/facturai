'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Banknote, CalendarCheck, Clock, Pencil, Plus, ReceiptText, RotateCcw, Sparkles, Sun, Trash2, TrendingUp, User } from 'lucide-react'
import { Client, Task, TaskClarity, TaskConsequence, TaskStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    DAY_CAPACITY_MINUTES,
    TASK_COLUMNS,
    createTask,
    deleteTask,
    getClientSignals,
    listClients,
    listTasks,
    moveTask,
    planTask,
    registerTaskAsLog,
    updateTask,
    type TaskInput,
} from '@/lib/actions'
import { useAgent } from '@/components/agent/AgentProvider'
import { errorMessage } from '@/lib/actions/validation'
import {
    BLOCK_META,
    CLARITY_OPTIONS,
    CONSEQUENCE_OPTIONS,
    ESTIMATE_OPTIONS,
    LABEL_META,
    computeDrift,
    currentBlock,
    emptySignals,
    scoreTask,
    sortByPriority,
    suggestNow,
    type ClientSignals,
} from '@/lib/task-priority'
import { emitDataChanged, useDataChanged } from '@/lib/events'

const fmt = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '')
const todayStr = () => new Date().toISOString().split('T')[0]
const fmtMinutes = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`)

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
    consequence: TaskConsequence | ''
    clarity: TaskClarity | ''
    estimated_minutes: string
}

const emptyForm = (): FormValues => ({
    title: '',
    notes: '',
    client_id: '',
    due_date: '',
    hours: '',
    amount: '',
    consequence: '',
    clarity: '',
    estimated_minutes: '',
})

const toInput = (v: FormValues, status: TaskStatus): TaskInput => ({
    title: v.title.trim(),
    notes: v.notes.trim() || null,
    status,
    client_id: v.client_id || null,
    due_date: v.due_date || null,
    hours: v.hours ? Number(v.hours) : null,
    amount: v.amount ? Number(v.amount) : null,
    consequence: v.consequence || null,
    clarity: v.clarity || null,
    estimated_minutes: v.estimated_minutes ? Number(v.estimated_minutes) : null,
})

/** Fila de opciones en forma de chips: una pregunta se responde con un toque. */
function ChipGroup<T extends string>({
    question,
    options,
    value,
    onChange,
}: {
    question: string
    options: { id: T; label: string }[]
    value: T | ''
    onChange: (next: T | '') => void
}) {
    return (
        <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{question}</p>
            <div className="flex flex-wrap gap-1.5">
                {options.map((o) => {
                    const active = value === o.id
                    return (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => onChange(active ? '' : o.id)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                active
                                    ? 'bg-teal-600 border-teal-600 text-white'
                                    : 'border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-teal-400'
                            }`}
                        >
                            {o.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [signals, setSignals] = useState<ClientSignals>(emptySignals())
    const [loading, setLoading] = useState(true)
    const [working, setWorking] = useState(false)

    const [newForm, setNewForm] = useState<FormValues>(emptyForm())
    const [detailsOpen, setDetailsOpen] = useState(false)

    const [editing, setEditing] = useState<Task | null>(null)
    const [editForm, setEditForm] = useState<FormValues>(emptyForm())
    const [editStatus, setEditStatus] = useState<TaskStatus>('todo')

    const [toDelete, setToDelete] = useState<Task | null>(null)
    const [dragOver, setDragOver] = useState<TaskStatus | null>(null)
    /** Tarea recién completada que tenía estimación: se pregunta cuánto tomó de verdad. */
    const [measuring, setMeasuring] = useState<Task | null>(null)
    const { openWith } = useAgent()

    const load = async () => {
        try {
            const [t, c, s] = await Promise.all([listTasks(), listClients(), getClientSignals().catch(() => emptySignals())])
            setTasks(t)
            setClients(c)
            setSignals(s)
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
        // Dentro de cada columna, lo más urgente primero (las hechas se dejan como están).
        map.todo = sortByPriority(map.todo, signals)
        map.doing = sortByPriority(map.doing, signals)
        return map
    }, [tasks, signals])

    const block = currentBlock()
    const suggestions = useMemo(() => suggestNow(tasks, signals), [tasks, signals])
    const drift = useMemo(() => computeDrift(tasks), [tasks])

    const today = todayStr()
    const plan = useMemo(() => {
        const open = tasks.filter((t) => t.status !== 'done')
        const planned = sortByPriority(open.filter((t) => t.planned_for === today), signals)
        const carried = sortByPriority(open.filter((t) => !!t.planned_for && t.planned_for < today), signals)
        const minutes = planned.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0)
        return { planned, carried, minutes, over: minutes > DAY_CAPACITY_MINUTES }
    }, [tasks, signals, today])

    /** Saludo del asistente según la franja, con la pregunta ya cargada. */
    const agentIntro = useMemo(() => {
        if (block === 'morning') {
            return {
                icon: Sun,
                title: plan.planned.length > 0 ? 'Ya tienes plan para hoy' : 'Buenos días. ¿Armamos el plan de hoy?',
                text:
                    plan.planned.length > 0
                        ? 'Puedo repasarlo contigo, ajustar lo que no quepa y decirte por cuál empezar.'
                        : 'Te ayudo a elegir tres o cuatro cosas realistas para hoy, empezando por lo que traes arrastrando.',
                cta: plan.planned.length > 0 ? 'Repasar el plan' : 'Armar el plan de hoy',
                prompt:
                    plan.planned.length > 0
                        ? 'Repasemos el plan de hoy: dime si es realista, qué sacaría y por cuál empiezo.'
                        : 'Ayúdame a armar el plan de hoy. Empieza por lo que traigo arrastrado y propón pocas tareas realistas.',
            }
        }
        if (block === 'afternoon') {
            return {
                icon: Sparkles,
                title: '¿Cómo vas con el día?',
                text: 'Puedo decirte qué te queda del plan y qué conviene atacar con el tiempo que te sobra.',
                cta: '¿Qué me queda?',
                prompt: '¿Cómo voy con el plan de hoy? Dime qué me queda pendiente y qué conviene hacer con el tiempo que queda de tarde.',
            }
        }
        return {
            icon: CalendarCheck,
            title: 'Cerrando el día',
            text: 'Repasemos qué se cerró y qué mueves a mañana, para no arrastrarlo sin decidirlo.',
            cta: 'Cerrar el día',
            prompt: 'Hagamos la revisión del cierre del día: qué cerré, qué quedó abierto y qué muevo a mañana.',
        }
    }, [block, plan.planned.length])

    const billableClients = clients.filter((c) => c.billing_modality !== 'hour_bag' || c.parent_client_id)

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newForm.title.trim()) {
            toast.error('Escribe de qué se trata la tarea')
            return
        }
        setWorking(true)
        try {
            const created = await createTask(toInput(newForm, 'todo'))
            setTasks((prev) => [...prev, created])
            setNewForm(emptyForm())
            setDetailsOpen(false)
            toast.success('Tarea creada')
        } catch (err) {
            toast.error(errorMessage(err))
        } finally {
            setWorking(false)
        }
    }

    const applyMove = async (task: Task, status: TaskStatus) => {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)))
        try {
            const updated = await moveTask(task.id, status)
            setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
            // Si tenía estimación y aún no se midió, se pregunta cuánto tomó (opcional).
            if (status === 'done' && updated.estimated_minutes != null && updated.actual_minutes == null) {
                setMeasuring(updated)
            }
        } catch (e) {
            setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
            toast.error(errorMessage(e))
        }
    }

    const handleDrop = async (status: TaskStatus, taskId: string) => {
        setDragOver(null)
        const task = tasks.find((t) => t.id === taskId)
        if (!task || task.status === status) return
        await applyMove(task, status)
    }

    const saveActual = async (minutes: number | null) => {
        const task = measuring
        setMeasuring(null)
        if (!task || minutes == null) return
        try {
            const updated = await moveTask(task.id, 'done', minutes)
            setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
            toast.success('Anotado, así el cálculo mejora con el tiempo')
        } catch (e) {
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
            consequence: task.consequence ?? '',
            clarity: task.clarity ?? '',
            estimated_minutes: task.estimated_minutes != null ? String(task.estimated_minutes) : '',
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

    const togglePlan = async (task: Task, date: string | null) => {
        try {
            const updated = await planTask(task.id, date)
            setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
            if (date === today) toast.success('Va en el plan de hoy')
        } catch (e) {
            toast.error(errorMessage(e))
        }
    }

    const optionalFields = (v: FormValues, set: (next: FormValues) => void) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
                <Label>Horas a cobrar (opcional)</Label>
                <Input type="number" step="0.25" min="0" placeholder="Ej: 3" value={v.hours} onChange={(e) => set({ ...v, hours: e.target.value })} />
            </div>
            <div className="space-y-1">
                <Label>Monto a cobrar (opcional)</Label>
                <Input type="number" step="0.01" min="0" placeholder="Ej: 50" value={v.amount} onChange={(e) => set({ ...v, amount: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
                <ChipGroup
                    question="¿Cuánto crees que te toma? (opcional, sirve para medir después)"
                    options={ESTIMATE_OPTIONS.map((o) => ({ id: String(o.minutes), label: o.label }))}
                    value={v.estimated_minutes}
                    onChange={(x) => set({ ...v, estimated_minutes: x })}
                />
            </div>
            <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                Con cliente y monto (u horas) podrás registrar la tarea como ítem pendiente de facturar.
            </p>
        </div>
    )

    const questions = (v: FormValues, set: (next: FormValues) => void) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ChipGroup
                question="Si esto no se hace esta semana, ¿qué pasa?"
                options={CONSEQUENCE_OPTIONS}
                value={v.consequence}
                onChange={(x) => set({ ...v, consequence: x })}
            />
            <ChipGroup
                question="¿Ya sabes exactamente cómo hacerlo?"
                options={CLARITY_OPTIONS}
                value={v.clarity}
                onChange={(x) => set({ ...v, clarity: x })}
            />
        </div>
    )

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-5">
                <h1 className="text-2xl font-bold">Tareas</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    La prioridad se calcula sola con tus dos respuestas y lo que el sistema ya sabe de cada cliente.
                </p>
            </div>

            {/* Asistente según la franja del día */}
            {!loading && (
                <section className="rounded-xl border bg-gradient-to-br from-teal-50 to-sky-50 dark:from-teal-950/40 dark:to-sky-950/30 p-4 mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-900 dark:bg-gray-700 text-teal-400 flex items-center justify-center">
                            <agentIntro.icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-sm font-bold">{agentIntro.title}</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">{agentIntro.text}</p>
                        </div>
                        <Button className="bg-teal-600 hover:bg-teal-700 text-white shrink-0" onClick={() => openWith(agentIntro.prompt)}>
                            <Sparkles className="w-4 h-4" /> {agentIntro.cta}
                        </Button>
                    </div>

                    {/* Plan de hoy */}
                    {plan.planned.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-teal-200/60 dark:border-teal-800/40">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                                    Plan de hoy · {plan.planned.length} tarea{plan.planned.length === 1 ? '' : 's'}
                                </h3>
                                {plan.minutes > 0 && (
                                    <span className={`text-[11px] font-medium ${plan.over ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                                        {fmtMinutes(plan.minutes)} de {fmtMinutes(DAY_CAPACITY_MINUTES)}
                                    </span>
                                )}
                            </div>
                            {plan.over && (
                                <p className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400 mb-2">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                                    Te pasas de lo que cabe en un día con cabeza. Mejor saca algo ahora que arrastrarlo mañana.
                                </p>
                            )}
                            <ul className="space-y-1.5">
                                {plan.planned.map((task) => {
                                    const p = scoreTask(task, signals)
                                    return (
                                        <li key={task.id} className="flex items-center gap-2 rounded-lg bg-card/80 border px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => applyMove(task, 'done')}
                                                title="Marcar como hecha"
                                                className="w-4 h-4 rounded border-2 border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-500/10 shrink-0"
                                            />
                                            <span className="flex-1 text-sm truncate">{task.title}</span>
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${LABEL_META[p.label].className}`}>
                                                {LABEL_META[p.label].emoji}
                                            </span>
                                            {task.estimated_minutes != null && (
                                                <span className="text-[10px] text-muted-foreground shrink-0">{fmtMinutes(task.estimated_minutes)}</span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => togglePlan(task, null)}
                                                title="Sacar del plan de hoy"
                                                className="text-muted-foreground hover:text-red-500 shrink-0"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )}

                    {/* Arrastradas de días anteriores */}
                    {plan.carried.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-800/40">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                                Vienen arrastrándose · {plan.carried.length}
                            </h3>
                            <ul className="space-y-1.5">
                                {plan.carried.map((task) => (
                                    <li key={task.id} className="flex items-center gap-2 rounded-lg bg-card/80 border px-3 py-2">
                                        <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span className="flex-1 text-sm truncate">{task.title}</span>
                                        {(task.postponed_count ?? 0) >= 3 && (
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 shrink-0">
                                                movida {task.postponed_count} veces
                                            </span>
                                        )}
                                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => togglePlan(task, today)}>
                                            Hoy
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Sugerencia por franja cuando aún no hay plan */}
                    {plan.planned.length === 0 && suggestions.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-teal-200/60 dark:border-teal-800/40">
                            <p className="text-xs text-muted-foreground mb-2">{BLOCK_META[block].hint}</p>
                            <ul className="space-y-1.5">
                                {suggestions.map(({ task, priority }) => (
                                    <li key={task.id} className="flex items-center gap-2 rounded-lg bg-card/80 border px-3 py-2">
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${LABEL_META[priority.label].className}`}>
                                            {LABEL_META[priority.label].emoji} {LABEL_META[priority.label].text}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm truncate">{task.title}</p>
                                            <p className="text-[11px] text-muted-foreground truncate">{priority.reason}</p>
                                        </div>
                                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => togglePlan(task, today)}>
                                            Hoy
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            )}

            {/* Cómo va tu cálculo de tiempos */}
            {drift.length > 0 && (
                <section className="rounded-xl border bg-card shadow-sm p-4 mb-6">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-violet-600" />
                        <h2 className="text-sm font-bold">Cómo va tu cálculo de tiempos</h2>
                    </div>
                    <ul className="space-y-1.5">
                        {drift.map((d) => {
                            const clarity = CLARITY_OPTIONS.find((c) => c.id === d.clarity)!
                            const off = Math.abs(d.ratio - 1) < 0.15
                            return (
                                <li key={d.clarity} className="text-sm flex items-baseline gap-2">
                                    <span className="text-muted-foreground">Cuando dices &quot;{clarity.short.toLowerCase()}&quot;:</span>
                                    <strong className={off ? 'text-emerald-600' : d.ratio > 1 ? 'text-red-600' : 'text-sky-600'}>
                                        {off ? 'tu cálculo da' : d.ratio > 1 ? `te toma ${d.ratio}× lo previsto` : `te toma ${d.ratio}× lo previsto`}
                                    </strong>
                                    <span className="text-xs text-muted-foreground">({d.samples} tareas medidas)</span>
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}

            {/* Alta */}
            <form onSubmit={handleCreate} className="rounded-xl border bg-card shadow-sm p-4 mb-6 space-y-3">
                <div className="flex gap-2">
                    <Input
                        placeholder="Nueva tarea… (ej: llamar a Atlantic para el mantenimiento)"
                        value={newForm.title}
                        onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                        className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={() => setDetailsOpen((o) => !o)}>
                        {detailsOpen ? 'Menos' : 'Más opciones'}
                    </Button>
                    <Button type="submit" disabled={working} className="bg-teal-600 hover:bg-teal-700 text-white">
                        <Plus className="w-4 h-4" /> Agregar
                    </Button>
                </div>
                {questions(newForm, setNewForm)}
                {detailsOpen && optionalFields(newForm, setNewForm)}
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
                                        const priority = scoreTask(task, signals)
                                        const showLabel = task.status !== 'done' && (task.consequence != null || task.clarity != null || task.due_date != null)
                                        return (
                                            <article
                                                key={task.id}
                                                draggable
                                                onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                                                className="rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                                            >
                                                {showLabel && (
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${LABEL_META[priority.label].className}`}>
                                                            {LABEL_META[priority.label].emoji} {LABEL_META[priority.label].text}
                                                        </span>
                                                    </div>
                                                )}
                                                <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                                                    {task.title}
                                                </p>
                                                {showLabel && <p className="text-[11px] text-muted-foreground mt-0.5">{priority.reason}</p>}
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
                                                    {task.estimated_minutes != null && (
                                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                                            ~{fmtMinutes(task.estimated_minutes)}
                                                            {task.actual_minutes != null && ` · real ${fmtMinutes(task.actual_minutes)}`}
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
                                                    {task.status !== 'done' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => togglePlan(task, task.planned_for === today ? null : today)}
                                                            title={task.planned_for === today ? 'Sacar del plan de hoy' : 'Poner en el plan de hoy'}
                                                            className={`p-1.5 rounded hover:bg-teal-50 dark:hover:bg-teal-900/20 ${
                                                                task.planned_for === today ? 'text-teal-600' : 'text-muted-foreground'
                                                            }`}
                                                        >
                                                            <CalendarCheck className="w-4 h-4" />
                                                        </button>
                                                    )}
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

            {/* ¿Cuánto tomó de verdad? */}
            <Dialog open={!!measuring} onOpenChange={(o) => !o && setMeasuring(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>¿Cuánto te llevó de verdad?</DialogTitle>
                        <DialogDescription>
                            {measuring ? (
                                <>
                                    Calculaste <strong>{fmtMinutes(measuring.estimated_minutes ?? 0)}</strong> para &quot;{measuring.title}&quot;.
                                    Con el dato real, el sistema aprende cuánto sueles desviarte. Puedes saltarlo.
                                </>
                            ) : (
                                ''
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-wrap gap-2 py-2">
                        {ESTIMATE_OPTIONS.map((o) => (
                            <Button key={o.minutes} variant="outline" size="sm" onClick={() => saveActual(o.minutes)}>
                                {o.label}
                            </Button>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setMeasuring(null)}>Saltar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Editar */}
            <Dialog open={!!editing} onOpenChange={(o) => !o && !working && setEditing(null)}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Editar tarea</DialogTitle>
                        <DialogDescription>Si cambias las respuestas, la prioridad se recalcula sola.</DialogDescription>
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
                        {questions(editForm, setEditForm)}
                        {optionalFields(editForm, setEditForm)}
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
