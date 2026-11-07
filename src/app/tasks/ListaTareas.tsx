'use client'

import { useMemo, useState } from 'react'
import { CalendarCheck, ChevronRight, Clock, Pencil, ReceiptText, Repeat, Trash2 } from 'lucide-react'
import type { Task, TaskConsequence, TaskStatus } from '@/types'
import { LABEL_META, scoreTask, sortByPriority, type ClientSignals } from '@/lib/task-priority'
import { CirculoHecha, ESTADOS, PRIORIDADES, SelectorEstado, SelectorPrioridad, prioridadDe } from './prioridad'

export type Agrupar = 'estado' | 'prioridad' | 'cliente'

type Grupo = { id: string; titulo: string; dot: string; tareas: Task[]; plegadoInicial: boolean }

const fmt = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '')
const fmtMinutes = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`)
const porPosicion = (a: Task, b: Task) => Number(a.position) - Number(b.position)
const recientes = (a: Task, b: Task) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')

/**
 * Vista de lista, a la manera de Todoist o Things: una línea por tarea, lo
 * importante a la izquierda y los cambios rápidos (prioridad, estado, plan de
 * hoy) a un clic a la derecha. Las hechas van al final y plegadas.
 */
export function ListaTareas({
    tareas,
    signals,
    agrupar,
    hoy,
    working,
    canRegister,
    onHecha,
    onEstado,
    onPrioridad,
    onPlan,
    onPosponer,
    onEditar,
    onBorrar,
    onFacturar,
}: {
    tareas: Task[]
    signals: ClientSignals
    agrupar: Agrupar
    hoy: string
    working: boolean
    canRegister: (t: Task) => boolean
    onHecha: (t: Task) => void
    onEstado: (t: Task, s: TaskStatus) => void
    onPrioridad: (t: Task, c: TaskConsequence | null) => void
    onPlan: (t: Task) => void
    onPosponer: (t: Task) => void
    onEditar: (t: Task) => void
    onBorrar: (t: Task) => void
    onFacturar: (t: Task) => void
}) {
    const grupos = useMemo<Grupo[]>(() => {
        const abiertas = tareas.filter((t) => t.status !== 'done')
        const hechas = tareas.filter((t) => t.status === 'done').sort(recientes)
        const grupoHechas: Grupo = { id: 'done', titulo: 'Hechas', dot: 'bg-emerald-500', tareas: hechas, plegadoInicial: true }

        if (agrupar === 'estado') {
            return [
                ...ESTADOS.filter((e) => e.id !== 'done').map((e) => ({
                    id: e.id,
                    titulo: e.label,
                    dot: e.dot,
                    tareas: abiertas.filter((t) => t.status === e.id).sort(porPosicion),
                    plegadoInicial: false,
                })),
                grupoHechas,
            ]
        }
        if (agrupar === 'prioridad') {
            const ordenadas = sortByPriority(abiertas, signals)
            return [
                ...PRIORIDADES.map((p) => ({
                    id: p.id,
                    titulo: p.label,
                    dot: p.id === 'urgente' ? 'bg-red-500' : p.id === 'alta' ? 'bg-orange-500' : p.id === 'media' ? 'bg-amber-400' : 'bg-slate-400',
                    tareas: ordenadas.filter((t) => prioridadDe(t).id === p.id),
                    plegadoInicial: false,
                })),
                grupoHechas,
            ]
        }
        // Por cliente: alfabético, y "Sin cliente" al final.
        const nombres = [...new Set(abiertas.map((t) => t.clients?.name ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')))
        return [
            ...nombres.map((n) => ({
                id: `c:${n}`,
                titulo: n || 'Sin cliente',
                dot: n ? 'bg-teal-500' : 'bg-slate-400',
                tareas: sortByPriority(abiertas.filter((t) => (t.clients?.name ?? '') === n), signals),
                plegadoInicial: false,
            })),
            grupoHechas,
        ]
    }, [tareas, signals, agrupar])

    // Solo se guarda lo que el usuario cambió; el resto sigue su valor inicial.
    const [plegados, setPlegados] = useState<Record<string, boolean>>({})
    const estaPlegado = (g: Grupo) => plegados[g.id] ?? g.plegadoInicial

    const visibles = grupos.filter((g) => g.tareas.length > 0)
    if (visibles.length === 0) {
        return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hay tareas que coincidan.</p>
    }

    return (
        <div className="space-y-3">
            {visibles.map((g) => {
                const plegado = estaPlegado(g)
                return (
                    <section key={g.id} className="rounded-xl border bg-card">
                        <button
                            type="button"
                            onClick={() => setPlegados((p) => ({ ...p, [g.id]: !plegado }))}
                            aria-expanded={!plegado}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
                        >
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${plegado ? '' : 'rotate-90'}`} />
                            <span className={`h-2 w-2 rounded-full ${g.dot}`} />
                            <h3 className="text-sm font-semibold">{g.titulo}</h3>
                            <span className="text-xs text-muted-foreground tabular-nums">{g.tareas.length}</span>
                        </button>
                        {!plegado && (
                            <ul className="divide-y border-t">
                                {g.tareas.map((t) => (
                                    <Fila
                                        key={t.id}
                                        t={t}
                                        signals={signals}
                                        hoy={hoy}
                                        working={working}
                                        facturable={canRegister(t)}
                                        onHecha={onHecha}
                                        onEstado={onEstado}
                                        onPrioridad={onPrioridad}
                                        onPlan={onPlan}
                                        onPosponer={onPosponer}
                                        onEditar={onEditar}
                                        onBorrar={onBorrar}
                                        onFacturar={onFacturar}
                                    />
                                ))}
                            </ul>
                        )}
                    </section>
                )
            })}
        </div>
    )
}

function Fila({
    t,
    signals,
    hoy,
    working,
    facturable,
    onHecha,
    onEstado,
    onPrioridad,
    onPlan,
    onPosponer,
    onEditar,
    onBorrar,
    onFacturar,
}: {
    t: Task
    signals: ClientSignals
    hoy: string
    working: boolean
    facturable: boolean
    onHecha: (t: Task) => void
    onEstado: (t: Task, s: TaskStatus) => void
    onPrioridad: (t: Task, c: TaskConsequence | null) => void
    onPlan: (t: Task) => void
    onPosponer: (t: Task) => void
    onEditar: (t: Task) => void
    onBorrar: (t: Task) => void
    onFacturar: (t: Task) => void
}) {
    const hecha = t.status === 'done'
    const vencida = !!t.due_date && !hecha && t.due_date < hoy
    const enHoy = t.planned_for === hoy
    const p = scoreTask(t, signals)
    const pasos = t.task_subtasks ?? []
    const meta = [
        t.clients?.name,
        t.estimated_minutes != null ? fmtMinutes(t.estimated_minutes) : null,
        t.amount != null ? `$${t.amount.toFixed(2)}` : t.hours != null ? `${t.hours} h` : null,
        pasos.length > 0 ? `${pasos.filter((s) => s.done).length}/${pasos.length} pasos` : null,
    ].filter(Boolean) as string[]

    return (
        <li className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-accent/40 sm:flex-nowrap">
            <CirculoHecha hecha={hecha} onClick={() => onHecha(t)} />

            <button type="button" onClick={() => onEditar(t)} className="min-w-0 flex-1 text-left" title={hecha ? undefined : p.reason}>
                <span className={`block truncate text-sm ${hecha ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                    {!hecha && (t.consequence != null || t.clarity != null || t.due_date != null) && (
                        <span className="mr-1.5" aria-label={LABEL_META[p.label].text}>
                            {LABEL_META[p.label].emoji}
                        </span>
                    )}
                    {t.title}
                </span>
                {(meta.length > 0 || t.due_date || t.recurrence) && (
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {t.due_date && <span className={vencida ? 'font-medium text-red-600 dark:text-red-400' : ''}>{vencida ? 'Venció' : 'Para'} {fmt(t.due_date)}</span>}
                        {t.due_date && meta.length > 0 && <span aria-hidden>·</span>}
                        <span className="truncate">{meta.join(' · ')}</span>
                        {t.recurrence && <Repeat className="h-3 w-3 shrink-0" aria-label="Se repite" />}
                    </span>
                )}
            </button>

            <div className="ml-8 flex shrink-0 items-center gap-1.5 sm:ml-0">
                {/* Acciones secundarias: aparecen al pasar por encima (siempre en táctil). */}
                <div className="flex items-center opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    {!hecha && (
                        <button type="button" onClick={() => onPosponer(t)} title="Posponer a mañana" aria-label="Posponer a mañana" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                            <Clock className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {facturable && (
                        <button type="button" onClick={() => onFacturar(t)} disabled={working} title="Registrar como ítem pendiente de facturar" aria-label="Registrar para facturar" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
                            <ReceiptText className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <button type="button" onClick={() => onEditar(t)} title="Editar" aria-label="Editar" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => onBorrar(t)} title="Eliminar" aria-label="Eliminar" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
                {!hecha && (
                    <button
                        type="button"
                        onClick={() => onPlan(t)}
                        title={enHoy ? 'Está en el plan de hoy. Sacar' : 'Poner en el plan de hoy'}
                        aria-label={enHoy ? 'Sacar del plan de hoy' : 'Poner en el plan de hoy'}
                        aria-pressed={enHoy}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition ${
                            enHoy ? 'bg-teal-600 text-white ring-teal-600 hover:bg-teal-700' : 'text-muted-foreground ring-border hover:bg-accent hover:text-foreground'
                        }`}
                    >
                        <CalendarCheck className="h-3 w-3" /> Hoy
                    </button>
                )}
                {!hecha && <SelectorPrioridad task={t} onCambiar={(c) => onPrioridad(t, c)} />}
                <SelectorEstado task={t} onCambiar={(s) => onEstado(t, s)} />
            </div>
        </li>
    )
}
