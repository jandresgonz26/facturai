'use client'
/**
 * «Añadir del catálogo»: un buscador desplegable con los servicios activos agrupados por área y categoría.
 * Al elegir uno se llama a `onElegir` con el servicio y el nombre de su categoría (la de facturación).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Star } from 'lucide-react'
import { catalogoAccion } from '@/app/servicios/acciones'
import { agrupar, coincide, precioTexto, unidadLabel, type Catalogo, type Servicio } from '@/lib/servicios/tipos'

export function CatalogoPicker({ onElegir, className = '', etiqueta = 'Añadir del catálogo' }: { onElegir: (s: Servicio, categoria: string | undefined) => void; className?: string; etiqueta?: string }) {
    const [abierto, setAbierto] = useState(false)
    const [cat, setCat] = useState<Catalogo | null>(null)
    const [q, setQ] = useState('')
    const caja = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!abierto) return
        const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
        document.addEventListener('mousedown', fuera)
        document.addEventListener('keydown', esc)
        return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
    }, [abierto])

    const grupos = useMemo(() => {
        if (!cat) return []
        const catPorId = new Map(cat.categorias.map((c) => [c.id, c]))
        const areaPorId = new Map(cat.areas.map((a) => [a.id, a]))
        const visibles = cat.servicios.filter((s) => { const c = catPorId.get(s.category_id ?? ''); return coincide(s, q, c, c?.area_id ? areaPorId.get(c.area_id) : undefined) })
        return agrupar(cat, visibles).map((g) => ({ ...g, categorias: g.categorias.filter((c) => c.servicios.length > 0) })).filter((g) => g.categorias.length > 0)
    }, [cat, q])

    const abrir = async () => {
        setAbierto((x) => !x)
        if (!cat) setCat(await catalogoAccion())
    }

    return (
        <div ref={caja} className={`relative ${className}`}>
            <button type="button" onClick={abrir} aria-expanded={abierto} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                <Search className="size-4" /> {etiqueta}…
            </button>
            {abierto && (
                <div className="absolute left-0 z-30 mt-1 w-[min(26rem,90vw)] rounded-lg border bg-popover shadow-lg">
                    <div className="border-b p-2">
                        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: seo, mantenimiento, logo…" aria-label="Buscar en el catálogo"
                            className="h-8 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring" />
                    </div>
                    <div className="max-h-80 overflow-y-auto py-1 text-sm">
                        {!cat && <p className="px-3 py-4 text-center text-muted-foreground">Cargando…</p>}
                        {cat && grupos.length === 0 && <p className="px-3 py-4 text-center text-muted-foreground">{cat.servicios.length ? 'Nada coincide con la búsqueda.' : 'El catálogo está vacío: créalo en Servicios.'}</p>}
                        {grupos.map((g) => g.categorias.map((c) => (
                            <div key={`${g.area?.id ?? 'x'}-${c.categoria?.id ?? 'sin'}`}>
                                <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <span className="size-2 rounded-full" style={{ background: g.area?.color ?? '#9ca3af' }} />
                                    {g.area?.nombre ?? 'Sin área'} · {c.categoria?.name ?? 'Sin categoría'}
                                </div>
                                {c.servicios.map((s) => (
                                    <button key={s.id} type="button" onClick={() => { onElegir(s, c.categoria?.name); setAbierto(false); setQ('') }}
                                        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-accent">
                                        <span className="flex min-w-0 items-center gap-1.5">{s.destacado && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}<span className="truncate">{s.nombre}</span></span>
                                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{precioTexto(s)} · {unidadLabel(s.unidad)}</span>
                                    </button>
                                ))}
                            </div>
                        )))}
                    </div>
                </div>
            )}
        </div>
    )
}
