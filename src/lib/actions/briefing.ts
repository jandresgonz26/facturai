import { supabase } from '@/lib/supabase'
import { Client } from '@/types'
import { getEurToUsdRate } from '@/lib/currency'
import { listClients } from './clients'
import { getRecurringLoadStatus } from './recurring'
import { ActionError, currentPeriod, round2 } from './validation'

export type AlertSeverity = 'high' | 'medium' | 'low'

export interface BriefingAlert {
    kind: 'overdue' | 'unpaid' | 'recurring_not_loaded' | 'pending_to_bill' | 'hour_bag_full' | 'hour_bag_near'
    severity: AlertSeverity
    title: string
    detail: string
    href: string
}

export interface Briefing {
    period: string
    today: string
    eur_usd_rate: number
    unpaid_invoices: { id: string; invoice_number: string; client_name: string; total_amount: number; issue_date: string; due_date: string | null; days_since_issue: number; overdue: boolean }[]
    unpaid_total: number
    clients_with_pending: { client_id: string; client_name: string; pending_count: number; pending_total: number }[]
    recurring_not_loaded: { client_id: string; client_name: string; count: number; total_usd: number }[]
    hour_bags: { client_id: string; client_name: string; parent_name: string | null; hours: number }[]
    alerts: BriefingAlert[]
}

const dayDiff = (from: string, to: Date) => Math.floor((to.getTime() - new Date(from).getTime()) / 86400000)

/**
 * "Qué tengo pendiente hoy": facturas sin cobrar (y vencidas), clientes con
 * trabajo sin facturar, servicios fijos aún no cargados este mes y bolsas de
 * horas a punto de completarse. Alimenta la campana y el resumen del dashboard.
 */
export async function getBriefing(): Promise<Briefing> {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const period = currentPeriod()

    const [clients, rate, { data: invoices, error: invError }, { data: pendingLogs, error: logError }] = await Promise.all([
        listClients(),
        getEurToUsdRate(),
        supabase.from('invoices').select('id, invoice_number, client_id, total_amount, issue_date, due_date, status').neq('status', 'paid').order('issue_date'),
        supabase.from('logs').select('client_id, value, hours').eq('status', 'pending'),
    ])
    if (invError) throw new ActionError(`No se pudieron cargar las facturas: ${invError.message}`)
    if (logError) throw new ActionError(`No se pudieron cargar los pendientes: ${logError.message}`)

    const byId = new Map(clients.map((c) => [c.id, c]))
    const nameOf = (id: string) => byId.get(id)?.name ?? 'Desconocido'
    const billingTarget = (c: Client) => (c.parent_client_id && byId.get(c.parent_client_id)) || c

    // 1) Facturas sin cobrar
    const unpaid = ((invoices || []) as { id: string; invoice_number: string; client_id: string; total_amount: number; issue_date: string; due_date: string | null }[]).map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        client_name: nameOf(i.client_id),
        total_amount: Number(i.total_amount || 0),
        issue_date: i.issue_date,
        due_date: i.due_date ?? null,
        days_since_issue: dayDiff(i.issue_date, today),
        overdue: i.due_date ? i.due_date < todayStr : dayDiff(i.issue_date, today) > 30,
    }))

    // 2) Pendientes por facturar (agrupados en el cliente al que se factura) y bolsas de horas
    const pendingByTarget: Record<string, { count: number; total: number }> = {}
    const hoursByClient: Record<string, number> = {}
    for (const l of (pendingLogs || []) as { client_id: string; value: number | null; hours: number | null }[]) {
        const c = byId.get(l.client_id)
        if (!c) continue
        if (c.billing_modality === 'hour_bag') {
            hoursByClient[c.id] = (hoursByClient[c.id] || 0) + Number(l.hours || 0)
            continue
        }
        const t = billingTarget(c)
        pendingByTarget[t.id] ??= { count: 0, total: 0 }
        pendingByTarget[t.id].count += 1
        pendingByTarget[t.id].total += Number(l.value || 0)
    }
    const clientsWithPending = Object.entries(pendingByTarget)
        .map(([client_id, v]) => ({ client_id, client_name: nameOf(client_id), pending_count: v.count, pending_total: round2(v.total) }))
        .sort((a, b) => b.pending_total - a.pending_total)

    const hourBags = clients
        .filter((c) => c.billing_modality === 'hour_bag' && (hoursByClient[c.id] || 0) > 0)
        .map((c) => ({ client_id: c.id, client_name: c.name, parent_name: c.parent_client_id ? nameOf(c.parent_client_id) : null, hours: round2(hoursByClient[c.id] || 0) }))
        .sort((a, b) => b.hours - a.hours)

    // 3) Servicios fijos sin cargar este mes (solo clientes estándar de primer nivel)
    const { data: activeServices } = await supabase.from('recurring_services').select('client_id').eq('is_active', true)
    const targetsWithRecurring = new Set(
        ((activeServices || []) as { client_id: string }[]).map((s) => byId.get(s.client_id)).filter(Boolean).map((c) => billingTarget(c as Client).id)
    )
    const recurringNotLoaded: Briefing['recurring_not_loaded'] = []
    for (const targetId of targetsWithRecurring) {
        const st = await getRecurringLoadStatus(targetId, period).catch(() => null)
        if (st && st.toLoad.length > 0) {
            const total = round2(st.toLoad.reduce((s, x) => s + (x.currency === 'EUR' ? (x.original_amount ?? x.amount) * rate : x.amount), 0))
            recurringNotLoaded.push({ client_id: targetId, client_name: nameOf(targetId), count: st.toLoad.length, total_usd: total })
        }
    }

    // 4) Alertas
    const alerts: BriefingAlert[] = []
    for (const i of unpaid.filter((u) => u.overdue)) {
        alerts.push({ kind: 'overdue', severity: 'high', title: `Factura #${i.invoice_number} vencida`, detail: `${i.client_name} · $${i.total_amount.toFixed(2)} · ${i.days_since_issue} días`, href: '/invoices' })
    }
    for (const b of hourBags.filter((h) => h.hours >= 10)) {
        alerts.push({ kind: 'hour_bag_full', severity: 'high', title: `Bolsa de ${b.client_name} completa`, detail: `${b.hours}h acumuladas · empaquetar y facturar`, href: '/' })
    }
    for (const r of recurringNotLoaded) {
        alerts.push({ kind: 'recurring_not_loaded', severity: 'medium', title: `Fijos de ${r.client_name} sin cargar`, detail: `${r.count} servicios · $${r.total_usd.toFixed(2)} este mes`, href: '/month-end' })
    }
    for (const c of clientsWithPending) {
        alerts.push({ kind: 'pending_to_bill', severity: 'medium', title: `${c.client_name} tiene trabajo sin facturar`, detail: `${c.pending_count} ítems · $${c.pending_total.toFixed(2)}`, href: '/month-end' })
    }
    for (const i of unpaid.filter((u) => !u.overdue)) {
        alerts.push({ kind: 'unpaid', severity: 'low', title: `Factura #${i.invoice_number} por cobrar`, detail: `${i.client_name} · $${i.total_amount.toFixed(2)} · ${i.days_since_issue} días`, href: '/invoices' })
    }
    for (const b of hourBags.filter((h) => h.hours >= 8 && h.hours < 10)) {
        alerts.push({ kind: 'hour_bag_near', severity: 'low', title: `Bolsa de ${b.client_name} casi llena`, detail: `${b.hours}h de 10h`, href: '/' })
    }

    return {
        period,
        today: todayStr,
        eur_usd_rate: rate,
        unpaid_invoices: unpaid,
        unpaid_total: round2(unpaid.reduce((s, u) => s + u.total_amount, 0)),
        clients_with_pending: clientsWithPending,
        recurring_not_loaded: recurringNotLoaded,
        hour_bags: hourBags,
        alerts,
    }
}
