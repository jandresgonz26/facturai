'use client'

/**
 * Encargos: en qué está trabajando cada agente, cuáles esperan tu respuesta (con su pregunta, para responder
 * aquí mismo) y lo terminado con su resultado.
 */
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, Hand, LoaderCircle, CircleCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageText } from '@/components/agent/MessageText'
import { DEPARTAMENTOS } from '@/lib/agent/shared'
import type { Encargo } from '@/lib/agent/encargos'
import { cancelarEncargoAccion, responderEncargoAccion } from '@/app/oficina/clic-acciones'

const ESTADO = {
    pendiente: { texto: 'En cola', Icono: LoaderCircle, clase: 'text-muted-foreground' },
    trabajando: { texto: 'Trabajando', Icono: LoaderCircle, clase: 'text-emerald-600 dark:text-emerald-400' },
    esperando: { texto: 'Espera tu respuesta', Icono: Hand, clase: 'text-amber-600 dark:text-amber-400' },
    listo: { texto: 'Listo', Icono: CircleCheck, clase: 'text-emerald-600 dark:text-emerald-400' },
    cancelado: { texto: 'Cancelado', Icono: X, clase: 'text-muted-foreground' },
} as const
const fecha = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function ListaEncargos({ encargos, titulo, vacio, mostrarQuien = true }: { encargos: Encargo[]; titulo: string; vacio: string; mostrarQuien?: boolean }) {
    return (
        <section className="rounded-2xl border bg-card p-4" aria-label={titulo}>
            <h2 className="font-semibold">{titulo}</h2>
            {encargos.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{vacio}</p> : (
                <ul className="mt-2 divide-y">{encargos.map((e) => <Item key={e.id} e={e} mostrarQuien={mostrarQuien} />)}</ul>
            )}
        </section>
    )
}

function Item({ e, mostrarQuien }: { e: Encargo; mostrarQuien: boolean }) {
    const info = DEPARTAMENTOS[e.departamento]
    const ui = ESTADO[e.estado]
    const [respuesta, setRespuesta] = useState('')
    const [busy, start] = useTransition()
    const responder = () => start(async () => {
        const r = await responderEncargoAccion(e.id, respuesta)
        if (r.ok) { setRespuesta(''); toast.success(r.mensaje) } else toast.error(r.mensaje)
    })
    return (
        <li className="py-2.5">
            <details open={e.estado === 'esperando'}>
                <summary className="flex cursor-pointer items-start gap-2 text-sm">
                    <ui.Icono className={`mt-0.5 h-4 w-4 shrink-0 ${ui.clase} ${e.estado === 'trabajando' ? 'animate-spin' : ''}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                        <span className="font-medium">{e.titulo}</span>
                        <span className="block text-xs text-muted-foreground">{mostrarQuien && <>{info.emoji} {info.persona} · </>}<span className={ui.clase}>{ui.texto}</span>{e.proyecto && <> · {e.proyecto}</>} · {fecha(e.updated_at)}</span>
                    </span>
                </summary>
                <div className="mt-2 space-y-2 pl-6">
                    {e.estado === 'esperando' && e.pregunta && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                            <p className="text-sm"><span className="font-semibold">{info.persona} pregunta:</span> {e.pregunta}</p>
                            <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(ev) => { ev.preventDefault(); responder() }}>
                                <label htmlFor={`resp-${e.id}`} className="sr-only">Tu respuesta</label>
                                <Textarea id={`resp-${e.id}`} rows={2} value={respuesta} onChange={(ev) => setRespuesta(ev.target.value)} placeholder="Tu respuesta…" className="text-sm" />
                                <Button type="submit" size="sm" disabled={busy || !respuesta.trim()}>Responder</Button>
                            </form>
                        </div>
                    )}
                    {e.resultado && <div className="rounded-xl border bg-muted/30 p-3"><MessageText text={e.resultado} /></div>}
                    {!e.resultado && e.estado !== 'esperando' && <p className="text-xs text-muted-foreground">{e.detalle.slice(0, 400) || 'Sin detalle.'}</p>}
                    <div className="flex flex-wrap gap-1.5">
                        {e.resultado && <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(e.resultado!).then(() => toast.success('Copiado'), () => toast.error('No se pudo copiar'))}><Copy /> Copiar</Button>}
                        {['pendiente', 'trabajando', 'esperando'].includes(e.estado) && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { if (window.confirm(`¿Cancelar «${e.titulo}»?`)) start(() => cancelarEncargoAccion(e.id)) }}>Cancelar</Button>}
                    </div>
                </div>
            </details>
        </li>
    )
}
