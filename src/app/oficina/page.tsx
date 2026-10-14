import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DEPARTAMENTOS } from '@/lib/agent/shared'
import { leerCerebro } from '@/lib/agent/cerebro'
import { completitud } from '@/lib/agent/cerebro-secciones'
import { listarPlanes, type PlanConPasos } from '@/lib/agent/planes'
import { GeneradorPlan } from '@/components/oficina/GeneradorPlan'
import { OficinaCliente } from './OficinaCliente'

export const dynamic = 'force-dynamic'

async function cuenta(p: PromiseLike<{ count: number | null }>): Promise<number> {
    try { return (await p).count ?? 0 } catch { return 0 }
}
const filas = (tabla: string) => supabase.from(tabla).select('id', { count: 'exact', head: true }).is('proyecto_id', null)

const FIJAR_OBJETIVOS = 'Ayúdame a fijar mis 3 objetivos principales de los próximos meses: revisa el cerebro de la empresa y las cifras de hoy, propónmelos con su cifra y fecha, y créalos en el departamento que corresponde.'

/** La Oficina: primero la guía (ruta de inicio y planes en marcha), después el equipo en 3D y su actividad. */
export default async function OficinaPage() {
    const [cerebro, planes, objetivos, entregables, completados] = await Promise.all([
        leerCerebro().catch(() => ({})),
        listarPlanes().catch(() => [] as PlanConPasos[]),
        cuenta(filas('objetivos').eq('estado', 'activo')),
        cuenta(filas('entregables')),
        cuenta(filas('planes').eq('estado', 'completado')),
    ])
    const comp = completitud(cerebro)
    const totalPlanes = planes.length + completados
    const ruta = [
        { hecho: comp.pct >= 75, titulo: 'Cuéntale a tu equipo quién eres', detalle: `Cerebro de la empresa al ${comp.pct} %: oferta, precios, cliente ideal y metas.`, href: '/oficina/cerebro' },
        { hecho: objetivos >= 3, titulo: 'Fija tus 3 objetivos principales', detalle: `${objetivos} de 3 objetivos activos, con cifra y fecha.`, href: `/oficina/direccion?q=${encodeURIComponent(FIJAR_OBJETIVOS)}` },
        { hecho: totalPlanes > 0, titulo: 'Crea tu primer plan guiado', detalle: 'Una meta convertida en pasos, cada uno con su agente.', href: '#nuevo-plan' },
        { hecho: entregables > 0, titulo: 'Haz tu primera tarea guiada', detalle: 'Un entregable listo para usar, por ejemplo con Camila o Mateo.', href: '/oficina/marketing#tareas' },
    ]
    const pendientes = ruta.filter((r) => !r.hecho).length

    const arriba = (
        <div className="mb-5 space-y-4">
            {pendientes > 0 && (
                <section className="rounded-2xl border bg-card p-4" aria-labelledby="ruta-inicio">
                    <h2 id="ruta-inicio" className="font-semibold">Ruta de inicio <span className="font-normal text-muted-foreground">· {ruta.length - pendientes} de {ruta.length}</span></h2>
                    <p className="text-xs text-muted-foreground">Cuatro pasos para que tu equipo trabaje con tu información y te lleve hacia tus metas.</p>
                    <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {ruta.map((r, i) => (
                            <li key={r.titulo}>
                                <Link href={r.href} className={`flex h-full gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/50 ${r.hecho ? 'opacity-60' : ''}`}>
                                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${r.hecho ? 'bg-emerald-500 text-white' : 'border'}`}>{r.hecho ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                                    <span className="min-w-0">
                                        <span className={`block text-sm font-medium ${r.hecho ? 'line-through' : ''}`}>{r.titulo}</span>
                                        <span className="block text-xs text-muted-foreground">{r.detalle}</span>
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            {planes.length > 0 && (
                <section aria-labelledby="planes-marcha">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                        <h2 id="planes-marcha" className="text-lg font-semibold">Planes</h2>
                        <Link href="/oficina/cerebro" className="text-xs text-muted-foreground hover:text-foreground">🧠 Cerebro al {comp.pct} %</Link>
                    </div>
                    <ul className="grid gap-3 md:grid-cols-2">
                        {planes.map((p) => {
                            const a = p.actual
                            const info = a ? DEPARTAMENTOS[a.departamento] : null
                            return (
                                <li key={p.id}>
                                    <Link href={`/oficina/planes/${p.id}`} className="block h-full rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="font-semibold leading-snug">{p.titulo}</span>
                                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.estado === 'borrador' ? 'Por revisar' : p.estado === 'pausado' ? 'En pausa' : `${p.hechos}/${p.total}`}</span>
                                        </div>
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#D4A72C]" style={{ width: `${p.total ? Math.round((p.hechos / p.total) * 100) : 0}%` }} /></div>
                                        <p className="mt-2 flex items-center gap-1 text-sm">
                                            {p.estado === 'borrador' ? <>Revísalo y actívalo <ArrowRight className="h-3.5 w-3.5" /></>
                                                : a && info ? <><span className="text-muted-foreground">Toca:</span> {info.emoji} {a.titulo}</>
                                                    : <span className="text-muted-foreground">{p.estado === 'pausado' ? 'Reanúdalo cuando quieras.' : 'Sin pasos pendientes.'}</span>}
                                        </p>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}

            <GeneradorPlan />
        </div>
    )

    return <OficinaCliente arriba={arriba} />
}
