'use client'

/** Secciones del cerebro con su guía de preguntas, guardado por sección y el porcentaje completo. */
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MIN_COMPLETA, SECCIONES, completitud, type SeccionCerebro } from '@/lib/agent/cerebro-secciones'
import { guardarCerebroAccion } from '../procesos-acciones'

const ENTREVISTA = 'Entrevístame para completar el cerebro de la empresa: revisa qué secciones faltan y pregúntame una a la vez.'

export function EditorCerebro({ inicial }: { inicial: Partial<Record<SeccionCerebro, string>> }) {
    const [guardado, setGuardado] = useState(inicial)
    const [textos, setTextos] = useState(inicial)
    const [busy, start] = useTransition()
    const comp = completitud(guardado)

    const guardar = (k: SeccionCerebro) => start(async () => {
        const r = await guardarCerebroAccion(k, textos[k] ?? '')
        if (r.ok) { setGuardado((g) => ({ ...g, [k]: (textos[k] ?? '').trim() })); toast.success(r.mensaje) } else toast.error(r.mensaje)
    })

    return (
        <div className="space-y-4">
            <section className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="font-semibold">{comp.pct} % completo <span className="font-normal text-muted-foreground">· {comp.completas} de {comp.total} secciones</span></p>
                        <div className="mt-2 h-2 w-56 max-w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={comp.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cerebro completo">
                            <div className="h-full rounded-full bg-[#D4A72C] transition-all" style={{ width: `${comp.pct}%` }} />
                        </div>
                    </div>
                    <Button variant="outline" asChild><Link href={`/oficina/direccion?q=${encodeURIComponent(ENTREVISTA)}`}><MessageCircle /> Que Ramón me entreviste</Link></Button>
                </div>
            </section>

            {SECCIONES.map((s) => {
                const texto = textos[s.key] ?? ''
                const cambiado = texto.trim() !== (guardado[s.key] ?? '').trim()
                const completa = (guardado[s.key] ?? '').trim().length >= MIN_COMPLETA
                return (
                    <section key={s.key} className="rounded-2xl border bg-card p-4" aria-labelledby={`sec-${s.key}`}>
                        <div className="flex items-center justify-between gap-2">
                            <h2 id={`sec-${s.key}`} className="font-semibold">{s.titulo}</h2>
                            {completa ? <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Completa</span> : <span className="text-xs text-amber-600 dark:text-amber-400">Falta</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{s.preguntas}</p>
                        <label htmlFor={`cerebro-${s.key}`} className="sr-only">{s.titulo}</label>
                        <Textarea id={`cerebro-${s.key}`} className="mt-2" rows={texto.length > 300 ? 6 : 4} value={texto} placeholder={`Ej.: ${s.ejemplo}`}
                            onChange={(e) => setTextos((t) => ({ ...t, [s.key]: e.target.value }))} />
                        <div className="mt-2 flex items-center justify-end gap-2">
                            {cambiado && <span className="text-xs text-muted-foreground">Sin guardar</span>}
                            <Button size="sm" disabled={busy || !cambiado} onClick={() => guardar(s.key)}>Guardar</Button>
                        </div>
                    </section>
                )
            })}
        </div>
    )
}
