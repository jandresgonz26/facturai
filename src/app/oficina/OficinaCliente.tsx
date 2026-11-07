'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { ArrowRight, Bot, CircleCheck, CircleDashed, Hand, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAgent } from '@/components/agent/AgentProvider'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import type { AgentEvent, EstadoDepartamento } from '@/lib/agent/eventos'
import type { EstadoDeps } from '@/components/oficina/Oficina3D'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Three.js solo existe en el navegador: sin render en el servidor.
const Oficina3D = dynamic(() => import('@/components/oficina/Oficina3D'), { ssr: false, loading: () => <div className="h-full grid place-items-center text-sm text-muted-foreground">Abriendo la oficina…</div> })

const DEPS = Object.keys(DEPARTAMENTOS) as Departamento[]
const NOMBRES = DEPS.map((d) => DEPARTAMENTOS[d].persona)
const EQUIPO = `${NOMBRES.slice(0, -1).join(', ')} y ${NOMBRES[NOMBRES.length - 1]}`

const ESTADO_UI: Record<EstadoDepartamento, { texto: string; clase: string; Icono: typeof CircleCheck }> = {
    libre: { texto: 'Libre', clase: 'text-muted-foreground', Icono: CircleDashed },
    trabajando: { texto: 'Trabajando', clase: 'text-emerald-600 dark:text-emerald-400', Icono: LoaderCircle },
    esperando: { texto: 'Espera tu OK', clase: 'text-amber-600 dark:text-amber-400', Icono: Hand },
}

const ESTADO_EVENTO: Record<AgentEvent['estado'], string> = {
    hecho: '✅', en_curso: '⏳', espera_aprobacion: '✋', cancelado: '✖️', error: '⚠️',
}

type Estado = { departamentos: Record<Departamento, { estado: EstadoDepartamento; ultimo: AgentEvent | null }>; eventos: AgentEvent[] }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
/** «hace 5 min», «hoy 9:30», «ayer 18:00» o «3 nov 10:15». */
function cuando(iso: string): string {
    const d = new Date(iso)
    const min = Math.round((Date.now() - d.getTime()) / 60_000)
    if (min < 1) return 'ahora'
    if (min < 60) return `hace ${min} min`
    const dia = (x: Date) => x.toDateString()
    if (dia(d) === dia(new Date())) return `hoy ${hora(iso)}`
    if (dia(d) === dia(new Date(Date.now() - 86_400_000))) return `ayer ${hora(iso)}`
    return `${fecha(iso)} ${hora(iso)}`
}

type Trabajo = Record<Departamento, { titulo: string; esperando: boolean }[]>
type Pestana = 'destacado' | 'todo'
const VISIBLES = 5

/**
 * La Oficina en el navegador: cabecera con el pulso del equipo, la oficina en 3D, las tarjetas de cada agente (qué
 * tiene entre manos), los bloques que pinta el servidor (`selector`, `conversacion`, `guia`) y la actividad, en
 * pestañas y recogida para que no ocupe media página.
 */
export function OficinaCliente({ selector, conversacion, guia, trabajo, esperanRespuesta = 0 }: { selector?: React.ReactNode; conversacion?: React.ReactNode; guia?: React.ReactNode; trabajo?: Partial<Trabajo>; esperanRespuesta?: number }) {
    const { openWith } = useAgent()
    const router = useRouter()
    const { resolvedTheme } = useTheme()
    const [montado, setMontado] = useState(false)
    useEffect(() => setMontado(true), [])
    const oscuro = montado && resolvedTheme === 'dark'
    const [estado, setEstado] = useState<Estado | null>(null)
    const [error, setError] = useState<string | null>(null)

    const cargar = useCallback(async () => {
        try {
            const r = await fetch('/api/oficina/estado', { cache: 'no-store' })
            const d = (await r.json()) as Estado & { ok: boolean; error?: string }
            if (!d.ok) throw new Error(d.error || 'No se pudo leer la oficina')
            setEstado(d)
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo leer la oficina')
        }
    }, [])

    // La oficina se refresca sola cada 5 s mientras la pestaña está visible.
    useEffect(() => {
        void cargar()
        const id = setInterval(() => { if (document.visibilityState === 'visible') void cargar() }, 5000)
        return () => clearInterval(id)
    }, [cargar])

    const estados = Object.fromEntries(DEPS.map((d) => [d, estado?.departamentos[d]?.estado ?? 'libre'])) as EstadoDeps
    // Tocar a un agente (en 3D o en su tarjeta) abre su página: su chat, sus objetivos y sus informes.
    const hablar = (dep: Departamento) => router.push(`/oficina/${dep}`)
    const trabajando = DEPS.filter((d) => estados[d] === 'trabajando').length
    const esperandoOk = DEPS.filter((d) => estados[d] === 'esperando').length

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Tu equipo de IA</p>
                    <h1 className="font-display text-3xl font-bold">Oficina</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{EQUIPO}. Toca a alguien para abrir su página con su chat, sus objetivos y sus informes.</p>
                    <ul className="mt-3 flex flex-wrap gap-2 text-xs font-medium" aria-label="Cómo está el equipo ahora">
                        <li className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1">
                            <span className={`h-2 w-2 rounded-full ${trabajando ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden />
                            {trabajando ? `${trabajando} trabajando ahora` : 'Nadie trabajando ahora'}
                        </li>
                        {esperandoOk > 0 && <li className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300"><Hand className="h-3.5 w-3.5" aria-hidden /> {esperandoOk} {esperandoOk === 1 ? 'espera' : 'esperan'} tu OK</li>}
                        {esperanRespuesta > 0 && <li><a href="#encargos" className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">✋ {esperanRespuesta} {esperanRespuesta === 1 ? 'encargo espera' : 'encargos esperan'} tu respuesta</a></li>}
                    </ul>
                </div>
                <Button variant="outline" className="shrink-0" onClick={() => openWith('¿Qué está pasando hoy en la oficina? Dame un resumen por departamento.')}><Bot /> Resumen del equipo</Button>
            </header>

            {selector}

            {error && <p className="flex items-center gap-1 text-sm text-destructive"><TriangleAlert className="h-4 w-4" /> {error}</p>}

            {/* La oficina en 3D, a lo ancho y con protagonismo. */}
            <div className="relative w-full overflow-hidden rounded-3xl border aspect-[4/3] min-h-[340px] max-h-[72vh] sm:aspect-[16/9] xl:aspect-[2/1] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_24px_60px_-30px_rgba(11,15,20,0.5)] bg-[radial-gradient(120%_90%_at_50%_0%,#ffffff_0%,#e6edf3_55%,#d5dfe8_100%)] dark:bg-[radial-gradient(120%_90%_at_50%_0%,#1b2634_0%,#111822_55%,#0b0f14_100%)] dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)]">
                <Oficina3D estados={estados} onSelect={hablar} oscuro={oscuro} className="h-full w-full" />
                <span className="pointer-events-none absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden /> En vivo
                </span>
            </div>

            {/* El equipo: una tarjeta grande por agente, con lo que tiene entre manos. */}
            <section aria-labelledby="titulo-equipo">
                <h2 id="titulo-equipo" className="sr-only">El equipo</h2>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {DEPS.map((dep) => <TarjetaAgente key={dep} dep={dep} d={estado?.departamentos[dep]} trabajo={trabajo?.[dep] ?? []} />)}
                </ul>
            </section>

            {conversacion}

            {guia}

            <Actividad eventos={estado?.eventos ?? null} />
        </div>
    )
}

function TarjetaAgente({ dep, d, trabajo }: { dep: Departamento; d?: { estado: EstadoDepartamento; ultimo: AgentEvent | null }; trabajo: { titulo: string; esperando: boolean }[] }) {
    const info = DEPARTAMENTOS[dep]
    const pregunta = trabajo.find((t) => t.esperando)
    const ui = pregunta ? ESTADO_UI.esperando : ESTADO_UI[d?.estado ?? 'libre']
    const ahora = pregunta ?? trabajo[0]
    return (
        <li>
            <Link href={`/oficina/${dep}`} className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: info.color }} aria-hidden />
                <div className="flex items-start gap-3">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl" style={{ background: `${info.color}26` }} aria-hidden>{info.emoji}</span>
                    <div className="min-w-0 flex-1">
                        <div className="text-lg font-semibold leading-tight">{info.persona}</div>
                        <div className="text-sm text-muted-foreground">{info.nombre}</div>
                    </div>
                    <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ui.clase}`}>
                        <ui.Icono className={`h-3.5 w-3.5 ${d?.estado === 'trabajando' && !pregunta ? 'animate-spin' : ''}`} aria-hidden /> {pregunta ? 'Espera tu respuesta' : ui.texto}
                    </span>
                </div>
                <div className="min-h-[2.75rem] text-sm">
                    {ahora ? (
                        <p className="line-clamp-2"><span className="text-muted-foreground">{ahora.esperando ? 'Te pregunta por:' : 'Con:'}</span> {ahora.titulo}</p>
                    ) : d?.ultimo ? (
                        <p className="line-clamp-2 text-muted-foreground">{ESTADO_EVENTO[d.ultimo.estado]} {d.ultimo.titulo} <span className="whitespace-nowrap text-xs">· {cuando(d.ultimo.created_at)}</span></p>
                    ) : (
                        <p className="line-clamp-2 text-muted-foreground">{info.descripcion}</p>
                    )}
                </div>
                <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span>{trabajo.length ? `${trabajo.length} ${trabajo.length === 1 ? 'encargo abierto' : 'encargos abiertos'}` : 'Sin encargos'}</span>
                    <span className="flex items-center gap-1 font-medium text-foreground transition-transform group-hover:translate-x-0.5">Hablar con {info.persona} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
                </div>
            </Link>
        </li>
    )
}

/** La actividad, recogida: por defecto solo informes y avisos (lo que se lee), con «Todo» para ver cada herramienta. */
function Actividad({ eventos }: { eventos: AgentEvent[] | null }) {
    const [pestana, setPestana] = useState<Pestana>('destacado')
    const [dep, setDep] = useState<Departamento | null>(null)
    const [todos, setTodos] = useState(false)
    const base = (eventos ?? []).filter((e) => (pestana === 'todo' || e.tipo !== 'herramienta') && (!dep || e.departamento === dep))
    const lista = todos ? base.slice(0, 25) : base.slice(0, VISIBLES)
    const tab = (id: Pestana, texto: string) => (
        <button type="button" role="tab" aria-selected={pestana === id} onClick={() => { setPestana(id); setTodos(false) }}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${pestana === id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{texto}</button>
    )
    return (
        <section aria-labelledby="titulo-actividad" className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="titulo-actividad" className="font-semibold">Actividad</h2>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1" aria-label="Filtrar por agente">
                        {DEPS.map((d) => (
                            <button key={d} type="button" onClick={() => { setDep(dep === d ? null : d); setTodos(false) }} aria-pressed={dep === d} title={`${DEPARTAMENTOS[d].persona} · ${DEPARTAMENTOS[d].nombre}`}
                                className={`grid h-8 w-8 place-items-center rounded-full border text-base transition ${dep === d ? 'border-foreground bg-accent' : dep ? 'opacity-40 hover:opacity-100' : 'hover:bg-accent'}`}>{DEPARTAMENTOS[d].emoji}</button>
                        ))}
                    </div>
                    <div role="tablist" aria-label="Qué actividad ver" className="flex gap-1 rounded-lg bg-muted p-1">
                        {tab('destacado', 'Informes y avisos')}
                        {tab('todo', 'Todo')}
                    </div>
                </div>
            </div>
            {!eventos ? (
                <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>
            ) : base.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{eventos.length === 0 ? 'Todavía no hay actividad. Pídele algo al equipo o espera el primer informe automático.' : pestana === 'destacado' ? 'No hay informes ni avisos recientes. Mira «Todo» para ver cada paso.' : 'Nada de este agente últimamente.'}</p>
            ) : (
                <>
                    <ul className="mt-3 divide-y">
                        {lista.map((e) => {
                            const info = DEPARTAMENTOS[e.departamento]
                            const informe = e.tipo === 'rutina' && typeof e.detalle?.informe === 'string' ? (e.detalle.informe as string)
                                : e.tipo === 'aviso' && typeof e.detalle?.texto === 'string' ? (e.detalle.texto as string) : null
                            return (
                                <li key={e.id} className="py-2.5 text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-base" title={`${info.persona} · ${info.nombre}`} aria-hidden>{info.emoji}</span>
                                        <span className="min-w-0 flex-1 truncate"><span className="font-medium">{info.persona}</span> <span className="text-muted-foreground">·</span> {ESTADO_EVENTO[e.estado]} {e.titulo}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{cuando(e.created_at)}</span>
                                    </div>
                                    {informe && <details className="mt-1 pl-7"><summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Ver {e.tipo === 'aviso' ? 'mensaje' : 'informe'}</summary><pre className="mt-1 font-sans text-xs whitespace-pre-wrap">{informe}</pre></details>}
                                </li>
                            )
                        })}
                    </ul>
                    {base.length > VISIBLES && (
                        <button type="button" onClick={() => setTodos(!todos)} className="mt-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                            {todos ? 'Ver menos' : `Ver toda (${Math.min(base.length, 25)})`}
                        </button>
                    )}
                </>
            )}
        </section>
    )
}
