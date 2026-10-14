'use client'

/**
 * Un plan guiado paso a paso. En borrador se revisa (quitar pasos, activar o descartar). Activo, el paso que
 * toca se destaca con su acción: hacer su tarea guiada con el agente, hablar con él o marcarlo hecho.
 */
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowRight, Check, CircleSlash, ListPlus, MessageCircle, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageText } from '@/components/agent/MessageText'
import { DEPARTAMENTOS } from '@/lib/agent/shared'
import { TAREA } from '@/lib/agent/tareas-catalogo'
import type { Paso, PlanConPasos } from '@/lib/agent/planes'
import { estadoPlanAccion, pasoATareaAccion, pasoEstadoAccion, quitarPasoAccion } from '@/app/oficina/procesos-acciones'
import { TareaGuiadaDialog } from './TareaGuiadaDialog'

const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
const hoy = () => new Date().toLocaleDateString('en-CA')

export function PlanVista({ plan }: { plan: PlanConPasos }) {
    const [busy, start] = useTransition()
    const [tareaDe, setTareaDe] = useState<Paso | null>(null)
    const borrador = plan.estado === 'borrador'
    const vivos = plan.pasos.filter((p) => p.estado !== 'omitido')
    const numero = (p: Paso) => vivos.findIndex((x) => x.id === p.id) + 1
    const pct = plan.total ? Math.round((plan.hechos / plan.total) * 100) : 0

    const accion = (fn: () => Promise<{ ok: boolean; mensaje: string }>) => start(async () => {
        const r = await fn()
        if (r.ok) toast.success(r.mensaje); else toast.error(r.mensaje)
    })

    return (
        <div className="space-y-4">
            {borrador && (
                <div className="flex flex-col gap-3 rounded-2xl border border-[#D4A72C]/50 bg-[#D4A72C]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="font-semibold">Revisa el plan antes de ponerlo en marcha</p>
                        <p className="text-sm text-muted-foreground">Quita los pasos que no te convenzan. Al activarlo, la Oficina te guía paso a paso y los informes de los lunes te recuerdan dónde vas.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm('¿Descartar este plan?')) accion(() => estadoPlanAccion(plan.id, 'descartado')) }}>Descartar</Button>
                        <Button disabled={busy} onClick={() => accion(() => estadoPlanAccion(plan.id, 'activo'))}>Activar plan <ArrowRight /></Button>
                    </div>
                </div>
            )}

            {plan.estado === 'completado' && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 font-semibold">🎉 Plan completado. Buen trabajo.</div>}

            <section className="rounded-2xl border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-semibold">{plan.estado === 'activo' && plan.actual ? `Paso ${numero(plan.actual)} de ${plan.total}` : `${plan.total} pasos`}</h2>
                    <span className="text-sm tabular-nums text-muted-foreground">{plan.hechos}/{plan.total} hechos</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del plan">
                    <div className="h-full rounded-full bg-[#D4A72C] transition-all" style={{ width: `${pct}%` }} />
                </div>

                <ol className="mt-4 space-y-2">
                    {plan.pasos.map((p) => {
                        const info = DEPARTAMENTOS[p.departamento]
                        const tarea = p.tarea_guiada ? TAREA.get(p.tarea_guiada) : null
                        const toca = plan.actual?.id === p.id
                        const vencido = p.estado === 'pendiente' && p.fecha && p.fecha < hoy()
                        const pedido = `Paso del plan «${plan.titulo}»: ${p.titulo}.${p.descripcion ? ` ${p.descripcion}` : ''} Ayúdame a hacerlo.`
                        return (
                            <li key={p.id} className={`rounded-xl border p-3 ${toca ? 'border-2' : ''} ${p.estado !== 'pendiente' ? 'opacity-70' : ''}`} style={toca ? { borderColor: info.color } : undefined} aria-current={toca ? 'step' : undefined}>
                                <div className="flex items-start gap-3">
                                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${p.estado === 'hecho' ? 'bg-emerald-500 text-white' : 'border'}`}>
                                        {p.estado === 'hecho' ? <Check className="h-4 w-4" /> : p.estado === 'omitido' ? <CircleSlash className="h-4 w-4 text-muted-foreground" /> : numero(p)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className={`font-medium leading-snug ${p.estado === 'omitido' ? 'line-through' : ''}`}>{p.titulo}</div>
                                        <div className="mt-0.5 text-xs text-muted-foreground">
                                            {info.emoji} {info.persona}
                                            {p.fecha && <> · <span className={vencido ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>{vencido ? 'venció el ' : 'para el '}{fechaCorta(p.fecha)}</span></>}
                                            {tarea && <> · tarea guiada: {tarea.titulo}</>}
                                        </div>
                                        {p.descripcion && <p className="mt-1 text-sm text-muted-foreground">{p.descripcion}</p>}

                                        {p.entregable && (
                                            <details className="mt-2">
                                                <summary className="cursor-pointer text-xs font-medium">Entregable: {p.entregable.titulo}{p.entregable.estado === 'aprobado' ? ' · aprobado' : ''}</summary>
                                                <div className="mt-2 rounded-xl border bg-muted/30 p-3"><MessageText text={p.entregable.contenido} /></div>
                                            </details>
                                        )}

                                        {toca && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {tarea && <Button size="sm" disabled={busy} onClick={() => setTareaDe(p)} style={{ background: info.color }} className="text-white hover:opacity-90"><Sparkles /> {p.entregable ? 'Rehacer' : 'Hacerlo ahora'} con {info.persona}</Button>}
                                                {tarea && p.entregable && <Button size="sm" disabled={busy} onClick={() => accion(() => pasoEstadoAccion(p.id, 'hecho', p.entregable!.id))}>Aprobar y seguir <ArrowRight /></Button>}
                                                {!tarea && <Button size="sm" variant="outline" asChild><Link href={`/oficina/${p.departamento}?q=${encodeURIComponent(pedido)}`}><MessageCircle /> Hablar con {info.persona}</Link></Button>}
                                                {!tarea && <Button size="sm" disabled={busy} onClick={() => accion(() => pasoEstadoAccion(p.id, 'hecho'))}><Check /> Ya lo hice</Button>}
                                                {!p.task_id && <Button size="sm" variant="ghost" disabled={busy} onClick={() => accion(() => pasoATareaAccion(p.id))}><ListPlus /> A mis tareas</Button>}
                                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => accion(() => pasoEstadoAccion(p.id, 'omitido'))}>Saltar</Button>
                                            </div>
                                        )}
                                        {plan.estado === 'activo' && !toca && p.estado === 'pendiente' && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => accion(() => pasoEstadoAccion(p.id, 'hecho'))}>Marcar hecho</Button>
                                                {!p.task_id && <Button size="sm" variant="ghost" disabled={busy} onClick={() => accion(() => pasoATareaAccion(p.id))}>A mis tareas</Button>}
                                            </div>
                                        )}
                                        {p.estado !== 'pendiente' && plan.estado !== 'borrador' && (
                                            <button type="button" className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline" disabled={busy} onClick={() => accion(() => pasoEstadoAccion(p.id, 'pendiente'))}>Reabrir</button>
                                        )}
                                    </div>
                                    {borrador && (
                                        <button type="button" aria-label={`Quitar el paso ${p.titulo}`} disabled={busy} onClick={() => accion(() => quitarPasoAccion(p.id))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ol>
            </section>

            {plan.estado === 'activo' && (
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => accion(() => estadoPlanAccion(plan.id, 'pausado'))}>Pausar plan</Button>
                </div>
            )}
            {plan.estado === 'pausado' && (
                <div className="flex justify-end gap-2">
                    <Button size="sm" disabled={busy} onClick={() => accion(() => estadoPlanAccion(plan.id, 'activo'))}>Reanudar plan</Button>
                </div>
            )}

            {tareaDe?.tarea_guiada && TAREA.get(tareaDe.tarea_guiada) && (
                <TareaGuiadaDialog key={tareaDe.id} tarea={TAREA.get(tareaDe.tarea_guiada)!} abierto onAbierto={(v) => { if (!v) setTareaDe(null) }}
                    pasoId={tareaDe.id} iniciales={tareaDe.datos} contexto={`Paso ${numero(tareaDe)} de ${plan.total} · ${plan.titulo}`} />
            )}
        </div>
    )
}
