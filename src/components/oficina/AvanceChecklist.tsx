/** Avance real del proyecto activo en Seguimiento de Tareas: tareas por estado, sprint activo y aprobaciones. */
import { ExternalLink } from 'lucide-react'
import { ESTADOS, ETIQUETA_ESTADO, type AvanceProyecto } from '@/lib/agent/checklist'

const COLOR: Record<(typeof ESTADOS)[number], string> = { pendiente: '#94a3b8', desarrollo: '#1B6CA8', pruebas: '#F2A93B', listo: '#4BBFD0', produccion: '#6FC043' }

export function AvanceChecklist({ a }: { a: AvanceProyecto }) {
    const pct = a.total ? Math.round((a.terminadas / a.total) * 100) : 0
    return (
        <section className="rounded-2xl border bg-card p-4" aria-label={`Avance de ${a.nombre}`}>
            <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">📋 Avance del proyecto</h2>
                <a href={a.enlace} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Seguimiento de Tareas <ExternalLink className="h-3 w-3" /></a>
            </div>
            <p className="mt-1 text-sm"><span className="text-2xl font-bold tabular-nums">{pct} %</span> <span className="text-muted-foreground">· {a.terminadas} de {a.total} tareas en producción</span></p>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={ESTADOS.map((e) => `${ETIQUETA_ESTADO[e]}: ${a.porEstado[e]}`).join(', ')}>
                {ESTADOS.map((e) => a.porEstado[e] > 0 && <div key={e} style={{ width: `${(a.porEstado[e] / Math.max(1, a.total)) * 100}%`, background: COLOR[e] }} />)}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {ESTADOS.map((e) => <li key={e} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR[e] }} />{ETIQUETA_ESTADO[e]} <span className="tabular-nums text-foreground">{a.porEstado[e]}</span></li>)}
            </ul>
            <div className="mt-3 space-y-1 border-t pt-2 text-sm">
                <p>{a.sprint ? <>Sprint activo: <span className="font-medium">{a.sprint.nombre}</span> · {a.sprint.terminadas} de {a.sprint.total} en producción</> : <span className="text-muted-foreground">Sin sprint activo</span>}</p>
                {a.pendientesAprobacion > 0 && <p className="text-amber-600 dark:text-amber-400">{a.pendientesAprobacion} {a.pendientesAprobacion === 1 ? 'tarea espera' : 'tareas esperan'} la aprobación del cliente</p>}
            </div>
        </section>
    )
}
