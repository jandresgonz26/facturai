import { notFound } from 'next/navigation'
import { leerControl } from '@/lib/control/datos'
import { PanelControl } from './PanelControl'

export const dynamic = 'force-dynamic'

export default async function PaginaControlProyecto({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const c = await leerControl(id).catch(() => null)
    if (!c) notFound()
    return <PanelControl datos={c} />
}
