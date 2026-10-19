import Link from 'next/link'
import { listClients } from '@/lib/actions/clients'
import { ESTADOS, estadoDe, listarPropuestas, vencida, type EstadoPropuesta } from '@/lib/propuestas/datos'
import { dinero } from '@/lib/propuestas/precios'
import { NuevaPropuesta } from './NuevaPropuesta'

export const dynamic = 'force-dynamic'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'America/Caracas' })

/** Propuestas comerciales: todas en un sitio, con su estado (enviada, vista, aceptada…). */
export default async function PaginaPropuestas({ searchParams }: { searchParams: Promise<{ estado?: string; cliente?: string }> }) {
    const sp = await searchParams
    const estado = ESTADOS.some((e) => e.id === sp.estado) ? (sp.estado as EstadoPropuesta) : undefined
    const [todas, clientes] = await Promise.all([listarPropuestas({ clientId: sp.cliente }).catch(() => []), listClients().catch(() => [])])
    const propuestas = estado ? todas.filter((p) => p.status === estado) : todas
    const cuenta = (e: EstadoPropuesta) => todas.filter((p) => p.status === e).length
    const abiertas = todas.filter((p) => ['sent', 'viewed', 'changes_requested'].includes(p.status))

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-2xl font-bold">Propuestas</h1>
                    <p className="mt-1 max-w-prose text-sm text-muted-foreground">Escribe la propuesta aquí, compártela con un enlace y sigue qué pasó: si la abrió, si pidió cambios o si la aceptó.</p>
                </div>
                <NuevaPropuesta clientes={clientes.map((c) => ({ id: c.id, name: c.name, stage: c.stage ?? 'active' }))} clienteInicial={sp.cliente} />
            </header>

            {abiertas.length > 0 && !estado && (
                <p className="rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
                    <span className="font-medium">{abiertas.length} {abiertas.length === 1 ? 'propuesta espera' : 'propuestas esperan'} respuesta del cliente</span>
                    {abiertas.some((p) => p.status === 'changes_requested') && <span className="text-amber-700 dark:text-amber-400"> · hay cambios pedidos por revisar</span>}
                </p>
            )}

            <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
                <Link href={sp.cliente ? `/propuestas?cliente=${sp.cliente}` : '/propuestas'} className={`rounded-full border px-3 py-1 text-sm ${!estado ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent'}`}>Todas · {todas.length}</Link>
                {ESTADOS.filter((e) => cuenta(e.id) > 0).map((e) => (
                    <Link key={e.id} href={`/propuestas?estado=${e.id}${sp.cliente ? `&cliente=${sp.cliente}` : ''}`} className={`rounded-full border px-3 py-1 text-sm ${estado === e.id ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent'}`}>
                        {e.label} · {cuenta(e.id)}
                    </Link>
                ))}
            </nav>

            {propuestas.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center">
                    <p className="font-medium">{todas.length ? 'No hay propuestas con este estado.' : 'Aún no hay propuestas.'}</p>
                    {!todas.length && <p className="mt-1 text-sm text-muted-foreground">Crea la primera: trae la plantilla de JAM Tech y puedes redactarla con IA a partir de tus notas.</p>}
                </div>
            ) : (
                <ul className="divide-y rounded-xl border bg-card">
                    {propuestas.map((p) => {
                        const e = estadoDe(p.status)
                        const venc = vencida(p) && !['accepted', 'rejected'].includes(p.status)
                        return (
                            <li key={p.id}>
                                <Link href={`/propuestas/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition hover:bg-accent/50">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="font-mono">{p.number}</span>
                                            <span>·</span>
                                            <span className="truncate">{p.clients?.name ?? 'Sin cliente'}</span>
                                        </div>
                                        <div className="truncate font-medium">{p.title}</div>
                                    </div>
                                    <div className="text-right text-sm tabular-nums">
                                        {p.total_once > 0 && <div className="font-medium">{dinero(p.total_once, p.currency)}</div>}
                                        {p.total_recurring > 0 && <div className="text-xs text-muted-foreground">+ {dinero(p.total_recurring, p.currency)}/mes</div>}
                                    </div>
                                    <div className="flex w-36 flex-col items-end gap-1">
                                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${e.tono}`}>{e.label}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {venc ? 'Vencida' : p.view_count > 0 ? `${p.view_count} ${p.view_count === 1 ? 'vista' : 'vistas'}` : ''}
                                            {venc || p.view_count > 0 ? ' · ' : ''}
                                            {fecha(p.updated_at)}
                                        </span>
                                    </div>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
