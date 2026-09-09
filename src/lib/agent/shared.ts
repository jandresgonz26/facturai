/**
 * Definiciones compartidas entre servidor (tools) y cliente (tarjetas del chat).
 * Sin dependencias de servidor.
 */
export const WRITE_TOOLS = [
    'add_log',
    'add_hour_log',
    'load_recurring_services',
    'bill_client_month',
    'mark_invoice_paid',
    'update_invoice_item',
    'set_invoice_payment_note',
    'add_recurring_service',
    'add_service_category',
    'create_quote',
    'convert_quote_to_invoice',
    'send_invoice_email',
    'send_quote_email',
    'send_payment_thanks',
    'update_client_email',
    'set_client_payment_terms',
    'create_lead',
    'update_client_stage',
    'add_client_note',
    'set_next_action',
] as const
export type WriteToolName = (typeof WRITE_TOOLS)[number]

export function isWriteTool(name: string): name is WriteToolName {
    return (WRITE_TOOLS as readonly string[]).includes(name)
}

export const TOOL_LABELS: Record<string, string> = {
    list_clients: 'Consultando clientes',
    get_billing_snapshot: 'Revisando pendientes y servicios fijos',
    get_pending_logs: 'Consultando ítems pendientes',
    find_past_items: 'Revisando cómo se cobró antes',
    list_categories: 'Consultando categorías',
    list_invoices: 'Consultando facturas',
    list_quotes: 'Consultando cotizaciones',
    get_invoice_items: 'Consultando el detalle de la factura',
    get_revenue_summary: 'Calculando ingresos y cobros',
    add_log: 'Registrar actividad',
    add_hour_log: 'Registrar horas',
    load_recurring_services: 'Cargar servicios fijos',
    bill_client_month: 'Facturar el mes',
    mark_invoice_paid: 'Marcar factura como pagada',
    update_invoice_item: 'Corregir ítem de la factura',
    set_invoice_payment_note: 'Nota de pago de la factura',
    add_recurring_service: 'Crear servicio fijo',
    add_service_category: 'Crear categoría de servicio',
    create_quote: 'Crear cotización',
    convert_quote_to_invoice: 'Convertir cotización en factura',
    get_briefing: 'Revisando qué hay pendiente',
    preview_email: 'Preparando el correo',
    list_pipeline: 'Consultando el pipeline',
    get_client_timeline: 'Consultando el historial del cliente',
    send_invoice_email: 'Enviar factura por correo',
    send_quote_email: 'Enviar cotización por correo',
    send_payment_thanks: 'Enviar agradecimiento de pago',
    update_client_email: 'Guardar correo del cliente',
    set_client_payment_terms: 'Guardar condiciones de pago',
    create_lead: 'Crear lead',
    update_client_stage: 'Cambiar etapa del cliente',
    add_client_note: 'Guardar nota',
    set_next_action: 'Definir próxima acción',
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
