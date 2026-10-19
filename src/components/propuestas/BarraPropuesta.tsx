'use client'
/**
 * Barra fija al pie de la propuesta del cliente: el total de lo que eligió, «Pedir cambios» y
 * «Aceptar propuesta». También avisa al servidor de que se abrió (una vez por sesión del navegador).
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dinero, frecuencia, opcionPorId } from '@/lib/propuestas/precios'
import { useSeleccion } from './TablaInversion'

type Modal = null | 'aceptar' | 'cambios' | 'gracias-cambios'

export function BarraPropuesta({ token, estado, vencida, conPrecios, cliente }: { token: string; estado: string; vencida: boolean; conPrecios: boolean; cliente: string }) {
    const s = useSeleccion()
    const router = useRouter()
    const [modal, setModal] = useState<Modal>(null)
    const [nombre, setNombre] = useState(cliente)
    const [mensaje, setMensaje] = useState('')
    const [conforme, setConforme] = useState(false)
    const [enviando, setEnviando] = useState(false)
    const [error, setError] = useState('')
    const avisada = useRef(false)

    useEffect(() => {
        if (avisada.current) return
        avisada.current = true
        const clave = `propuesta-vista-${token}`
        try {
            if (sessionStorage.getItem(clave)) return
            sessionStorage.setItem(clave, '1')
        } catch {
            /* sin almacenamiento: se cuenta igual */
        }
        fetch(`/api/propuesta/${token}/vista`, { method: 'POST' }).catch(() => undefined)
    }, [token])

    const cerrada = estado === 'accepted' || estado === 'rejected'
    if (cerrada) return null
    const t = s?.totales
    const varias = (s?.pricing.opciones.length ?? 0) > 1
    const opcion = s ? opcionPorId(s.pricing, s.opcionId) : undefined

    async function enviar(ruta: 'aceptar' | 'cambios') {
        setEnviando(true)
        setError('')
        try {
            const body = ruta === 'aceptar' ? { nombre, opcion_id: s?.opcionId ?? '', extras_ids: s?.extras ?? [] } : { mensaje, nombre }
            const r = await fetch(`/api/propuesta/${token}/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
            const j = (await r.json().catch(() => ({}))) as { ok?: boolean; mensaje?: string }
            if (!r.ok || !j.ok) throw new Error(j.mensaje || 'No se pudo enviar. Inténtalo de nuevo.')
            if (ruta === 'aceptar') {
                setModal(null)
                window.scrollTo({ top: 0, behavior: 'smooth' })
                router.refresh()
            } else {
                setMensaje('')
                setModal('gracias-cambios')
                router.refresh()
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo enviar.')
        } finally {
            setEnviando(false)
        }
    }

    const total = t && conPrecios ? (
        <div className="min-w-0">
            <div className="text-[0.72rem] font-semibold tracking-[0.1em] text-[#7a8a96] uppercase">{varias && opcion?.nombre ? `Opción ${opcion.nombre}` : 'Total'}</div>
            <div className="truncate font-display text-[1.25rem] leading-tight font-semibold tabular-nums text-[#0B3552] sm:text-[1.4rem]">
                {t.unico.total > 0 && dinero(t.unico.total, s.moneda)}
                {t.recurrentes.map((r, i) => (
                    <span key={r.frecuencia} className="text-[0.95rem] font-medium text-[#106898]">
                        {t.unico.total > 0 || i > 0 ? ' + ' : ''}
                        {dinero(r.bloque.total, s.moneda)}
                        {frecuencia(r.frecuencia).sufijo}
                    </span>
                ))}
            </div>
        </div>
    ) : (
        <div className="text-[0.95rem] text-[#5b6b78]">¿Todo claro? Acéptala o dinos qué cambiarías.</div>
    )

    return (
        <>
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e3ebf0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
                <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
                    {total}
                    <div className="flex w-full gap-2 sm:w-auto">
                        <button type="button" onClick={() => { setError(''); setModal('cambios') }} className="flex-1 whitespace-nowrap rounded-full border border-[#c9d8e2] bg-white px-3 py-2.5 text-[0.95rem] font-medium text-[#0B3552] transition hover:border-[#106898] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#106898] sm:flex-none">
                            Pedir cambios
                        </button>
                        <button type="button" disabled={vencida} onClick={() => { setError(''); setModal('aceptar') }} className="flex-1 whitespace-nowrap rounded-full bg-[#68B840] px-4 py-2.5 text-[0.95rem] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(104,184,64,0.8)] transition hover:bg-[#5aa535] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f8f2a] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">
                            Aceptar propuesta
                        </button>
                    </div>
                </div>
            </div>

            {modal && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B3552]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && !enviando && setModal(null)}>
                    <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
                        {modal === 'aceptar' && (
                            <form onSubmit={(e) => { e.preventDefault(); if (conforme) enviar('aceptar') }}>
                                <h2 className="font-display text-[1.35rem] font-semibold text-[#0B3552]">Aceptar la propuesta</h2>
                                {t && conPrecios && (
                                    <div className="mt-4 rounded-2xl bg-[#f4f7f9] p-4 text-[0.95rem]">
                                        {varias && <div className="font-medium text-[#0B3552]">Opción: {opcion?.nombre || 'elegida'}</div>}
                                        {(s?.extras.length ?? 0) > 0 && <div className="text-[#5b6b78]">Con {s!.extras.length} {s!.extras.length === 1 ? 'extra' : 'extras'}</div>}
                                        {t.unico.total > 0 && <div className="mt-1 flex justify-between"><span>Pago único</span><span className="font-semibold tabular-nums">{dinero(t.unico.total, s!.moneda)}</span></div>}
                                        {t.recurrentes.map((r) => <div key={r.frecuencia} className="flex justify-between"><span>{frecuencia(r.frecuencia).label}</span><span className="font-semibold tabular-nums">{dinero(r.bloque.total, s!.moneda)}{frecuencia(r.frecuencia).sufijo}</span></div>)}
                                    </div>
                                )}
                                <label htmlFor="acepta-nombre" className="mt-5 block text-[0.9rem] font-medium text-[#24323d]">Tu nombre completo</label>
                                <input id="acepta-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" required minLength={3} maxLength={120} className="mt-1.5 w-full rounded-xl border border-[#c9d8e2] px-3.5 py-2.5 text-[1rem] outline-none focus:border-[#106898] focus:ring-2 focus:ring-[#106898]/20" />
                                <label className="mt-4 flex items-start gap-3 text-[0.9rem] leading-snug text-[#4a5a66]">
                                    <input id="acepta-conforme" type="checkbox" checked={conforme} onChange={(e) => setConforme(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#68B840]" />
                                    Leí la propuesta y acepto el alcance, los plazos y la inversión indicados.
                                </label>
                                {error && <p className="mt-3 text-[0.9rem] text-[#c0392b]">{error}</p>}
                                <div className="mt-6 flex gap-2">
                                    <button type="button" onClick={() => setModal(null)} disabled={enviando} className="flex-1 rounded-full border border-[#c9d8e2] px-4 py-2.5 font-medium text-[#0B3552]">Volver</button>
                                    <button type="submit" disabled={enviando || !conforme || nombre.trim().length < 3} className="flex-1 rounded-full bg-[#68B840] px-4 py-2.5 font-semibold text-white disabled:opacity-50">{enviando ? 'Enviando…' : 'Aceptar'}</button>
                                </div>
                            </form>
                        )}
                        {modal === 'cambios' && (
                            <form onSubmit={(e) => { e.preventDefault(); enviar('cambios') }}>
                                <h2 className="font-display text-[1.35rem] font-semibold text-[#0B3552]">¿Qué te gustaría cambiar?</h2>
                                <p className="mt-1.5 text-[0.92rem] text-[#5b6b78]">Cuéntanos con tus palabras. Te responderemos con la propuesta ajustada en este mismo enlace.</p>
                                <label htmlFor="cambios-mensaje" className="sr-only">Comentario</label>
                                <textarea id="cambios-mensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} required minLength={3} maxLength={2000} rows={5} placeholder="Por ejemplo: ¿podemos dejar el blog para una segunda fase?" className="mt-4 w-full resize-y rounded-xl border border-[#c9d8e2] px-3.5 py-2.5 text-[1rem] outline-none focus:border-[#106898] focus:ring-2 focus:ring-[#106898]/20" />
                                <label htmlFor="cambios-nombre" className="mt-3 block text-[0.9rem] font-medium text-[#24323d]">Tu nombre</label>
                                <input id="cambios-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={100} className="mt-1.5 w-full rounded-xl border border-[#c9d8e2] px-3.5 py-2.5 text-[1rem] outline-none focus:border-[#106898] focus:ring-2 focus:ring-[#106898]/20" />
                                {error && <p className="mt-3 text-[0.9rem] text-[#c0392b]">{error}</p>}
                                <div className="mt-6 flex gap-2">
                                    <button type="button" onClick={() => setModal(null)} disabled={enviando} className="flex-1 rounded-full border border-[#c9d8e2] px-4 py-2.5 font-medium text-[#0B3552]">Volver</button>
                                    <button type="submit" disabled={enviando || mensaje.trim().length < 3} className="flex-1 rounded-full bg-[#106898] px-4 py-2.5 font-semibold text-white disabled:opacity-50">{enviando ? 'Enviando…' : 'Enviar comentario'}</button>
                                </div>
                            </form>
                        )}
                        {modal === 'gracias-cambios' && (
                            <div className="text-center">
                                <h2 className="font-display text-[1.35rem] font-semibold text-[#0B3552]">¡Gracias! Lo recibimos</h2>
                                <p className="mt-2 text-[0.95rem] text-[#5b6b78]">Revisamos tu comentario y te avisamos cuando la propuesta esté actualizada.</p>
                                <button type="button" onClick={() => setModal(null)} className="mt-6 rounded-full bg-[#106898] px-6 py-2.5 font-semibold text-white">Entendido</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
