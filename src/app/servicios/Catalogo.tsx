'use client'
/**
 * Catálogo de servicios: Área → Categoría → Servicio. A la izquierda las áreas y categorías (filtran), arriba el
 * buscador y la forma de cobro, y en el centro los servicios en tarjetas (los destacados) o en lista. Todo se edita
 * en un panel lateral sin salir de la página.
 */
import { useMemo, useState, useTransition } from 'react'
import { Archive, ArrowDown, ArrowUp, Check, Copy, LayoutGrid, List, Minus, Pencil, Plus, RotateCcw, Search, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { agrupar, coincide, precioTexto, unidadLabel, UNIDADES, type Area, type Catalogo as Datos, type Categoria, type Servicio, type UnidadServicio } from '@/lib/servicios/tipos'
import type { ServicioInput } from '@/lib/servicios/datos'
import {
    activarServicioAccion, actualizarAreaAccion, actualizarCategoriaAccion, actualizarServicioAccion, borrarAreaAccion, crearAreaAccion, crearCategoriaAccion,
    crearServicioAccion, duplicarServicioAccion, moverServicioAccion,
} from './acciones'

type Seleccion = { tipo: 'todo' } | { tipo: 'area'; id: string | null } | { tipo: 'categoria'; id: string }
type Cobro = 'todos' | 'mes' | 'unico' | 'hora'
type Panel =
    | { tipo: 'servicio'; servicio: Servicio | null; categoriaId: string }
    | { tipo: 'categoria'; categoria: Categoria | null; areaId: string | null }
    | { tipo: 'area'; area: Area | null }
    | null

const area = 'w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-ring'
const sel = 'h-9 w-full rounded-md border bg-background px-3 text-sm'
const COLORES = ['#7c3aed', '#0d9488', '#db2777', '#2563eb', '#ea580c', '#65a30d', '#0891b2', '#4b5563']

/** Condiciones de una categoría: «- » son viñetas, el resto títulos cortos. */
function Nota({ texto }: { texto: string }) {
    return (
        <div className="space-y-1 text-[13px]">
            {texto.split('\n').filter((l) => l.trim()).map((l, i) => l.trim().startsWith('-')
                ? <p key={i} className="flex gap-2 pl-1 text-muted-foreground"><span aria-hidden>·</span>{l.trim().replace(/^-\s*/, '')}</p>
                : <p key={i} className="pt-1.5 font-medium">{l.trim()}</p>)}
        </div>
    )
}

// ─── Formularios del panel lateral ───────────────────────────────────────────

function FormServicio({ datos, servicio, categoriaId, onListo }: { datos: Datos; servicio: Servicio | null; categoriaId: string; onListo: (s: Servicio, nuevo: boolean) => void }) {
    const [v, setV] = useState<ServicioInput>(() => servicio ? {
        category_id: servicio.category_id ?? '', nombre: servicio.nombre, precio: servicio.precio === null ? '' : String(servicio.precio), precio_max: servicio.precio_max === null ? '' : String(servicio.precio_max),
        unidad: servicio.unidad, moneda: servicio.moneda, resumen: servicio.resumen ?? '', incluye: servicio.incluye.join('\n'), no_incluye: servicio.no_incluye.join('\n'), destacado: servicio.destacado,
    } : { category_id: categoriaId, nombre: '', precio: '', precio_max: '', unidad: 'unico', moneda: 'EUR', resumen: '', incluye: '', no_incluye: '', destacado: false })
    const [guardando, start] = useTransition()
    const set = (c: Partial<ServicioInput>) => setV((x) => ({ ...x, ...c }))
    const guardar = () => start(async () => {
        const r = servicio ? await actualizarServicioAccion(servicio.id, v) : await crearServicioAccion(v)
        if (!r.ok) return void toast.error(r.mensaje)
        toast.success(r.mensaje)
        onListo(r.data!, !servicio)
    })
    return (
        <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); guardar() }}>
            <div className="space-y-1.5"><Label htmlFor="sv-cat">Categoría</Label>
                <select id="sv-cat" className={sel} value={v.category_id} onChange={(e) => set({ category_id: e.target.value })}>
                    <option value="">Sin categoría</option>
                    {[...datos.areas, null].map((a) => {
                        const cats = datos.categorias.filter((c) => c.area_id === (a?.id ?? null))
                        return cats.length ? <optgroup key={a?.id ?? 'sin'} label={a?.nombre ?? 'Sin área'}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null
                    })}
                </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="sv-nombre">Nombre</Label><Input id="sv-nombre" value={v.nombre} onChange={(e) => set({ nombre: e.target.value })} required /></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.destacado} onChange={(e) => set({ destacado: e.target.checked })} /><span>Destacado <span className="block text-xs text-muted-foreground">Un paquete o servicio estrella: sale arriba y en tarjeta grande.</span></span></label>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="sv-precio">Precio</Label><Input id="sv-precio" inputMode="decimal" value={v.precio} onChange={(e) => set({ precio: e.target.value })} placeholder="55" /></div>
                <div className="space-y-1.5"><Label htmlFor="sv-max">Hasta <span className="font-normal text-muted-foreground">(si es rango)</span></Label><Input id="sv-max" inputMode="decimal" value={v.precio_max} onChange={(e) => set({ precio_max: e.target.value })} placeholder="—" /></div>
                <div className="space-y-1.5"><Label htmlFor="sv-unidad">Forma de cobro</Label>
                    <select id="sv-unidad" className={sel} value={v.unidad} onChange={(e) => set({ unidad: e.target.value as UnidadServicio })}>{UNIDADES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="sv-moneda">Moneda</Label>
                    <select id="sv-moneda" className={sel} value={v.moneda} onChange={(e) => set({ moneda: e.target.value as 'USD' | 'EUR' })}><option value="EUR">EUR</option><option value="USD">USD</option></select>
                </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="sv-resumen">Descripción</Label><textarea id="sv-resumen" rows={3} className={area} value={v.resumen} onChange={(e) => set({ resumen: e.target.value })} placeholder="Para quién es y qué resuelve" /></div>
            <div className="space-y-1.5"><Label htmlFor="sv-incluye">Incluye <span className="font-normal text-muted-foreground">(una línea por punto)</span></Label><textarea id="sv-incluye" rows={7} className={area} value={v.incluye} onChange={(e) => set({ incluye: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="sv-no">No incluye</Label><textarea id="sv-no" rows={3} className={area} value={v.no_incluye} onChange={(e) => set({ no_incluye: e.target.value })} /></div>
            <Button type="submit" disabled={guardando} className="w-full">{guardando ? 'Guardando…' : servicio ? 'Guardar cambios' : 'Crear servicio'}</Button>
        </form>
    )
}

function FormCategoria({ datos, categoria, areaId, onListo }: { datos: Datos; categoria: Categoria | null; areaId: string | null; onListo: (c: Categoria) => void }) {
    const [name, setName] = useState(categoria?.name ?? '')
    const [area_id, setArea] = useState(categoria?.area_id ?? areaId ?? '')
    const [nota, setNota] = useState(categoria?.nota ?? '')
    const [guardando, start] = useTransition()
    const guardar = () => start(async () => {
        if (categoria) {
            const r = await actualizarCategoriaAccion(categoria.id, { name, area_id: area_id || null, nota })
            if (!r.ok) return void toast.error(r.mensaje)
            toast.success(r.mensaje)
            onListo({ ...categoria, name: name.trim(), area_id: area_id || null, nota: nota.trim() || null })
        } else {
            const r = await crearCategoriaAccion(name, area_id || null)
            if (!r.ok || !r.data) return void toast.error(r.mensaje)
            if (nota.trim()) await actualizarCategoriaAccion(r.data.id, { nota })
            toast.success(r.mensaje)
            onListo({ ...r.data, nota: nota.trim() || null })
        }
    })
    return (
        <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); guardar() }}>
            <div className="space-y-1.5"><Label htmlFor="ct-nombre">Nombre</Label><Input id="ct-nombre" value={name} onChange={(e) => setName(e.target.value)} required />
                {categoria && name.trim() !== categoria.name && <p className="text-xs text-amber-700">Es la categoría de facturación: el nombre nuevo saldrá en las facturas que hagas a partir de ahora.</p>}
            </div>
            <div className="space-y-1.5"><Label htmlFor="ct-area">Área</Label>
                <select id="ct-area" className={sel} value={area_id} onChange={(e) => setArea(e.target.value)}><option value="">Sin área</option>{datos.areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="ct-nota">Condiciones <span className="font-normal text-muted-foreground">(opcional; «- » para viñetas)</span></Label>
                <textarea id="ct-nota" rows={10} className={area} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={'Qué entra y qué se presupuesta aparte en esta categoría\n- …'} />
            </div>
            <Button type="submit" disabled={guardando} className="w-full">{guardando ? 'Guardando…' : categoria ? 'Guardar categoría' : 'Crear categoría'}</Button>
        </form>
    )
}

function FormArea({ areaActual, onListo, onBorrada }: { areaActual: Area | null; onListo: (a: Area) => void; onBorrada: (id: string) => void }) {
    const [nombre, setNombre] = useState(areaActual?.nombre ?? '')
    const [color, setColor] = useState(areaActual?.color ?? COLORES[3]!)
    const [guardando, start] = useTransition()
    const guardar = () => start(async () => {
        if (areaActual) {
            const r = await actualizarAreaAccion(areaActual.id, nombre, color)
            if (!r.ok) return void toast.error(r.mensaje)
            toast.success(r.mensaje)
            onListo({ ...areaActual, nombre: nombre.trim(), color })
        } else {
            const r = await crearAreaAccion(nombre, color)
            if (!r.ok || !r.data) return void toast.error(r.mensaje)
            toast.success(r.mensaje)
            onListo(r.data)
        }
    })
    return (
        <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); guardar() }}>
            <div className="space-y-1.5"><Label htmlFor="ar-nombre">Nombre</Label><Input id="ar-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Fotografía y video" required /></div>
            <fieldset><legend className="text-sm font-medium">Color</legend>
                <div className="mt-2 flex flex-wrap gap-2">{COLORES.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-7 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`} style={{ background: c }} />)}</div>
            </fieldset>
            <Button type="submit" disabled={guardando} className="w-full">{guardando ? 'Guardando…' : areaActual ? 'Guardar área' : 'Crear área'}</Button>
            {areaActual && (
                <button type="button" className="w-full text-center text-xs text-red-600 hover:underline" onClick={() => start(async () => {
                    if (!window.confirm(`¿Borrar el área «${areaActual.nombre}»? Sus categorías y servicios no se borran: quedan «Sin área».`)) return
                    const r = await borrarAreaAccion(areaActual.id)
                    if (!r.ok) return void toast.error(r.mensaje)
                    toast.success(r.mensaje)
                    onBorrada(areaActual.id)
                })}>Borrar área</button>
            )}
        </form>
    )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export function Catalogo({ inicial }: { inicial: Datos }) {
    const [datos, setDatos] = useState(inicial)
    const [seleccion, setSeleccion] = useState<Seleccion>({ tipo: 'todo' })
    const [q, setQ] = useState('')
    const [cobro, setCobro] = useState<Cobro>('todos')
    const [vista, setVista] = useState<'tarjetas' | 'lista'>('tarjetas')
    const [verArchivados, setVerArchivados] = useState(false)
    const [panel, setPanel] = useState<Panel>(null)
    const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
    const [ocupado, start] = useTransition()

    const cambiarVista = (v: 'tarjetas' | 'lista') => setVista(v)

    const catPorId = useMemo(() => new Map(datos.categorias.map((c) => [c.id, c])), [datos.categorias])
    const areaPorId = useMemo(() => new Map(datos.areas.map((a) => [a.id, a])), [datos.areas])
    const enSeleccion = (s: Servicio) => {
        if (seleccion.tipo === 'todo') return true
        if (seleccion.tipo === 'categoria') return s.category_id === seleccion.id
        const c = catPorId.get(s.category_id ?? '')
        return (c?.area_id ?? null) === seleccion.id
    }
    const activos = datos.servicios.filter((s) => verArchivados || s.activo)
    const visibles = activos.filter((s) => enSeleccion(s) && (cobro === 'todos' || s.unidad === cobro) && coincide(s, q, catPorId.get(s.category_id ?? ''), areaPorId.get(catPorId.get(s.category_id ?? '')?.area_id ?? '')))
    const filtrando = q.trim() !== '' || cobro !== 'todos'
    // Categorías vacías: solo al mirar su área o la propia categoría (para poder añadir ahí), nunca en «Todo».
    const vaciaVisible = (c: Categoria) => !filtrando && (seleccion.tipo === 'categoria' ? c.id === seleccion.id : seleccion.tipo === 'area' && (c.area_id ?? null) === seleccion.id)
    const grupos = agrupar(datos, visibles)
        .map((g) => ({ ...g, categorias: g.categorias.filter((c) => c.servicios.length > 0 || (c.categoria !== null && vaciaVisible(c.categoria))) }))
        .filter((g) => g.categorias.length > 0)
    const cuenta = (pred: (s: Servicio) => boolean) => activos.filter(pred).length
    const archivados = datos.servicios.filter((s) => !s.activo).length
    const sinArea = datos.categorias.filter((c) => !c.area_id)

    const reemplazar = (s: Servicio, nuevo: boolean) => setDatos((d) => ({ ...d, servicios: nuevo ? [...d.servicios, s] : d.servicios.map((x) => (x.id === s.id ? s : x)) }))
    const accion = (fn: () => Promise<{ ok: boolean; mensaje: string; data?: unknown }>, despues?: (data: unknown) => void) => start(async () => {
        const r = await fn()
        if (!r.ok) return void toast.error(r.mensaje)
        toast.success(r.mensaje)
        despues?.(r.data)
    })
    const mover = (s: Servicio, dir: -1 | 1) => accion(() => moverServicioAccion(s.id, dir), () => {
        // Refleja el cambio de orden en pantalla sin recargar.
        setDatos((d) => {
            const hermanos = d.servicios.filter((x) => x.category_id === s.category_id).sort((a, b) => a.orden - b.orden)
            const i = hermanos.findIndex((x) => x.id === s.id)
            const j = i + dir
            if (j < 0 || j >= hermanos.length) return d
            ;[hermanos[i], hermanos[j]] = [hermanos[j]!, hermanos[i]!]
            const orden = new Map(hermanos.map((x, k) => [x.id, k + 1]))
            return { ...d, servicios: d.servicios.map((x) => (orden.has(x.id) ? { ...x, orden: orden.get(x.id)! } : x)) }
        })
    })

    const acciones = (s: Servicio) => (
        <span className="flex shrink-0 items-center">
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Editar ${s.nombre}`} onClick={() => setPanel({ tipo: 'servicio', servicio: s, categoriaId: s.category_id ?? '' })}><Pencil /></Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Duplicar ${s.nombre}`} disabled={ocupado} onClick={() => accion(() => duplicarServicioAccion(s.id), (d) => reemplazar(d as Servicio, true))}><Copy /></Button>
            {!filtrando && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir ${s.nombre}`} disabled={ocupado} onClick={() => mover(s, -1)}><ArrowUp /></Button>}
            {!filtrando && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar ${s.nombre}`} disabled={ocupado} onClick={() => mover(s, 1)}><ArrowDown /></Button>}
            <Button type="button" size="icon-sm" variant="ghost" aria-label={s.activo ? `Archivar ${s.nombre}` : `Reactivar ${s.nombre}`} disabled={ocupado}
                onClick={() => accion(() => activarServicioAccion(s.id, !s.activo), () => reemplazar({ ...s, activo: !s.activo }, false))}>{s.activo ? <Archive /> : <RotateCcw />}</Button>
        </span>
    )

    const tarjeta = (s: Servicio) => (
        <article key={s.id} className={`flex flex-col rounded-xl border bg-card p-5 ${s.activo ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 font-semibold"><Star className="size-4 shrink-0 fill-amber-400 text-amber-400" />{s.nombre}{!s.activo && <span className="text-xs font-normal text-muted-foreground">(archivado)</span>}</h4>
                    <p className="mt-1 font-display text-2xl font-bold tabular-nums">{precioTexto(s)}</p>
                </div>
                {acciones(s)}
            </div>
            {s.resumen && <p className="mt-2 text-sm text-muted-foreground">{s.resumen}</p>}
            {s.incluye.length > 0 && <ul className="mt-3 space-y-1.5 text-sm">{s.incluye.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{x}</li>)}</ul>}
            {s.no_incluye.length > 0 && <ul className="mt-3 space-y-1 text-[13px] text-muted-foreground">{s.no_incluye.map((x) => <li key={x} className="flex gap-2"><Minus className="mt-0.5 size-4 shrink-0" />{x}</li>)}</ul>}
        </article>
    )

    const fila = (s: Servicio) => (
        <li key={s.id} className={`flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 ${s.activo ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium">{s.destacado && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}{s.nombre}{!s.activo && <span className="text-xs font-normal text-muted-foreground">(archivado)</span>}</div>
                {s.resumen && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{s.resumen}</p>}
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{unidadLabel(s.unidad)}</span>
            <span className="min-w-28 whitespace-nowrap text-right text-sm font-semibold tabular-nums">{precioTexto(s)}</span>
            {acciones(s)}
        </li>
    )

    const nav = (o: { activo: boolean; onClick: () => void; children: React.ReactNode; n: number; color?: string; key?: string }) => (
        <button key={o.key} type="button" onClick={o.onClick} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${o.activo ? 'bg-accent font-semibold' : 'hover:bg-accent/60'}`}>
            {o.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
            <span className="min-w-0 flex-1 truncate">{o.children}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{o.n}</span>
        </button>
    )
    const es = (s: Seleccion) => JSON.stringify(s) === JSON.stringify(seleccion)
    const categoriaPorDefecto = seleccion.tipo === 'categoria' ? seleccion.id : seleccion.tipo === 'area' ? datos.categorias.find((c) => c.area_id === seleccion.id)?.id ?? '' : ''

    return (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Áreas y categorías">
                {nav({ activo: es({ tipo: 'todo' }), onClick: () => setSeleccion({ tipo: 'todo' }), n: activos.length, children: 'Todo el catálogo' })}
                {[...datos.areas].sort((a, b) => a.orden - b.orden).map((a) => {
                    const cats = datos.categorias.filter((c) => c.area_id === a.id).sort((x, y) => x.orden - y.orden || x.name.localeCompare(y.name, 'es'))
                    return (
                        <div key={a.id}>
                            <div className="group flex items-center">
                                <div className="min-w-0 flex-1">{nav({ activo: es({ tipo: 'area', id: a.id }), onClick: () => setSeleccion({ tipo: 'area', id: a.id }), n: cuenta((s) => catPorId.get(s.category_id ?? '')?.area_id === a.id), color: a.color, children: a.nombre })}</div>
                                <button type="button" aria-label={`Editar el área ${a.nombre}`} className="ml-0.5 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 focus:opacity-100" onClick={() => setPanel({ tipo: 'area', area: a })}><Pencil className="size-3.5" /></button>
                            </div>
                            <div className="ml-4 border-l pl-2">
                                {cats.map((c) => nav({ key: c.id, activo: es({ tipo: 'categoria', id: c.id }), onClick: () => setSeleccion({ tipo: 'categoria', id: c.id }), n: cuenta((s) => s.category_id === c.id), children: c.name }))}
                                <button type="button" className="mt-0.5 flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setPanel({ tipo: 'categoria', categoria: null, areaId: a.id })}><Plus className="size-3" /> Categoría</button>
                            </div>
                        </div>
                    )
                })}
                {sinArea.length > 0 && (
                    <div>
                        {nav({ activo: es({ tipo: 'area', id: null }), onClick: () => setSeleccion({ tipo: 'area', id: null }), n: cuenta((s) => !catPorId.get(s.category_id ?? '')?.area_id), color: '#9ca3af', children: 'Sin área' })}
                        <p className="ml-4 mt-1 text-[11px] leading-snug text-muted-foreground">Categorías de facturación sin área: edítalas para asignarles una.</p>
                    </div>
                )}
                <button type="button" className="flex items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => setPanel({ tipo: 'area', area: null })}><Plus className="size-4" /> Nueva área</button>
            </aside>

            <div className="min-w-0 space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                    <label className="relative min-w-[14rem] flex-1">
                        <span className="sr-only">Buscar servicios</span>
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: seo, mantenimiento, logo…" className="pl-8" />
                    </label>
                    <div className="flex rounded-md border p-0.5" role="group" aria-label="Forma de cobro">
                        {(['todos', 'mes', 'unico', 'hora'] as const).map((c) => (
                            <button key={c} type="button" aria-pressed={cobro === c} onClick={() => setCobro(c)} className={`rounded px-2.5 py-1 text-xs font-medium ${cobro === c ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                {c === 'todos' ? 'Todos' : unidadLabel(c)}
                            </button>
                        ))}
                    </div>
                    <div className="flex rounded-md border p-0.5" role="group" aria-label="Vista">
                        <button type="button" aria-pressed={vista === 'tarjetas'} aria-label="Ver en tarjetas" onClick={() => cambiarVista('tarjetas')} className={`rounded p-1.5 ${vista === 'tarjetas' ? 'bg-accent' : 'text-muted-foreground'}`}><LayoutGrid className="size-4" /></button>
                        <button type="button" aria-pressed={vista === 'lista'} aria-label="Ver en lista" onClick={() => cambiarVista('lista')} className={`rounded p-1.5 ${vista === 'lista' ? 'bg-accent' : 'text-muted-foreground'}`}><List className="size-4" /></button>
                    </div>
                    <Button type="button" size="sm" onClick={() => setPanel({ tipo: 'servicio', servicio: null, categoriaId: categoriaPorDefecto })}><Plus /> Añadir servicio</Button>
                </div>

                {grupos.length === 0 && (
                    <div className="rounded-xl border border-dashed p-10 text-center text-sm">
                        <p className="font-medium">{filtrando ? 'Nada coincide con la búsqueda.' : 'Aún no hay servicios aquí.'}</p>
                        <p className="mt-1 text-muted-foreground">{filtrando ? 'Prueba con otra palabra o quita el filtro de cobro.' : 'Usa «Añadir servicio» para crear el primero.'}</p>
                    </div>
                )}

                {grupos.map((g) => (
                    <section key={g.area?.id ?? 'sin-area'} className="space-y-4">
                        <h2 className="flex items-center gap-2 text-lg font-semibold"><span className="h-5 w-1.5 rounded-full" style={{ background: g.area?.color ?? '#9ca3af' }} />{g.area?.nombre ?? 'Sin área'}</h2>
                        {g.categorias.map((c) => {
                            const clave = c.categoria?.id ?? `sin-${g.area?.id ?? 'x'}`
                            const destacados = vista === 'tarjetas' ? c.servicios.filter((s) => s.destacado) : []
                            const resto = vista === 'tarjetas' ? c.servicios.filter((s) => !s.destacado) : c.servicios
                            return (
                                <div key={clave} className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <h3 className="text-sm font-semibold">{c.categoria?.name ?? 'Sin categoría'}</h3>
                                        <span className="text-xs text-muted-foreground">{c.servicios.length} {c.servicios.length === 1 ? 'servicio' : 'servicios'}</span>
                                        {c.categoria?.nota && (
                                            <button type="button" className="text-xs font-medium text-teal-700 hover:underline" onClick={() => setAbiertas((x) => { const n = new Set(x); if (n.has(clave)) n.delete(clave); else n.add(clave); return n })}>
                                                {abiertas.has(clave) ? 'Ocultar condiciones' : 'Ver condiciones'}
                                            </button>
                                        )}
                                        <span className="ml-auto flex gap-1">
                                            {c.categoria && <Button type="button" size="sm" variant="ghost" onClick={() => setPanel({ tipo: 'categoria', categoria: c.categoria, areaId: c.categoria!.area_id })}><Pencil /> Categoría</Button>}
                                            <Button type="button" size="sm" variant="ghost" onClick={() => setPanel({ tipo: 'servicio', servicio: null, categoriaId: c.categoria?.id ?? '' })}><Plus /> Añadir aquí</Button>
                                        </span>
                                    </div>
                                    {c.categoria?.nota && abiertas.has(clave) && <div className="rounded-lg border bg-muted/40 px-4 py-3"><Nota texto={c.categoria.nota} /></div>}
                                    {destacados.length > 0 && <div className="grid gap-4 md:grid-cols-2">{destacados.map(tarjeta)}</div>}
                                    {resto.length > 0 && <ul className="divide-y rounded-xl border bg-card">{resto.map(fila)}</ul>}
                                    {c.servicios.length === 0 && <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">Sin servicios todavía.</p>}
                                </div>
                            )
                        })}
                    </section>
                ))}

                {archivados > 0 && (
                    <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => setVerArchivados((x) => !x)}>
                        {verArchivados ? 'Ocultar archivados' : `Ver archivados (${archivados})`}
                    </button>
                )}
            </div>

            <Sheet open={panel !== null} onOpenChange={(o) => { if (!o) setPanel(null) }}>
                <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle>
                            {panel?.tipo === 'servicio' ? (panel.servicio ? 'Editar servicio' : 'Nuevo servicio')
                                : panel?.tipo === 'categoria' ? (panel.categoria ? 'Editar categoría' : 'Nueva categoría')
                                    : panel?.tipo === 'area' ? (panel.area ? 'Editar área' : 'Nueva área') : ''}
                        </SheetTitle>
                        <SheetDescription>
                            {panel?.tipo === 'categoria' ? 'Las categorías son las mismas de facturación: su nombre sale en las facturas.' : panel?.tipo === 'area' ? 'Las grandes líneas de negocio: agrupan categorías.' : 'Precio, forma de cobro y lo que incluye.'}
                        </SheetDescription>
                    </SheetHeader>
                    {panel?.tipo === 'servicio' && <FormServicio key={panel.servicio?.id ?? `nuevo-${panel.categoriaId}`} datos={datos} servicio={panel.servicio} categoriaId={panel.categoriaId} onListo={(s, nuevo) => { reemplazar(s, nuevo); setPanel(null) }} />}
                    {panel?.tipo === 'categoria' && <FormCategoria key={panel.categoria?.id ?? 'nueva'} datos={datos} categoria={panel.categoria} areaId={panel.areaId} onListo={(c) => { setDatos((d) => ({ ...d, categorias: d.categorias.some((x) => x.id === c.id) ? d.categorias.map((x) => (x.id === c.id ? c : x)) : [...d.categorias, c] })); setPanel(null) }} />}
                    {panel?.tipo === 'area' && <FormArea key={panel.area?.id ?? 'nueva'} areaActual={panel.area} onListo={(a) => { setDatos((d) => ({ ...d, areas: d.areas.some((x) => x.id === a.id) ? d.areas.map((x) => (x.id === a.id ? a : x)) : [...d.areas, a] })); setPanel(null) }} onBorrada={(id) => { setDatos((d) => ({ ...d, areas: d.areas.filter((x) => x.id !== id), categorias: d.categorias.map((c) => (c.area_id === id ? { ...c, area_id: null } : c)) })); setSeleccion({ tipo: 'todo' }); setPanel(null) }} />}
                </SheetContent>
            </Sheet>
        </div>
    )
}
