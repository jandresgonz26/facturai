'use client'

import { useState } from 'react'
import { Check, ListChecks, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { addSubtask, deleteSubtask, toggleSubtask } from '@/lib/actions'
import { errorMessage } from '@/lib/actions/validation'
import type { Task, TaskSubtask } from '@/types'

/**
 * Checklist dentro de una tarea. Vive solo en el diálogo de editar (no en el
 * alta): una tarea nueva todavía no tiene id al que colgarle pasos.
 */
export function SubtaskChecklist({ task, onChange }: { task: Task; onChange: (subtasks: TaskSubtask[]) => void }) {
    const subtasks = task.task_subtasks ?? []
    const [title, setTitle] = useState('')
    const [busy, setBusy] = useState(false)
    const done = subtasks.filter((s) => s.done).length

    const add = async (e: React.FormEvent) => {
        e.preventDefault()
        const t = title.trim()
        if (!t) return
        setBusy(true)
        try {
            const created = await addSubtask(task.id, t)
            onChange([...subtasks, created])
            setTitle('')
        } catch (err) {
            toast.error(errorMessage(err))
        } finally {
            setBusy(false)
        }
    }

    const toggle = async (s: TaskSubtask) => {
        onChange(subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))
        try {
            await toggleSubtask(s.id, !s.done)
        } catch (err) {
            onChange(subtasks)
            toast.error(errorMessage(err))
        }
    }

    const remove = async (s: TaskSubtask) => {
        onChange(subtasks.filter((x) => x.id !== s.id))
        try {
            await deleteSubtask(s.id)
        } catch (err) {
            onChange(subtasks)
            toast.error(errorMessage(err))
        }
    }

    return (
        <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5" />
                Pasos {subtasks.length > 0 ? `· ${done}/${subtasks.length}` : '(opcional)'}
            </label>
            {subtasks.length > 0 && (
                <ul className="space-y-1">
                    {subtasks.map((s) => (
                        <li key={s.id} className="flex items-center gap-2 rounded-lg border bg-card/60 px-2.5 py-1.5">
                            <button
                                type="button"
                                onClick={() => toggle(s)}
                                title={s.done ? 'Marcar sin hacer' : 'Marcar hecho'}
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                    s.done ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40 hover:border-emerald-500'
                                }`}
                            >
                                {s.done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                            </button>
                            <span className={`flex-1 text-sm ${s.done ? 'line-through text-muted-foreground' : ''}`}>{s.title}</span>
                            <button type="button" onClick={() => remove(s)} title="Eliminar paso" className="text-muted-foreground hover:text-red-500 shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <form onSubmit={add} className="flex gap-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Agregar un paso…" className="h-8 text-sm" />
                <button
                    type="submit"
                    disabled={busy || !title.trim()}
                    className="shrink-0 px-2.5 rounded-lg border text-muted-foreground hover:border-teal-400 hover:text-teal-600 disabled:opacity-40 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </form>
        </div>
    )
}
