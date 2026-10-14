'use client'

/** Roadmap del agente: objetivos con su avance, estado, fecha y los hitos (tareas) de cada uno. */
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, Plus, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ObjetivoConAvance } from '@/lib/agent/objetivos'
import type { Departamento } from '@/lib/agent/shared'
import { crearHitoAccion, crearObjetivoAccion, estadoObjetivoAccion, marcarHitoAccion, valorObjetivoAccion } from './acciones'

type MetricaOpcion = { key: string; etiqueta: string; unidad: 'usd' | 'numero' | 'pct'; propia: boolean }

const fmt = (v: number | null, u: string) => v === null ? '—' : u === 'usd' ? `$${v.toLocaleString('es-VE', { maximumFractionDigits: 2 })}` : u === 'pct' ? `${v.toLocaleString('es-VE')} %` : v.toLocaleString('es-VE')
const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

/** ¿Va a tiempo? Compara el avance con el tiempo transcurrido entre la creación y la fecha límite. */
function ritmo(o: ObjetivoConAvance): { texto: string; clase: string } | null {
    if (o.estado !== 'activo' || o.avance === null || !o.fecha_limite) return null
    const ini = Date.parse(o.created_at); const fin = Date.parse(`${o.fecha_limite}T23:59:59`)
    const t = Math.min(1, Math.max(0, (Date.now() - ini) / Math.max(1, fin - ini)))
    if (o.avance >= 1) return { texto: 'Meta alcanzada', clase: 'text-emerald-600 dark:text-emerald-400' }
    if (Date.now() > fin) return { texto: 'Venció sin llegar', clase: 'text-destructive' }
    return o.avance + 0.1 >= t ? { texto: 'A tiempo', clase: 'text-emerald-600 dark:text-emerald-400' } : { texto: 'Atrasado', clase: 'text-amber-600 dark:text-amber-400' }
}

export function PanelObjetivos({ dep, color, objetivos, metricas }: { dep: Departamento; color: string; objetivos: ObjetivoConAvance[]; metricas: MetricaOpcion[] }) {
    const [nuevo, setNuevo] = useState(objetivos.length === 0)
    const [metrica, setMetrica] = useState('manual')
    const [busy, start] = useTransition()
    const elegida = metricas.find((m) => m.key === metrica)

    const crear = (f: FormData) => start(async () => {
        const r = await crearObjetivoAccion(dep, f)
        if (r.ok) { toast.success(r.mensaje); setNuevo(false); setMetrica('manual') } else toast.error(r.mensaje)
    })

    return (
        <section className="rounded-2xl border bg-card p-4" aria-labelledby={`objetivos-${dep}`}>
            <header className="flex items-center justify-between gap-2">
                <h2 id={`objetivos-${dep}`} className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4" /> Objetivos</h2>
                <Button variant="outline" size="sm" onClick={() => setNuevo((v) => !v)}><Plus /> Nuevo</Button>
            </header>

            {nuevo && (
                <form action={crear} className="mt-3 grid gap-2 rounded-xl border bg-muted/30 p-3">
                    <Input name="titulo" placeholder="Ej.: Facturar $6.000 al mes" aria-label="Objetivo" required />
                    <label className="grid gap-1 text-xs text-muted-foreground">¿Cómo se mide?
                        <select name="metrica" value={metrica} onChange={(e) => setMetrica(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                            <option value="manual">A mano (yo actualizo el valor)</option>
                            {metricas.filter((m) => m.propia).map((m) => <option key={m.key} value={m.key}>Automático: {m.etiqueta}</option>)}
                            {metricas.filter((m) => !m.propia).map((m) => <option key={m.key} value={m.key}>Automático (otra área): {m.etiqueta}</option>)}
                        </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1 text-xs text-muted-foreground">Meta{elegida ? ` (${elegida.unidad === 'usd' ? 'USD' : elegida.unidad === 'pct' ? '%' : 'número'})` : ''}
                            <Input name="meta" inputMode="decimal" placeholder="6000" required />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">Fecha límite
                            <Input name="fecha" type="date" />
                        </label>
                    </div>
                    {!elegida && (
                        <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1 text-xs text-muted-foreground">Valor de hoy
                                <Input name="actual" inputMode="decimal" placeholder="0" />
                            </label>
                            <label className="grid gap-1 text-xs text-muted-foreground">Unidad
                                <select name="unidad" className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" defaultValue="numero">
                                    <option value="numero">Número</option><option value="usd">USD</option><option value="pct">%</option>
                                </select>
                            </label>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        {objetivos.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setNuevo(false)}>Cancelar</Button>}
                        <Button type="submit" size="sm" disabled={busy}>{busy ? 'Guardando…' : 'Crear objetivo'}</Button>
                    </div>
                </form>
            )}

            {objetivos.length === 0 && !nuevo && <p className="mt-3 text-sm text-muted-foreground">Sin objetivos todavía.</p>}
            <ul className="mt-3 space-y-3">
                {objetivos.map((o) => <Objetivo key={o.id} dep={dep} color={color} o={o} />)}
            </ul>
        </section>
    )
}

function Objetivo({ dep, color, o }: { dep: Departamento; color: string; o: ObjetivoConAvance }) {
    const [abierto, setAbierto] = useState(false)
    const [hito, setHito] = useState('')
    const [busy, start] = useTransition()
    const r = ritmo(o)
    const pct = o.avance === null ? null : Math.round(o.avance * 100)

    return (
        <li className={`rounded-xl border p-3 ${o.estado === 'pausado' ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="font-medium leading-snug">{o.titulo}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                        {fmt(o.valor, o.unidad)} de {fmt(o.valor_meta, o.unidad)}
                        {o.fecha_limite && <> · hasta el {fechaCorta(o.fecha_limite)}</>}
                        {o.automatica ? <> · automático</> : <> · manual</>}
                        {o.estado === 'pausado' && <> · en pausa</>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {r && <span className={`text-xs font-semibold ${r.clase}`}>{r.texto}</span>}
                    <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-label="Ver hitos y opciones" className="rounded-md p-1 hover:bg-muted">
                        <ChevronDown className={`h-4 w-4 transition ${abierto ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label={`Avance de ${o.titulo}`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct ?? 0}%`, background: color }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{pct === null ? 'Sin dato de avance' : `${pct} %`}</span>
                <span>{o.hitos.filter((h) => h.status === 'done').length}/{o.hitos.length} hitos</span>
            </div>

            {abierto && (
                <div className="mt-3 space-y-3 border-t pt-3">
                    <ul className="space-y-1.5">
                        {o.hitos.map((h) => (
                            <li key={h.id} className="flex items-center gap-2 text-sm">
                                <button type="button" aria-label={h.status === 'done' ? 'Marcar como pendiente' : 'Marcar como hecho'} disabled={busy}
                                    onClick={() => start(() => marcarHitoAccion(dep, h.id, h.status !== 'done'))}
                                    className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${h.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'hover:border-foreground/40'}`}>
                                    {h.status === 'done' && <Check className="h-3.5 w-3.5" />}
                                </button>
                                <span className={h.status === 'done' ? 'text-muted-foreground line-through' : ''}>{h.title}</span>
                                {h.due_date && <span className="ml-auto text-xs text-muted-foreground">{fechaCorta(h.due_date)}</span>}
                            </li>
                        ))}
                        {o.hitos.length === 0 && <li className="text-xs text-muted-foreground">Sin hitos. Añade el primer paso o pídeselo en el chat.</li>}
                    </ul>
                    <form className="flex gap-2" action={() => start(async () => { const r2 = await crearHitoAccion(dep, o.id, hito, null); if (r2.ok) { setHito(''); toast.success(r2.mensaje) } else toast.error(r2.mensaje) })}>
                        <Input value={hito} onChange={(e) => setHito(e.target.value)} placeholder="Nuevo hito (se crea como tarea)" aria-label="Nuevo hito" className="h-8 text-sm" />
                        <Button type="submit" size="sm" variant="outline" disabled={busy || hito.trim().length < 3}>Añadir</Button>
                    </form>
                    <div className="flex flex-wrap gap-1.5">
                        {!o.automatica && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
                                const v = window.prompt(`Valor de hoy para «${o.titulo}»`, o.valor === null ? '' : String(o.valor))
                                const n = v === null ? null : Number(v.replace(',', '.'))
                                if (n !== null && Number.isFinite(n)) start(() => valorObjetivoAccion(dep, o.id, n))
                            }}>Actualizar valor</Button>
                        )}
                        {o.estado === 'activo' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(() => estadoObjetivoAccion(dep, o.id, 'logrado'))}>Logrado</Button>}
                        {o.estado === 'activo' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(() => estadoObjetivoAccion(dep, o.id, 'pausado'))}>Pausar</Button>}
                        {o.estado === 'pausado' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(() => estadoObjetivoAccion(dep, o.id, 'activo'))}>Reanudar</Button>}
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => { if (window.confirm(`¿Descartar «${o.titulo}»?`)) start(() => estadoObjetivoAccion(dep, o.id, 'descartado')) }}>Descartar</Button>
                    </div>
                </div>
            )}
        </li>
    )
}
