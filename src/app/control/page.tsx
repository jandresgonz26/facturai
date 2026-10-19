import Link from 'next/link'
import { listClients } from '@/lib/actions/clients'
import { dinero } from '@/lib/control/calculo'
import { listarControles } from '@/lib/control/datos'
import { NuevoControl } from './NuevoControl'

export const dynamic = 'force-dynamic'

/** Control interno de proyectos: cuánto falta cobrar al cliente, cuánto falta pagar a los programadores y el margen. */
export default async function PaginaControl() {
    const [proyectos, clientes] = await Promise.all([listarControles().catch(() => []), listClients().catch(() => [])])
    const activos = proyectos.filter((p) => p.estado === 'activo')
    const porCobrar = activos.reduce((s, p) => s + p.resumen.porCobrar, 0)
    const porPagar = activos.reduce((s, p) => s + p.resumen.porPagar, 0)

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-2xl font-bold">Control de proyectos</h1>
                    <p className="mt-1 max-w-prose text-sm text-muted-foreground">Solo para ti: lo que cobras a cada cliente, lo que pagas a los programadores y lo que te queda. No toca facturas ni nada que vea el cliente.</p>
                </div>
                <NuevoControl clientes={clientes.map((c) => ({ id: c.id, name: c.name }))} />
            </header>

            {activos.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-card p-4">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Te falta cobrar</div>
                        <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{dinero(porCobrar)}</div>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Te falta pagar</div>
                        <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{dinero(porPagar)}</div>
                    </div>
                </div>
            )}

            {proyectos.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center">
                    <p className="font-medium">Aún no hay proyectos en el control.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Crea uno por cada trabajo con su plan de cuotas y sus programadores.</p>
                </div>
            ) : (
                <ul className="divide-y rounded-xl border bg-card">
                    {proyectos.map((p) => {
                        const r = p.resumen
                        const pct = r.totalCobrar > 0 ? Math.round((Math.min(r.cobrado, r.totalCobrar) / r.totalCobrar) * 100) : 0
                        return (
                            <li key={p.id}>
                                <Link href={`/control/${p.id}`} className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 transition hover:bg-accent/50 ${p.estado === 'cerrado' ? 'opacity-60' : ''}`}>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs text-muted-foreground">{p.clients?.name ?? 'Sin cliente'}{p.estado === 'cerrado' ? ' · Cerrado' : ''}</div>
                                        <div className="truncate font-medium">{p.nombre}</div>
                                        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" aria-label={`Cobrado ${pct} %`}>
                                            <div className="h-full rounded-full bg-gradient-to-r from-[#48C0C0] to-[#68B840]" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                    <dl className="grid grid-cols-3 gap-x-6 text-right text-sm tabular-nums">
                                        <div><dt className="text-xs text-muted-foreground">Por cobrar</dt><dd className="font-medium">{dinero(r.porCobrar, p.moneda)}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Por pagar</dt><dd className="font-medium">{dinero(r.porPagar, p.moneda)}</dd></div>
                                        <div><dt className="text-xs text-muted-foreground">Margen</dt><dd className="font-medium text-emerald-700 dark:text-emerald-400">{dinero(r.margenPrevisto, p.moneda)}</dd></div>
                                    </dl>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
