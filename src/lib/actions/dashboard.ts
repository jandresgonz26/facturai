import { supabase } from '@/lib/supabase'
import { ActionError, currentPeriod, round2 } from './validation'

export const DEFAULT_MONTHLY_GOAL = 5500

/** Meta mensual de facturación. Si la columna aún no existe, usa el valor por defecto. */
export async function getMonthlyGoal(): Promise<number> {
    const { data, error } = await supabase.from('company_settings').select('monthly_goal').limit(1).maybeSingle()
    if (error || !data || data.monthly_goal == null) return DEFAULT_MONTHLY_GOAL
    const n = Number(data.monthly_goal)
    return n > 0 ? n : DEFAULT_MONTHLY_GOAL
}

export interface MonthlyRevenue {
    period: string
    invoiced: number
    paid: number
    unpaid: number
    count: number
    goal: number
}

/**
 * Ingresos del mes = facturas EMITIDAS en el periodo (por fecha de emisión),
 * no actividades registradas. Así el número coincide con la suma de las
 * facturas del mes en la pantalla de Facturas.
 */
export async function getMonthlyRevenue(period = currentPeriod()): Promise<MonthlyRevenue> {
    const [y, m] = period.split('-').map(Number)
    const from = `${period}-01`
    const to = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0]
    const [{ data, error }, goal] = await Promise.all([
        supabase.from('invoices').select('total_amount, status').gte('issue_date', from).lte('issue_date', to),
        getMonthlyGoal(),
    ])
    if (error) throw new ActionError(`No se pudieron calcular los ingresos: ${error.message}`)
    const rows = (data || []) as { total_amount: number; status: string }[]
    const invoiced = round2(rows.reduce((s, r) => s + Number(r.total_amount || 0), 0))
    const paid = round2(rows.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.total_amount || 0), 0))
    return { period, invoiced, paid, unpaid: round2(invoiced - paid), count: rows.length, goal }
}
