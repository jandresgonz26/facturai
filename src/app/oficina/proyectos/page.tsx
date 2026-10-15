import Link from 'next/link'
import { listarProyectos, TIPOS_PROYECTO } from '@/lib/agent/proyectos'
import { proyectoActivo } from '@/lib/agent/proyecto-activo'
import { GestorProyectos } from './GestorProyectos'

export const dynamic = 'force-dynamic'

/** Proyectos de la Oficina: crear uno (Wapalink, un cliente, algo interno), elegir en cuál trabajar, pausar o archivar. */
export default async function PaginaProyectos() {
    const [proyectos, { id }] = await Promise.all([listarProyectos({ incluirArchivados: true }).catch(() => []), proyectoActivo()])
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Link href="/oficina" className="text-sm text-muted-foreground hover:text-foreground">← Oficina</Link>
            <header>
                <h1 className="text-2xl font-bold">📁 Proyectos</h1>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">Cada proyecto tiene su propio cerebro, objetivos, planes, encargos y conversaciones con los agentes. Elige uno y todo lo que pidas en la Oficina (o en Telegram con /proyecto) queda en él.</p>
            </header>
            <GestorProyectos proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre, tipo: TIPOS_PROYECTO[p.tipo], descripcion: p.descripcion, estado: p.estado, checklist: p.checklist_slug }))} actual={id} />
        </div>
    )
}
