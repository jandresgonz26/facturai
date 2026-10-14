'use client'

/** En qué proyecto trabajas: JAM Tech o uno de tus proyectos. Cambia el contexto de la Oficina y de los chats. */
import Link from 'next/link'
import { useTransition } from 'react'
import { FolderKanban } from 'lucide-react'
import { elegirProyectoAccion } from '@/app/oficina/clic-acciones'

export function SelectorProyecto({ proyectos, actual }: { proyectos: { id: string; nombre: string }[]; actual: string | null }) {
    const [busy, start] = useTransition()
    return (
        <div className="flex items-center gap-2">
            <label htmlFor="selector-proyecto" className="flex items-center gap-1.5 text-sm text-muted-foreground"><FolderKanban className="h-4 w-4" /> Proyecto</label>
            <select id="selector-proyecto" value={actual ?? ''} disabled={busy} onChange={(e) => start(() => elegirProyectoAccion(e.target.value || null))}
                className="h-9 max-w-[200px] rounded-md border bg-background px-2 text-sm font-medium">
                <option value="">JAM Tech</option>
                {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <Link href="/oficina/proyectos" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Gestionar</Link>
        </div>
    )
}
