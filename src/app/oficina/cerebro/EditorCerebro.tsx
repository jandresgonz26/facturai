'use client'

/**
 * Editor del cerebro: fuentes (web, PDF, imágenes, notas) de las que la IA propone las secciones, el texto de
 * cada sección con su guía, «Con IA» por sección y «Guardar todo». Nada llega al cerebro sin que José lo guarde.
 */
import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, FileText, Globe, LoaderCircle, MessageCircle, StickyNote, Trash2, Upload, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MIN_COMPLETA, completitud, seccionesPara, type SeccionCerebro } from '@/lib/agent/cerebro-secciones'
import type { Fuente, PropuestaCerebro } from '@/lib/agent/cerebro-fuentes'
import { borrarFuenteAccion, generarCerebroAccion, guardarCerebroAccion, guardarCerebroVariasAccion } from '../procesos-acciones'

type Textos = Partial<Record<SeccionCerebro, string>>
const entrevista = (proyecto: string | null) => `Entrevístame para completar el cerebro ${proyecto ? `del proyecto ${proyecto}` : 'de la empresa'}: revisa qué secciones faltan y pregúntame una a la vez.`
const ICONO = { url: Globe, archivo: FileText, nota: StickyNote } as const
const palabras = (c: number) => `~${Math.max(1, Math.round(c / 6)).toLocaleString('es-VE')} palabras`

export function EditorCerebro({ inicial, proyecto = null, fuentes: fuentesIniciales = [] }: { inicial: Textos; proyecto?: string | null; fuentes?: Fuente[] }) {
    const router = useRouter()
    const secciones = seccionesPara(proyecto)
    const [guardado, setGuardado] = useState(inicial)
    const [textos, setTextos] = useState(inicial)
    const [propuestas, setPropuestas] = useState<Textos>({})
    const [sugeridas, setSugeridas] = useState<Set<SeccionCerebro>>(new Set())
    const [faltante, setFaltante] = useState<string | null>(null)
    const [fuentes, setFuentes] = useState(fuentesIniciales)
    const [generando, setGenerando] = useState<SeccionCerebro | 'todo' | null>(null)
    const [busy, start] = useTransition()
    const comp = completitud(guardado)
    const sinGuardar = secciones.filter((s) => (textos[s.key] ?? '').trim() !== (guardado[s.key] ?? '').trim())

    /** Las propuestas van directo a las secciones vacías; en las que tienen texto, quedan al lado para elegir. */
    const aplicar = (p: PropuestaCerebro) => {
        const directas = new Set(sugeridas)
        const aparte: Textos = { ...propuestas }
        const nuevos: Textos = { ...textos }
        for (const s of secciones) {
            const v = p[s.key]
            if (!v) continue
            if (!(textos[s.key] ?? '').trim()) { nuevos[s.key] = v; directas.add(s.key) } else aparte[s.key] = v
        }
        setTextos(nuevos); setPropuestas(aparte); setSugeridas(directas)
        setFaltante(p.faltante?.trim() || null)
    }
    const generar = (seccion?: SeccionCerebro) => {
        setGenerando(seccion ?? 'todo')
        start(async () => {
            const r = await generarCerebroAccion(seccion)
            setGenerando(null)
            if (r.ok && r.data) { aplicar(r.data); toast.success(r.mensaje) } else toast.error(r.mensaje)
        })
    }
    const guardar = (k: SeccionCerebro) => start(async () => {
        const r = await guardarCerebroAccion(k, textos[k] ?? '')
        if (r.ok) { setGuardado((g) => ({ ...g, [k]: (textos[k] ?? '').trim() })); setSugeridas((s) => { const n = new Set(s); n.delete(k); return n }); toast.success(r.mensaje) } else toast.error(r.mensaje)
    })
    const guardarTodo = () => start(async () => {
        const cambios = Object.fromEntries(sinGuardar.map((s) => [s.key, textos[s.key] ?? '']))
        const r = await guardarCerebroVariasAccion(cambios)
        if (r.ok) { setGuardado((g) => ({ ...g, ...Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.trim()])) })); setSugeridas(new Set()); toast.success(r.mensaje) } else toast.error(r.mensaje)
    })

    return (
        <div className="space-y-4 pb-20">
            <section className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="font-semibold">{comp.pct} % completo <span className="font-normal text-muted-foreground">· {comp.completas} de {comp.total} secciones</span></p>
                        <div className="mt-2 h-2 w-56 max-w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={comp.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cerebro completo">
                            <div className="h-full rounded-full bg-[#D4A72C] transition-all" style={{ width: `${comp.pct}%` }} />
                        </div>
                    </div>
                    <Button variant="outline" asChild><Link href={`/oficina/direccion?q=${encodeURIComponent(entrevista(proyecto))}`}><MessageCircle /> Que Ramón me entreviste</Link></Button>
                </div>
            </section>

            <Fuentes fuentes={fuentes} setFuentes={setFuentes} onCambio={() => router.refresh()} generando={generando === 'todo'} puedeGenerar={!busy} onGenerar={() => generar()} hayAlgo={fuentes.length > 0 || comp.completas > 0} />

            {faltante && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"><span className="font-semibold">Lo que no encontré en las fuentes:</span> {faltante}</p>}

            {secciones.map((s) => {
                const texto = textos[s.key] ?? ''
                const cambiado = texto.trim() !== (guardado[s.key] ?? '').trim()
                const completa = (guardado[s.key] ?? '').trim().length >= MIN_COMPLETA
                const propuesta = propuestas[s.key]
                return (
                    <section key={s.key} className="rounded-2xl border bg-card p-4" aria-labelledby={`sec-${s.key}`}>
                        <div className="flex items-center justify-between gap-2">
                            <h2 id={`sec-${s.key}`} className="font-semibold">{s.titulo}</h2>
                            {completa ? <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Completa</span> : <span className="text-xs text-amber-600 dark:text-amber-400">Falta</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{s.preguntas}</p>
                        <label htmlFor={`cerebro-${s.key}`} className="sr-only">{s.titulo}</label>
                        <Textarea id={`cerebro-${s.key}`} className={`mt-2 ${sugeridas.has(s.key) && cambiado ? 'border-violet-400/70 bg-violet-500/5' : ''}`} rows={texto.length > 300 ? 7 : 4} value={texto} placeholder={`Ej.: ${s.ejemplo}`}
                            onChange={(e) => setTextos((t) => ({ ...t, [s.key]: e.target.value }))} />
                        {propuesta && (
                            <div className="mt-2 rounded-xl border border-violet-400/60 bg-violet-500/5 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Propuesta de la IA</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm">{propuesta}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    <Button size="sm" variant="outline" onClick={() => { setTextos((t) => ({ ...t, [s.key]: propuesta })); setSugeridas((x) => new Set(x).add(s.key)); setPropuestas((p) => ({ ...p, [s.key]: undefined })) }}>Usar esta versión</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setPropuestas((p) => ({ ...p, [s.key]: undefined }))}>Descartar</Button>
                                </div>
                            </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                            {cambiado && <span className="mr-auto text-xs text-muted-foreground">{sugeridas.has(s.key) ? '✨ Sugerido por IA · revisa y guarda' : 'Sin guardar'}</span>}
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => generar(s.key)} title="Redactar o mejorar esta sección con IA, usando tus fuentes">
                                {generando === s.key ? <LoaderCircle className="animate-spin" /> : <Wand2 />} Con IA
                            </Button>
                            <Button size="sm" disabled={busy || !cambiado} onClick={() => guardar(s.key)}>Guardar</Button>
                        </div>
                    </section>
                )
            })}

            {sinGuardar.length > 0 && (
                <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-lg">
                    <span className="text-sm">{sinGuardar.length} {sinGuardar.length === 1 ? 'sección sin guardar' : 'secciones sin guardar'}</span>
                    <Button size="sm" disabled={busy} onClick={guardarTodo}>Guardar todo</Button>
                </div>
            )}
        </div>
    )
}

/** Fuentes: enlaces, archivos y notas de los que la IA saca el cerebro. */
function Fuentes({ fuentes, setFuentes, onCambio, generando, puedeGenerar, onGenerar, hayAlgo }: {
    fuentes: Fuente[]; setFuentes: (f: Fuente[]) => void; onCambio: () => void; generando: boolean; puedeGenerar: boolean; onGenerar: () => void; hayAlgo: boolean
}) {
    const [urls, setUrls] = useState('')
    const [nota, setNota] = useState('')
    const [archivos, setArchivos] = useState<File[]>([])
    const [subiendo, setSubiendo] = useState(false)
    const [busy, start] = useTransition()
    const input = useRef<HTMLInputElement>(null)
    const hayNuevo = urls.trim() || nota.trim() || archivos.length > 0

    const anadir = async () => {
        const f = new FormData()
        f.set('urls', urls); f.set('nota', nota)
        archivos.forEach((a) => f.append('archivos', a))
        setSubiendo(true)
        try {
            const r = await fetch('/api/oficina/cerebro/fuentes', { method: 'POST', body: f })
            const d = (await r.json().catch(() => null)) as { ok: boolean; agregadas?: number; errores?: string[]; fuentes?: Fuente[]; error?: string } | null
            if (!d) throw new Error(r.status === 401 ? 'Tu sesión expiró: vuelve a entrar.' : 'No se pudieron añadir las fuentes.')
            if (d.fuentes) setFuentes(d.fuentes)
            if (d.agregadas) { toast.success(`${d.agregadas} ${d.agregadas === 1 ? 'fuente añadida' : 'fuentes añadidas'}`); setUrls(''); setNota(''); setArchivos([]); if (input.current) input.current.value = '' }
            for (const e of d.errores ?? []) toast.error(e)
            if (d.error) toast.error(d.error)
            onCambio()
        } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudieron añadir las fuentes.') } finally { setSubiendo(false) }
    }

    return (
        <section className="rounded-2xl border bg-card p-4" aria-labelledby="fuentes-titulo">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="fuentes-titulo" className="font-semibold">Fuentes</h2>
                    <p className="text-sm text-muted-foreground">Añade tu web, un PDF (presentación, catálogo, propuesta) o pega un texto, y la IA llena el cerebro por ti. Revisas antes de guardar.</p>
                </div>
                <Button onClick={onGenerar} disabled={!puedeGenerar || !hayAlgo || subiendo} title={hayAlgo ? 'Proponer todas las secciones con IA' : 'Añade primero una fuente'}>
                    {generando ? <LoaderCircle className="animate-spin" /> : <Wand2 />} {generando ? 'Leyendo tus fuentes…' : 'Llenar con IA'}
                </Button>
            </div>

            {fuentes.length > 0 && (
                <ul className="mt-3 divide-y rounded-xl border">
                    {fuentes.map((f) => { const I = ICONO[f.tipo]; return (
                        <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <I className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{f.nombre}</a> : f.nombre}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{palabras(f.caracteres)}</span>
                            <button type="button" aria-label={`Quitar ${f.nombre}`} disabled={busy} onClick={() => start(async () => { await borrarFuenteAccion(f.id); setFuentes(fuentes.filter((x) => x.id !== f.id)) })} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
                        </li>
                    ) })}
                </ul>
            )}

            <div className="mt-3 grid gap-2">
                <label htmlFor="fuente-urls" className="sr-only">Enlaces</label>
                <Input id="fuente-urls" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="Enlace de tu web (puedes poner varios separados por espacio)" inputMode="url" />
                <div className="flex flex-wrap items-center gap-2">
                    <input ref={input} id="fuente-archivos" type="file" multiple accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setArchivos(Array.from(e.target.files ?? []).slice(0, 5))} />
                    <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}><Upload /> {archivos.length ? `${archivos.length} ${archivos.length === 1 ? 'archivo' : 'archivos'}` : 'Subir PDF o imagen'}</Button>
                    {archivos.length > 0 && <span className="min-w-0 truncate text-xs text-muted-foreground">{archivos.map((a) => a.name).join(', ')}</span>}
                </div>
                <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">Pegar un texto (notas, una conversación, la descripción del producto…)</summary>
                    <label htmlFor="fuente-nota" className="sr-only">Texto</label>
                    <Textarea id="fuente-nota" className="mt-2" rows={4} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Pega aquí lo que quieras que la IA tenga en cuenta." />
                </details>
                <div className="flex items-center justify-end gap-2">
                    {subiendo && <span className="text-xs text-muted-foreground">Leyendo… un PDF puede tardar hasta un minuto.</span>}
                    <Button variant="secondary" size="sm" disabled={!hayNuevo || subiendo} onClick={() => void anadir()}>{subiendo ? <LoaderCircle className="animate-spin" /> : null} Añadir fuentes</Button>
                </div>
            </div>
        </section>
    )
}
