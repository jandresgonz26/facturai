'use client'

import { useMemo } from 'react'
import { CalendarClock, Sparkles } from 'lucide-react'
import type { Task } from '@/types'
import { Button } from '@/components/ui/button'
import { LABEL_META, type ClientSignals } from '@/lib/task-priority'
import { DEFAULT_WINDOWS, buildSchedule, formatTime, type Window } from '@/lib/schedule'

/**
 * Horario del día: reparte las tareas comprometidas en las horas libres.
 *
 * Se dibuja como una lista vertical con la hora a la izquierda, no como una
 * rejilla de calendario: para una jornada de una persona, la rejilla añade
 * ruido visual sin decir nada más.
 */
export function DaySchedule({
    tasks,
    windows,
    signals,
    nowMinutes,
    usingDefaults,
    onAskAssistant,
}: {
    tasks: Task[]
    windows: Window[]
    signals?: ClientSignals
    nowMinutes: number
    usingDefaults: boolean
    onAskAssistant: () => void
}) {
    const schedule = useMemo(
        () => buildSchedule(tasks, windows.length ? windows : DEFAULT_WINDOWS, { signals, nowMinutes }),
        [tasks, windows, signals, nowMinutes]
    )

    const horas = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`)

    return (
        <section className="rounded-xl border bg-card p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-teal-600" />
                    <h2 className="text-sm font-semibold">Tu horario de hoy</h2>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground">
                        {schedule.freeMinutes > 0 ? `${horas(schedule.freeMinutes)} libres` : 'sin holgura'}
                    </span>
                    <Button size="sm" variant="outline" onClick={onAskAssistant}>
                        <Sparkles className="w-3.5 h-3.5" /> Ajustar
                    </Button>
                </div>
            </div>

            {usingDefaults && (
                <p className="text-[11px] text-muted-foreground mb-3">
                    Horario estándar. Dile al asistente desde cuándo estás disponible y lo recalcula.
                </p>
            )}

            {schedule.blocks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                    No queda tiempo disponible hoy, o no hay tareas con las que armarlo.
                </p>
            ) : (
                <ol className="relative">
                    {schedule.blocks.map((b, i) => {
                        const meta = LABEL_META[b.priority.label]
                        const prev = schedule.blocks[i - 1]
                        // Un salto grande entre bloques es una pausa real del día.
                        const gap = prev && b.start - prev.end >= 30
                        return (
                            <li key={b.task.id}>
                                {gap && (
                                    <div className="flex items-center gap-3 py-1.5 pl-[4.5rem] text-[11px] text-muted-foreground">
                                        <span className="h-px flex-1 bg-border" />
                                        {horas(b.start - prev.end)} libre
                                        <span className="h-px flex-1 bg-border" />
                                    </div>
                                )}
                                <div
                                    className={`flex items-start gap-3 rounded-lg px-2 py-2 transition-colors ${
                                        b.inProgress ? 'bg-teal-50 dark:bg-teal-900/20' : b.past ? 'opacity-45' : ''
                                    }`}
                                >
                                    <div className="w-16 shrink-0 pt-0.5 text-right">
                                        <p className="text-xs font-medium tabular-nums">{formatTime(b.start)}</p>
                                        <p className="text-[10px] text-muted-foreground tabular-nums">{horas(b.end - b.start)}</p>
                                    </div>
                                    <span className={`mt-1 w-1 shrink-0 self-stretch rounded-full ${meta.border.replace('border-l-', 'bg-')}`} />
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-sm leading-5 ${b.past ? 'line-through' : ''}`}>{b.task.title}</p>
                                        {b.task.clients?.name && (
                                            <p className="text-[11px] text-muted-foreground truncate">{b.task.clients.name}</p>
                                        )}
                                    </div>
                                    {b.inProgress && (
                                        <span className="shrink-0 self-center rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-medium text-white">
                                            ahora
                                        </span>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ol>
            )}

            {schedule.overflow.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                    <p className="text-[11px] text-muted-foreground">
                        No cabe{schedule.overflow.length === 1 ? '' : 'n'} hoy:{' '}
                        {schedule.overflow.map((o) => o.task.title).join(', ')}
                    </p>
                </div>
            )}
        </section>
    )
}
