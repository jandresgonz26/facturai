import Link from 'next/link'
import { notFound } from 'next/navigation'
import { leerPlan } from '@/lib/agent/planes'
import { listarObjetivos } from '@/lib/agent/objetivos'
import { PlanVista } from '@/components/oficina/PlanVista'

export const dynamic = 'force-dynamic'

const fechaLarga = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
const ESTADO: Record<string, string> = { borrador: 'Borrador', activo: 'En marcha', completado: 'Completado', pausado: 'En pausa', descartado: 'Descartado' }

/** Un plan guiado: la meta, su objetivo medible y los pasos con el que toca ahora. */
export default async function PaginaPlan({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
    const plan = await leerPlan(id)
    if (!plan) notFound()
    const objetivo = plan.objetivo_id ? (await listarObjetivos({ incluirCerrados: true }).catch(() => [])).find((o) => o.id === plan.objetivo_id) ?? null : null
    const o = plan.objetivo_propuesto

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Link href="/oficina" className="text-sm text-muted-foreground hover:text-foreground">← Oficina</Link>
            <header>
                <p className="text-xs font-medium uppercase tracking-wide text-[#B08A1E] dark:text-[#D4A72C]">🧭 Plan guiado · {ESTADO[plan.estado]}</p>
                <h1 className="mt-1 text-2xl font-bold leading-tight [text-wrap:balance]">{plan.titulo}</h1>
                <p className="mt-1 text-sm text-muted-foreground">Meta: {plan.meta}{plan.fecha_limite && <> · hasta el {fechaLarga(plan.fecha_limite)}</>}</p>
                {plan.resumen && <p className="mt-3 max-w-prose text-sm">{plan.resumen}</p>}
                {objetivo ? (
                    <p className="mt-2 text-sm">Objetivo medible: <Link href={`/oficina/${objetivo.departamento}`} className="font-medium underline-offset-2 hover:underline">{objetivo.titulo}</Link>{objetivo.avance !== null && <> · {Math.round(objetivo.avance * 100)} % de avance</>}</p>
                ) : o && plan.estado === 'borrador' ? (
                    <p className="mt-2 text-sm text-muted-foreground">Al activarlo se crea el objetivo «{o.titulo}»{o.metrica !== 'manual' ? ', con avance automático' : ''}.</p>
                ) : null}
            </header>
            <PlanVista plan={plan} />
        </div>
    )
}
