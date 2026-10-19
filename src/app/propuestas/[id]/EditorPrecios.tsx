'use client'
/**
 * Se monta al abrirse (empieza siempre desde los precios guardados).
 * Editor de la tabla de inversión: opciones (paquetes), ítems con cantidad/unidad/frecuencia/descuento,
 * extras que el cliente marca, descuento general, impuesto, forma de pago y nota. Trabaja sobre un
 * borrador y lo aplica al pulsar «Guardar precios» (luego el guardado automático lo lleva a la base).
 */
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, FileDown, Plus, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { calcular, dinero, FRECUENCIAS, frecuencia, itemVacio, netoItem, opcionVacia, uid, type Descuento, type Frecuencia, type ItemPrecio, type Moneda, type Pricing } from '@/lib/propuestas/precios'
import { cotizacionesAccion } from '../acciones'

const campo = 'h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/** Número editable sin pelearse con el cursor («1.», «0,5»…). */
function Num({ id, value, onChange, min = 0, max, paso = 'any', className = '', etiqueta }: { id: string; value: number; onChange: (n: number) => void; min?: number; max?: number; paso?: string; className?: string; etiqueta: string }) {
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
            step={paso}
            onChange={(e) => {
                setTxt(e.target.value)
                const n = Number(e.target.value.replace(',', '.'))
                if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(Math.max(min, max != null ? Math.min(max, n) : n))
            }}
            onBlur={() => setTxt(String(value))}
            className={`${campo} tabular-nums ${className}`}
        />
    )
}

function EditorDescuento({ id, d, onChange, moneda }: { id: string; d: Descuento | null; onChange: (d: Descuento | null) => void; moneda: Moneda }) {
    return (
        <div className="flex items-center gap-1.5">
            <select id={`${id}-tipo`} aria-label="Tipo de descuento" value={d?.tipo ?? ''} onChange={(e) => onChange(e.target.value ? { tipo: e.target.value as Descuento['tipo'], valor: d?.valor || (e.target.value === 'pct' ? 10 : 50) } : null)} className={`${campo} w-32`}>
                <option value="">Sin descuento</option>
                <option value="pct">Descuento %</option>
                <option value="monto">Descuento {moneda === 'EUR' ? '€' : '$'}</option>
            </select>
            {d && <Num id={`${id}-valor`} etiqueta="Valor del descuento" value={d.valor} max={d.tipo === 'pct' ? 100 : undefined} onChange={(v) => onChange({ ...d, valor: v })} className="w-24" />}
        </div>
    )
}

function EditorItem({ item, onChange, onQuitar, onSubir, onBajar, onDuplicar, moneda }: { item: ItemPrecio; onChange: (i: ItemPrecio) => void; onQuitar: () => void; onSubir?: () => void; onBajar?: () => void; onDuplicar: () => void; moneda: Moneda }) {
    const set = <K extends keyof ItemPrecio>(k: K, v: ItemPrecio[K]) => onChange({ ...item, [k]: v })
    const id = `it-${item.id}`
    return (
        <div className="rounded-lg border bg-card p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem_5rem_6rem_8rem]">
                <input id={`${id}-servicio`} aria-label="Servicio" value={item.servicio} onChange={(e) => set('servicio', e.target.value)} placeholder="Servicio (ej.: Diseño web)" className={`${campo} font-medium`} />
                <Num id={`${id}-precio`} etiqueta="Precio unitario" value={item.precio} onChange={(v) => set('precio', v)} />
                <Num id={`${id}-cantidad`} etiqueta="Cantidad" value={item.cantidad} onChange={(v) => set('cantidad', v)} />
                <input id={`${id}-unidad`} aria-label="Unidad" value={item.unidad} onChange={(e) => set('unidad', e.target.value)} placeholder="unidad" className={campo} />
                <select id={`${id}-frecuencia`} aria-label="Frecuencia" value={item.frecuencia} onChange={(e) => set('frecuencia', e.target.value as Frecuencia)} className={campo}>
                    {FRECUENCIAS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
            </div>
            <textarea id={`${id}-desc`} aria-label="Descripción" value={item.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Qué incluye (opcional)" rows={1} className="mt-2 w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <EditorDescuento id={id} d={item.descuento} onChange={(d) => set('descuento', d)} moneda={moneda} />
                {item.descuento && (
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={item.tachado} onChange={(e) => set('tachado', e.target.checked)} /> Mostrar precio anterior tachado</label>
                )}
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={item.incluido} onChange={(e) => onChange({ ...item, incluido: e.target.checked, a_convenir: e.target.checked ? false : item.a_convenir })} /> Incluido sin costo</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={item.a_convenir} onChange={(e) => onChange({ ...item, a_convenir: e.target.checked, incluido: e.target.checked ? false : item.incluido })} /> A convenir</label>
                <span className="ml-auto font-semibold tabular-nums">{item.incluido ? 'Incluido' : item.a_convenir ? 'A convenir' : `${dinero(netoItem(item), moneda)}${frecuencia(item.frecuencia).sufijo}`}</span>
                <span className="flex gap-0.5">
                    {onSubir && <Button type="button" size="icon-xs" variant="ghost" onClick={onSubir} aria-label="Subir"><ArrowUp /></Button>}
                    {onBajar && <Button type="button" size="icon-xs" variant="ghost" onClick={onBajar} aria-label="Bajar"><ArrowDown /></Button>}
                    <Button type="button" size="icon-xs" variant="ghost" onClick={onDuplicar} aria-label="Duplicar"><Copy /></Button>
                    <Button type="button" size="icon-xs" variant="ghost" onClick={onQuitar} aria-label="Quitar"><Trash2 /></Button>
                </span>
            </div>
        </div>
    )
}

function ListaItems({ items, onChange, moneda, textoAgregar }: { items: ItemPrecio[]; onChange: (xs: ItemPrecio[]) => void; moneda: Moneda; textoAgregar: string }) {
    const mover = (i: number, d: number) => {
        const xs = [...items]
        ;[xs[i], xs[i + d]] = [xs[i + d], xs[i]]
        onChange(xs)
    }
    return (
        <div className="space-y-2">
            {items.map((it, i) => (
                <EditorItem
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
            <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, itemVacio()])}><Plus /> {textoAgregar}</Button>
        </div>
    )
}

const PLANES: { label: string; cuotas: [string, number][] }[] = [
    { label: '50 / 50', cuotas: [['Al aceptar la propuesta', 50], ['Al entregar', 50]] },
    { label: '40 / 30 / 30', cuotas: [['Al aceptar la propuesta', 40], ['A mitad del proyecto', 30], ['Al entregar', 30]] },
    { label: '3 cuotas iguales', cuotas: [['Primera cuota', 33.33], ['Segunda cuota', 33.33], ['Tercera cuota', 33.34]] },
]

export function EditorPrecios({ abierto, onCerrar, pricing, moneda, onGuardar, clientId }: { abierto: boolean; onCerrar: () => void; pricing: Pricing; moneda: Moneda; onGuardar: (p: Pricing) => void; clientId: string }) {
    const [p, setP] = useState(pricing)
    const [sel, setSel] = useState(pricing.opciones[0]?.id ?? '')
    const [cotizaciones, setCotizaciones] = useState<Awaited<ReturnType<typeof cotizacionesAccion>> | null>(null)

    const opcion = p.opciones.find((o) => o.id === sel) ?? p.opciones[0]
    const setOpcion = (cambio: Partial<typeof opcion>) => setP({ ...p, opciones: p.opciones.map((o) => (o.id === opcion.id ? { ...o, ...cambio } : o)) })
    const t = calcular(p, opcion?.id, p.extras.map((e) => e.id))
    const sumaPct = p.plan_pagos.reduce((s, c) => s + c.pct, 0)

    async function importar(id: string) {
        const q = cotizaciones?.find((x) => x.id === id)
        if (!q) return
        const nuevos = q.items.map((i) => itemVacio({ servicio: i.service, descripcion: i.description, cantidad: Number(i.quantity) || 1, precio: Number(i.unit_price) || 0 }))
        const actuales = opcion.items.filter((i) => i.servicio.trim() || i.precio > 0)
        setOpcion({ items: [...actuales, ...nuevos] })
        toast.success(`${nuevos.length} ${nuevos.length === 1 ? 'ítem importado' : 'ítems importados'}${q.currency !== moneda ? ` (la cotización estaba en ${q.currency}; revisa los precios)` : ''}.`)
    }

    return (
        <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Precios de la propuesta</DialogTitle>
                    <DialogDescription>Todo en {moneda}. El cliente verá las opciones como tarjetas para elegir, marcará los extras que quiera y el total se actualizará solo.</DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <label htmlFor="pr-titulo" className="text-sm font-medium">Título de la sección</label>
                            <input id="pr-titulo" value={p.titulo} onChange={(e) => setP({ ...p, titulo: e.target.value })} className={campo} />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="pr-cotizacion" className="text-sm font-medium">Importar de una cotización</label>
                            <div className="flex gap-2">
                                <select id="pr-cotizacion" defaultValue="" onFocus={async () => { if (!cotizaciones) setCotizaciones(await cotizacionesAccion(clientId)) }} onChange={(e) => { importar(e.target.value); e.target.value = '' }} className={campo}>
                                    <option value="" disabled>{cotizaciones ? (cotizaciones.length ? 'Elige una cotización…' : 'No hay cotizaciones con importe') : 'Cargar cotizaciones…'}</option>
                                    {cotizaciones?.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                                </select>
                                <FileDown className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            </div>
                        </div>
                    </div>

                    <section className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="mr-2 font-semibold">Opciones</h3>
                            {p.opciones.map((o, i) => (
                                <button key={o.id} type="button" onClick={() => setSel(o.id)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${o.id === opcion?.id ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent'}`}>
                                    {o.recomendada && <Star className="size-3.5 fill-current" />}
                                    {o.nombre || (p.opciones.length > 1 ? `Opción ${i + 1}` : 'Única opción')}
                                </button>
                            ))}
                            {p.opciones.length < 6 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => { const n = opcionVacia({ nombre: `Opción ${p.opciones.length + 1}`, items: opcion ? opcion.items.map((i) => ({ ...i, id: uid() })) : [itemVacio()] }); setP({ ...p, opciones: [...p.opciones.map((o, i) => (i === 0 && !o.nombre ? { ...o, nombre: 'Opción 1' } : o)), n] }); setSel(n.id) }}>
                                    <Plus /> Añadir opción
                                </Button>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">{p.opciones.length > 1 ? 'El cliente elige una opción al aceptar. La nueva opción empieza como copia de la que estabas viendo.' : 'Con una sola opción se ve como una tabla normal. Añade más para ofrecer paquetes (Básico, Profesional…).'}</p>
                        {opcion && (
                            <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                                {p.opciones.length > 1 && (
                                    <div className="grid gap-2 sm:grid-cols-[14rem_1fr_auto_auto] sm:items-center">
                                        <input aria-label="Nombre de la opción" value={opcion.nombre} onChange={(e) => setOpcion({ nombre: e.target.value })} placeholder="Nombre (ej.: Profesional)" className={`${campo} font-medium`} />
                                        <input aria-label="Descripción de la opción" value={opcion.descripcion} onChange={(e) => setOpcion({ descripcion: e.target.value })} placeholder="Para quién es, en una frase" className={campo} />
                                        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={opcion.recomendada} onChange={(e) => setP({ ...p, opciones: p.opciones.map((o) => ({ ...o, recomendada: o.id === opcion.id ? e.target.checked : e.target.checked ? false : o.recomendada })) })} /> Recomendada</label>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => { const resto = p.opciones.filter((o) => o.id !== opcion.id); setP({ ...p, opciones: resto }); setSel(resto[0].id) }}><Trash2 /> Quitar opción</Button>
                                    </div>
                                )}
                                <ListaItems items={opcion.items} onChange={(items) => setOpcion({ items })} moneda={moneda} textoAgregar="Añadir ítem" />
                            </div>
                        )}
                    </section>

                    <section className="space-y-2">
                        <h3 className="font-semibold">Extras opcionales</h3>
                        <p className="text-xs text-muted-foreground">El cliente los marca si los quiere y se suman a su total (sirven para cualquier opción).</p>
                        <ListaItems items={p.extras} onChange={(extras) => setP({ ...p, extras })} moneda={moneda} textoAgregar="Añadir extra" />
                    </section>

                    <section className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 rounded-xl border p-3">
                            <h3 className="font-semibold">Descuento general</h3>
                            <EditorDescuento id="dg" d={p.descuento} onChange={(d) => setP({ ...p, descuento: d ? { motivo: p.descuento?.motivo ?? '', aplica: p.descuento?.aplica ?? 'unico', ...d } : null })} moneda={moneda} />
                            {p.descuento && (
                                <>
                                    <input aria-label="Motivo del descuento" value={p.descuento.motivo} onChange={(e) => setP({ ...p, descuento: { ...p.descuento!, motivo: e.target.value } })} placeholder="Motivo (ej.: Descuento por pago anticipado)" className={campo} />
                                    <select aria-label="A qué aplica el descuento" value={p.descuento.aplica} onChange={(e) => setP({ ...p, descuento: { ...p.descuento!, aplica: e.target.value as 'unico' | 'recurrente' | 'ambos' } })} className={campo}>
                                        <option value="unico">Sobre el pago único</option>
                                        <option value="recurrente">Sobre lo recurrente</option>
                                        <option value="ambos">Sobre todo</option>
                                    </select>
                                </>
                            )}
                        </div>
                        <div className="space-y-2 rounded-xl border p-3">
                            <h3 className="font-semibold">Impuesto</h3>
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!p.impuesto} onChange={(e) => setP({ ...p, impuesto: e.target.checked ? { nombre: 'IVA', pct: 16 } : null })} /> Sumar un impuesto a los totales</label>
                            {p.impuesto && (
                                <div className="flex gap-2">
                                    <input aria-label="Nombre del impuesto" value={p.impuesto.nombre} onChange={(e) => setP({ ...p, impuesto: { ...p.impuesto!, nombre: e.target.value } })} className={campo} />
                                    <Num id="imp-pct" etiqueta="Porcentaje del impuesto" value={p.impuesto.pct} max={100} onChange={(v) => setP({ ...p, impuesto: { ...p.impuesto!, pct: v } })} className="w-24" />
                                    <span className="self-center text-sm">%</span>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="space-y-2 rounded-xl border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="mr-2 font-semibold">Forma de pago del pago único</h3>
                            <Button type="button" size="xs" variant={p.plan_pagos.length ? 'ghost' : 'secondary'} onClick={() => setP({ ...p, plan_pagos: [] })}>Todo junto</Button>
                            {PLANES.map((pl) => <Button key={pl.label} type="button" size="xs" variant="ghost" onClick={() => setP({ ...p, plan_pagos: pl.cuotas.map(([concepto, pct]) => ({ id: uid(), concepto, pct })) })}>{pl.label}</Button>)}
                        </div>
                        {p.plan_pagos.map((c, i) => (
                            <div key={c.id} className="flex items-center gap-2">
                                <input aria-label="Concepto de la cuota" value={c.concepto} onChange={(e) => setP({ ...p, plan_pagos: p.plan_pagos.map((x) => (x.id === c.id ? { ...x, concepto: e.target.value } : x)) })} className={campo} />
                                <Num id={`cuota-${c.id}`} etiqueta="Porcentaje de la cuota" value={c.pct} max={100} onChange={(v) => setP({ ...p, plan_pagos: p.plan_pagos.map((x) => (x.id === c.id ? { ...x, pct: v } : x)) })} className="w-24" />
                                <span className="text-sm">%</span>
                                <span className="w-24 text-right text-sm tabular-nums">{dinero(t.cuotas[i]?.monto ?? 0, moneda)}</span>
                                <Button type="button" size="icon-xs" variant="ghost" onClick={() => setP({ ...p, plan_pagos: p.plan_pagos.filter((x) => x.id !== c.id) })} aria-label="Quitar cuota"><Trash2 /></Button>
                            </div>
                        ))}
                        {p.plan_pagos.length > 0 && (
                            <div className="flex items-center justify-between text-sm">
                                <Button type="button" size="xs" variant="outline" onClick={() => setP({ ...p, plan_pagos: [...p.plan_pagos, { id: uid(), concepto: 'Otra cuota', pct: Math.max(0, Math.round((100 - sumaPct) * 100) / 100) }] })}><Plus /> Añadir cuota</Button>
                                <span className={Math.abs(sumaPct - 100) < 0.001 ? 'text-emerald-700 dark:text-emerald-400' : 'font-medium text-amber-700 dark:text-amber-400'}>Suma {Math.round(sumaPct * 100) / 100} %{Math.abs(sumaPct - 100) < 0.001 ? '' : ' · debería ser 100 %'}</span>
                            </div>
                        )}
                    </section>

                    <section className="space-y-1">
                        <label htmlFor="pr-nota" className="text-sm font-semibold">Nota bajo los precios</label>
                        <textarea id="pr-nota" value={p.nota} onChange={(e) => setP({ ...p, nota: e.target.value })} rows={2} placeholder="Ej.: Precios en dólares. El hosting y el dominio se pagan aparte, directamente al proveedor." className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
                    </section>
                </div>

                <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-3">
                    <div className="text-sm">
                        <span className="text-muted-foreground">{p.opciones.length > 1 ? `${opcion?.nombre || 'Opción'} con todos los extras: ` : p.extras.length ? 'Con todos los extras: ' : 'Total: '}</span>
                        <span className="font-semibold tabular-nums">
                            {[t.unico.total > 0 ? dinero(t.unico.total, moneda) : '', ...t.recurrentes.map((r) => `${dinero(r.bloque.total, moneda)}${frecuencia(r.frecuencia).sufijo}`)].filter(Boolean).join(' + ') || dinero(0, moneda)}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
                        <Button type="button" onClick={() => { if (p.plan_pagos.length && Math.abs(sumaPct - 100) >= 0.001) return void toast.error('Las cuotas de la forma de pago tienen que sumar 100 %.'); onGuardar(p) }}>Guardar precios</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
