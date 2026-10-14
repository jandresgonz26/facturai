'use client'

/** Biblioteca de entregables de un agente: lo que produjeron sus tareas guiadas, para releer, copiar o aprobar. */
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Archive, Check, Copy, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageText } from '@/components/agent/MessageText'
import type { Entregable } from '@/lib/agent/entregables'
import { estadoEntregableAccion } from '@/app/oficina/procesos-acciones'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })

export function ListaEntregables({ entregables, titulo = 'Entregables' }: { entregables: Entregable[]; titulo?: string }) {
    const [busy, start] = useTransition()
    const copiar = async (t: string) => {
        try { await navigator.clipboard.writeText(t); toast.success('Copiado') } catch { toast.error('No se pudo copiar') }
    }
    return (
        <section className="rounded-2xl border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> {titulo}</h2>
            {entregables.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aún no hay entregables. Haz una tarea guiada y quedará aquí.</p> : (
                <ul className="mt-2 divide-y">
                    {entregables.map((e) => (
                        <li key={e.id} className="py-2">
                            <details>
                                <summary className="flex cursor-pointer items-center gap-2 text-sm">
                                    <span className="min-w-0 flex-1 truncate">{e.titulo}</span>
                                    {e.estado === 'aprobado' && <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">Aprobado</span>}
                                    <span className="shrink-0 text-xs text-muted-foreground">{fecha(e.created_at)}</span>
                                </summary>
                                <div className="mt-2 rounded-xl border bg-muted/30 p-3"><MessageText text={e.contenido} /></div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    <Button size="sm" variant="ghost" onClick={() => void copiar(e.contenido)}><Copy /> Copiar</Button>
                                    {e.estado !== 'aprobado' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(() => estadoEntregableAccion(e.id, 'aprobado'))}><Check /> Aprobar</Button>}
                                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(() => estadoEntregableAccion(e.id, 'archivado'))}><Archive /> Archivar</Button>
                                </div>
                            </details>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
