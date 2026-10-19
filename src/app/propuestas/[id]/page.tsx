import { notFound } from 'next/navigation'
import { eventosDe, leerPropuesta } from '@/lib/propuestas/datos'
import { EditorPropuesta, type DatosEditor } from './EditorPropuesta'

export const dynamic = 'force-dynamic'

export default async function PaginaPropuesta({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const p = await leerPropuesta(id).catch(() => null)
    if (!p) notFound()
    const eventos = await eventosDe(id)
    const a = p.accepted_snapshot
    const datos: DatosEditor = {
        id: p.id,
        number: p.number,
        title: p.title,
        client_id: p.client_id,
        cliente: { name: p.clients?.name ?? '', phone: p.clients?.phone ?? null, email: p.clients?.email ?? null, contact_name: p.clients?.contact_name ?? null },
        content: p.content,
        pricing: p.pricing,
        currency: p.currency,
        status: p.status,
        token: p.token,
        valid_until: p.valid_until,
        view_count: p.view_count,
        first_viewed_at: p.first_viewed_at,
        last_viewed_at: p.last_viewed_at,
        accepted_by: p.accepted_by,
        accepted_at: p.accepted_at,
        aceptacion: a ? { opcion_nombre: a.opcion_nombre, varias: a.pricing.opciones.length > 1, extras: a.extras_ids.length, totales: a.totales } : null,
        billing: p.billing,
        updated_at: p.updated_at,
    }
    // key: si otra pestaña o el cliente cambian algo, al refrescar se monta con los datos nuevos.
    return <EditorPropuesta key={`${p.status}-${p.accepted_at ?? ''}`} inicial={datos} eventos={eventos} />
}
