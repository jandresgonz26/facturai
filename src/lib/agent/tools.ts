import { tool } from 'ai'
import { z } from 'zod'
import * as actions from '@/lib/actions'
import { dateSchema, periodSchema, uuidSchema, errorMessage } from '@/lib/actions/validation'

/** Resultado uniforme: el modelo siempre recibe ok/data o ok/error legible. */
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try {
        return { ok: true, data: await fn() }
    } catch (e) {
        console.error('[agent tool]', e)
        return { ok: false, error: errorMessage(e) }
    }
}

const clientNameField = z.string().min(1).describe('Nombre del cliente tal como aparece en la lista, para mostrarlo en la confirmación')

/** El modelo a veces manda "" en vez de omitir: lo tratamos como ausente. */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const optionalDate = z.preprocess(blankToUndefined, dateSchema.optional())
const optionalText = z.preprocess(blankToUndefined, z.string().trim().min(1).optional())

export const agentTools = {
    // ───────────── Lecturas (se ejecutan sin confirmación) ─────────────
    list_clients: tool({
        description:
            'Lista los clientes (id, nombre, moneda, modalidad, cliente padre). Úsala para convertir el nombre que dice el usuario en un client_id. Si pasas query, filtra por nombre de forma tolerante.',
        inputSchema: z.object({
            query: z.string().optional().describe('Texto para buscar por nombre (opcional)'),
        }),
        execute: async ({ query }) =>
            run(async () => {
                const clients = query ? await actions.findClients(query) : await actions.listClients()
                return clients.map((c) => ({
                    id: c.id,
                    name: c.name,
                    currency: c.preferred_input_currency,
                    billing_modality: c.billing_modality,
                    parent_client_id: c.parent_client_id ?? null,
                }))
            }),
    }),

    get_billing_snapshot: tool({
        description:
            'Devuelve todo lo necesario para facturar el mes a un cliente: ítems pendientes (incluye subclientes), servicios fijos ya cargados y por cargar en el periodo, tasa EUR/USD, próximo número de factura y totales proyectados. Llámala SIEMPRE antes de proponer bill_client_month.',
        inputSchema: z.object({
            client_id: uuidSchema,
            period: periodSchema.optional().describe('Periodo YYYY-MM. Si se omite, el mes actual.'),
        }),
        execute: async ({ client_id, period }) => run(() => actions.getBillingSnapshot(client_id, period)),
    }),

    get_pending_logs: tool({
        description: 'Ítems pendientes de facturar. Sin client_id devuelve los de todos los clientes.',
        inputSchema: z.object({ client_id: uuidSchema.optional() }),
        execute: async ({ client_id }) =>
            run(async () => {
                const logs = await actions.getPendingLogs(client_id)
                return logs.map((l) => ({
                    id: l.id,
                    client_name: l.clients?.name ?? null,
                    description: l.description,
                    value_usd: l.value,
                    currency: l.currency ?? 'USD',
                    original_amount: l.original_amount ?? null,
                    hours: l.hours ?? null,
                    category: l.service_categories?.name ?? null,
                    date: l.created_at?.split('T')[0],
                }))
            }),
    }),

    list_categories: tool({
        description: 'Categorías de servicio disponibles para clasificar actividades.',
        inputSchema: z.object({}),
        execute: async () => run(async () => (await actions.listCategories()).map((c) => ({ id: c.id, name: c.name }))),
    }),

    list_invoices: tool({
        description: 'Facturas emitidas con filtros opcionales por cliente, estado (draft, sent, paid) y rango de fechas de emisión.',
        inputSchema: z.object({
            client_id: uuidSchema.optional(),
            status: z.enum(['draft', 'sent', 'paid']).optional(),
            from: dateSchema.optional(),
            to: dateSchema.optional(),
            limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async (filters) =>
            run(async () => {
                const invoices = await actions.listInvoices({ ...filters, limit: filters.limit ?? 20 })
                return invoices.map((i) => ({
                    id: i.id,
                    invoice_number: i.invoice_number,
                    client_name: i.clients?.name ?? null,
                    issue_date: i.issue_date,
                    due_date: i.due_date ?? null,
                    total_amount: i.total_amount,
                    status: i.status,
                    paid_at: i.paid_at ?? null,
                }))
            }),
    }),

    get_invoice_items: tool({
        description:
            'Ítems (descripción, categoría, monto) que componen UNA factura ya emitida. Resuelve primero el invoice_id con list_invoices (por cliente y rango de fechas) y luego llama a esta herramienta para ver el detalle. Úsala cuando el usuario pregunte qué se le cobró, el detalle o la descripción de una factura o de un periodo ya facturado.',
        inputSchema: z.object({ invoice_id: uuidSchema }),
        execute: async ({ invoice_id }) =>
            run(async () => {
                const { invoice, items } = await actions.getInvoiceWithItems(invoice_id)
                return {
                    invoice_number: invoice.invoice_number,
                    client_name: invoice.clients?.name ?? null,
                    issue_date: invoice.issue_date,
                    total_amount: invoice.total_amount,
                    items: items.map((l) => ({
                        description: l.description,
                        category: l.service_categories?.name ?? null,
                        value_usd: l.value,
                        hours: l.hours ?? null,
                    })),
                }
            }),
    }),

    get_revenue_summary: tool({
        description: 'Resumen de ingresos: total facturado, cobrado y por cobrar, desglosado por mes y por cliente, más la lista de facturas sin pagar con días transcurridos. Úsala para preguntas como "¿quién me debe?" o "¿cuánto facturé en X?".',
        inputSchema: z.object({
            from: dateSchema.optional().describe('Fecha de emisión desde (YYYY-MM-DD)'),
            to: dateSchema.optional().describe('Fecha de emisión hasta (YYYY-MM-DD)'),
            client_id: uuidSchema.optional(),
        }),
        execute: async (filters) => run(() => actions.getRevenueSummary(filters)),
    }),

    // ───────────── Escrituras (requieren confirmación del usuario) ─────────────
    add_log: tool({
        description:
            'Registra UNA actividad puntual (no recurrente) para un cliente. Requiere confirmación. Para clientes estándar el monto es obligatorio; para subclientes por bolsa de horas, las horas son obligatorias. El monto va en la moneda del cliente.',
        inputSchema: z.object({
            client_id: uuidSchema,
            client_name: clientNameField,
            description: z.string().min(3).describe('Descripción clara del trabajo realizado'),
            amount: z.number().positive().optional().describe('Monto en la moneda del cliente. Obligatorio para clientes estándar.'),
            hours: z.number().positive().optional().describe('SOLO para subclientes por bolsa de horas o si el usuario dice las horas. No lo inventes.'),
            category: optionalText.describe('SOLO si el usuario menciona la categoría; si no, omítelo y se usa la predeterminada'),
            date: optionalDate.describe('SOLO si el usuario indica una fecha distinta de hoy (YYYY-MM-DD)'),
        }),
        execute: async ({ client_name, ...input }) =>
            run(async () => {
                const log = await actions.addLog(input)
                return {
                    id: log.id,
                    client_name,
                    description: log.description,
                    value_usd: log.value,
                    currency: log.currency,
                    original_amount: log.original_amount,
                    hours: log.hours,
                    date: log.created_at?.split('T')[0],
                }
            }),
    }),

    load_recurring_services: tool({
        description:
            'Carga como pendientes los servicios fijos del cliente (y subclientes) que aún no se hayan cargado en el periodo. Es idempotente: los ya cargados se omiten. Requiere confirmación. Úsala solo cuando el usuario quiera cargar fijos SIN facturar todavía; para facturar el mes usa bill_client_month.',
        inputSchema: z.object({
            client_id: uuidSchema,
            client_name: clientNameField,
            period: periodSchema,
        }),
        execute: async ({ client_id, client_name, period }) =>
            run(async () => {
                const r = await actions.loadRecurringServices(client_id, period)
                return {
                    client_name,
                    period,
                    loaded: r.inserted.map((l) => ({ description: l.description, value_usd: l.value })),
                    skipped: r.skipped.map((s) => s.description),
                }
            }),
    }),

    bill_client_month: tool({
        description:
            'Flujo completo de facturación mensual para un cliente: carga los servicios fijos que falten (si load_recurring), registra los ítems adicionales dictados (extra_items), y crea la factura con TODOS los pendientes del cliente y sus subclientes. Requiere confirmación. Antes de llamarla debes haber consultado get_billing_snapshot y haber explicado al usuario el desglose y el total.',
        inputSchema: z.object({
            client_id: uuidSchema,
            client_name: clientNameField,
            period: periodSchema.describe('Periodo a facturar, YYYY-MM'),
            load_recurring: z.boolean().describe('true para cargar los servicios fijos que falten en el periodo'),
            extra_items: z
                .array(
                    z.object({
                        description: z.string().min(3),
                        amount: z.number().positive().describe('Monto en la moneda del cliente'),
                        category: optionalText.describe('SOLO si el usuario la menciona'),
                    })
                )
                .default([])
                .describe('Ítems puntuales nuevos que dictó el usuario'),
            issue_date: optionalDate.describe('SOLO si el usuario pide una fecha de emisión distinta de hoy'),
            invoice_number: optionalText.describe('SOLO si el usuario pide un número concreto; si no, omítelo (se asigna el siguiente)'),
            expected_total_usd: z.number().optional().describe('projected_total_usd del snapshot más los ítems nuevos en USD'),
        }),
        execute: async ({ client_name, expected_total_usd, ...input }) =>
            run(async () => {
                void client_name
                void expected_total_usd
                return actions.billClientMonth(input)
            }),
    }),

    mark_invoice_paid: tool({
        description: 'Marca una factura como pagada (fecha de pago = hoy). Requiere confirmación. Resuelve antes el invoice_id con list_invoices.',
        inputSchema: z.object({
            invoice_id: uuidSchema,
            invoice_number: z.string().min(1),
            client_name: clientNameField,
        }),
        execute: async ({ invoice_id, invoice_number, client_name }) =>
            run(async () => {
                const inv = await actions.markInvoicePaid(invoice_id)
                return { invoice_number, client_name, total_amount: inv.total_amount, paid_at: inv.paid_at }
            }),
    }),

    add_recurring_service: tool({
        description:
            'Crea un servicio FIJO que se cobrará TODOS los meses de forma automática hasta que se desactive. No todos los clientes tienen servicios fijos: es una decisión poco frecuente e importante. Requiere confirmación. Úsala SOLO si el usuario pide explícitamente que sea recurrente ("todos los meses", "cada mes", "de forma fija"). Si el usuario menciona un mes concreto (ej. "el SEO de agosto") es un cobro puntual de ese mes: usa add_log, NO esta herramienta, aunque el trabajo en sí sea mensual.',
        inputSchema: z.object({
            client_id: uuidSchema,
            client_name: clientNameField,
            description: z.string().min(3),
            amount: z.number().positive().describe('Monto mensual en la moneda del cliente'),
            category: optionalText.describe('SOLO si el usuario la menciona'),
        }),
        execute: async ({ client_name, ...input }) =>
            run(async () => {
                const s = await actions.addRecurringService(input)
                return { client_name, description: s.description, amount_usd: s.amount, currency: s.currency }
            }),
    }),
}

export type AgentTools = typeof agentTools

export { WRITE_TOOLS, isWriteTool, type WriteToolName } from './shared'
import { WRITE_TOOLS as WRITE_TOOL_NAMES, type WriteToolName as WriteName } from './shared'

/** Toda escritura pasa por confirmación explícita del usuario. */
export const toolApproval = Object.fromEntries(WRITE_TOOL_NAMES.map((t) => [t, 'user-approval'])) as Record<WriteName, 'user-approval'>
