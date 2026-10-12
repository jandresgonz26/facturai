'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Bot, CircleCheck, CircleDashed, Hand, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAgent } from '@/components/agent/AgentProvider'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import type { AgentEvent, EstadoDepartamento } from '@/lib/agent/eventos'
import type { EstadoDeps } from '@/components/oficina/Oficina3D'
import { MenuDepartamento } from '@/components/oficina/MenuDepartamento'

// Three.js solo existe en el navegador: sin render en el servidor.
const Oficina3D = dynamic(() => import('@/components/oficina/Oficina3D'), { ssr: false, loading: () => <div className="h-full grid place-items-center text-sm text-muted-foreground">Abriendo la oficina…</div> })

const DEPS = Object.keys(DEPARTAMENTOS) as Departamento[]

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

export default function OficinaPage() {
    const { openWith, openDraft } = useAgent()
    const [seleccion, setSeleccion] = useState<Departamento | null>(null)
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
    const hablar = (dep: Departamento) => setSeleccion(dep)
    const preguntar = (texto: string, enviar: boolean) => (enviar ? openWith(texto) : openDraft(texto))

    return (
        <div className="max-w-6xl mx-auto">
            <MenuDepartamento dep={seleccion} onClose={() => setSeleccion(null)} onPreguntar={preguntar} />
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-2xl font-bold">Oficina</h1>
                    <p className="text-sm text-muted-foreground mt-1">Tu equipo de IA por departamentos. Toca a alguien para hacerle una pregunta; levanta la mano cuando espera tu confirmación.</p>
                </div>
                <Button variant="outline" onClick={() => openWith('¿Qué está pasando hoy en la oficina? Dame un resumen por departamento.')}><Bot /> Resumen del equipo</Button>
            </div>

            {error && <p className="text-sm text-destructive flex items-center gap-1 mb-3"><TriangleAlert className="w-4 h-4" /> {error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
                <div className="rounded-2xl border overflow-hidden aspect-[16/10] min-h-[320px] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_20px_50px_-30px_rgba(11,15,20,0.45)] bg-[radial-gradient(120%_90%_at_50%_0%,#ffffff_0%,#e6edf3_55%,#d5dfe8_100%)] dark:bg-[radial-gradient(120%_90%_at_50%_0%,#1b2634_0%,#111822_55%,#0b0f14_100%)] dark:shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)]">
                    <Oficina3D estados={estados} onSelect={hablar} oscuro={oscuro} className="w-full h-full" />
                </div>

                <div className="flex flex-col gap-3">
                    {DEPS.map((dep) => {
                        const info = DEPARTAMENTOS[dep]
                        const d = estado?.departamentos[dep]
                        const ui = ESTADO_UI[d?.estado ?? 'libre']
                        return (
                            <button
                                key={dep}
                                type="button"
                                onClick={() => hablar(dep)}
                                className="text-left rounded-xl border bg-card px-4 py-3 hover:bg-accent/50 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">{info.emoji} {info.nombre}</span>
                                    <span className={`text-xs flex items-center gap-1 ${ui.clase}`}>
                                        <ui.Icono className={`w-3.5 h-3.5 ${d?.estado === 'trabajando' ? 'animate-spin' : ''}`} /> {ui.texto}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {d?.ultimo ? `${ESTADO_EVENTO[d.ultimo.estado]} ${d.ultimo.titulo} · ${fecha(d.ultimo.created_at)} ${hora(d.ultimo.created_at)}` : info.descripcion}
                                </p>
                            </button>
                        )
                    })}
                </div>
            </div>

            <section className="mt-6">
                <h2 className="text-lg font-semibold mb-2">Actividad reciente</h2>
                {!estado ? (
                    <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : estado.eventos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Todavía no hay actividad. Pídele algo al asistente o espera el primer informe automático.</p>
                ) : (
                    <ul className="divide-y rounded-xl border bg-card">
                        {estado.eventos.slice(0, 25).map((e) => {
                            const info = DEPARTAMENTOS[e.departamento]
                            const informe = e.tipo === 'rutina' && typeof e.detalle?.informe === 'string' ? (e.detalle.informe as string) : null
                            return (
                                <li key={e.id} className="px-4 py-2.5 text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground tabular-nums w-24 shrink-0">{fecha(e.created_at)} {hora(e.created_at)}</span>
                                        <span className="shrink-0">{info.emoji}</span>
                                        <span className="truncate">{ESTADO_EVENTO[e.estado]} {e.titulo}</span>
                                        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{e.fuente}</span>
                                    </div>
                                    {informe && <details className="mt-1 ml-26"><summary className="text-xs text-muted-foreground cursor-pointer">Ver informe</summary><pre className="whitespace-pre-wrap text-xs mt-1 font-sans">{informe}</pre></details>}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>
        </div>
    )
}
