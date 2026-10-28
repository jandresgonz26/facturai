'use client'
import { useState, useTransition } from 'react'
import { Check, Minus, Pencil, Plus, Archive, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { precioTexto, UNIDADES, type Servicio, type TipoServicio } from '@/lib/servicios/tipos'
import type { ServicioInput } from '@/lib/servicios/datos'
import { activarServicioAccion, actualizarServicioAccion, crearServicioAccion } from './acciones'

const area = 'min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-ring'
const aInput = (s: Servicio): ServicioInput => ({
    tipo: s.tipo, nombre: s.nombre, precio: s.precio === null ? '' : String(s.precio), precio_max: s.precio_max === null ? '' : String(s.precio_max),
    unidad: s.unidad, moneda: s.moneda, resumen: s.resumen ?? '', incluye: s.incluye.join('\n'), no_incluye: s.no_incluye.join('\n'),
})
const nuevo = (tipo: TipoServicio): ServicioInput => ({ tipo, nombre: '', precio: '', precio_max: '', unidad: tipo === 'paquete' ? 'mes' : tipo === 'politica' ? 'ninguna' : 'unico', moneda: 'EUR', resumen: '', incluye: '', no_incluye: '' })

/** Formulario de un servicio (nuevo o existente). Las listas, una línea por punto. */
function Formulario({ valor, onGuardar, onCancelar, guardando }: { valor: ServicioInput; onGuardar: (v: ServicioInput) => void; onCancelar: () => void; guardando: boolean }) {
    const [v, setV] = useState(valor)
    const set = (c: Partial<ServicioInput>) => setV((x) => ({ ...x, ...c }))
    const politica = v.tipo === 'politica'
    return (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onGuardar(v) }}>
            <div className="space-y-1.5"><Label htmlFor="sv-nombre">Nombre</Label><Input id="sv-nombre" value={v.nombre} onChange={(e) => set({ nombre: e.target.value })} required /></div>
            {!politica && (
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.3fr_0.8fr]">
                    <div className="space-y-1.5"><Label htmlFor="sv-precio">Precio</Label><Input id="sv-precio" inputMode="decimal" value={v.precio} onChange={(e) => set({ precio: e.target.value })} placeholder="55" /></div>
                    <div className="space-y-1.5"><Label htmlFor="sv-max">Hasta <span className="font-normal text-muted-foreground">(si es rango)</span></Label><Input id="sv-max" inputMode="decimal" value={v.precio_max} onChange={(e) => set({ precio_max: e.target.value })} placeholder="—" /></div>
                    <div className="space-y-1.5"><Label htmlFor="sv-unidad">Se cobra</Label>
                        <select id="sv-unidad" value={v.unidad} onChange={(e) => set({ unidad: e.target.value as ServicioInput['unidad'] })} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                            {UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5"><Label htmlFor="sv-moneda">Moneda</Label>
                        <select id="sv-moneda" value={v.moneda} onChange={(e) => set({ moneda: e.target.value as 'USD' | 'EUR' })} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="EUR">EUR</option><option value="USD">USD</option></select>
                    </div>
                </div>
            )}
            <div className="space-y-1.5"><Label htmlFor="sv-resumen">{v.tipo === 'paquete' ? 'Para quién es' : 'Descripción'}</Label><textarea id="sv-resumen" className={area} value={v.resumen} onChange={(e) => set({ resumen: e.target.value })} /></div>
            {v.tipo !== 'adicional' && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor="sv-incluye">{politica ? 'Cuenta como cambio menor' : 'Incluye'} <span className="font-normal text-muted-foreground">(una línea por punto)</span></Label><textarea id="sv-incluye" className={`${area} min-h-40`} value={v.incluye} onChange={(e) => set({ incluye: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label htmlFor="sv-no">{politica ? 'Se presupuesta aparte' : 'No incluye'}</Label><textarea id="sv-no" className={`${area} min-h-40`} value={v.no_incluye} onChange={(e) => set({ no_incluye: e.target.value })} /></div>
                </div>
            )}
            <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
            </div>
        </form>
    )
}

export function Catalogo({ inicial }: { inicial: Servicio[] }) {
    const [lista, setLista] = useState(inicial)
    const [editando, setEditando] = useState<string | null>(null) // id, o «nuevo:<tipo>»
    const [verArchivados, setVerArchivados] = useState(false)
    const [guardando, start] = useTransition()

    const visibles = lista.filter((s) => verArchivados || s.activo)
    const paquetes = visibles.filter((s) => s.tipo === 'paquete')
    const adicionales = visibles.filter((s) => s.tipo === 'adicional')
    const politicas = visibles.filter((s) => s.tipo === 'politica')
    const archivados = lista.filter((s) => !s.activo).length

    const guardar = (id: string | null, v: ServicioInput) => start(async () => {
        const r = id ? await actualizarServicioAccion(id, v) : await crearServicioAccion(v)
        if (!r.ok) return void toast.error(r.mensaje)
        toast.success(r.mensaje)
        const s = r.data!
        setLista((xs) => (id ? xs.map((x) => (x.id === id ? s : x)) : [...xs, s]))
        setEditando(null)
    })
    const archivar = (s: Servicio) => start(async () => {
        const r = await activarServicioAccion(s.id, !s.activo)
        if (!r.ok) return void toast.error(r.mensaje)
        toast.success(r.mensaje)
        setLista((xs) => xs.map((x) => (x.id === s.id ? { ...x, activo: !s.activo } : x)))
    })
    const acciones = (s: Servicio) => (
        <span className="flex gap-1">
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Editar ${s.nombre}`} onClick={() => setEditando(s.id)}><Pencil /></Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={s.activo ? `Archivar ${s.nombre}` : `Reactivar ${s.nombre}`} onClick={() => archivar(s)} disabled={guardando}>{s.activo ? <Archive /> : <RotateCcw />}</Button>
        </span>
    )

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div><h2 className="text-lg font-semibold">Paquetes mensuales</h2><p className="text-sm text-muted-foreground">Lo que cobro cada mes por cada nivel de servicio.</p></div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditando('nuevo:paquete')}><Plus /> Nuevo paquete</Button>
                </div>
                {editando === 'nuevo:paquete' && <div className="rounded-xl border bg-card p-4"><Formulario valor={nuevo('paquete')} onGuardar={(v) => guardar(null, v)} onCancelar={() => setEditando(null)} guardando={guardando} /></div>}
                <div className="grid gap-4 md:grid-cols-2">
                    {paquetes.map((s) => (
                        <article key={s.id} className={`flex flex-col rounded-xl border bg-card p-5 ${s.activo ? '' : 'opacity-60'}`}>
                            {editando === s.id ? <Formulario valor={aInput(s)} onGuardar={(v) => guardar(s.id, v)} onCancelar={() => setEditando(null)} guardando={guardando} /> : (
                                <>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="font-semibold">{s.nombre}{!s.activo && <span className="ml-2 text-xs font-normal text-muted-foreground">(archivado)</span>}</h3>
                                            <p className="mt-1 font-display text-3xl font-bold tabular-nums">{precioTexto(s)}</p>
                                        </div>
                                        {acciones(s)}
                                    </div>
                                    {s.resumen && <p className="mt-2 text-sm text-muted-foreground">{s.resumen}</p>}
                                    {s.incluye.length > 0 && <ul className="mt-4 space-y-1.5 text-sm">{s.incluye.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{x}</li>)}</ul>}
                                    {s.no_incluye.length > 0 && <ul className="mt-3 space-y-1 text-[13px] text-muted-foreground">{s.no_incluye.map((x) => <li key={x} className="flex gap-2"><Minus className="mt-0.5 size-4 shrink-0" />{x}</li>)}</ul>}
                                </>
                            )}
                        </article>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div><h2 className="text-lg font-semibold">Servicios adicionales</h2><p className="text-sm text-muted-foreground">Fuera de los paquetes, puntuales o por horas. Precios orientativos.</p></div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditando('nuevo:adicional')}><Plus /> Nuevo servicio</Button>
                </div>
                {editando === 'nuevo:adicional' && <div className="rounded-xl border bg-card p-4"><Formulario valor={nuevo('adicional')} onGuardar={(v) => guardar(null, v)} onCancelar={() => setEditando(null)} guardando={guardando} /></div>}
                <ul className="divide-y rounded-xl border bg-card">
                    {adicionales.map((s) => (
                        <li key={s.id} className={`px-4 py-3 ${s.activo ? '' : 'opacity-60'}`}>
                            {editando === s.id ? <Formulario valor={aInput(s)} onGuardar={(v) => guardar(s.id, v)} onCancelar={() => setEditando(null)} guardando={guardando} /> : (
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium">{s.nombre}{!s.activo && <span className="ml-2 text-xs font-normal text-muted-foreground">(archivado)</span>}</div>
                                        {s.resumen && <p className="mt-0.5 text-sm text-muted-foreground">{s.resumen}</p>}
                                    </div>
                                    <span className="whitespace-nowrap pt-0.5 text-sm font-semibold tabular-nums">{precioTexto(s)}</span>
                                    {acciones(s)}
                                </div>
                            )}
                        </li>
                    ))}
                    {adicionales.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Sin servicios adicionales.</li>}
                </ul>
            </section>

            {politicas.map((s) => (
                <section key={s.id} className="rounded-xl border bg-card p-5">
                    {editando === s.id ? <Formulario valor={aInput(s)} onGuardar={(v) => guardar(s.id, v)} onCancelar={() => setEditando(null)} guardando={guardando} /> : (
                        <>
                            <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{s.nombre}</h2>{acciones(s)}</div>
                            {s.resumen && <p className="mt-1 text-sm text-muted-foreground">{s.resumen}</p>}
                            <div className="mt-4 grid gap-6 sm:grid-cols-2">
                                <div><h3 className="text-sm font-semibold">Cuenta como cambio menor</h3><ul className="mt-2 space-y-1.5 text-sm">{s.incluye.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{x}</li>)}</ul></div>
                                <div><h3 className="text-sm font-semibold">Se presupuesta aparte</h3><ul className="mt-2 space-y-1.5 text-sm">{s.no_incluye.map((x) => <li key={x} className="flex gap-2"><Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{x}</li>)}</ul></div>
                            </div>
                        </>
                    )}
                </section>
            ))}

            {archivados > 0 && (
                <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => setVerArchivados((x) => !x)}>
                    {verArchivados ? 'Ocultar archivados' : `Ver archivados (${archivados})`}
                </button>
            )}
        </div>
    )
}
