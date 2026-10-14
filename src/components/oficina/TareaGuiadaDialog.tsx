'use client'

/**
 * Una tarea guiada de principio a fin: pide los datos que necesita, muestra al agente trabajando y presenta
 * el entregable (ya guardado). Dentro de un plan, «Aprobar y seguir» marca el paso y abre el siguiente.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Copy, LoaderCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MessageText } from '@/components/agent/MessageText'
import { DEPARTAMENTOS } from '@/lib/agent/shared'
import { TAREA, type TareaGuiada } from '@/lib/agent/tareas-catalogo'
import type { Entregable, EventoTarea } from '@/lib/agent/entregables'
import { pasoEstadoAccion } from '@/app/oficina/procesos-acciones'

/** Lee el avance en vivo de /api/oficina/tarea (una línea JSON por evento). */
async function correrTarea(tareaId: string, valores: Record<string, string>, pasoId: string | null | undefined, onEvento: (e: EventoTarea) => void, signal: AbortSignal) {
    const r = await fetch('/api/oficina/tarea', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tareaId, valores, pasoId }), signal })
    if (!r.ok || !r.body) throw new Error(r.status === 401 ? 'Tu sesión expiró: vuelve a entrar.' : 'No se pudo iniciar la tarea.')
    const lector = r.body.pipeThrough(new TextDecoderStream()).getReader()
    let resto = ''
    for (;;) {
        const { value, done } = await lector.read()
        if (done) break
        resto += value
        const lineas = resto.split('\n')
        resto = lineas.pop() ?? ''
        for (const l of lineas) if (l.trim()) onEvento(JSON.parse(l) as EventoTarea)
    }
}

type Props = {
    tarea: TareaGuiada
    abierto: boolean
    onAbierto: (v: boolean) => void
    pasoId?: string | null
    iniciales?: Record<string, string>
    /** Encabezado extra dentro de un plan («Paso 3 de 7 · …»). */
    contexto?: string
}

export function TareaGuiadaDialog({ tarea, abierto, onAbierto, pasoId, iniciales, contexto }: Props) {
    const info = DEPARTAMENTOS[tarea.departamento]
    const router = useRouter()
    const [valores, setValores] = useState<Record<string, string>>(iniciales ?? {})
    const [resultado, setResultado] = useState<Entregable | null>(null)
    const [corriendo, setCorriendo] = useState(false)
    const [vivo, setVivo] = useState('')
    const [consulta, setConsulta] = useState<string | null>(null)
    const [guardando, start] = useTransition()
    const [segundos, setSegundos] = useState(0)
    const cancelar = useRef<AbortController | null>(null)
    const trabajando = corriendo || guardando

    useEffect(() => () => cancelar.current?.abort(), [])

    useEffect(() => {
        if (!corriendo) return
        const t0 = Date.now()
        const id = setInterval(() => setSegundos(Math.round((Date.now() - t0) / 1000)), 1000)
        return () => { clearInterval(id); setSegundos(0) }
    }, [corriendo])

    const faltan = tarea.campos.filter((c) => c.requerido && !valores[c.key]?.trim())
    const ejecutar = async () => {
        const ctrl = new AbortController()
        cancelar.current = ctrl
        setCorriendo(true); setVivo(''); setConsulta(null)
        let fin: Entregable | null = null
        try {
            await correrTarea(tarea.id, valores, pasoId, (e) => {
                if (e.t === 'paso') setVivo('')
                else if (e.t === 'texto') { setVivo((v) => v + e.d); setConsulta(null) }
                else if (e.t === 'herramienta') setConsulta(e.n)
                else if (e.t === 'fin') fin = e.entregable
                else if (e.t === 'error') throw new Error(e.mensaje)
            }, ctrl.signal)
            if (!fin) throw new Error('La tarea se cortó antes de terminar. Inténtalo de nuevo.')
            setResultado(fin)
            toast.success('Entregable listo y guardado.')
            router.refresh()
        } catch (e) {
            if (!ctrl.signal.aborted) toast.error(e instanceof Error ? e.message : 'La tarea falló.')
        } finally {
            setCorriendo(false)
        }
    }
    const aprobarYSeguir = () => start(async () => {
        if (!pasoId || !resultado) return
        const r = await pasoEstadoAccion(pasoId, 'hecho', resultado.id)
        if (r.ok) { toast.success(r.mensaje); onAbierto(false) } else toast.error(r.mensaje)
    })
    const copiar = async () => {
        if (!resultado) return
        try { await navigator.clipboard.writeText(resultado.contenido); toast.success('Copiado') } catch { toast.error('No se pudo copiar') }
    }
    const siguientes = (tarea.siguiente ?? []).map((id) => TAREA.get(id)).filter(Boolean) as TareaGuiada[]

    return (
        <Dialog open={abierto} onOpenChange={(v) => { if (!guardando) onAbierto(v) }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!guardando}>
                <DialogHeader>
                    {contexto && <p className="text-xs font-medium uppercase tracking-wide" style={{ color: info.color }}>{contexto}</p>}
                    <DialogTitle>{info.emoji} {tarea.titulo}</DialogTitle>
                    <DialogDescription>{tarea.para} · Lo hace {info.persona}.</DialogDescription>
                </DialogHeader>

                {!resultado && !trabajando && (
                    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (faltan.length === 0) void ejecutar() }}>
                        {tarea.campos.map((c) => (
                            <label key={c.key} className="grid gap-1 text-sm" htmlFor={`campo-${tarea.id}-${c.key}`}>
                                <span className="font-medium">{c.etiqueta}{c.requerido && <span className="text-destructive"> *</span>}</span>
                                {c.tipo === 'parrafo' ? (
                                    <Textarea id={`campo-${tarea.id}-${c.key}`} rows={3} value={valores[c.key] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))} />
                                ) : (
                                    <Input id={`campo-${tarea.id}-${c.key}`} type={c.tipo === 'fecha' ? 'date' : 'text'} inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                                        value={valores[c.key] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))} />
                                )}
                                {c.ayuda && <span className="text-xs text-muted-foreground">{c.ayuda}</span>}
                            </label>
                        ))}
                        {tarea.campos.length === 0 && <p className="text-sm text-muted-foreground">No necesita datos: {info.persona} trabaja con lo que ya sabe de la empresa.</p>}
                        <p className="text-xs text-muted-foreground">Usa el cerebro de la empresa{tarea.herramientas.length ? ' y tus datos reales' : ''}{tarea.web ? ' y busca en la web' : ''}. Solo lee: no cambia nada.</p>
                        <div className="flex justify-end">
                            <Button type="submit" disabled={faltan.length > 0}>Hacerlo con {info.persona} <ArrowRight /></Button>
                        </div>
                    </form>
                )}

                {corriendo && !resultado && (
                    <div className="grid gap-3">
                        <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
                            <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" style={{ color: info.color }} />
                            <span className="font-medium">{consulta ? `${consulta}…` : vivo ? `${info.persona} está escribiendo…` : `${info.persona} está revisando tus datos…`}</span>
                            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{segundos} s</span>
                        </div>
                        {vivo ? <div className="rounded-xl border bg-muted/30 p-4"><MessageText text={vivo} /></div>
                            : <p className="text-sm text-muted-foreground">Suele tardar entre 30 segundos y 2 minutos. Puedes cerrar esta ventana: el entregable se guarda igual en la página de {info.persona}.</p>}
                    </div>
                )}

                {resultado && (
                    <div className="grid gap-3">
                        <div className="rounded-xl border bg-muted/30 p-4"><MessageText text={resultado.contenido} /></div>
                        <p className="text-xs text-muted-foreground">Guardado en los entregables de {info.persona}. Revisa cifras y nombres antes de enviarlo.</p>
                        {!pasoId && siguientes.length > 0 && (
                            <p className="text-sm">Lo que suele venir después: {siguientes.map((s) => <span key={s.id} className="font-medium">{s.titulo}</span>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ' · ', el] : [el]), [])}</p>
                        )}
                        <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="ghost" onClick={() => setResultado(null)} disabled={trabajando}><RotateCcw /> Rehacer</Button>
                            <Button variant="outline" onClick={() => void copiar()}><Copy /> Copiar</Button>
                            {pasoId
                                ? <Button onClick={aprobarYSeguir} disabled={trabajando}>{trabajando ? 'Guardando…' : 'Aprobar y seguir'} <ArrowRight /></Button>
                                : <Button onClick={() => onAbierto(false)}>Listo</Button>}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
