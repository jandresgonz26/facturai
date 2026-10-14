'use client'

/** Nivel de confianza de un agente: lo interno (tareas, notas, objetivos…) sin pedirte confirmación. */
import { useState, useTransition } from 'react'
import { ShieldCheck } from 'lucide-react'
import { autonomiaAccion } from '@/app/oficina/clic-acciones'

export function Confianza({ dep, persona, inicial, internas }: { dep: string; persona: string; inicial: boolean; internas: string[] }) {
    const [on, setOn] = useState(inicial)
    const [busy, start] = useTransition()
    const cambiar = () => { const v = !on; setOn(v); start(() => autonomiaAccion(dep, v)) }
    return (
        <section className="rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Confianza</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{on ? `${persona} hace lo interno sin preguntarte y te dice qué hizo.` : `${persona} te pide confirmación para todo.`}</p>
                </div>
                <button type="button" role="switch" aria-checked={on} aria-label="Lo interno sin preguntar" disabled={busy} onClick={cambiar}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
            </div>
            {internas.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Interno: {internas.join(' · ')}. Correos, facturas, cobros y cotizaciones siempre te piden confirmación.</p>}
            {internas.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{persona} no tiene acciones internas: todo lo que hace te pide confirmación.</p>}
        </section>
    )
}
