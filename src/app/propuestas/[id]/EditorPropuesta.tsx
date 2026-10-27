'use client'
/**
 * Pantalla de una propuesta: título, editor tipo Notion, precios, y a la derecha el estado, el enlace para
 * compartir, la actividad del cliente y (si la aceptó) la facturación. Guarda sola mientras escribes.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { ArrowLeft, Check, Copy, Wallet, Eye, FileDown, Link2, Loader2, MessageCircle, MoreHorizontal, Receipt, Repeat, RotateCcw, Sparkles, Trash2, Wand2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Bloque } from '@/lib/propuestas/bloques'
import type { EventoPropuesta, Facturacion } from '@/lib/propuestas/datos'
import { estadoDe, type EstadoPropuesta } from '@/lib/propuestas/tipos'
import type { BorradorIA } from '@/lib/propuestas/ia'
import { dinero, frecuencia, type Moneda, type Pricing, type Totales } from '@/lib/propuestas/precios'
import { borrarPropuestaAccion, crearFijosAccion, duplicarPropuestaAccion, enviarPropuestaAccion, facturarPropuestaAccion, guardarPropuestaAccion, reabrirPropuestaAccion, rechazarPropuestaAccion } from '../acciones'
import { crearControlDesdePropuestaAccion } from '@/app/control/acciones'
import { InversionCtx } from './contexto'
import { DialogoIA } from './DialogoIA'
import { EditorPrecios } from './EditorPrecios'
import type { EditorPropuestaBN } from './EditorBloques'

const EditorBloques = dynamic(() => import('./EditorBloques'), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-lg bg-muted/50" /> })

export type DatosEditor = {
    id: string
    number: string
    title: string
    client_id: string
    cliente: { name: string; phone: string | null; email: string | null; contact_name: string | null }
    content: Bloque[]
    pricing: Pricing
    currency: Moneda
    status: EstadoPropuesta
    token: string
    valid_until: string | null
    view_count: number
    first_viewed_at: string | null
    last_viewed_at: string | null
    accepted_by: string | null
    accepted_at: string | null
    aceptacion: { opcion_nombre: string; varias: boolean; extras: number; totales: Totales } | null
    billing: Facturacion
    updated_at: string
    /** El control interno que salió de esta propuesta, si ya se creó. */
    control_id: string | null
}

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' })

const EVENTO: Record<string, string> = { created: 'Creada', sent: 'Marcada como enviada', viewed: 'El cliente la abrió', changes_requested: 'El cliente pidió cambios', accepted: 'El cliente la aceptó', rejected: 'Marcada como rechazada', invoiced: 'Factura creada', recurring_created: 'Servicios fijos creados', reopened: 'Reabierta' }

function textoEvento(e: EventoPropuesta): string {
    const d = e.detail ?? {}
    if (e.kind === 'viewed' && Number(d.vez) > 1) return `El cliente la abrió (${d.vez}.ª vez)`
    if (e.kind === 'accepted') return `Aceptada por ${d.nombre}${d.opcion ? ` · ${d.opcion}` : ''}`
    if (e.kind === 'invoiced') return `Factura ${d.factura} · ${d.concepto}`
    if (e.kind === 'created' && d.copia_de) return `Creada como copia de ${d.copia_de}`
    return EVENTO[e.kind] ?? e.kind
}

export function EditorPropuesta({ inicial, eventos }: { inicial: DatosEditor; eventos: EventoPropuesta[] }) {
    const router = useRouter()
    const { resolvedTheme } = useTheme()
    const [titulo, setTitulo] = useState(inicial.title)
    const [pricing, setPricing] = useState(inicial.pricing)
    const [validez, setValidez] = useState(inicial.valid_until ?? '')
    const [estadoGuardado, setEstadoGuardado] = useState<'guardado' | 'pendiente' | 'guardando' | 'error'>('guardado')
    const [preciosAbierto, setPreciosAbierto] = useState(false)
    const [ia, setIa] = useState<null | { modo: 'redactar' | 'reescribir'; seleccion: string; bloques: string[] }>(null)
    const [menu, setMenu] = useState(false)
    const [pendiente, start] = useTransition()
    const editorRef = useRef<EditorPropuestaBN | null>(null)
    const tituloRef = useRef<HTMLTextAreaElement>(null)
    useLayoutEffect(() => {
        const el = tituloRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }, [titulo])
    const cambios = useRef<{ title?: string; content?: unknown; pricing?: Pricing; valid_until?: string | null }>({})
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const aceptada = inicial.status === 'accepted'
    const enlace = typeof window !== 'undefined' ? `${window.location.origin}/propuesta/${inicial.token}` : `/propuesta/${inicial.token}`
    const est = estadoDe(inicial.status)

    const guardar = useCallback(async () => {
        if (timer.current) clearTimeout(timer.current)
        const c = cambios.current
        if (!Object.keys(c).length) return
        cambios.current = {}
        setEstadoGuardado('guardando')
        const r = await guardarPropuestaAccion(inicial.id, c)
        if (r.ok) setEstadoGuardado(Object.keys(cambios.current).length ? 'pendiente' : 'guardado')
        else {
            cambios.current = { ...c, ...cambios.current }
            setEstadoGuardado('error')
            toast.error(r.mensaje)
        }
    }, [inicial.id])

    const programar = useCallback(
        (c: typeof cambios.current) => {
            cambios.current = { ...cambios.current, ...c }
            setEstadoGuardado('pendiente')
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(guardar, 1200)
        },
        [guardar],
    )

    useEffect(() => {
        const antes = (e: BeforeUnloadEvent) => {
            if (Object.keys(cambios.current).length) e.preventDefault()
        }
        window.addEventListener('beforeunload', antes)
        return () => window.removeEventListener('beforeunload', antes)
    }, [])

    const onCambioContenido = useCallback((bloques: unknown[]) => programar({ content: bloques }), [programar])
    const onListo = useCallback((ed: EditorPropuestaBN) => { editorRef.current = ed }, [])
    const ctx = useMemo(() => ({ pricing, moneda: inicial.currency, abrirPrecios: () => setPreciosAbierto(true), soloLectura: false }), [pricing, inicial.currency])

    async function asegurarGuardado() {
        await guardar()
    }

    const compartir = () =>
        start(async () => {
            await asegurarGuardado()
            if (inicial.status === 'draft' || inicial.status === 'rejected') {
                const r = await enviarPropuestaAccion(inicial.id)
                if (!r.ok) return void toast.error(r.mensaje)
            }
            try {
                await navigator.clipboard.writeText(enlace)
                toast.success('Enlace copiado. Pégalo en WhatsApp o en el correo.')
            } catch {
                toast.info(enlace)
            }
            router.refresh()
        })

    const mensajeCliente = `Hola${inicial.cliente.contact_name ? ` ${inicial.cliente.contact_name.split(' ')[0]}` : ''}, te comparto la propuesta «${titulo}». Puedes revisarla, elegir y aceptarla desde aquí: ${enlace}`
    const telefono = (inicial.cliente.phone ?? '').replace(/\D/g, '')

    const enviarWhatsApp = () =>
        start(async () => {
            await asegurarGuardado()
            if (inicial.status === 'draft' || inicial.status === 'rejected') {
                const r = await enviarPropuestaAccion(inicial.id)
                if (!r.ok) return void toast.error(r.mensaje)
            }
            window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensajeCliente)}`, '_blank', 'noopener')
            router.refresh()
        })

    const accion = (fn: () => Promise<{ ok: boolean; mensaje: string; data?: unknown }>, despues?: (data?: unknown) => void) =>
        start(async () => {
            await asegurarGuardado()
            const r = await fn()
            if (!r.ok) return void toast.error(r.mensaje)
            toast.success(r.mensaje)
            setMenu(false)
            if (despues) despues(r.data)
            else router.refresh()
        })

    function abrirIA(modo: 'redactar' | 'reescribir') {
        const ed = editorRef.current
        if (!ed) return
        if (modo === 'reescribir') {
            const sel = ed.getSelection()?.blocks ?? [ed.getTextCursorPosition().block]
            if (sel.some((b) => b.type === 'inversion')) return void toast.error('Deja la tabla de inversión fuera de la selección: los precios se cambian con «Editar precios».')
            const md = ed.blocksToMarkdownLossy(sel).trim()
            if (!md) return void toast.error('Selecciona el texto que quieres reescribir (o pon el cursor en un párrafo).')
            setIa({ modo, seleccion: md, bloques: sel.map((b) => b.id) })
        } else setIa({ modo, seleccion: '', bloques: [] })
    }

    function aplicarBorrador(b: BorradorIA) {
        const ed = editorRef.current
        if (!ed) return
        const bloques = ed.tryParseMarkdownToBlocks(b.markdown).map((x) => (x.type === 'paragraph' && JSON.stringify(x.content).includes('[[INVERSION]]') ? ({ type: 'inversion' } as never) : x))
        if (!bloques.some((x) => x.type === 'inversion')) bloques.push({ type: 'inversion' } as never)
        ed.replaceBlocks(ed.document, bloques)
        setPricing(b.pricing)
        programar({ pricing: b.pricing, content: ed.document })
    }

    function aplicarReescrito(md: string) {
        const ed = editorRef.current
        if (!ed || !ia) return
        ed.replaceBlocks(ia.bloques, ed.tryParseMarkdownToBlocks(md))
        programar({ content: ed.document })
    }

    const a = inicial.aceptacion
    const b = inicial.billing ?? {}
    const cuotasPendientes = a ? a.totales.cuotas.filter((c) => !(b.cuotas_facturadas ?? []).includes(c.cuota.id)) : []
    const puedeFacturar = !!a && (a.totales.cuotas.length ? cuotasPendientes.length > 0 : a.totales.unico.total > 0 && !b.unico_facturado)
    const tieneRecurrente = !!a && a.totales.recurrentes.length > 0

    return (
        <InversionCtx.Provider value={ctx}>
            <div className="mx-auto max-w-6xl">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Link href="/propuestas" className="mr-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Propuestas</Link>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                        {estadoGuardado === 'guardando' ? <><Loader2 className="size-3.5 animate-spin" /> Guardando…</> : estadoGuardado === 'pendiente' ? 'Cambios sin guardar' : estadoGuardado === 'error' ? <span className="text-destructive">No se guardó · reintenta</span> : <><Check className="size-3.5" /> Guardado</>}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => abrirIA('redactar')}><Sparkles /> Redactar con IA</Button>
                    <Button variant="outline" size="sm" onClick={() => abrirIA('reescribir')} title="Reescribe el párrafo o los bloques seleccionados"><Wand2 /> Reescribir selección</Button>
                    <Button variant="outline" size="sm" asChild><a href={`/propuestas/${inicial.id}/vista`} target="_blank" rel="noopener" onClick={() => void guardar()}><Eye /> Vista previa</a></Button>
                    <Button variant="outline" size="sm" asChild><a href={`/api/propuestas/${inicial.id}/pdf`} onClick={() => void guardar()}><FileDown /> PDF</a></Button>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
                    <div className="min-w-0 rounded-2xl border bg-card px-2 py-6 sm:px-6">
                        <div className="px-[54px]">
                            <div className="font-mono text-xs text-muted-foreground">{inicial.number} · {inicial.cliente.name}</div>
                            <label htmlFor="titulo-propuesta" className="sr-only">Título</label>
                            {/* Crece en altura con el texto: un título largo pasa a la línea siguiente en vez de esconderse. */}
                            <textarea id="titulo-propuesta" ref={tituloRef} rows={1} value={titulo} onChange={(e) => { const v = e.target.value.replace(/\n/g, ' '); setTitulo(v); if (v.trim().length >= 3) programar({ title: v }) }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} className="font-display mt-1 block w-full resize-none overflow-hidden bg-transparent text-3xl leading-tight font-semibold text-balance outline-none placeholder:text-muted-foreground/50" placeholder="Título de la propuesta" />
                        </div>
                        {aceptada && <p className="mx-[54px] mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">El cliente ya la aceptó: lo que aceptó quedó guardado tal cual. Si cambias algo aquí, el enlace seguirá mostrando la versión aceptada salvo que la reabras.</p>}
                        <div className="mt-4">
                            <EditorBloques inicial={inicial.content} onCambio={onCambioContenido} onListo={onListo} tema={resolvedTheme === 'dark' ? 'dark' : 'light'} soloLectura={false} />
                        </div>
                    </div>

                    <aside className="space-y-4">
                        <section className="space-y-3 rounded-2xl border bg-card p-4">
                            <div className="flex items-center justify-between">
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${est.tono}`}>{est.label}</span>
                                <div className="relative">
                                    <Button variant="ghost" size="icon-sm" onClick={() => setMenu((m) => !m)} aria-label="Más acciones" aria-expanded={menu}><MoreHorizontal /></Button>
                                    {menu && (
                                        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border bg-popover p-1 text-sm shadow-lg">
                                            <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-accent" onClick={() => accion(() => duplicarPropuestaAccion(inicial.id), (d) => router.push(`/propuestas/${(d as { id: string }).id}`))}><Copy className="size-4" /> Duplicar</button>
                                            {!aceptada && inicial.status !== 'rejected' && <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-accent" onClick={() => accion(() => rechazarPropuestaAccion(inicial.id))}><XCircle className="size-4" /> Marcar como rechazada</button>}
                                            {aceptada && <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-accent" onClick={() => { if (confirm('¿Reabrirla? El cliente podrá aceptar de nuevo la versión actual. La aceptación anterior queda en la actividad.')) accion(() => reabrirPropuestaAccion(inicial.id)) }}><RotateCcw className="size-4" /> Reabrir para cambios</button>}
                                            {!aceptada && <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-destructive hover:bg-accent" onClick={() => { if (confirm('¿Borrar esta propuesta? No se puede deshacer.')) accion(() => borrarPropuestaAccion(inicial.id), () => router.push('/propuestas')) }}><Trash2 className="size-4" /> Borrar</button>}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {inicial.status === 'draft' ? (
                                <p className="text-sm text-muted-foreground">Borrador: el enlace se activa cuando lo copias o lo envías.</p>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    {inicial.view_count > 0 ? `Abierta ${inicial.view_count} ${inicial.view_count === 1 ? 'vez' : 'veces'}${inicial.last_viewed_at ? ` · última ${fechaHora(inicial.last_viewed_at)}` : ''}` : 'El cliente aún no la abre.'}
                                </p>
                            )}
                            <div className="grid gap-2">
                                <Button onClick={compartir} disabled={pendiente}><Link2 /> {inicial.status === 'draft' ? 'Activar y copiar enlace' : 'Copiar enlace'}</Button>
                                <Button variant="outline" onClick={enviarWhatsApp} disabled={pendiente}><MessageCircle /> {telefono ? 'Enviar por WhatsApp' : 'Abrir WhatsApp con el mensaje'}</Button>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="validez" className="text-xs font-medium text-muted-foreground">Válida hasta (opcional)</label>
                                <input id="validez" type="date" value={validez} onChange={(e) => { setValidez(e.target.value); programar({ valid_until: e.target.value || null }) }} className="h-9 w-full rounded-md border bg-background px-2.5 text-sm" />
                            </div>
                        </section>

                        {aceptada && a && (
                            <section className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                                <h2 className="font-semibold">Aceptada 🎉</h2>
                                <p className="text-sm">
                                    Por <span className="font-medium">{inicial.accepted_by}</span>{inicial.accepted_at ? ` · ${fechaHora(inicial.accepted_at)}` : ''}
                                    {a.varias && <><br />Opción: <span className="font-medium">{a.opcion_nombre || 'sin nombre'}</span></>}
                                    {a.extras > 0 && <><br />Con {a.extras} {a.extras === 1 ? 'extra' : 'extras'}</>}
                                </p>
                                <div className="text-sm tabular-nums">
                                    {a.totales.unico.total > 0 && <div className="flex justify-between"><span>Pago único</span><span className="font-semibold">{dinero(a.totales.unico.total, inicial.currency)}</span></div>}
                                    {a.totales.recurrentes.map((r) => <div key={r.frecuencia} className="flex justify-between"><span>{frecuencia(r.frecuencia).label}</span><span className="font-semibold">{dinero(r.bloque.total, inicial.currency)}{frecuencia(r.frecuencia).sufijo}</span></div>)}
                                </div>
                                <div className="grid gap-2">
                                    {puedeFacturar && (
                                        <Button disabled={pendiente} onClick={() => accion(() => facturarPropuestaAccion(inicial.id, cuotasPendientes[0]?.cuota.id))}>
                                            <Receipt /> {a.totales.cuotas.length ? `Facturar «${cuotasPendientes[0].cuota.concepto || 'cuota'}» (${dinero(cuotasPendientes[0].monto, inicial.currency)})` : 'Crear la factura'}
                                        </Button>
                                    )}
                                    {tieneRecurrente && !b.fijos?.length && <Button variant="outline" disabled={pendiente} onClick={() => accion(() => crearFijosAccion(inicial.id))}><Repeat /> Crear servicios fijos</Button>}
                                    {inicial.control_id
                                        ? <Button variant="outline" asChild><Link href={`/control/${inicial.control_id}`}><Wallet /> Ver control interno</Link></Button>
                                        : <Button variant="outline" disabled={pendiente} onClick={() => accion(() => crearControlDesdePropuestaAccion(inicial.id), (d) => router.push(`/control/${d as string}`))}><Wallet /> Crear control interno</Button>}
                                </div>
                                {(b.facturas?.length || b.fijos?.length) ? (
                                    <ul className="space-y-1 text-xs text-muted-foreground">
                                        {b.facturas?.map((f) => <li key={f.invoice_id}>✓ Factura <Link href="/invoices" className="underline">{f.invoice_number}</Link> · {f.concepto}</li>)}
                                        {b.fijos?.length ? <li>✓ {b.fijos.length} {b.fijos.length === 1 ? 'servicio fijo' : 'servicios fijos'}: {b.fijos.map((x) => x.descripcion).join(', ')}</li> : null}
                                    </ul>
                                ) : null}
                            </section>
                        )}

                        <section className="rounded-2xl border bg-card p-4">
                            <h2 className="text-sm font-semibold">Actividad</h2>
                            <ol className="mt-2 space-y-2.5">
                                {eventos.map((e) => (
                                    <li key={e.id} className="text-sm">
                                        <div className={e.kind === 'changes_requested' ? 'font-medium text-amber-700 dark:text-amber-400' : e.kind === 'accepted' ? 'font-medium text-emerald-700 dark:text-emerald-400' : ''}>{textoEvento(e)}</div>
                                        {e.kind === 'changes_requested' && typeof e.detail?.mensaje === 'string' && <blockquote className="mt-1 border-l-2 border-amber-300 pl-2 text-xs whitespace-pre-line text-muted-foreground">{e.detail.mensaje}{e.detail.nombre ? ` — ${e.detail.nombre}` : ''}</blockquote>}
                                        <div className="text-xs text-muted-foreground">{fechaHora(e.created_at)}</div>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    </aside>
                </div>
            </div>

            {preciosAbierto && <EditorPrecios abierto onCerrar={() => setPreciosAbierto(false)} pricing={pricing} moneda={inicial.currency} clientId={inicial.client_id} onGuardar={(p) => { setPricing(p); programar({ pricing: p }); setPreciosAbierto(false); toast.success('Precios actualizados.') }} />}
            {ia && <DialogoIA abierto modo={ia.modo} clientId={inicial.client_id} titulo={titulo} seleccion={ia.seleccion} onCerrar={() => setIa(null)} onBorrador={aplicarBorrador} onReescrito={aplicarReescrito} />}
        </InversionCtx.Provider>
    )
}
