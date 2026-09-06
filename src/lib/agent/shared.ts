/**
 * Definiciones compartidas entre servidor (tools) y cliente (tarjetas del chat).
 * Sin dependencias de servidor.
 */
export const WRITE_TOOLS = [
    'add_log',
    'load_recurring_services',
    'bill_client_month',
    'mark_invoice_paid',
    'add_recurring_service',
] as const
export type WriteToolName = (typeof WRITE_TOOLS)[number]

export function isWriteTool(name: string): name is WriteToolName {
    return (WRITE_TOOLS as readonly string[]).includes(name)
}

export const TOOL_LABELS: Record<string, string> = {
    list_clients: 'Consultando clientes',
    get_billing_snapshot: 'Revisando pendientes y servicios fijos',
    get_pending_logs: 'Consultando ítems pendientes',
    list_categories: 'Consultando categorías',
    list_invoices: 'Consultando facturas',
    get_invoice_items: 'Consultando el detalle de la factura',
    get_revenue_summary: 'Calculando ingresos y cobros',
    add_log: 'Registrar actividad',
    load_recurring_services: 'Cargar servicios fijos',
    bill_client_month: 'Facturar el mes',
    mark_invoice_paid: 'Marcar factura como pagada',
    add_recurring_service: 'Crear servicio fijo',
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function periodLabel(period?: string): string {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return period ?? ''
    const [y, m] = period.split('-').map(Number)
    return `${MONTHS[m - 1]} ${y}`
}

export function dateLabel(date?: string | null): string {
    if (!date) return 'Hoy'
    const [y, m, d] = date.split('-')
    return `${d}/${m}/${y}`
}

export function fmtUsd(n: number | null | undefined): string {
    if (n == null || isNaN(Number(n))) return '-'
    return `$${Number(n).toFixed(2)}`
}

export function fmtMoney(n: number | null | undefined, currency?: string | null): string {
    if (n == null || isNaN(Number(n))) return '-'
    return currency === 'EUR' ? `€${Number(n).toFixed(2)}` : `$${Number(n).toFixed(2)}`
}
