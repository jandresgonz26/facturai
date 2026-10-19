'use client'
/**
 * La tabla de inversión tal como la ve el cliente: opciones como tarjetas para elegir, detalle de la
 * opción elegida, extras que puede marcar, ajustes, totales y plan de pagos. La elección vive en un
 * contexto para que la barra de «Aceptar propuesta» (al pie de la página) muestre el mismo total.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { calcular, detalleCantidad, dinero, frecuencia, opcionPorId, precioLinea, textoDescuento, type ItemPrecio, type Moneda, type Pricing, type Totales } from '@/lib/propuestas/precios'

type Seleccion = {
    pricing: Pricing
    moneda: Moneda
    opcionId: string
    setOpcionId: (id: string) => void
    extras: string[]
    toggleExtra: (id: string) => void
    totales: Totales
    /** Aceptada: la elección ya no se cambia. */
    bloqueada: boolean
}

const Ctx = createContext<Seleccion | null>(null)
export const useSeleccion = () => useContext(Ctx)

export function SeleccionProvider({ pricing, moneda, inicial, bloqueada = false, children }: { pricing: Pricing; moneda: Moneda; inicial?: { opcionId: string; extras: string[] }; bloqueada?: boolean; children: ReactNode }) {
    const [opcionId, setOpcionId] = useState(inicial?.opcionId ?? opcionPorId(pricing)?.id ?? '')
    const [extras, setExtras] = useState<string[]>(inicial?.extras ?? [])
    const totales = useMemo(() => calcular(pricing, opcionId, extras), [pricing, opcionId, extras])
    const value = useMemo<Seleccion>(
        () => ({
            pricing,
            moneda,
            opcionId,
            setOpcionId: (id) => !bloqueada && setOpcionId(id),
            extras,
            toggleExtra: (id) => !bloqueada && setExtras((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id])),
            totales,
            bloqueada,
        }),
        [pricing, moneda, opcionId, extras, totales, bloqueada],
    )
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function resumenOpcion(p: Pricing, id: string, moneda: Moneda) {
    const t = calcular(p, id, [])
    return {
        unico: t.unico.total > 0 ? dinero(t.unico.total, moneda) : '',
        recurrente: t.recurrentes.map((r) => `${dinero(r.bloque.total, moneda)}${frecuencia(r.frecuencia).sufijo}`).join(' + '),
    }
}

function Linea({ item, moneda, marcable, marcado, onToggle }: { item: ItemPrecio; moneda: Moneda; marcable?: boolean; marcado?: boolean; onToggle?: () => void }) {
    const detalle = detalleCantidad(item, moneda)
    const conDescuento = !!item.descuento && !item.incluido && !item.a_convenir
    const contenido = (
        <>
            {marcable && (
                <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${marcado ? 'border-[#68B840] bg-[#68B840] text-white' : 'border-[#b7c7d3] bg-white'}`} aria-hidden>
                    {marcado && <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
            )}
            <div className="min-w-0 flex-1">
                <div className="font-medium text-[#0B3552]">{item.servicio || 'Servicio'}</div>
                {item.descripcion && <div className="mt-0.5 text-[0.9rem] leading-snug text-[#5b6b78]">{item.descripcion}</div>}
                {detalle && <div className="mt-1 text-[0.8rem] tabular-nums text-[#7a8a96]">{detalle}</div>}
            </div>
            <div className="shrink-0 text-right">
                {conDescuento && item.tachado && <div className="text-[0.8rem] tabular-nums text-[#93a3ae] line-through">{dinero(item.cantidad * item.precio, moneda)}</div>}
                <div className={`font-semibold tabular-nums ${item.incluido ? 'text-[#3f8f2a]' : item.a_convenir ? 'text-[#7a8a96]' : 'text-[#0B3552]'}`}>{marcable && !item.incluido && !item.a_convenir ? '+' : ''}{precioLinea(item, moneda)}</div>
                {conDescuento && <div className="mt-0.5 inline-block rounded-full bg-[#edf7e8] px-2 py-0.5 text-[0.72rem] font-semibold text-[#3f8f2a]">−{textoDescuento(item.descuento!, moneda)}</div>}
            </div>
        </>
    )
    if (marcable)
        return (
            <button type="button" onClick={onToggle} className={`flex w-full items-start gap-3 border-b border-[#e8eef2] px-5 py-4 text-left transition last:border-b-0 hover:bg-[#f6fafb] ${marcado ? 'bg-[#f4faf0]' : ''}`} aria-pressed={marcado}>
                {contenido}
            </button>
        )
    return <div className="flex items-start gap-3 border-b border-[#e8eef2] px-5 py-4 last:border-b-0">{contenido}</div>
}

function FilaTotal({ label, valor, fuerte, tono }: { label: string; valor: string; fuerte?: boolean; tono?: 'verde' }) {
    return (
        <div className={`flex items-baseline justify-between gap-4 ${fuerte ? 'pt-2 text-[1.15rem] font-semibold text-[#0B3552]' : 'text-[0.94rem] text-[#4a5a66]'}`}>
            <span>{label}</span>
            <span className={`tabular-nums ${tono === 'verde' ? 'text-[#3f8f2a]' : ''}`}>{valor}</span>
        </div>
    )
}

export function TablaInversion() {
    const s = useSeleccion()
    if (!s) return null
    const { pricing: p, moneda, totales: t, opcionId, bloqueada } = s
    const opcion = opcionPorId(p, opcionId)
    const varias = p.opciones.length > 1
    const extrasVisibles = bloqueada ? p.extras.filter((e) => s.extras.includes(e.id)) : p.extras
    const opcionesVisibles = bloqueada ? p.opciones.filter((o) => o.id === opcion?.id) : p.opciones
    const verUnico = t.unico.subtotal > 0 || t.recurrentes.length === 0

    return (
        <section id="inversion" className="mt-12 scroll-mt-6">
            <h2 className="font-display flex items-center gap-3 text-[1.45rem] font-semibold text-[#0B3552] before:block before:h-[1.1em] before:w-1 before:rounded-full before:bg-gradient-to-b before:from-[#48C0C0] before:to-[#68B840]">{p.titulo || 'Inversión'}</h2>
            {varias && !bloqueada && <p className="mt-2 text-[0.98rem] text-[#5b6b78]">Elige la opción que mejor te encaje. Puedes cambiarla antes de aceptar.</p>}

            {varias && (
                <div className={`mt-5 grid gap-3 ${opcionesVisibles.length >= 3 ? 'sm:grid-cols-3' : opcionesVisibles.length === 2 ? 'sm:grid-cols-2' : ''}`} role="radiogroup" aria-label="Opciones">
                    {opcionesVisibles.map((o) => {
                        const sel = o.id === opcion?.id
                        const r = resumenOpcion(p, o.id, moneda)
                        return (
                            <button
                                key={o.id}
                                type="button"
                                role="radio"
                                aria-checked={sel}
                                onClick={() => s.setOpcionId(o.id)}
                                disabled={bloqueada}
                                className={`relative flex flex-col rounded-2xl border-2 bg-white p-5 text-left transition ${sel ? 'border-[#106898] shadow-[0_10px_30px_-12px_rgba(16,104,152,0.45)]' : 'border-[#e3ebf0] hover:border-[#9cc6dc]'} ${bloqueada ? 'cursor-default' : ''}`}
                            >
                                {o.recomendada && <span className="absolute -top-2.5 left-5 rounded-full bg-gradient-to-r from-[#48C0C0] to-[#68B840] px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide text-white uppercase">Recomendada</span>}
                                <span className="flex items-center justify-between gap-3">
                                    <span className="font-display text-[1.1rem] font-semibold text-[#0B3552]">{o.nombre || 'Opción'}</span>
                                    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${sel ? 'border-[#106898]' : 'border-[#c3d2dc]'}`} aria-hidden>{sel && <span className="h-2.5 w-2.5 rounded-full bg-[#106898]" />}</span>
                                </span>
                                {o.descripcion && <span className="mt-1.5 text-[0.9rem] leading-snug text-[#5b6b78]">{o.descripcion}</span>}
                                <span className="mt-auto pt-4">
                                    {r.unico && <span className="block font-display text-[1.5rem] font-semibold tabular-nums text-[#0B3552]">{r.unico}</span>}
                                    {r.recurrente && <span className="block text-[0.92rem] font-medium tabular-nums text-[#106898]">{r.unico ? '+ ' : ''}{r.recurrente}</span>}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}

            <div className="mt-5 overflow-hidden rounded-2xl border border-[#e3ebf0] bg-white">
                {varias && opcion && <div className="border-b border-[#e8eef2] bg-[#f6fafb] px-5 py-2.5 text-[0.78rem] font-semibold tracking-[0.08em] text-[#106898] uppercase">Incluye la opción {opcion.nombre || 'elegida'}</div>}
                {(opcion?.items ?? []).filter((i) => i.servicio.trim() || i.precio > 0 || i.incluido || i.a_convenir).map((i) => <Linea key={i.id} item={i} moneda={moneda} />)}
            </div>

            {extrasVisibles.length > 0 && (
                <div className="mt-5 overflow-hidden rounded-2xl border border-dashed border-[#b9d3c2] bg-white">
                    <div className="border-b border-[#e8eef2] bg-[#f6faf4] px-5 py-2.5 text-[0.78rem] font-semibold tracking-[0.08em] text-[#3f8f2a] uppercase">{bloqueada ? 'Extras añadidos' : 'Puedes añadir'}</div>
                    {extrasVisibles.map((e) => <Linea key={e.id} item={e} moneda={moneda} marcable={!bloqueada} marcado={s.extras.includes(e.id)} onToggle={() => s.toggleExtra(e.id)} />)}
                </div>
            )}

            <div className={`mt-5 grid gap-4 ${verUnico && t.recurrentes.length > 0 ? 'sm:grid-cols-2' : ''}`}>
                {verUnico && (
                    <div className="rounded-2xl bg-[#0B3552] p-5 text-white">
                        <div className="text-[0.78rem] font-semibold tracking-[0.08em] text-[#9fd6e0] uppercase">Pago único</div>
                        <div className="mt-3 space-y-1.5 [&_*]:!text-white/85">
                            {(t.unico.descuento > 0 || t.unico.impuesto > 0) && <FilaTotal label="Subtotal" valor={dinero(t.unico.subtotal, moneda)} />}
                            {t.unico.descuento > 0 && <FilaTotal label={p.descuento?.motivo || 'Descuento'} valor={`−${dinero(t.unico.descuento, moneda)}`} />}
                            {t.unico.impuesto > 0 && <FilaTotal label={`${p.impuesto?.nombre} (${p.impuesto?.pct} %)`} valor={dinero(t.unico.impuesto, moneda)} />}
                        </div>
                        <div className="mt-2 font-display text-[2rem] leading-tight font-semibold tabular-nums">{dinero(t.unico.total, moneda)}</div>
                        {t.cuotas.length > 0 && (
                            <div className="mt-4 border-t border-white/15 pt-3">
                                <div className="text-[0.78rem] font-semibold tracking-[0.08em] text-[#9fd6e0] uppercase">Forma de pago</div>
                                <ul className="mt-2 space-y-1">
                                    {t.cuotas.map((c) => (
                                        <li key={c.cuota.id} className="flex justify-between gap-3 text-[0.94rem] text-white/90">
                                            <span>{c.cuota.concepto || 'Cuota'} <span className="text-white/60">({c.cuota.pct} %)</span></span>
                                            <span className="tabular-nums">{dinero(c.monto, moneda)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
                {t.recurrentes.length > 0 && (
                    <div className="rounded-2xl border-2 border-[#48C0C0]/50 bg-[#f2fafb] p-5">
                        <div className="text-[0.78rem] font-semibold tracking-[0.08em] text-[#106898] uppercase">Recurrente</div>
                        <div className="mt-3 space-y-3">
                            {t.recurrentes.map((r) => (
                                <div key={r.frecuencia}>
                                    {(r.bloque.descuento > 0 || r.bloque.impuesto > 0) && (
                                        <div className="space-y-1">
                                            <FilaTotal label="Subtotal" valor={dinero(r.bloque.subtotal, moneda)} />
                                            {r.bloque.descuento > 0 && <FilaTotal label={p.descuento?.motivo || 'Descuento'} valor={`−${dinero(r.bloque.descuento, moneda)}`} tono="verde" />}
                                            {r.bloque.impuesto > 0 && <FilaTotal label={`${p.impuesto?.nombre} (${p.impuesto?.pct} %)`} valor={dinero(r.bloque.impuesto, moneda)} />}
                                        </div>
                                    )}
                                    <div className="font-display text-[1.6rem] font-semibold tabular-nums text-[#0B3552]">
                                        {dinero(r.bloque.total, moneda)}
                                        <span className="ml-1 text-[1rem] font-medium text-[#106898]">{frecuencia(r.frecuencia).sufijo}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {p.nota && <p className="mt-4 text-[0.9rem] leading-relaxed whitespace-pre-line text-[#5b6b78]">{p.nota}</p>}
        </section>
    )
}
