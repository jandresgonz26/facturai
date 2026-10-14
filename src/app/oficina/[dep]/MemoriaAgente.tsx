'use client'

/** Lo que este agente recuerda siempre (sus recuerdos y los generales). Se puede añadir o quitar a mano. */
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Brain, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Departamento } from '@/lib/agent/shared'
import { olvidarAccion, recordarAccion } from './acciones'

export function MemoriaAgente({ dep, persona, recuerdos }: { dep: Departamento; persona: string; recuerdos: { id: string; hecho: string; general: boolean }[] }) {
    const [texto, setTexto] = useState('')
    const [busy, start] = useTransition()
    return (
        <section className="rounded-2xl border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Brain className="h-4 w-4" /> Lo que {persona} recuerda</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
                {recuerdos.map((r) => (
                    <li key={r.id} className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">{r.hecho}{r.general && <span className="ml-1 text-xs text-muted-foreground">(para todos)</span>}</span>
                        <button type="button" aria-label="Olvidar" title="Olvidar" disabled={busy} onClick={() => start(() => olvidarAccion(dep, r.id))} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                    </li>
                ))}
                {recuerdos.length === 0 && <li className="text-xs text-muted-foreground">Nada todavía. Dile «recuerda que…» en el chat o escríbelo aquí.</li>}
            </ul>
            <form className="mt-3 flex gap-2" action={() => start(async () => { const r = await recordarAccion(dep, texto); if (r.ok) setTexto(''); else toast.error(r.mensaje) })}>
                <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Algo que ${persona} deba recordar…`} aria-label="Nuevo recuerdo" className="h-8 text-sm" />
                <Button type="submit" size="sm" variant="outline" disabled={busy || texto.trim().length < 3}>Guardar</Button>
            </form>
        </section>
    )
}
