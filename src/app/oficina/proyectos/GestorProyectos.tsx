'use client'

/** Crear un proyecto y gestionar los existentes (trabajar en él, pausar, archivar). */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { crearProyectoAccion, elegirProyectoAccion, estadoProyectoAccion } from '../clic-acciones'

type Fila = { id: string; nombre: string; tipo: string; descripcion: string | null; estado: 'activo' | 'pausado' | 'archivado' }

export function GestorProyectos({ proyectos, actual }: { proyectos: Fila[]; actual: string | null }) {
    const router = useRouter()
    const [nuevo, setNuevo] = useState(proyectos.length === 0)
    const [busy, start] = useTransition()
    const crear = (f: FormData) => start(async () => {
        const r = await crearProyectoAccion(f)
        if (r.ok) { toast.success(r.mensaje); router.push('/oficina/cerebro') } else toast.error(r.mensaje)
    })
    const vivos = proyectos.filter((p) => p.estado !== 'archivado')
    const archivados = proyectos.filter((p) => p.estado === 'archivado')

    return (
        <div className="space-y-4">
            <section className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold">Nuevo proyecto</h2>
                    {!nuevo && <Button size="sm" variant="outline" onClick={() => setNuevo(true)}><Plus /> Nuevo</Button>}
                </div>
                {nuevo && (
                    <form action={crear} className="mt-3 grid gap-3">
                        <label className="grid gap-1 text-sm" htmlFor="proy-nombre"><span className="font-medium">Nombre</span>
                            <Input id="proy-nombre" name="nombre" placeholder="Ej.: Wapalink" required minLength={2} maxLength={80} />
                        </label>
                        <fieldset className="grid gap-1 text-sm">
                            <legend className="mb-1 font-medium">Tipo</legend>
                            <div className="flex flex-wrap gap-3">
                                {[['producto', 'Producto propio'], ['cliente', 'Cliente'], ['interno', 'Interno']].map(([v, t], i) => (
                                    <label key={v} className="flex items-center gap-1.5"><input type="radio" name="tipo" value={v} defaultChecked={i === 0} /> {t}</label>
                                ))}
                            </div>
                        </fieldset>
                        <label className="grid gap-1 text-sm" htmlFor="proy-desc"><span className="font-medium">¿De qué se trata?</span>
                            <Textarea id="proy-desc" name="descripcion" rows={3} placeholder="Ej.: asistente de IA para WhatsApp para pequeños negocios; lanzamiento en diciembre." />
                        </label>
                        <div className="flex justify-end gap-2">
                            {proyectos.length > 0 && <Button type="button" variant="ghost" onClick={() => setNuevo(false)}>Cancelar</Button>}
                            <Button type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear y completar su cerebro'}</Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Al crearlo pasas a trabajar en él y te llevo a su cerebro para contarle al equipo de qué se trata.</p>
                    </form>
                )}
            </section>

            <section className="rounded-2xl border bg-card p-4">
                <h2 className="font-semibold">Tus proyectos</h2>
                <ul className="mt-2 divide-y">
                    <li className="flex items-center justify-between gap-3 py-2.5">
                        <div><div className="font-medium">JAM Tech</div><div className="text-xs text-muted-foreground">La empresa</div></div>
                        {actual === null ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Trabajando aquí</span>
                            : <Button size="sm" variant="outline" disabled={busy} onClick={() => start(() => elegirProyectoAccion(null))}>Trabajar aquí</Button>}
                    </li>
                    {vivos.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                                <div className="font-medium">{p.nombre} {p.estado === 'pausado' && <span className="text-xs font-normal text-muted-foreground">· en pausa</span>}</div>
                                <div className="text-xs text-muted-foreground">{p.tipo}{p.descripcion && <> · {p.descripcion}</>}</div>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-1.5">
                                {actual === p.id ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Trabajando aquí</span>
                                    : <Button size="sm" variant="outline" disabled={busy} onClick={() => start(() => elegirProyectoAccion(p.id))}>Trabajar aquí</Button>}
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => { const r = await estadoProyectoAccion(p.id, p.estado === 'pausado' ? 'activo' : 'pausado'); if (!r.ok) toast.error(r.mensaje) })}>{p.estado === 'pausado' ? 'Reanudar' : 'Pausar'}</Button>
                                <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { if (window.confirm(`¿Archivar «${p.nombre}»? Su información se conserva, pero deja de aparecer.`)) start(async () => { const r = await estadoProyectoAccion(p.id, 'archivado'); if (r.ok) toast.success(r.mensaje); else toast.error(r.mensaje) }) }}>Archivar</Button>
                            </div>
                        </li>
                    ))}
                </ul>
                {archivados.length > 0 && (
                    <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-muted-foreground">Archivados ({archivados.length})</summary>
                        <ul className="mt-1 space-y-1">{archivados.map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-2"><span>{p.nombre}</span>
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => { await estadoProyectoAccion(p.id, 'activo') })}>Recuperar</Button></li>
                        ))}</ul>
                    </details>
                )}
            </section>
        </div>
    )
}
