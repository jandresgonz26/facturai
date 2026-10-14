import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DEPARTAMENTOS } from '@/lib/agent/shared'
import { leerCerebro } from '@/lib/agent/cerebro'
import { completitud } from '@/lib/agent/cerebro-secciones'
import { listarPlanes, type PlanConPasos } from '@/lib/agent/planes'
import { GeneradorPlan } from '@/components/oficina/GeneradorPlan'
import { PuertaEntrada } from '@/components/oficina/PuertaEntrada'
import { SelectorProyecto } from '@/components/oficina/SelectorProyecto'
import { ListaEncargos } from '@/components/oficina/ListaEncargos'
import { listarEncargos, type Encargo } from '@/lib/agent/encargos'
import { leerHilo } from '@/lib/agent/hilos'
import { listarProyectos, porAlcance, type Proyecto, type ProyectoId } from '@/lib/agent/proyectos'
import { proyectoActivo } from '@/lib/agent/proyecto-activo'
import type { UIMessage } from 'ai'
import { OficinaCliente } from './OficinaCliente'

export const dynamic = 'force-dynamic'

async function cuenta(p: PromiseLike<{ count: number | null }>): Promise<number> {
    try { return (await p).count ?? 0 } catch { return 0 }
}
const filas = (tabla: string, p: ProyectoId) => porAlcance(supabase.from(tabla).select('id', { count: 'exact', head: true }), p)

const FIJAR_OBJETIVOS = 'Ayúdame a fijar mis 3 objetivos principales de los próximos meses: revisa el cerebro de la empresa y las cifras de hoy, propónmelos con su cifra y fecha, y créalos en el departamento que corresponde.'

/**
 * La Oficina: arriba, el proyecto en el que trabajas, la puerta de entrada (un solo chat con todo el equipo) y lo
 * que están haciendo; después la ruta de inicio, los planes y el equipo en 3D con su actividad.
 */
export default async function OficinaPage() {
    const { id: pid, proyecto } = await proyectoActivo()
    const [cerebro, planes, objetivos, entregables, completados, proyectos, hilo, abiertos, recientes] = await Promise.all([
        leerCerebro(pid).catch(() => ({})),
        listarPlanes({ alcance: pid }).catch(() => [] as PlanConPasos[]),
        cuenta(filas('objetivos', pid).eq('estado', 'activo')),
        cuenta(filas('entregables', pid)),
        cuenta(filas('planes', pid).eq('estado', 'completado')),
        listarProyectos().catch(() => [] as Proyecto[]),
        leerHilo('equipo', pid).catch(() => [] as UIMessage[]),
        listarEncargos({ alcance: pid, abiertos: true }).catch(() => [] as Encargo[]),
        listarEncargos({ alcance: pid, limite: 6 }).catch(() => [] as Encargo[]),
    ])
    // Abiertos primero (lo que espera tu respuesta arriba), después los terminados recientes.
    const encargos = [...abiertos.sort((a, b) => Number(b.estado === 'esperando') - Number(a.estado === 'esperando')), ...recientes.filter((e) => !abiertos.some((x) => x.id === e.id)).slice(0, 4)]
    const nombre = proyecto?.nombre ?? 'JAM Tech'
    const comp = completitud(cerebro)
    const totalPlanes = planes.length + completados
    const ruta = [
        { hecho: comp.pct >= 75, titulo: proyecto ? `Cuéntale al equipo qué es ${nombre}` : 'Cuéntale a tu equipo quién eres', detalle: `Cerebro ${proyecto ? 'del proyecto' : 'de la empresa'} al ${comp.pct} %: oferta, precios, cliente ideal y metas.`, href: '/oficina/cerebro' },
        { hecho: objetivos >= 3, titulo: 'Fija tus 3 objetivos principales', detalle: `${objetivos} de 3 objetivos activos, con cifra y fecha.`, href: `/oficina/direccion?q=${encodeURIComponent(FIJAR_OBJETIVOS)}` },
        { hecho: totalPlanes > 0, titulo: 'Crea tu primer plan guiado', detalle: 'Una meta convertida en pasos, cada uno con su agente.', href: '#nuevo-plan' },
        { hecho: entregables > 0, titulo: 'Haz tu primera tarea guiada', detalle: 'Un entregable listo para usar, por ejemplo con Camila o Mateo.', href: '/oficina/marketing#tareas' },
    ]
    const pendientes = ruta.filter((r) => !r.hecho).length

    const arriba = (
        <div className="mb-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
                <SelectorProyecto proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))} actual={pid} />
                <p className="text-xs text-muted-foreground">{proyecto ? `Todo lo que pidas aquí queda en ${nombre}.` : 'Trabajando en la empresa. Crea un proyecto para Wapalink o un cliente.'}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <PuertaEntrada key={pid ?? 'jamtech'} inicial={hilo} proyecto={pid} />
                <ListaEncargos encargos={encargos} titulo="En lo que estamos" vacio="Nadie tiene encargos ahora. Pídele algo largo al equipo (una propuesta, una investigación) y lo verás aquí mientras lo trabajan." />
            </div>

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
