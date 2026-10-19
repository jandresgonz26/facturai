import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ContenidoPropuesta } from '@/components/propuestas/ContenidoPropuesta'
import { SeleccionProvider, TablaInversion } from '@/components/propuestas/TablaInversion'
import { BarraPropuesta } from '@/components/propuestas/BarraPropuesta'
import { Portada } from '@/components/propuestas/Portada'
import { propuestaPublica, vencida } from '@/lib/propuestas/datos'
import { tieneContenido } from '@/lib/propuestas/precios'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const p = await propuestaPublica((await params).token)
    if (!p) return { title: 'Propuesta · JAM Tech', robots: { index: false, follow: false } }
    const titulo = `${p.title} · Propuesta de JAM Tech`
    const descripcion = `Propuesta ${p.number} para ${p.clients?.name ?? 'ti'}: qué haremos, qué incluye y la inversión. Ábrela, elige y acéptala desde aquí.`
    return {
        title: titulo,
        description: descripcion,
        robots: { index: false, follow: false },
        openGraph: { title: titulo, description: descripcion, type: 'website', siteName: 'JAM Tech' },
        twitter: { card: 'summary_large_image', title: titulo, description: descripcion },
    }
}

export default async function PaginaPropuesta({ params }: Props) {
    const { token } = await params
    const p = await propuestaPublica(token)
    if (!p) notFound()

    // Aceptada: se muestra exactamente lo que el cliente aceptó, aunque José la haya editado después.
    const a = p.status === 'accepted' ? p.accepted_snapshot : null
    const pricing = a?.pricing ?? p.pricing
    const content = a?.content ?? p.content
    const conPrecios = tieneContenido(pricing)

    return (
        <div className="min-h-screen bg-[#f4f7f9] font-sans text-[#24323d] [color-scheme:light]">
            <SeleccionProvider pricing={pricing} moneda={p.currency} inicial={a ? { opcionId: a.opcion_id, extras: a.extras_ids } : undefined} bloqueada={!!a}>
                <Portada
                    numero={p.number}
                    titulo={a?.title ?? p.title}
                    cliente={p.clients?.name ?? ''}
                    fecha={p.sent_at ?? p.created_at}
                    validaHasta={p.valid_until}
                    pdfHref={`/api/propuesta/${token}/pdf`}
                />
                <main className="mx-auto max-w-3xl px-4 pt-8 pb-40 sm:px-6 sm:pt-10">
                    <EstadoAviso estado={p.status} vencida={vencida(p)} aceptadaPor={a?.nombre} fecha={a?.fecha} />
                    <article className="rounded-3xl bg-white px-5 py-8 shadow-[0_1px_2px_rgba(11,53,82,0.06),0_12px_40px_-24px_rgba(11,53,82,0.25)] sm:px-10 sm:py-10">
                        <ContenidoPropuesta bloques={content} inversion={() => (conPrecios ? <TablaInversion /> : null)} />
                    </article>
                    <Pie />
                </main>
                <BarraPropuesta token={token} estado={p.status} vencida={vencida(p)} conPrecios={conPrecios} cliente={p.clients?.contact_name || ''} />
            </SeleccionProvider>
        </div>
    )
}

function EstadoAviso({ estado, vencida, aceptadaPor, fecha }: { estado: string; vencida: boolean; aceptadaPor?: string; fecha?: string }) {
    if (estado === 'accepted' && aceptadaPor)
        return (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#cfe8c4] bg-[#f1f9ec] px-5 py-4 text-[#2f6b1f]">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#68B840] text-white" aria-hidden>✓</span>
                <div>
                    <div className="font-semibold">Propuesta aceptada</div>
                    <div className="text-[0.94rem]">Aceptada por {aceptadaPor}{fecha ? ` el ${new Date(fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Caracas' })}` : ''}. ¡Gracias por confiar en JAM Tech! Te escribiremos para arrancar.</div>
                </div>
            </div>
        )
    if (estado === 'rejected')
        return <div className="mb-6 rounded-2xl border border-[#e3e7eb] bg-white px-5 py-4 text-[#5b6b78]">Esta propuesta está cerrada. Si quieres retomarla, escríbenos y te preparamos una versión actualizada.</div>
    if (vencida)
        return <div className="mb-6 rounded-2xl border border-[#f1dfb5] bg-[#fdf8ec] px-5 py-4 text-[#7a5a12]">Esta propuesta ya venció. Escríbenos y te la actualizamos: los precios y plazos pueden haber cambiado.</div>
    if (estado === 'changes_requested')
        return <div className="mb-6 rounded-2xl border border-[#cfe3ee] bg-[#f1f8fb] px-5 py-4 text-[#0f5378]">Recibimos tus comentarios. Te avisaremos cuando la propuesta esté actualizada; este mismo enlace mostrará la nueva versión.</div>
    return null
}

function Pie() {
    return (
        <footer className="mt-10 flex flex-col items-center gap-2 text-center text-[0.85rem] text-[#7a8a96]">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo estático de la marca */}
            <img src="/brand/jamtech-logo.png" alt="JAM Tech" className="h-7 w-auto opacity-80" />
            <p>
                JAM Tech Corp · <a className="underline-offset-2 hover:underline" href="https://jamtech.cloud" target="_blank" rel="noopener noreferrer">jamtech.cloud</a> · <a className="underline-offset-2 hover:underline" href="mailto:info@jamtech.cloud">info@jamtech.cloud</a>
            </p>
        </footer>
    )
}
