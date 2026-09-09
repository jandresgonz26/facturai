/**
 * Descripción legible (en español) de lo que propone o hizo cada herramienta
 * de escritura. Compartida por la tarjeta del chat web y por el bot de Telegram.
 */
import { TOOL_LABELS, dateLabel, fmtMoney, fmtUsd, periodLabel } from './shared'
import type { Quote } from '@/types'

export type Row = { label: string; value: string }
export type Rec = Record<string, unknown>

export const str = (v: unknown) => (v == null || v === '' ? undefined : String(v))
export const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? undefined : Number(v))

export function describeInput(tool: string, raw: unknown): { title: string; rows: Row[]; items?: string[]; note?: string } {
    const input = (raw ?? {}) as Rec
    const client = str(input.client_name) ?? 'Cliente'
    switch (tool) {
        case 'add_log': {
            const rows: Row[] = [
                { label: 'Cliente', value: client },
                { label: 'Descripción', value: str(input.description) ?? '-' },
                { label: 'Monto', value: `${num(input.amount)?.toFixed(2)} (moneda del cliente)` },
            ]
            if (input.category) rows.push({ label: 'Categoría', value: str(input.category)! })
            rows.push({ label: 'Fecha', value: dateLabel(str(input.date)) })
            return { title: `Registrar actividad para ${client}`, rows, note: 'Se guardará como ítem puntual pendiente de facturar.' }
        }
        case 'add_hour_log': {
            const rows: Row[] = [
                { label: 'Cliente', value: client },
                { label: 'Descripción', value: str(input.description) ?? '-' },
                { label: 'Horas', value: `${num(input.hours)}h` },
            ]
            if (input.category) rows.push({ label: 'Categoría', value: str(input.category)! })
            rows.push({ label: 'Fecha', value: dateLabel(str(input.date)) })
            return { title: `Registrar horas para ${client}`, rows, note: 'Se suman a la bolsa de 10 horas; el cobro se genera al completarla.' }
        }
        case 'load_recurring_services':
            return {
                title: `Cargar servicios fijos de ${client}`,
                rows: [{ label: 'Periodo', value: periodLabel(str(input.period)) }],
                note: 'Solo se cargan los servicios que aún no estén cargados en el periodo.',
            }
        case 'bill_client_month': {
            const extras = Array.isArray(input.extra_items) ? (input.extra_items as Rec[]) : []
            const rows: Row[] = [
                { label: 'Cliente', value: client },
                { label: 'Periodo', value: periodLabel(str(input.period)) },
                { label: 'Servicios fijos', value: input.load_recurring ? 'Cargar los que falten' : 'No cargar' },
                { label: 'Fecha de emisión', value: dateLabel(str(input.issue_date)) },
            ]
            if (input.due_date) rows.push({ label: 'Vencimiento', value: dateLabel(str(input.due_date)) })
            rows.push({ label: 'Nº de factura', value: str(input.invoice_number) ?? 'Automático' })
            if (input.expected_total_usd != null) rows.push({ label: 'Total estimado', value: fmtUsd(num(input.expected_total_usd)) })
            return {
                title: `Facturar ${periodLabel(str(input.period))} a ${client}`,
                rows,
                items: extras.map((e) => `${str(e.description)} — ${num(e.amount)?.toFixed(2)}`),
                note: 'Se emitirá la factura con todos los ítems pendientes del cliente y sus subclientes.',
            }
        }
        case 'mark_invoice_paid':
            return {
                title: `Marcar como pagada la factura #${str(input.invoice_number) ?? ''}`,
                rows: [
                    { label: 'Cliente', value: client },
                    { label: 'Fecha de pago', value: input.paid_at ? dateLabel(str(input.paid_at)) : 'Hoy' },
                ],
                note: input.paid_at ? 'Esta fecha queda impresa en el recibo y en el correo de agradecimiento.' : undefined,
            }
        case 'update_invoice_item': {
            const rows: Row[] = [{ label: 'Cliente', value: client }]
            if (input.new_description) {
                rows.push({ label: 'Concepto antes', value: str(input.old_description) ?? '-' })
                rows.push({ label: 'Concepto después', value: str(input.new_description) ?? '-' })
            }
            if (input.new_category_id) {
                rows.push({ label: 'Categoría antes', value: str(input.old_category) ?? 'Servicio Profesional' })
                rows.push({ label: 'Categoría después', value: str(input.new_category) ?? '-' })
            }
            return {
                title: `Corregir ítem en la factura #${str(input.invoice_number) ?? ''}`,
                rows,
                note: 'Solo funciona mientras la factura siga en borrador.',
            }
        }
        case 'add_recurring_service':
            return {
                title: `Nuevo servicio FIJO para ${client}`,
                rows: [
                    { label: 'Descripción', value: str(input.description) ?? '-' },
                    { label: 'Monto mensual', value: `${num(input.amount)?.toFixed(2)} (moneda del cliente)` },
                    ...(input.category ? [{ label: 'Categoría', value: str(input.category)! }] : []),
                ],
                note: `A partir de ahora, ${client} tendrá este cargo automático cada mes hasta que lo desactives en Clientes. No es un cobro puntual: no todos los clientes tienen servicios fijos, así que confirma solo si de verdad quieres que se repita mes a mes.`,
            }
        case 'add_service_category':
            return {
                title: `Crear categoría "${str(input.name) ?? ''}"`,
                rows: [{ label: 'Nombre', value: str(input.name) ?? '-' }],
                note: 'Quedará disponible para clasificar actividades y servicios fijos.',
            }
        case 'convert_quote_to_invoice':
            return {
                title: `Convertir la cotización ${str(input.quote_number) ?? ''} en factura`,
                rows: [
                    { label: 'Cliente', value: client },
                    { label: 'Total', value: fmtMoney(num(input.total_amount), str(input.currency)) },
                    { label: 'Fecha de emisión', value: dateLabel(str(input.issue_date)) },
                    ...(input.due_date ? [{ label: 'Vence', value: dateLabel(str(input.due_date)) }] : []),
                ],
                note: 'Se crea una factura en borrador con un ítem por cada línea de la cotización. No se envía al cliente hasta que lo pidas.',
            }
        case 'create_quote': {
            const items = Array.isArray(input.items) ? (input.items as Rec[]) : []
            const isHours = input.quote_type === 'hours'
            const sym = input.currency === 'EUR' ? '€' : '$'
            const total = items.reduce((s, it) => s + (isHours ? num(it.hours) ?? 0 : (num(it.quantity) ?? 1) * (num(it.unit_price) ?? 0)), 0)
            return {
                title: `Cotización para ${str(input.client_name) ?? ''}`,
                rows: [
                    { label: 'Emite', value: str(input.company_name) ?? 'JAM Tech, C.A.' },
                    { label: 'Tipo', value: isHours ? 'Solo horas' : 'Con importe' },
                    { label: 'Moneda', value: str(input.currency) ?? 'USD' },
                    { label: 'Fecha', value: dateLabel(str(input.issue_date)) },
                    { label: isHours ? 'Total horas' : 'Total', value: isHours ? `${total}h` : `${sym}${total.toFixed(2)}` },
                ],
                items: items.map((it) =>
                    isHours
                        ? `${str(it.description)} — ${num(it.hours) ?? 0}h`
                        : `${str(it.description)} — ${num(it.quantity) ?? 1} × ${sym}${(num(it.unit_price) ?? 0).toFixed(2)}`
                ),
                note: 'Se guardará en Cotizaciones y podrás descargar el PDF.',
            }
        }
        case 'send_invoice_email':
        case 'send_quote_email':
        case 'send_payment_thanks': {
            const doc = tool === 'send_quote_email' ? `Cotización ${str(input.quote_number) ?? ''}` : `Factura #${str(input.invoice_number) ?? ''}`
            const what = tool === 'send_payment_thanks' ? 'Agradecimiento de pago' : tool === 'send_quote_email' ? 'Cotización' : 'Factura'
            return {
                title: `Enviar ${what.toLowerCase()} a ${client}`,
                rows: [
                    { label: 'Documento', value: doc },
                    { label: 'Para', value: str(input.to) ?? '-' },
                ],
                note: 'Es un envío real al cliente y no se puede deshacer. Revisa el destinatario, el asunto y el cuerpo de la vista previa.',
            }
        }
        case 'update_client_email':
            return { title: `Guardar correo de ${client}`, rows: [{ label: 'Correo', value: str(input.email) ?? '-' }] }
        case 'set_client_payment_terms':
            return {
                title: input.payment_terms ? `Condiciones de pago de ${client}` : `Quitar condiciones de pago de ${client}`,
                rows: [{ label: 'Texto', value: str(input.payment_terms) ?? '(vacío)' }],
                note: 'Es visible para el cliente: sale impreso en sus facturas y en el correo que se le envíe, no es una nota interna.',
            }
        case 'create_lead':
            return {
                title: `Crear lead: ${str(input.name) ?? ''}`,
                rows: [
                    ...(input.email ? [{ label: 'Correo', value: str(input.email)! }] : []),
                    ...(input.contact_name ? [{ label: 'Contacto', value: str(input.contact_name)! }] : []),
                    ...(input.source ? [{ label: 'Origen', value: str(input.source)! }] : []),
                    ...(input.note ? [{ label: 'Nota', value: str(input.note)! }] : []),
                ],
                note: 'Queda en la etapa Lead del pipeline, con su propia ficha.',
            }
        case 'update_client_stage':
            return {
                title: `Cambiar etapa de ${client}`,
                rows: [{ label: 'Nueva etapa', value: STAGE_LABELS[str(input.stage) ?? ''] ?? str(input.stage) ?? '-' }],
            }
        case 'add_client_note':
            return { title: `Nota en la ficha de ${client}`, rows: [{ label: 'Nota', value: str(input.body) ?? '-' }] }
        case 'set_next_action':
            return {
                title: `Próxima acción con ${client}`,
                rows: [
                    { label: 'Acción', value: str(input.next_action) ?? '-' },
                    { label: 'Para', value: input.next_action_at ? dateLabel(str(input.next_action_at)) : 'Sin fecha' },
                ],
            }
        default:
            return { title: TOOL_LABELS[tool] ?? tool, rows: [] }
    }
}

export const STAGE_LABELS: Record<string, string> = { lead: 'Lead', quoted: 'Cotizado', active: 'Cliente activo', inactive: 'Inactivo' }

/** Vista previa de correo (salida de preview_email) tal como la usan las tarjetas. */
export interface EmailPreviewLike {
    kind: string
    to: string | null
    subject: string
    text: string
    attachment_name: string
    from: string
    company: string
    invoice_id?: string
    quote_id?: string
    already_sent: { sent_at: string; to: string } | null
    warnings: string[]
    test_mode_to: string | null
    configured: boolean
}

/** Busca en la misma respuesta la vista previa que corresponde a un envío propuesto. */
export function findEmailPreview(
    parts: { type: string; state: string; output?: unknown }[] | undefined,
    tool: string,
    input: unknown
): EmailPreviewLike | undefined {
    if (!parts) return undefined
    const inp = (input ?? {}) as Rec
    const kind = tool === 'send_quote_email' ? 'quote' : tool === 'send_payment_thanks' ? 'payment_thanks' : 'invoice'
    let found: EmailPreviewLike | undefined
    for (const p of parts) {
        if (p.type !== 'tool-preview_email' || p.state !== 'output-available') continue
        const out = p.output as { ok?: boolean; data?: EmailPreviewLike } | undefined
        const d = out?.data
        if (!out?.ok || !d || d.kind !== kind) continue
        if (kind === 'quote' ? d.quote_id === inp.quote_id : d.invoice_id === inp.invoice_id) found = d
    }
    return found
}

export function describeResult(tool: string, raw: unknown): { title: string; lines: string[]; invoiceId?: string; quote?: Quote } {
    const d = (raw ?? {}) as Rec
    switch (tool) {
        case 'add_log':
            return {
                title: 'Actividad registrada',
                lines: [
                    `${str(d.description)} · ${fmtMoney(num(d.original_amount), str(d.currency))}${
                        d.currency === 'EUR' && d.value_usd != null ? ` (≈ ${fmtUsd(num(d.value_usd))})` : ''
                    }`,
                    `${str(d.client_name) ?? ''} · ${dateLabel(str(d.date))}`,
                ],
            }
        case 'add_hour_log':
            return {
                title: 'Horas registradas',
                lines: [`${str(d.description)} · ${num(d.hours)}h`, `${str(d.client_name) ?? ''} · ${dateLabel(str(d.date))}`],
            }
        case 'load_recurring_services': {
            const loaded = Array.isArray(d.loaded) ? (d.loaded as Rec[]) : []
            const skipped = Array.isArray(d.skipped) ? (d.skipped as string[]) : []
            return {
                title: loaded.length ? `${loaded.length} servicios fijos cargados` : 'Nada que cargar',
                lines: [
                    ...loaded.map((l) => `${str(l.description)} · ${fmtUsd(num(l.value_usd))}`),
                    ...(skipped.length ? [`Ya estaban cargados: ${skipped.join(', ')}`] : []),
                ],
            }
        }
        case 'bill_client_month': {
            const excluded = Array.isArray(d.excluded_new_items) ? (d.excluded_new_items as Rec[]) : []
            const lines = [
                `Total ${fmtUsd(num(d.total_amount))} · ${num(d.items_count)} ítems · emitida ${dateLabel(str(d.issue_date))}`,
                `Fijos cargados: ${num(d.recurring_loaded) ?? 0} · Ítems nuevos: ${num(d.extras_added) ?? 0}`,
            ]
            if (excluded.length) {
                lines.push(
                    `⚠️ ${excluded.length} ítem${excluded.length === 1 ? '' : 's'} nuevo${excluded.length === 1 ? '' : 's'} apareció mientras tanto y NO se incluyó: ${excluded
                        .map((l) => `${str(l.description)} (${fmtUsd(num(l.value_usd))})`)
                        .join(', ')}`
                )
            }
            return {
                title: `Factura #${str(d.invoice_number)} creada para ${str(d.client_name)}`,
                lines,
                invoiceId: str(d.invoice_id),
            }
        }
        case 'mark_invoice_paid':
            return {
                title: `Factura #${str(d.invoice_number)} marcada como pagada`,
                lines: [`${str(d.client_name)} · ${fmtUsd(num(d.total_amount))} · pagada el ${dateLabel(str(d.paid_at)?.split('T')[0])}`],
            }
        case 'update_invoice_item':
            return {
                title: `Ítem corregido en la factura #${str(d.invoice_number)}`,
                lines: [`${str(d.client_name)} · "${str(d.description)}"${d.category ? ` · ${str(d.category)}` : ''}`],
            }
        case 'add_recurring_service':
            return {
                title: 'Servicio fijo creado',
                lines: [`${str(d.description)} · ${fmtUsd(num(d.amount_usd))} al mes · ${str(d.client_name)}`],
            }
        case 'add_service_category':
            return { title: 'Categoría creada', lines: [str(d.name) ?? ''] }
        case 'convert_quote_to_invoice': {
            const items = Array.isArray(d.items) ? (d.items as Rec[]) : []
            return {
                title: `Factura #${str(d.invoice_number) ?? ''} creada desde la cotización ${str(d.quote_number) ?? ''}`,
                lines: [`${str(d.client_name) ?? ''} · ${fmtUsd(num(d.total_amount))} · ${items.length} ítem${items.length === 1 ? '' : 's'} · en borrador`],
                invoiceId: str(d.invoice_id),
            }
        }
        case 'create_quote': {
            const q = d as unknown as Quote
            const sym = q.currency === 'EUR' ? '€' : '$'
            return {
                title: `Cotización ${q.quote_number} creada para ${q.client_name}`,
                lines: [q.quote_type === 'hours' ? `${q.total_hours}h en total` : `Total ${sym}${Number(q.total_amount).toFixed(2)} · ${q.items?.length ?? 0} ítems`],
                quote: q,
            }
        }
        case 'send_invoice_email':
        case 'send_quote_email':
        case 'send_payment_thanks': {
            const doc = d.quote_number ? `Cotización ${str(d.quote_number)}` : `Factura #${str(d.invoice_number) ?? ''}`
            return {
                title: `Correo enviado a ${str(d.to) ?? ''}`,
                lines: [`${doc} · ${str(d.client_name) ?? ''}`, `Asunto: ${str(d.subject) ?? ''}`, ...(d.redirected ? ['Modo prueba: se desvió a tu dirección de pruebas.'] : [])],
            }
        }
        case 'update_client_email':
            return { title: 'Correo guardado', lines: [`${str(d.client_name) ?? ''} · ${str(d.email) ?? ''}`] }
        case 'set_client_payment_terms':
            return { title: d.payment_terms ? 'Condiciones de pago guardadas' : 'Condiciones de pago eliminadas', lines: [`${str(d.client_name) ?? ''}${d.payment_terms ? ` · ${str(d.payment_terms)}` : ''}`] }
        case 'create_lead':
            return { title: 'Lead creado', lines: [`${str(d.name) ?? ''}${d.email ? ` · ${str(d.email)}` : ''} · etapa Lead`] }
        case 'update_client_stage':
            return { title: 'Etapa actualizada', lines: [`${str(d.client_name) ?? ''} → ${STAGE_LABELS[str(d.stage) ?? ''] ?? str(d.stage) ?? ''}`] }
        case 'add_client_note':
            return { title: 'Nota guardada', lines: [`${str(d.client_name) ?? ''}: ${str(d.body) ?? ''}`] }
        case 'set_next_action':
            return { title: 'Próxima acción guardada', lines: [`${str(d.client_name) ?? ''}: ${str(d.next_action) ?? ''}${d.next_action_at ? ` · ${dateLabel(str(d.next_action_at))}` : ''}`] }
        default:
            return { title: TOOL_LABELS[tool] ?? tool, lines: [] }
    }
}
