import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { UIMessage } from 'ai'
import { supabase } from '@/lib/supabase'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import { leerHilo } from '@/lib/agent/hilos'
import { listarObjetivos, type ObjetivoConAvance } from '@/lib/agent/objetivos'
import { METRICAS, valorDe } from '@/lib/agent/metricas'
import { listarConsejos, type Consejo } from '@/lib/agent/tools-direccion'
import { PREGUNTAS } from '@/components/oficina/preguntas'
import { ChatAgente } from './ChatAgente'
import { PanelObjetivos } from './PanelObjetivos'
import { MemoriaAgente } from './MemoriaAgente'

export const dynamic = 'force-dynamic'

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmt = (v: number | null, u: string) => v === null ? '—' : u === 'usd' ? `$${v.toLocaleString('es-VE', { maximumFractionDigits: 2 })}` : v.toLocaleString('es-VE')
const ESTADO_CONSEJO: Record<Consejo['estado'], string> = { propuesta: 'Propuesta', aceptada: 'Aceptada', descartada: 'Descartada', hecha: 'Hecha' }

async function seguro<T>(p: Promise<T>, vacio: T): Promise<T> {
    try { return await p } catch (e) { console.error('[página del agente]', e instanceof Error ? e.message : e); return vacio }
}

/** Página de un agente de la Oficina: su chat, su roadmap de objetivos, sus cifras, sus informes y lo que recuerda. */
export default async function PaginaAgente({ params }: { params: Promise<{ dep: string }> }) {
    const { dep: raw } = await params
    if (!(raw in DEPARTAMENTOS)) notFound()
    const dep = raw as Departamento
    const info = DEPARTAMENTOS[dep]
    const propias = METRICAS.filter((m) => m.departamento === dep)

    const [hilo, objetivos, kpis, informes, memoria, consejos] = await Promise.all([
        seguro<UIMessage[]>(leerHilo(dep), []),
        seguro<ObjetivoConAvance[]>(listarObjetivos({ departamento: dep }), []),
        Promise.all(propias.map(async (m) => ({ etiqueta: m.etiqueta, unidad: m.unidad, valor: await valorDe(m.key) }))),
        seguro(Promise.resolve(supabase.from('agent_events').select('id, created_at, titulo, detalle').eq('departamento', dep).eq('tipo', 'rutina').eq('estado', 'hecho').order('created_at', { ascending: false }).limit(5))
            .then(({ data }) => (data ?? []) as { id: string; created_at: string; titulo: string; detalle: { informe?: string } | null }[]), []),
        seguro(Promise.resolve(supabase.from('agent_memoria').select('id, hecho, departamento').eq('activo', true).or(`departamento.eq.${dep},departamento.is.null`).order('created_at'))
            .then(({ data }) => (data ?? []).map((r) => ({ id: r.id as string, hecho: r.hecho as string, general: r.departamento === null }))), []),
        dep === 'direccion' ? seguro(listarConsejos(10), []) : Promise.resolve([] as Consejo[]),
    ])
    const metricas = METRICAS.map((m) => ({ key: m.key, etiqueta: m.etiqueta, unidad: m.unidad, propia: m.departamento === dep }))

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            <Link href="/oficina" className="text-sm text-muted-foreground hover:text-foreground">← Oficina</Link>
            <header className="flex flex-wrap items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl text-3xl" style={{ background: `${info.color}22`, boxShadow: `inset 0 0 0 1px ${info.color}66` }} aria-hidden>{info.emoji}</div>
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold leading-tight">{info.persona} <span className="font-normal text-muted-foreground">· {info.nombre}</span></h1>
                    <p className="text-sm text-muted-foreground">{info.descripcion}{informes[0] && <> · último informe: {fechaHora(informes[0].created_at)}</>}</p>
                </div>
            </header>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <ChatAgente dep={dep} inicial={hilo} preguntas={PREGUNTAS[dep] ?? []} />

                <div className="space-y-4">
                    {kpis.length > 0 && (
                        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={`Cifras de ${info.nombre}`}>
                            {kpis.map((k) => (
                                <div key={k.etiqueta} className="rounded-xl border bg-card px-3 py-2.5">
                                    <div className="text-[11px] text-muted-foreground">{k.etiqueta}</div>
                                    <div className="text-lg font-bold tabular-nums">{fmt(k.valor, k.unidad)}</div>
                                </div>
                            ))}
                        </section>
                    )}

                    <PanelObjetivos dep={dep} color={info.color} objetivos={objetivos} metricas={metricas} />

                    {dep === 'direccion' && consejos.length > 0 && (
                        <section className="rounded-2xl border bg-card p-4">
                            <h2 className="font-semibold">Consejos recientes</h2>
                            <ul className="mt-2 space-y-2 text-sm">
                                {consejos.map((c) => (
                                    <li key={c.id} className="flex items-start justify-between gap-3">
                                        <span><span className="text-xs uppercase tracking-wide text-muted-foreground">{c.tipo}</span><br />{c.titulo}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{ESTADO_CONSEJO[c.estado]}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <section className="rounded-2xl border bg-card p-4">
                        <h2 className="font-semibold">Informes de {info.persona}</h2>
                        {informes.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Todavía no hay informes automáticos.</p> : (
                            <ul className="mt-2 divide-y">
                                {informes.map((e) => (
                                    <li key={e.id} className="py-2">
                                        <details>
                                            <summary className="cursor-pointer text-sm">{e.titulo} · <span className="text-muted-foreground">{fechaHora(e.created_at)}</span></summary>
                                            {e.detalle?.informe && <pre className="mt-2 whitespace-pre-wrap font-sans text-xs">{e.detalle.informe}</pre>}
                                        </details>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <MemoriaAgente dep={dep} persona={info.persona} recuerdos={memoria} />
                </div>
            </div>
        </div>
    )
}
