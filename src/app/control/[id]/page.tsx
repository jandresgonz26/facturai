import { notFound } from 'next/navigation'
import { leerControl, propuestasEnlazables } from '@/lib/control/datos'
import { PanelControl } from './PanelControl'

export const dynamic = 'force-dynamic'

export default async function PaginaControlProyecto({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const c = await leerControl(id).catch(() => null)
    if (!c) notFound()
    // Para enlazar una propuesta si el control aún no tiene: las del mismo cliente (o todas, si no tiene cliente).
    const propuestas = c.proyecto.propuesta_id ? [] : await propuestasEnlazables(c.proyecto.client_id).catch(() => [])
    return <PanelControl datos={c} propuestas={propuestas} />
}
