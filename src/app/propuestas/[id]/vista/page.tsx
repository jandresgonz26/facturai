import { notFound } from 'next/navigation'
import { ContenidoPropuesta } from '@/components/propuestas/ContenidoPropuesta'
import { Portada } from '@/components/propuestas/Portada'
import { SeleccionProvider, TablaInversion } from '@/components/propuestas/TablaInversion'
import { leerPropuesta } from '@/lib/propuestas/datos'
import { tieneContenido } from '@/lib/propuestas/precios'

export const dynamic = 'force-dynamic'

/** Vista previa para José: igual que la verá el cliente (también en borrador), sin botones ni contador de vistas. */
export default async function VistaPrevia({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const p = await leerPropuesta(id).catch(() => null)
    if (!p) notFound()
    return (
        <div className="min-h-screen bg-[#f4f7f9] font-sans text-[#24323d] [color-scheme:light]">
            <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">Vista previa: así la verá {p.clients?.name ?? 'el cliente'}. {p.status === 'draft' ? 'Aún es un borrador: el enlace no funciona hasta que lo actives.' : ''}</div>
            <SeleccionProvider pricing={p.pricing} moneda={p.currency}>
                <Portada numero={p.number} titulo={p.title} cliente={p.clients?.name ?? ''} fecha={p.sent_at ?? p.created_at} validaHasta={p.valid_until} pdfHref={`/api/propuestas/${p.id}/pdf`} />
                <main className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
                    <article className="rounded-3xl bg-white px-5 py-8 shadow-[0_1px_2px_rgba(11,53,82,0.06),0_12px_40px_-24px_rgba(11,53,82,0.25)] sm:px-10 sm:py-10">
                        <ContenidoPropuesta bloques={p.content} inversion={() => (tieneContenido(p.pricing) ? <TablaInversion /> : null)} />
                    </article>
                </main>
            </SeleccionProvider>
        </div>
    )
}
