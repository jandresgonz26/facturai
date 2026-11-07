'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Flag } from 'lucide-react'
import type { Task, TaskConsequence, TaskStatus } from '@/types'

/**
 * Prioridad a la vista y a un clic. No es un campo nuevo: es la respuesta a
 * "si esto no se hace esta semana, ¿qué pasa?" (consequence), que es lo que ya
 * mueve la prioridad calculada. Aquí se le pone el nombre corto de siempre
 * (Urgente, Alta, Media, Normal) para poder cambiarla sin abrir el formulario.
 */
export type NivelPrioridad = 'urgente' | 'alta' | 'media' | 'normal'

export const PRIORIDADES: { id: NivelPrioridad; consequence: TaskConsequence | null; label: string; hint: string; flag: string; pill: string }[] = [
    { id: 'urgente', consequence: 'client_at_risk', label: 'Urgente', hint: 'Puedo perder el cliente o el trabajo', flag: 'text-red-600 dark:text-red-400', pill: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900' },
    { id: 'alta', consequence: 'payment_delayed', label: 'Alta', hint: 'Se retrasa un cobro', flag: 'text-orange-600 dark:text-orange-400', pill: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900' },
    { id: 'media', consequence: 'client_waiting', label: 'Media', hint: 'Un cliente se queda esperando', flag: 'text-amber-500 dark:text-amber-400', pill: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900' },
    { id: 'normal', consequence: null, label: 'Normal', hint: 'Si se retrasa, no pasa nada grave', flag: 'text-muted-foreground', pill: 'bg-muted text-muted-foreground ring-border' },
]

export function prioridadDe(task: Pick<Task, 'consequence'>) {
    const c = task.consequence
    return PRIORIDADES.find((p) => p.consequence === c) ?? PRIORIDADES[3]
}

export const ESTADOS: { id: TaskStatus; label: string; dot: string; pill: string }[] = [
    { id: 'todo', label: 'Por hacer', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900' },
    { id: 'doing', label: 'En curso', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900' },
    { id: 'done', label: 'Hecha', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900' },
]

/** Menú pequeño anclado a un botón: se cierra al elegir, al hacer clic fuera o con Escape. */
function MiniMenu<T extends string>({
    etiqueta,
    boton,
    opciones,
    valor,
    onElegir,
    alinear = 'right',
}: {
    etiqueta: string
    boton: (abierto: boolean) => React.ReactNode
    opciones: { id: T; label: string; hint?: string; icono?: React.ReactNode }[]
    valor: T
    onElegir: (id: T) => void
    alinear?: 'left' | 'right'
}) {
    const [abierto, setAbierto] = useState(false)
    const raiz = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!abierto) return
        const fuera = (e: MouseEvent) => {
            if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
        }
        const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
        document.addEventListener('mousedown', fuera)
        document.addEventListener('keydown', tecla)
        return () => {
            document.removeEventListener('mousedown', fuera)
            document.removeEventListener('keydown', tecla)
        }
    }, [abierto])

    return (
        <div ref={raiz} className="relative" onDoubleClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={abierto}
                aria-label={etiqueta}
                title={etiqueta}
                onClick={(e) => {
                    e.stopPropagation()
                    setAbierto((a) => !a)
                }}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {boton(abierto)}
            </button>
            {abierto && (
                <div
                    role="menu"
                    className={`absolute z-40 mt-1 w-60 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg ${alinear === 'right' ? 'right-0' : 'left-0'}`}
                >
                    {opciones.map((o) => (
                        <button
                            key={o.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={o.id === valor}
                            onClick={(e) => {
                                e.stopPropagation()
                                setAbierto(false)
                                if (o.id !== valor) onElegir(o.id)
                            }}
                            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        >
                            <span className="mt-0.5 shrink-0">{o.icono}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block font-medium">{o.label}</span>
                                {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
                            </span>
                            {o.id === valor && <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * Bandera de prioridad. `sobreColor` es para las tarjetas del tablero, que van
 * a color sólido: ahí la píldora es blanca translúcida para que se lea.
 */
export function SelectorPrioridad({ task, onCambiar, sobreColor = false, compacto = false }: { task: Task; onCambiar: (c: TaskConsequence | null) => void; sobreColor?: boolean; compacto?: boolean }) {
    const actual = prioridadDe(task)
    return (
        <MiniMenu<NivelPrioridad>
            etiqueta={`Prioridad: ${actual.label}. Cambiar`}
            valor={actual.id}
            opciones={PRIORIDADES.map((p) => ({ id: p.id, label: p.label, hint: p.hint, icono: <Flag className={`h-4 w-4 ${p.flag}`} fill={p.id === 'normal' ? 'none' : 'currentColor'} /> }))}
            onElegir={(id) => onCambiar(PRIORIDADES.find((p) => p.id === id)!.consequence)}
            boton={() =>
                sobreColor ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white ring-1 ring-white/30 transition hover:bg-white/30">
                        <Flag className="h-3 w-3" fill={actual.id === 'normal' ? 'none' : 'currentColor'} />
                        {actual.label}
                    </span>
                ) : (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition hover:brightness-95 ${actual.pill}`}>
                        <Flag className={`h-3 w-3 ${actual.flag}`} fill={actual.id === 'normal' ? 'none' : 'currentColor'} />
                        {!compacto && actual.label}
                    </span>
                )
            }
        />
    )
}

export function SelectorEstado({ task, onCambiar }: { task: Task; onCambiar: (s: TaskStatus) => void }) {
    const actual = ESTADOS.find((e) => e.id === task.status) ?? ESTADOS[0]
    return (
        <MiniMenu<TaskStatus>
            etiqueta={`Estado: ${actual.label}. Cambiar`}
            valor={actual.id}
            opciones={ESTADOS.map((e) => ({ id: e.id, label: e.label, icono: <span className={`mt-1 block h-2 w-2 rounded-full ${e.dot}`} /> }))}
            onElegir={onCambiar}
            boton={() => (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition hover:brightness-95 ${actual.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${actual.dot}`} />
                    {actual.label}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                </span>
            )}
        />
    )
}

/** El círculo de "hecha": un clic la cierra, otro la reabre. */
export function CirculoHecha({ hecha, onClick, sobreColor = false }: { hecha: boolean; onClick: () => void; sobreColor?: boolean }) {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={hecha ? 'Reabrir tarea' : 'Marcar como hecha'}
            title={hecha ? 'Reabrir' : 'Marcar como hecha'}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                sobreColor
                    ? hecha
                        ? 'border-white bg-white text-emerald-600'
                        : 'border-white/80 hover:bg-white/25'
                    : hecha
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-500/10'
            }`}
        >
            {hecha && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
    )
}
