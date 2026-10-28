'use client'
/**
 * Editor de la tabla de inversión. Se monta al abrirse (empieza siempre desde los precios guardados),
 * trabaja sobre un borrador y lo aplica con «Guardar precios»; luego el guardado automático lo lleva a la base.
 *
 * Se lee como una hoja de cálculo: una fila por ítem con los encabezados una sola vez arriba, el total de
 * cada línea alineado a la derecha y lo poco usado (descuento, «incluido», «a convenir», mover) detrás de
 * «Ajustes» en cada fila. Las secciones van separadas por una línea, con su título y una pista a la izquierda.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, SlidersHorizontal, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { calcular, dinero, FRECUENCIAS, frecuencia, itemVacio, netoItem, opcionVacia, textoDescuento, uid, type Descuento, type Frecuencia, type ItemPrecio, type Moneda, type Pricing } from '@/lib/propuestas/precios'
import { cotizacionesAccion } from '../acciones'
import { catalogoAccion } from '@/app/servicios/acciones'
import { aItemPropuesta, precioTexto, type Servicio } from '@/lib/servicios/tipos'

/** Campo de formulario normal (secciones de ajustes). */
const campo = 'h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30'
/** Celda de la tabla: sin borde hasta que pasas o escribes, para que la fila se lea como texto. */
const celda = 'h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/25'
/** Columnas de la tabla de ítems (encabezado y filas comparten la plantilla). */
const columnas = 'sm:grid-cols-[minmax(10rem,1fr)_3.75rem_6rem_6.5rem_8rem_6rem_4rem]'

/** Número editable sin pelearse con el cursor («1.», «0,5»…). */
function Num({ id, value, onChange, min = 0, max, className = '', etiqueta, placeholder }: { id: string; value: number; onChange: (n: number) => void; min?: number; max?: number; className?: string; etiqueta: string; placeholder?: string }) {
    const [txt, setTxt] = useState(String(value))
    useEffect(() => {
        if (Number(txt.replace(',', '.')) !== value) setTxt(String(value))
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el valor desde fuera
    }, [value])
    return (
        <input
            id={id}
            aria-label={etiqueta}
            inputMode="decimal"
            value={txt}
            placeholder={placeholder}
            onChange={(e) => {
                setTxt(e.target.value)
                const n = Number(e.target.value.replace(',', '.'))
                if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(Math.max(min, max != null ? Math.min(max, n) : n))
            }}
            onBlur={() => setTxt(String(value))}
            className={`tabular-nums ${className}`}
        />
    )
}

/** Descripción del ítem: crece con el texto, en letra pequeña bajo el nombre del servicio. */
function Descripcion({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
    const ref = useRef<HTMLTextAreaElement>(null)
    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }, [value])
    return <textarea ref={ref} id={id} aria-label="Descripción" rows={1} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Añadir descripción (opcional)" className="block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] leading-snug text-muted-foreground outline-none transition-colors placeholder:text-transparent group-hover:placeholder:text-muted-foreground/50 hover:border-border focus:border-ring focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring/25 focus:placeholder:text-muted-foreground/50" />
}

function EditorDescuento({ id, d, onChange, moneda }: { id: string; d: Descuento | null; onChange: (d: Descuento | null) => void; moneda: Moneda }) {
    return (
        <div className="flex items-center gap-1.5">
            <select id={`${id}-tipo`} aria-label="Tipo de descuento" value={d?.tipo ?? ''} onChange={(e) => onChange(e.target.value ? { tipo: e.target.value as Descuento['tipo'], valor: d?.valor || (e.target.value === 'pct' ? 10 : 50) } : null)} className={`${campo} w-36`}>
                <option value="">Sin descuento</option>
                <option value="pct">Descuento en %</option>
                <option value="monto">Descuento en {moneda === 'EUR' ? '€' : '$'}</option>
            </select>
            {d && <Num id={`${id}-valor`} etiqueta="Valor del descuento" value={d.valor} max={d.tipo === 'pct' ? 100 : undefined} onChange={(v) => onChange({ ...d, valor: v })} className={`${campo} w-20 text-right`} />}
        </div>
    )
}

/** Marcas que resumen los ajustes de una fila (para verlos sin abrirlos). */
function Marcas({ item, moneda }: { item: ItemPrecio; moneda: Moneda }) {
    // «Incluido» y «A convenir» ya se leen en el total; aquí solo lo que no se ve: el descuento.
    const m: string[] = []
    if (item.descuento && !item.incluido && !item.a_convenir) m.push(`−${textoDescuento(item.descuento, moneda)}`)
    if (!m.length) return null
    return (
        <span className="flex flex-wrap justify-end gap-1">
            {m.map((x) => <span key={x} className="rounded-full bg-emerald-50 px-1.5 py-px text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{x}</span>)}
        </span>
    )
}

function FilaItem({ item, onChange, onQuitar, onSubir, onBajar, onDuplicar, moneda }: { item: ItemPrecio; onChange: (i: ItemPrecio) => void; onQuitar: () => void; onSubir?: () => void; onBajar?: () => void; onDuplicar: () => void; moneda: Moneda }) {
    const [ajustes, setAjustes] = useState(false)
    const set = <K extends keyof ItemPrecio>(k: K, v: ItemPrecio[K]) => onChange({ ...item, [k]: v })
    const id = `it-${item.id}`
    const total = item.incluido ? 'Incluido' : item.a_convenir ? 'A convenir' : dinero(netoItem(item), moneda)
    return (
        <li className="group border-b border-border/70 py-2 last:border-b-0">
            <div className={`grid grid-cols-[1fr_1fr_1fr] items-start gap-x-1 gap-y-1 ${columnas}`}>
                <input id={`${id}-servicio`} aria-label="Servicio" value={item.servicio} onChange={(e) => set('servicio', e.target.value)} placeholder="Nombre del servicio" className={`${celda} col-span-3 font-medium sm:col-span-1`} />
                <Num id={`${id}-cantidad`} etiqueta="Cantidad" placeholder="Cant." value={item.cantidad} onChange={(v) => set('cantidad', v)} className={celda} />
                <input id={`${id}-unidad`} aria-label="Unidad" value={item.unidad} onChange={(e) => set('unidad', e.target.value)} placeholder="horas…" className={`${celda} placeholder:text-transparent group-hover:placeholder:text-muted-foreground/60 focus:placeholder:text-muted-foreground/60`} />
                <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-muted-foreground">{moneda === 'EUR' ? '€' : '$'}</span>
                    <Num id={`${id}-precio`} etiqueta={item.unidad ? `Precio por ${item.unidad}` : 'Precio unitario'} value={item.precio} onChange={(v) => set('precio', v)} className={`${celda} pl-5`} />
                </div>
                <select id={`${id}-frecuencia`} aria-label="Se cobra" value={item.frecuencia} onChange={(e) => set('frecuencia', e.target.value as Frecuencia)} className={`${celda} col-span-2 cursor-pointer sm:col-span-1`}>
                    {FRECUENCIAS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <div className="flex min-h-9 flex-col items-end justify-center gap-0.5 pr-1 text-right">
                    <span className={`text-sm font-semibold tabular-nums ${item.incluido ? 'text-emerald-700 dark:text-emerald-400' : item.a_convenir ? 'text-muted-foreground' : ''}`}>
                        {total}
                        {!item.incluido && !item.a_convenir && frecuencia(item.frecuencia).sufijo && <span className="font-normal text-muted-foreground">{frecuencia(item.frecuencia).sufijo}</span>}
                    </span>
                    <Marcas item={item} moneda={moneda} />
                </div>
                <div className="flex h-9 items-center justify-end gap-0.5">
                    <Button type="button" size="icon-xs" variant={ajustes ? 'secondary' : 'ghost'} onClick={() => setAjustes((a) => !a)} aria-label="Ajustes de la línea" aria-expanded={ajustes} title="Descuento, incluido, a convenir, mover"><SlidersHorizontal /></Button>
                    <Button type="button" size="icon-xs" variant="ghost" onClick={onQuitar} aria-label="Quitar línea" title="Quitar línea" className="text-muted-foreground hover:text-destructive"><Trash2 /></Button>
                </div>
                <div className="col-span-3 sm:col-span-6">
                    <Descripcion id={`${id}-desc`} value={item.descripcion} onChange={(v) => set('descripcion', v)} />
                </div>
            </div>
            {ajustes && (
                <div className="mt-2 ml-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                    <EditorDescuento id={id} d={item.descuento} onChange={(d) => set('descuento', d)} moneda={moneda} />
                    {item.descuento && <label className="flex items-center gap-1.5"><input type="checkbox" checked={item.tachado} onChange={(e) => set('tachado', e.target.checked)} /> Mostrar el precio anterior tachado</label>}
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={item.incluido} onChange={(e) => onChange({ ...item, incluido: e.target.checked, a_convenir: e.target.checked ? false : item.a_convenir })} /> Incluido sin costo</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={item.a_convenir} onChange={(e) => onChange({ ...item, a_convenir: e.target.checked, incluido: e.target.checked ? false : item.incluido })} /> Precio a convenir</label>
                    <span className="ml-auto flex items-center gap-0.5">
                        {onSubir && <Button type="button" size="xs" variant="ghost" onClick={onSubir}><ArrowUp /> Subir</Button>}
                        {onBajar && <Button type="button" size="xs" variant="ghost" onClick={onBajar}><ArrowDown /> Bajar</Button>}
                        <Button type="button" size="xs" variant="ghost" onClick={onDuplicar}><Copy /> Duplicar</Button>
                    </span>
                </div>
            )}
        </li>
    )
}

function TablaItems({ items, onChange, moneda, textoAgregar, pie }: { items: ItemPrecio[]; onChange: (xs: ItemPrecio[]) => void; moneda: Moneda; textoAgregar: string; pie?: React.ReactNode }) {
    const mover = (i: number, d: number) => {
        const xs = [...items]
        ;[xs[i], xs[i + d]] = [xs[i + d], xs[i]]
        onChange(xs)
    }
    return (
        <div>
            {items.length > 0 && (
                <div className={`hidden gap-x-1 border-b px-2 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:grid ${columnas}`} aria-hidden>
                    <span>Servicio</span>
                    <span>Cant.</span>
                    <span>Unidad</span>
                    <span>Precio</span>
                    <span>Se cobra</span>
                    <span className="pr-1 text-right">Total</span>
                    <span />
                </div>
            )}
            <ul>
                {items.map((it, i) => (
                    <FilaItem
                        key={it.id}
                        item={it}
                        moneda={moneda}
                        onChange={(n) => onChange(items.map((x) => (x.id === it.id ? n : x)))}
                        onQuitar={() => onChange(items.filter((x) => x.id !== it.id))}
                        onDuplicar={() => onChange([...items.slice(0, i + 1), { ...it, id: uid() }, ...items.slice(i + 1)])}
                        onSubir={i > 0 ? () => mover(i, -1) : undefined}
                        onBajar={i < items.length - 1 ? () => mover(i, 1) : undefined}
                    />
                ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...items, itemVacio()])}><Plus /> {textoAgregar}</Button>
                {pie}
            </div>
        </div>
    )
}

/** Una sección del editor: título y pista a la izquierda, controles a la derecha. */
function Seccion({ titulo, pista, children, extra }: { titulo: string; pista?: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }) {
    return (
        <section className="grid gap-x-8 gap-y-3 border-t py-6 first:border-t-0 first:pt-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
            <div>
                <h3 className="text-sm font-semibold">{titulo}</h3>
                {pista && <p className="mt-1 max-w-prose text-[13px] leading-snug text-muted-foreground">{pista}</p>}
                {extra}
            </div>
            <div className="min-w-0">{children}</div>
        </section>
    )
}

const PLANES: { label: string; cuotas: [string, number][] }[] = [
    { label: '50 / 50', cuotas: [['Al aceptar la propuesta', 50], ['Al entregar', 50]] },
    { label: '40 / 30 / 30', cuotas: [['Al aceptar la propuesta', 40], ['A mitad del proyecto', 30], ['Al entregar', 30]] },
    { label: '3 cuotas iguales', cuotas: [['Primera cuota', 33.33], ['Segunda cuota', 33.33], ['Tercera cuota', 33.34]] },
    { label: '4 cuotas iguales', cuotas: [['Primera cuota', 25], ['Segunda cuota', 25], ['Tercera cuota', 25], ['Cuarta cuota', 25]] },
]

export function EditorPrecios({ abierto, onCerrar, pricing, moneda, onGuardar, clientId }: { abierto: boolean; onCerrar: () => void; pricing: Pricing; moneda: Moneda; onGuardar: (p: Pricing) => void; clientId: string }) {
    const [p, setP] = useState(pricing)
    const [sel, setSel] = useState(pricing.opciones[0]?.id ?? '')
    const [cotizaciones, setCotizaciones] = useState<Awaited<ReturnType<typeof cotizacionesAccion>> | null>(null)
    const [catalogo, setCatalogo] = useState<Servicio[] | null>(null)

    const opcion = p.opciones.find((o) => o.id === sel) ?? p.opciones[0]
    const setOpcion = (cambio: Partial<typeof opcion>) => setP({ ...p, opciones: p.opciones.map((o) => (o.id === opcion.id ? { ...o, ...cambio } : o)) })
    const t = calcular(p, opcion?.id, p.extras.map((e) => e.id))
    const sumaPct = p.plan_pagos.reduce((s, c) => s + c.pct, 0)
    const planOk = Math.abs(sumaPct - 100) < 0.001
    const varias = p.opciones.length > 1

    async function importar(id: string) {
        const q = cotizaciones?.find((x) => x.id === id)
        if (!q) return
        const nuevos = q.items.map((i) => itemVacio({ servicio: i.service, descripcion: i.description, cantidad: Number(i.quantity) || 1, precio: Number(i.unit_price) || 0 }))
        const actuales = opcion.items.filter((i) => i.servicio.trim() || i.precio > 0)
        setOpcion({ items: [...actuales, ...nuevos] })
        toast.success(`${nuevos.length} ${nuevos.length === 1 ? 'línea importada' : 'líneas importadas'}${q.currency !== moneda ? ` (la cotización estaba en ${q.currency}: revisa los precios)` : ''}.`)
    }

    function anadirDelCatalogo(id: string) {
        const sv = catalogo?.find((x) => x.id === id)
        if (!sv) return
        const actuales = opcion.items.filter((i) => i.servicio.trim() || i.precio > 0)
        setOpcion({ items: [...actuales, aItemPropuesta(sv)] })
        toast.success(`«${sv.nombre}» añadido${sv.moneda !== moneda ? ` (su precio está en ${sv.moneda}: revísalo)` : ''}.`)
    }

    function anadirOpcion() {
        const n = opcionVacia({ nombre: `Opción ${p.opciones.length + 1}`, items: opcion ? opcion.items.map((i) => ({ ...i, id: uid() })) : [itemVacio()] })
        setP({ ...p, opciones: [...p.opciones.map((o, i) => (i === 0 && !o.nombre ? { ...o, nombre: 'Opción 1' } : o)), n] })
        setSel(n.id)
    }

    const delCatalogo = (
        <select
            id="pr-catalogo"
            aria-label="Añadir un servicio del catálogo"
            value=""
            onFocus={async () => { if (!catalogo) setCatalogo(await catalogoAccion()) }}
            onChange={(e) => anadirDelCatalogo(e.target.value)}
            className="h-8 max-w-64 cursor-pointer rounded-md border border-transparent bg-transparent px-2 text-sm text-muted-foreground outline-none hover:border-border hover:text-foreground focus:border-ring"
        >
            <option value="" disabled>{catalogo ? (catalogo.length ? 'Añadir del catálogo…' : 'El catálogo está vacío') : 'Añadir del catálogo…'}</option>
            {(['paquete', 'adicional'] as const).map((t) => {
                const xs = (catalogo ?? []).filter((x) => x.tipo === t)
                return xs.length ? <optgroup key={t} label={t === 'paquete' ? 'Paquetes' : 'Servicios adicionales'}>{xs.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {precioTexto(x)}</option>)}</optgroup> : null
            })}
        </select>
    )

    const importador = (
        <select
            id="pr-cotizacion"
            aria-label="Importar líneas de una cotización"
            value=""
            onFocus={async () => { if (!cotizaciones) setCotizaciones(await cotizacionesAccion(clientId)) }}
            onChange={(e) => importar(e.target.value)}
            className="h-8 max-w-64 cursor-pointer rounded-md border border-transparent bg-transparent px-2 text-sm text-muted-foreground outline-none hover:border-border hover:text-foreground focus:border-ring"
        >
            <option value="" disabled>{cotizaciones ? (cotizaciones.length ? 'Importar de una cotización…' : 'No hay cotizaciones con importe') : 'Importar de una cotización…'}</option>
            {cotizaciones?.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
        </select>
    )

    const resumenTotal = [
        t.unico.total > 0 ? `${dinero(t.unico.total, moneda)} pago único` : '',
        ...t.recurrentes.map((r) => `${dinero(r.bloque.total, moneda)}${frecuencia(r.frecuencia).sufijo}`),
    ].filter(Boolean)

    return (
        <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
            <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-5xl">
                <DialogHeader className="border-b px-6 pt-5 pb-4">
                    <DialogTitle>Precios de la propuesta</DialogTitle>
                    <DialogDescription>Todo en {moneda}. El cliente verá estos precios en la propuesta y el total se le actualiza solo según lo que elija.</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6">
                    <Seccion
                        titulo="Qué incluye"
                        pista={varias ? 'Cada opción es un paquete. El cliente elige una al aceptar.' : 'Una línea por servicio. El total de cada línea es cantidad × precio.'}
                        extra={!varias && <Button type="button" variant="link" size="sm" className="mt-1 h-auto px-0 text-[13px]" onClick={anadirOpcion}>Ofrecer varias opciones</Button>}
                    >
                        {varias && opcion && (
                            <div className="mb-4 space-y-3">
                                <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Opciones">
                                    {p.opciones.map((o, i) => (
                                        <button key={o.id} type="button" role="tab" aria-selected={o.id === opcion.id} onClick={() => setSel(o.id)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${o.id === opcion.id ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                                            {o.recomendada && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Recomendada" />}
                                            {o.nombre || `Opción ${i + 1}`}
                                        </button>
                                    ))}
                                    {p.opciones.length < 6 && <button type="button" onClick={anadirOpcion} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /> Opción</button>}
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[13rem_minmax(0,1fr)_auto_auto] sm:items-center">
                                    <input aria-label="Nombre de la opción" value={opcion.nombre} onChange={(e) => setOpcion({ nombre: e.target.value })} placeholder="Nombre (ej.: Profesional)" className={`${campo} font-medium`} />
                                    <input aria-label="Descripción de la opción" value={opcion.descripcion} onChange={(e) => setOpcion({ descripcion: e.target.value })} placeholder="Para quién es, en una frase" className={campo} />
                                    <label className="flex items-center gap-1.5 text-sm whitespace-nowrap"><input type="checkbox" checked={opcion.recomendada} onChange={(e) => setP({ ...p, opciones: p.opciones.map((o) => ({ ...o, recomendada: o.id === opcion.id ? e.target.checked : e.target.checked ? false : o.recomendada })) })} /> Recomendada</label>
                                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => { const resto = p.opciones.filter((o) => o.id !== opcion.id); setP({ ...p, opciones: resto }); setSel(resto[0].id) }}><Trash2 /> Quitar opción</Button>
                                </div>
                            </div>
                        )}
                        {opcion && <TablaItems items={opcion.items} onChange={(items) => setOpcion({ items })} moneda={moneda} textoAgregar="Añadir línea" pie={<>{delCatalogo}{importador}</>} />}
                    </Seccion>

                    <Seccion titulo="Extras opcionales" pista="El cliente los marca si los quiere y se suman a su total.">
                        <TablaItems items={p.extras} onChange={(extras) => setP({ ...p, extras })} moneda={moneda} textoAgregar="Añadir extra" />
                    </Seccion>

                    <Seccion titulo="Descuento e impuesto" pista="Se aplican sobre los totales. Cada línea puede llevar además su propio descuento en «Ajustes».">
                        <div className="grid gap-5 sm:grid-cols-2">
                            <div className="space-y-2">
                                <div className="text-[13px] font-medium text-muted-foreground">Descuento general</div>
                                <EditorDescuento id="dg" d={p.descuento} onChange={(d) => setP({ ...p, descuento: d ? { motivo: p.descuento?.motivo ?? '', aplica: p.descuento?.aplica ?? 'unico', ...d } : null })} moneda={moneda} />
                                {p.descuento && (
                                    <>
                                        <input aria-label="Motivo del descuento" value={p.descuento.motivo} onChange={(e) => setP({ ...p, descuento: { ...p.descuento!, motivo: e.target.value } })} placeholder="Motivo (ej.: pago anticipado)" className={campo} />
                                        <select aria-label="A qué aplica el descuento" value={p.descuento.aplica} onChange={(e) => setP({ ...p, descuento: { ...p.descuento!, aplica: e.target.value as 'unico' | 'recurrente' | 'ambos' } })} className={campo}>
                                            <option value="unico">Sobre el pago único</option>
                                            <option value="recurrente">Sobre lo recurrente</option>
                                            <option value="ambos">Sobre todo</option>
                                        </select>
                                    </>
                                )}
                            </div>
                            <div className="space-y-2">
                                <div className="text-[13px] font-medium text-muted-foreground">Impuesto</div>
                                <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={!!p.impuesto} onChange={(e) => setP({ ...p, impuesto: e.target.checked ? { nombre: 'IVA', pct: 16 } : null })} /> Sumar un impuesto</label>
                                {p.impuesto && (
                                    <div className="flex items-center gap-2">
                                        <input aria-label="Nombre del impuesto" value={p.impuesto.nombre} onChange={(e) => setP({ ...p, impuesto: { ...p.impuesto!, nombre: e.target.value } })} className={campo} />
                                        <Num id="imp-pct" etiqueta="Porcentaje del impuesto" value={p.impuesto.pct} max={100} onChange={(v) => setP({ ...p, impuesto: { ...p.impuesto!, pct: v } })} className={`${campo} w-20 text-right`} />
                                        <span className="text-sm text-muted-foreground">%</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Seccion>

                    <Seccion titulo="Forma de pago" pista="Cómo se reparte el pago único.">
                        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Formas de pago rápidas">
                            <button type="button" onClick={() => setP({ ...p, plan_pagos: [] })} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${p.plan_pagos.length === 0 ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Todo junto</button>
                            {PLANES.map((pl) => {
                                const activo = p.plan_pagos.length === pl.cuotas.length && pl.cuotas.every(([, pct], i) => Math.abs(p.plan_pagos[i].pct - pct) < 0.001)
                                return <button key={pl.label} type="button" onClick={() => setP({ ...p, plan_pagos: pl.cuotas.map(([concepto, pct]) => ({ id: uid(), concepto, pct })) })} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${activo ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{pl.label}</button>
                            })}
                        </div>
                        {p.plan_pagos.length > 0 && (
                            <div className="mt-3">
                                <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_7rem_2rem] gap-x-2 border-b px-2 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:grid" aria-hidden>
                                    <span>Cuándo se paga</span><span className="text-right">%</span><span className="pr-1 text-right">Monto</span><span />
                                </div>
                                <ul>
                                    {p.plan_pagos.map((c, i) => (
                                        <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_7rem_2rem] items-center gap-x-2 border-b border-border/70 py-1.5 last:border-b-0">
                                            <input aria-label="Cuándo se paga" value={c.concepto} onChange={(e) => setP({ ...p, plan_pagos: p.plan_pagos.map((x) => (x.id === c.id ? { ...x, concepto: e.target.value } : x)) })} className={celda} />
                                            <div className="relative">
                                                <Num id={`cuota-${c.id}`} etiqueta="Porcentaje de la cuota" value={c.pct} max={100} onChange={(v) => setP({ ...p, plan_pagos: p.plan_pagos.map((x) => (x.id === c.id ? { ...x, pct: v } : x)) })} className={`${celda} pr-6 text-right`} />
                                                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                                            </div>
                                            <span className="pr-1 text-right text-sm font-semibold tabular-nums">{dinero(t.cuotas[i]?.monto ?? 0, moneda)}</span>
                                            <Button type="button" size="icon-xs" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setP({ ...p, plan_pagos: p.plan_pagos.filter((x) => x.id !== c.id) })} aria-label="Quitar cuota"><Trash2 /></Button>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                    <Button type="button" size="sm" variant="ghost" onClick={() => setP({ ...p, plan_pagos: [...p.plan_pagos, { id: uid(), concepto: 'Otra cuota', pct: Math.max(0, Math.round((100 - sumaPct) * 100) / 100) }] })}><Plus /> Añadir cuota</Button>
                                    <span className={`text-sm tabular-nums ${planOk ? 'text-muted-foreground' : 'font-medium text-amber-700 dark:text-amber-400'}`}>{planOk ? 'Suma 100 %' : `Suma ${Math.round(sumaPct * 100) / 100} %: debe llegar a 100 %`}</span>
                                </div>
                            </div>
                        )}
                    </Seccion>

                    <Seccion titulo="Presentación" pista="Cómo se titula la sección y la nota que va debajo de los precios.">
                        <div className="space-y-2">
                            <input id="pr-titulo" aria-label="Título de la sección" value={p.titulo} onChange={(e) => setP({ ...p, titulo: e.target.value })} placeholder="Inversión" className={campo} />
                            <textarea id="pr-nota" aria-label="Nota bajo los precios" value={p.nota} onChange={(e) => setP({ ...p, nota: e.target.value })} rows={2} placeholder="Ej.: Precios en dólares. El dominio se paga aparte, directamente al proveedor." className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
                        </div>
                    </Seccion>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-6 py-3">
                    <div className="text-sm">
                        <div className="font-semibold tabular-nums">{resumenTotal.join(' + ') || dinero(0, moneda)}</div>
                        <div className="text-[13px] text-muted-foreground">
                            {[varias ? `Opción ${opcion?.nombre || 'elegida'}` : '', p.extras.length ? 'con todos los extras' : '', t.cuotas.length ? `${t.cuotas.length} cuotas${t.cuotas.every((c) => Math.abs(c.monto - t.cuotas[0].monto) < 0.01) ? ` de ${dinero(t.cuotas[0].monto, moneda)}` : ''}` : ''].filter(Boolean).join(' · ') || 'Total para el cliente'}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
                        <Button type="button" onClick={() => { if (p.plan_pagos.length && !planOk) return void toast.error('Las cuotas de la forma de pago tienen que sumar 100 %.'); onGuardar(p) }}>Guardar precios</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
