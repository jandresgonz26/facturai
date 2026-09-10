import type { Task } from '@/types'
import { getBriefing } from './briefing'
import { getDayPlan, getClientSignals, listTasks } from './tasks'
import { canSend, listNudges, markSent, type NudgeState } from './nudges'
import { sortByPriority } from '@/lib/task-priority'
import { USER_TIMEZONE, todayISO } from './validation'

/**
 * Decide qué vale la pena decirle al usuario en este momento, como haría un
 * asistente que está pendiente sin volverse pesado.
 *
 * Dos principios que guían todo el archivo:
 *  1. Interrumpir cuesta. Si no hay nada que de verdad merezca su atención, no
 *     se manda nada; el silencio es una respuesta válida.
 *  2. Insistir no es repetir. Cada asunto sabe cuántas veces se mencionó y
 *     cambia el tono: primero lo nombra, luego dice cuánto lleva, y al final
 *     pregunta si se suelta.
 */

export type CheckinMoment = 'morning' | 'midday' | 'evening'

export interface CheckinItem {
    kind: string
    ref_id: string
    text: string
    /** Cuántas veces se le había mencionado antes de este mensaje. */
    times_before: number
}

export interface Checkin {
    moment: CheckinMoment
    /** Mensaje listo para enviar, o null si no hay nada que amerite escribir. */
    message: string | null
    items: CheckinItem[]
}

const fmtDate = (d: string) => d.split('T')[0].split('-').reverse().join('/')
const money = (n: number) => `$${Number(n).toFixed(2)}`

/**
 * Un emoji por tipo de aviso, para que se distingan de un vistazo en el
 * teléfono. Uno solo por línea: si cada frase lleva adornos, dejan de servir
 * como señal y estorban.
 */
const KIND_EMOJI: Record<string, string> = {
    invoice_overdue: '💸',
    task_avoided: '🐸',
    task_overdue: '⏰',
    plan_missing: '📋',
    carried_over: '🔁',
    day_close: '🌙',
    quote_cold: '📄',
    wip_overload: '🧱',
    weekly_review: '🧹',
}

/** Más de esto empezado a la vez y ya no se termina nada. */
const WIP_LIMIT = 2
/** Días que puede esperar una tarea sin planificarse antes de repasarla. */
const STALE_DAYS = 14

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

/** Lunes en la zona del usuario: el día de repasar el montón. */
function isReviewDay(now: Date): boolean {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: USER_TIMEZONE, weekday: 'short' }).format(now)
    return day === 'Mon'
}

function hourInUserTimezone(now: Date): number {
    const h = new Intl.DateTimeFormat('en-US', { timeZone: USER_TIMEZONE, hour: 'numeric', hour12: false }).format(now)
    return Number(h) % 24
}

export function momentFor(now = new Date()): CheckinMoment {
    const h = hourInUserTimezone(now)
    if (h < 12) return 'morning'
    if (h < 18) return 'midday'
    return 'evening'
}

/**
 * Escala el tono según las veces que ya se mencionó: mencionar, señalar la
 * insistencia, y finalmente proponer soltarlo. Sin esto, "insistir" sería
 * mandar el mismo texto en bucle.
 */
function escalate(text: string, timesBefore: number): string {
    if (timesBefore === 0) return text
    if (timesBefore === 1) return `${text} (ya te lo mencioné ayer)`
    if (timesBefore < 4) return `${text} · van ${timesBefore + 1} veces que te lo digo`
    return `${text} · te lo he dicho ${timesBefore + 1} veces. ¿Lo hacemos hoy, lo partimos en algo más chico, o lo soltamos? Si me dices que lo suelte, no vuelvo a mencionarlo.`
}

export async function buildCheckin(now = new Date()): Promise<Checkin> {
    const moment = momentFor(now)
    const [briefing, plan, allTasks, signals, nudgeRows] = await Promise.all([
        getBriefing().catch(() => null),
        getDayPlan().catch(() => null),
        listTasks({ open_only: true }).catch(() => [] as Task[]),
        getClientSignals().catch(() => undefined),
        listNudges().catch(() => [] as NudgeState[]),
    ])

    const byKey = new Map(nudgeRows.map((n) => [`${n.kind}|${n.ref_id}`, n]))
    const stateOf = (kind: string, ref = '') => byKey.get(`${kind}|${ref}`)
    const items: CheckinItem[] = []

    const push = (kind: string, ref_id: string, text: string) => {
        const st = stateOf(kind, ref_id)
        if (!canSend(st, now)) return
        items.push({ kind, ref_id, text: escalate(text, st?.times_sent ?? 0), times_before: st?.times_sent ?? 0 })
    }

    // ── Lo que de verdad urge, a cualquier hora ──
    for (const inv of (briefing?.unpaid_invoices ?? []).filter((i) => i.overdue)) {
        push('invoice_overdue', inv.id, `**Factura #${inv.invoice_number}** de ${inv.client_name}: ${inv.days_since_issue} días sin cobrarse (**${money(inv.total_amount)}**)`)
    }

    // Tareas que se están evitando: el contador de posposiciones las delata.
    for (const t of allTasks.filter((x) => (x.postponed_count ?? 0) >= 3)) {
        push('task_avoided', t.id, `**${t.title}**: la has movido ${t.postponed_count} veces`)
    }

    // Vencidas de verdad
    for (const t of allTasks.filter((x) => x.due_date && x.due_date < todayISO())) {
        push('task_overdue', t.id, `**${t.title}**: venció el ${fmtDate(t.due_date!)}`)
    }

    // ── Según el momento del día ──
    if (moment === 'morning') {
        if (plan && plan.planned.length === 0) {
            const top = sortByPriority(plan.available, signals).slice(0, 3)
            if (top.length > 0) {
                const names = top.map((t) => `**${t.title}**`).join(', ')
                push('plan_missing', todayISO(), `Todavía no tienes plan para hoy. Por prioridad yo empezaría por ${names}`)
            }
        }
        if (plan && plan.carriedOver.length > 0) {
            push('carried_over', todayISO(), `Traes **${plan.carriedOver.length} tarea${plan.carriedOver.length === 1 ? '' : 's'}** arrastrándose de días anteriores`)
        }
    }

    // Demasiadas cosas empezadas a la vez: es la vía rápida a no terminar ninguna.
    const doing = allTasks.filter((t) => t.status === 'doing')
    if (doing.length > WIP_LIMIT) {
        push('wip_overload', todayISO(), `Tienes **${doing.length} tareas empezadas** a la vez. Terminar una antes de abrir otra te va a costar menos que arrastrarlas todas`)
    }

    /**
     * Revisión semanal: la válvula de escape del montón acumulado. Sin esto la
     * pila crece en silencio, y esa pila es la que genera la sensación de
     * colapso cuando encima llegan cosas nuevas cada día.
     */
    if (moment === 'morning' && isReviewDay(now)) {
        const stale = allTasks.filter(
            (t) => t.status === 'todo' && !t.planned_for && daysSince(t.created_at) >= STALE_DAYS
        )
        if (stale.length > 0) {
            push(
                'weekly_review',
                todayISO(),
                `Tienes **${stale.length} tarea${stale.length === 1 ? '' : 's'}** esperando hace más de ${STALE_DAYS} días sin que las planifiques. Repasémoslas: cada una se hace, se parte en algo más chico, o se suelta`
            )
        }
    }

    if (moment === 'evening' && plan) {
        const left = plan.planned.filter((t) => t.status !== 'done')
        if (left.length > 0) {
            push('day_close', todayISO(), `Del plan de hoy quedaron **${left.length} sin cerrar**: ${left.map((t) => `**${t.title}**`).join(', ')}. ¿Las mueves a mañana o las sueltas?`)
        }
    }

    // Cotizaciones sin respuesta: dinero parado esperando un "sí" o un "no".
    for (const f of briefing?.followups ?? []) {
        if (f.stage === 'quoted') {
            push('quote_cold', f.client_id, `**${f.client_name}**: cotización sin respuesta hace ${f.days_since_activity ?? 0} días`)
        }
    }

    if (items.length === 0) return { moment, message: null, items }

    // Se limita a lo que una persona puede atender de una sentada.
    const shown = items.slice(0, 5)
    const greeting =
        moment === 'morning' ? '☀️ **Buenos días.**' : moment === 'midday' ? '⏳ **¿Cómo va el día?**' : '🌙 **Cerrando el día.**'
    const closing =
        moment === 'morning'
            ? '¿Armamos el plan? Dime por dónde quieres empezar.'
            : moment === 'evening'
              ? 'Dime qué muevo a mañana.'
              : '¿Te ayudo con alguna?'

    const message = [greeting, '', ...shown.map((i) => `${KIND_EMOJI[i.kind] ?? '•'} ${i.text}`), '', closing].join('\n')
    return { moment, message, items: shown }
}

/** Deja constancia de lo enviado, para que la próxima vez el tono escale. */
export async function recordCheckin(items: CheckinItem[]): Promise<void> {
    for (const i of items) {
        await markSent({ kind: i.kind, ref_id: i.ref_id }).catch(() => undefined)
    }
}
