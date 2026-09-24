import { supabase } from '@/lib/supabase'
import { getBriefing } from './briefing'
import { localDateTimeToUtc } from './reminders'
import { addDaysISO, round2, todayISO } from './validation'

/**
 * Resumen de negocio del lunes por la mañana: cómo fue la semana pasada en
 * dinero, qué hay por cobrar y por facturar, y qué cliente lleva tiempo sin
 * moverse. Son cuentas, no opiniones: se arma sin modelo, para que las cifras
 * sean siempre las de la base de datos.
 */

/** Un cliente activo sin factura ni actividad en estos días se menciona como "quieto". */
const QUIET_DAYS = 45
const MAX_QUIET = 4

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "2026-09-14" → "14 sep". */
function shortDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '')
}

function monthName(iso: string): string {
    const [y, m] = iso.split('-').map(Number)
    const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-VE', { month: 'long', timeZone: 'UTC' })
    return name.charAt(0).toUpperCase() + name.slice(1)
}

export interface WeeklySummary {
    text: string
    week: { from: string; to: string }
    invoiced: number
    collected: number
}

export async function buildWeeklySummary(now = new Date()): Promise<WeeklySummary> {
    const today = todayISO(now)
    // Semana cerrada anterior: de lunes a domingo, sea cual sea el día en que se pida.
    const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7 // 0 = lunes
    const from = addDaysISO(today, -weekday - 7)
    const to = addDaysISO(from, 6)
    const fromUtc = localDateTimeToUtc(`${from}T00:00`).toISOString()
    const toUtc = localDateTimeToUtc(`${addDaysISO(to, 1)}T00:00`).toISOString()
    const monthStart = `${today.slice(0, 7)}-01`
    const monthStartUtc = localDateTimeToUtc(`${monthStart}T00:00`).toISOString()

    const [issuedRes, paidRes, monthIssuedRes, monthPaidRes, tasksRes, clientsRes, invoicesRes, logsRes, briefing] = await Promise.all([
        supabase.from('invoices').select('total_amount').gte('issue_date', from).lte('issue_date', to),
        supabase.from('invoices').select('total_amount').eq('status', 'paid').gte('paid_at', fromUtc).lt('paid_at', toUtc),
        supabase.from('invoices').select('total_amount').gte('issue_date', monthStart).lte('issue_date', today),
        supabase.from('invoices').select('total_amount').eq('status', 'paid').gte('paid_at', monthStartUtc),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('completed_at', fromUtc).lt('completed_at', toUtc),
        supabase.from('clients').select('id, name, stage, created_at'),
        supabase.from('invoices').select('client_id, issue_date').order('issue_date', { ascending: false }).limit(2000),
        supabase.from('logs').select('client_id, created_at').order('created_at', { ascending: false }).limit(3000),
        getBriefing(),
    ])
    for (const r of [issuedRes, paidRes, monthIssuedRes, monthPaidRes, clientsRes, invoicesRes, logsRes]) {
        if (r.error) throw new Error(`No se pudo armar el resumen semanal: ${r.error.message}`)
    }

    const sum = (rows: { total_amount: number }[] | null) => round2((rows || []).reduce((s, r) => s + Number(r.total_amount || 0), 0))
    const issued = (issuedRes.data || []) as { total_amount: number }[]
    const paid = (paidRes.data || []) as { total_amount: number }[]
    const invoiced = sum(issued)
    const collected = sum(paid)
    const monthInvoiced = sum(monthIssuedRes.data as { total_amount: number }[])
    const monthCollected = sum(monthPaidRes.data as { total_amount: number }[])
    const tasksDone = tasksRes.count ?? 0

    // Última señal de vida de cada cliente: su factura o su registro más reciente.
    const lastActivity = new Map<string, string>()
    const touch = (id: string | null, date: string | null) => {
        if (!id || !date) return
        const d = date.slice(0, 10)
        if ((lastActivity.get(id) ?? '') < d) lastActivity.set(id, d)
    }
    for (const i of (invoicesRes.data || []) as { client_id: string; issue_date: string }[]) touch(i.client_id, i.issue_date)
    for (const l of (logsRes.data || []) as { client_id: string; created_at: string }[]) touch(l.client_id, l.created_at)
    const quietCutoff = addDaysISO(today, -QUIET_DAYS)
    const quiet = ((clientsRes.data || []) as { id: string; name: string; stage: string | null }[])
        .filter((c) => (c.stage ?? 'active') === 'active')
        .map((c) => ({ name: c.name, last: lastActivity.get(c.id) }))
        // Sin historial no es "quieto", es nuevo o de prueba.
        .filter((c): c is { name: string; last: string } => !!c.last && c.last < quietCutoff)
        .sort((a, b) => a.last.localeCompare(b.last))

    const overdue = briefing.unpaid_invoices.filter((i) => i.overdue)
    const overdueTotal = round2(overdue.reduce((s, i) => s + i.total_amount, 0))
    const toBill = round2(briefing.clients_with_pending.reduce((s, c) => s + c.pending_total, 0))
    const recurringNotLoaded = round2(briefing.recurring_not_loaded.reduce((s, r) => s + r.total_usd, 0))

    const lines: string[] = [`📊 **Resumen de la semana** (${shortDate(from)} – ${shortDate(to)})`, '']

    lines.push('**La semana pasada**')
    lines.push(`- Facturaste **${money(invoiced)}**${issued.length ? ` (${plural(issued.length, 'factura', 'facturas')})` : ''}`)
    lines.push(`- Cobraste **${money(collected)}**${paid.length ? ` (${plural(paid.length, 'pago', 'pagos')})` : ''}`)
    if (tasksDone > 0) lines.push(`- Cerraste ${plural(tasksDone, 'tarea', 'tareas')}`)
    lines.push('')
    lines.push(`**${monthName(today)} hasta hoy**: facturado ${money(monthInvoiced)} · cobrado ${money(monthCollected)}`)
    lines.push('')

    if (briefing.unpaid_invoices.length) {
        const vencido = overdue.length ? `, de eso **${money(overdueTotal)} vencido** (${plural(overdue.length, 'factura', 'facturas')})` : ''
        lines.push(`**Por cobrar**: ${money(briefing.unpaid_total)} en ${plural(briefing.unpaid_invoices.length, 'factura', 'facturas')}${vencido}`)
    } else {
        lines.push('**Por cobrar**: nada, todo cobrado 🎉')
    }
    const porFacturar = [
        toBill > 0 ? `${money(toBill)} en trabajo registrado` : null,
        recurringNotLoaded > 0 ? `${money(recurringNotLoaded)} en servicios fijos sin cargar` : null,
    ].filter(Boolean)
    if (porFacturar.length) lines.push(`**Por facturar**: ${porFacturar.join(' + ')}`)

    if (quiet.length) {
        const names = quiet.slice(0, MAX_QUIET).map((c) => `${c.name} (desde el ${shortDate(c.last)})`)
        const more = quiet.length > MAX_QUIET ? ` y ${quiet.length - MAX_QUIET} más` : ''
        lines.push('')
        lines.push(`**Clientes quietos** (más de ${QUIET_DAYS} días sin factura ni actividad): ${names.join(', ')}${more}. ¿Vale la pena escribirles?`)
    }

    return { text: lines.join('\n'), week: { from, to }, invoiced, collected }
}
