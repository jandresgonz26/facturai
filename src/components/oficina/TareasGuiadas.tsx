'use client'

/** Tareas guiadas de un agente: entregables listos para usar, cada uno con su formulario. */
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { tareasDe, type TareaGuiada } from '@/lib/agent/tareas-catalogo'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import { TareaGuiadaDialog } from './TareaGuiadaDialog'

export function TareasGuiadas({ dep }: { dep: Departamento }) {
    const info = DEPARTAMENTOS[dep]
    const [abierta, setAbierta] = useState<TareaGuiada | null>(null)
    const tareas = tareasDe(dep)
    if (tareas.length === 0) return null
    return (
        <section id="tareas" className="rounded-2xl border bg-card p-4" aria-labelledby={`tareas-${dep}`}>
            <h2 id={`tareas-${dep}`} className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" /> Tareas guiadas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Elige una, responde lo que te pide y {info.persona} te entrega el documento listo.</p>
            <ul className="mt-3 grid gap-2">
                {tareas.map((t) => (
                    <li key={t.id}>
                        <button type="button" onClick={() => setAbierta(t)}
                            className="w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{ outlineColor: info.color }}>
                            <div className="text-sm font-medium">{t.titulo}</div>
                            <div className="text-xs text-muted-foreground">{t.para}</div>
                        </button>
                    </li>
                ))}
            </ul>
            {abierta && <TareaGuiadaDialog key={abierta.id} tarea={abierta} abierto onAbierto={(v) => { if (!v) setAbierta(null) }} />}
        </section>
    )
}
