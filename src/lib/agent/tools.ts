import { tool } from 'ai'
import { z } from 'zod'
import * as actions from '@/lib/actions'
import { dateSchema, periodSchema, uuidSchema, errorMessage } from '@/lib/actions/validation'
import { BLOCK_META, currentBlock, emptySignals, scoreTask, sortByPriority, suggestNow } from '@/lib/task-priority'

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
// El validador de correo de zod genera un JSON Schema con un patrón que la API de OpenAI rechaza en
// silencio (respuesta vacía). Validamos el formato en las acciones y aquí solo pedimos texto.
const emailField = z.string().trim().min(5)

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

    find_past_items: tool({
        description:
            'Busca cómo se describieron y cobraron actividades similares a un cliente (y sus subclientes) en el pasado, por palabra clave (ej. "SEO", "mantenimiento", "hosting"). Úsala ANTES de add_log/add_hour_log cuando el usuario pida cobrar algo que suene a un servicio que ya se le ha facturado antes a ese cliente, para reutilizar la misma redacción (actualizando solo el mes o número de pago) y para notar si el monto que menciona difiere del habitual.',
        inputSchema: z.object({
            client_id: uuidSchema,
            keyword: z.string().min(2).describe('Palabra clave del servicio, ej. "SEO"'),
        }),
        execute: async ({ client_id, keyword }) => run(() => actions.findPastItems(client_id, keyword)),
    }),

    get_briefing: tool({
        description:
            'Resumen de lo que hay pendiente hoy: facturas sin cobrar (y vencidas), clientes con trabajo sin facturar, servicios fijos aún no cargados este mes y bolsas de horas casi completas. Úsala para "¿qué tengo pendiente?", "¿qué toca hoy?", "dame el resumen" o al inicio de mes.',
        inputSchema: z.object({}),
        execute: async () => run(() => actions.getBriefing()),
    }),

    preview_email: tool({
        description:
            'Vista previa EXACTA del correo que se enviaría al cliente (destinatario, asunto, cuerpo, adjunto) para una factura (kind invoice), una cotización (kind quote) o un agradecimiento de pago (kind payment_thanks). Llámala SIEMPRE justo antes de send_invoice_email / send_quote_email / send_payment_thanks, en la misma respuesta. Si devuelve warnings (sin correo, sin configurar, ya enviado antes), resuélvelos o consúltalo con el usuario antes de proponer el envío. No manda nada.',
        inputSchema: z.object({
            kind: z.enum(['invoice', 'quote', 'payment_thanks']),
            invoice_id: uuidSchema.optional().describe('Para invoice y payment_thanks'),
            quote_id: uuidSchema.optional().describe('Para quote'),
            to: optionalText.describe('OMITE este campo casi siempre: el correo de la ficha del cliente se usa solo. Pásalo ÚNICAMENTE si el usuario dictó él mismo una dirección de correo explícita en su mensaje. Nunca inventes ni completes un valor de relleno aquí.'),
        }),
        execute: async ({ kind, invoice_id, quote_id, to }) =>
            run(async () => {
                const id = kind === 'quote' ? quote_id : invoice_id
                if (!id) throw new actions.ActionError(kind === 'quote' ? 'Falta quote_id' : 'Falta invoice_id')
                const p = await actions.previewEmail(kind, id, to)
                const { html: _html, ...rest } = p
                void _html
                return rest
            }),
    }),

    list_pipeline: tool({
        description:
            'Pipeline comercial: clientes agrupados por etapa (lead, quoted, active, inactive) con cotizado, por cobrar, pendiente de facturar y días desde la última actividad. Úsala para "¿qué leads tengo?", "¿a quién debo hacer seguimiento?", "¿cómo va el pipeline?".',
        inputSchema: z.object({}),
        execute: async () =>
            run(async () => {
                const p = await actions.getPipeline()
                const compact = (cards: Awaited<ReturnType<typeof actions.getPipeline>>['lead']) =>
                    cards.map((c) => ({
                        client_id: c.client.id,
                        name: c.client.name,
                        email: c.client.email ?? null,
                        source: c.client.source ?? null,
                        next_action: c.client.next_action ?? null,
                        next_action_at: c.client.next_action_at ?? null,
                        quoted_total: c.quoted_total,
                        unpaid_total: c.unpaid_total,
                        pending_total: c.pending_total,
                        days_since_activity: c.days_since_activity,
                        last_activity: c.last_activity_label,
                    }))
                return { lead: compact(p.lead), quoted: compact(p.quoted), active: compact(p.active), inactive: compact(p.inactive) }
            }),
    }),

    get_client_timeline: tool({
        description: 'Historial de un cliente: cotizaciones, facturas, pagos, correos enviados, notas y actividades, del más reciente al más antiguo.',
        inputSchema: z.object({ client_id: uuidSchema, limit: z.number().int().min(1).max(50).optional() }),
        execute: async ({ client_id, limit }) => run(async () => (await actions.getClientTimeline(client_id)).slice(0, limit ?? 25)),
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
                    // Nota de pago: undefined/null = usa la del cliente (client_payment_terms);
                    // '' = override explícito "sin nota"; texto = nota propia de esta factura.
                    payment_note: i.payment_note ?? null,
                    client_payment_terms: i.clients?.payment_terms ?? null,
                }))
            }),
    }),

    list_quotes: tool({
        description: 'Cotizaciones guardadas (id, número, cliente, total, fecha). Úsala para resolver "la cotización COT-0005" o "la cotización de X" a un quote_id antes de enviarla o consultarla.',
        inputSchema: z.object({
            query: z.string().optional().describe('Número (COT-0005) o nombre de cliente para filtrar'),
            limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async ({ query, limit }) =>
            run(async () => {
                const all = await actions.listQuotes(limit ?? 30)
                const q = query ? actions.normalizeText(query) : ''
                const rows = q ? all.filter((x) => actions.normalizeText(x.quote_number).includes(q) || actions.normalizeText(x.client_name).includes(q)) : all
                return rows.map((x) => ({
                    id: x.id,
                    quote_number: x.quote_number,
                    client_name: x.client_name,
                    client_id: x.client_id ?? null,
                    quote_type: x.quote_type,
                    currency: x.currency,
                    total_amount: x.total_amount,
                    total_hours: x.total_hours,
                    issue_date: x.issue_date,
                    // Si ya se convirtió en factura, aquí viene el id de esa factura.
                    invoice_id: x.invoice_id ?? null,
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
                    invoice_status: invoice.status,
                    items: items.map((l) => ({
                        id: l.id,
                        description: l.description,
                        category: l.service_categories?.name ?? null,
                        value_usd: l.value,
                        hours: l.hours ?? null,
                    })),
                }
            }),
    }),

    update_invoice_item: tool({
        description:
            'Corrige el concepto (descripción) y/o la categoría de servicio ("PRODUCTO / SERVICIO" en el documento) de un ítem de una factura que TODAVÍA ESTÁ EN BORRADOR. Requiere confirmación. Resuelve antes el invoice_id con list_invoices y el id del ítem (log_id) con get_invoice_items; get_invoice_items también te dice invoice_status, así que revisa que sea "draft" antes de proponerlo. Para cambiar la categoría, resuelve el nombre con list_categories (no inventes una que no exista). Si la factura ya se envió o se pagó, esta herramienta falla: explícale al usuario que ya no se puede corregir porque el documento ya salió así. El monto del ítem nunca cambia con esta herramienta.',
        inputSchema: z.object({
            log_id: uuidSchema,
            invoice_number: z.string().min(1),
            client_name: clientNameField,
            old_description: z.string().min(1).describe('Concepto actual del ítem, tal como lo devolvió get_invoice_items, para mostrarlo en la confirmación'),
            new_description: optionalText.describe('Nuevo concepto. Omite si solo se cambia la categoría.'),
            old_category: optionalText.describe('Categoría actual del ítem, tal como la devolvió get_invoice_items, para mostrarla en la confirmación'),
            new_category_id: uuidSchema.optional().describe('id de la nueva categoría, resuelto con list_categories. Omite si solo se cambia el concepto.'),
            new_category: optionalText.describe('Nombre EXACTO de la nueva categoría (el mismo cuyo id pasaste en new_category_id), para mostrarlo en la confirmación'),
        }),
        execute: async ({ log_id, invoice_number, client_name, old_description, new_description, old_category, new_category_id }) =>
            run(async () => {
                const log = await actions.updateInvoiceItem(log_id, {
                    ...(new_description ? { description: new_description } : {}),
                    ...(new_category_id ? { category_id: new_category_id } : {}),
                })
                return {
                    invoice_number,
                    client_name,
                    old_description,
                    description: log.description,
                    old_category: old_category ?? null,
                    category: log.service_categories?.name ?? null,
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
    // add_log y add_hour_log están separadas a propósito: un cliente estándar se
    // cobra por MONTO y uno de bolsa de horas por HORAS, nunca ambos a la vez
    // (igual que el formulario de Registro Rápido, que solo muestra el campo que
    // aplica). Separar las herramientas evita que el modelo mezcle los campos.
    add_log: tool({
        description:
            'Registra UNA actividad puntual (no recurrente) por un MONTO, para un cliente ESTÁNDAR (no de bolsa de horas). Requiere confirmación. El monto va en la moneda del cliente. Si el cliente es de bolsa de horas, usa add_hour_log en su lugar, nunca esta.',
        inputSchema: z.object({
            client_id: uuidSchema,
            client_name: clientNameField,
            description: z.string().min(3).describe('Descripción clara del trabajo realizado'),
            amount: z.number().positive().describe('Monto en la moneda del cliente'),
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
                    date: log.created_at?.split('T')[0],
                }
            }),
    }),

    add_hour_log: tool({
        description:
            'Registra HORAS trabajadas para un subcliente de BOLSA DE HORAS (nunca para un cliente estándar). Requiere confirmación. No lleva monto: el cobro ocurre al empaquetar 10 horas. Si el cliente es estándar, usa add_log en su lugar, nunca esta.',
        inputSchema: z.object({
            client_id: uuidSchema,
            client_name: clientNameField,
            description: z.string().min(3).describe('Descripción clara del trabajo realizado'),
            hours: z.number().positive().describe('Horas trabajadas'),
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
            'Flujo completo de facturación mensual para un cliente: carga los servicios fijos que falten (si load_recurring), registra los ítems adicionales dictados (extra_items), y crea la factura con los pendientes acordados (expected_log_ids) más lo recién cargado. Requiere confirmación. SIEMPRE debes haber llamado a get_billing_snapshot justo antes en esta misma respuesta y haber explicado al usuario el desglose y el total.',
        inputSchema: z.object({
            client_id: uuidSchema,
            client_name: clientNameField,
            period: periodSchema.describe('Periodo a facturar, YYYY-MM'),
            load_recurring: z.boolean().describe('true para cargar los servicios fijos que falten en el periodo'),
            expected_log_ids: z
                .array(uuidSchema)
                .optional()
                .describe(
                    'IMPORTANTE, no lo omitas: copia aquí, tal cual, los ids del campo pending_logs que devolvió get_billing_snapshot para este cliente (array vacío si no había ninguno). Fija exactamente qué se factura: si aparece un pendiente nuevo entre la propuesta y la confirmación, se excluye en vez de facturarse sin que el usuario lo haya visto.'
                ),
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
        description:
            'Marca una factura como pagada. Por defecto la fecha de pago es hoy. Requiere confirmación. Resuelve antes el invoice_id con list_invoices.',
        inputSchema: z.object({
            invoice_id: uuidSchema,
            invoice_number: z.string().min(1),
            client_name: clientNameField,
            paid_at: optionalDate.describe(
                'SOLO si el usuario indica que el pago fue en una fecha distinta de hoy (ej. "pagó hace 3 días", "pagó el 5 de septiembre"). Formato YYYY-MM-DD. Si el usuario solo dice "ya me pagó" sin más contexto, omite el campo.'
            ),
        }),
        execute: async ({ invoice_id, invoice_number, client_name, paid_at }) =>
            run(async () => {
                const inv = await actions.markInvoicePaid(invoice_id, paid_at)
                return { invoice_number, client_name, total_amount: inv.total_amount, paid_at: inv.paid_at }
            }),
    }),

    set_invoice_payment_note: tool({
        description:
            'Fija la nota de condiciones de pago de UNA factura puntual, distinta de la nota estándar del cliente (set_client_payment_terms). Requiere confirmación. Resuelve antes el invoice_id con list_invoices (trae payment_note actual y client_payment_terms del cliente). mode "client_default" borra el override y vuelve a usar la condición del cliente; "custom" imprime el texto de note en vez de la del cliente (ej. "50% ahora, 50% al finalizar"); "none" fuerza que NO salga ninguna nota en esta factura aunque el cliente tenga una configurada. Usa esto, no set_client_payment_terms, cuando el usuario hable de UNA factura específica y no de una condición permanente del cliente.',
        inputSchema: z.object({
            invoice_id: uuidSchema,
            invoice_number: z.string().min(1),
            client_name: clientNameField,
            mode: z.enum(['client_default', 'custom', 'none']),
            note: optionalText.describe('Texto de la nota. Obligatorio (y solo se usa) si mode es "custom".'),
        }),
        execute: async ({ invoice_id, invoice_number, client_name, mode, note }) =>
            run(async () => {
                if (mode === 'custom' && !note) throw new actions.ActionError('Falta el texto de la nota personalizada.')
                const value = mode === 'client_default' ? null : mode === 'none' ? '' : note!
                const inv = await actions.updateInvoicePaymentNote(invoice_id, value)
                return { invoice_number, client_name, mode, payment_note: inv.payment_note ?? null }
            }),
    }),

    add_service_category: tool({
        description:
            'Crea una categoría de servicio nueva (ej. "Consultoría"). Requiere confirmación. Úsala SOLO cuando el usuario mencione una categoría que no exista en la lista y confirme que quiere crearla; nunca la crees por tu cuenta.',
        inputSchema: z.object({ name: z.string().min(2).max(60).describe('Nombre de la categoría, corto y en singular') }),
        execute: async ({ name }) =>
            run(async () => {
                const c = await actions.addServiceCategory(name)
                return { id: c.id, name: c.name }
            }),
    }),

    create_quote: tool({
        description:
            'Crea una cotización (presupuesto) para un cliente potencial o existente. Requiere confirmación. quote_type "amount" lleva precio por ítem; "hours" solo horas. company_name define la plantilla del PDF. El cliente es texto libre (no necesita existir en la lista).',
        inputSchema: z.object({
            client_name: z.string().min(2).describe('Nombre del cliente tal como debe salir en el PDF'),
            company_name: z.enum(['JAM Tech, C.A.', 'Asiri Marketing']).default('JAM Tech, C.A.').describe('Empresa que emite la cotización'),
            quote_type: z.enum(['amount', 'hours']).default('amount'),
            currency: z.enum(['USD', 'EUR']).default('USD'),
            doc_title: optionalText.describe('Título del documento; por defecto COTIZACIÓN'),
            items: z
                .array(
                    z.object({
                        service: optionalText.describe('Nombre corto del servicio (columna Servicio)'),
                        description: z.string().min(2).describe('Descripción del ítem'),
                        quantity: z.number().positive().default(1),
                        unit_price: z.number().min(0).default(0).describe('Precio unitario (solo quote_type amount)'),
                        hours: z.number().min(0).default(0).describe('Horas (solo quote_type hours)'),
                    })
                )
                .min(1),
            issue_date: optionalDate.describe('SOLO si el usuario pide una fecha distinta de hoy'),
            client_email: optionalText.describe('Correo del cliente si el usuario lo da (se guarda en su ficha si es nuevo)'),
        }),
        execute: async (input) => run(() => actions.createQuote(input)),
    }),

    convert_quote_to_invoice: tool({
        description:
            'Convierte una cotización APROBADA por el cliente en una factura en borrador: crea un ítem por cada línea de la cotización y emite la factura con ellos (sin enviarla). Requiere confirmación. Resuelve antes el quote_id con list_quotes; si esa cotización ya trae invoice_id, ya fue convertida: dilo y no la conviertas de nuevo. Solo sirve para cotizaciones con importe (quote_type amount), no para las de solo horas.',
        inputSchema: z.object({
            quote_id: uuidSchema,
            quote_number: z.string().min(1).describe('Número de la cotización (ej. COT-0005), para la confirmación'),
            client_name: clientNameField,
            total_amount: z.number().min(0).describe('Total de la cotización tal como lo devolvió list_quotes, para la confirmación'),
            currency: z.enum(['USD', 'EUR']).default('USD'),
            issue_date: optionalDate.describe('SOLO si el usuario pide una fecha de emisión distinta de hoy'),
            due_date: optionalDate.describe('SOLO si el usuario indica fecha de vencimiento'),
        }),
        execute: async ({ quote_id, quote_number, client_name, issue_date, due_date }) =>
            run(async () => {
                const r = await actions.convertQuoteToInvoice({ quote_id, issue_date, due_date })
                return {
                    quote_number,
                    client_name,
                    invoice_id: r.invoice.id,
                    invoice_number: r.invoice.invoice_number,
                    total_amount: r.invoice.total_amount,
                    issue_date: r.invoice.issue_date,
                    payment_note: r.invoice.payment_note ?? null,
                    items: r.items.map((l) => ({ description: l.description, value: l.value })),
                }
            }),
    }),

    send_invoice_email: tool({
        description:
            'Envía la factura por correo al cliente con el PDF adjunto, y la marca como enviada. Requiere confirmación. Antes llama a preview_email(kind invoice) en la misma respuesta y dile al usuario a quién va y con qué asunto.',
        inputSchema: z.object({
            invoice_id: uuidSchema,
            invoice_number: z.string().min(1),
            client_name: clientNameField,
            to: emailField.describe('Copia EXACTAMENTE el campo "to" que devolvió preview_email para este mismo documento; nunca lo inventes ni lo modifiques.'),
        }),
        execute: async ({ invoice_id, to }) => run(() => actions.sendDocumentEmail('invoice', invoice_id, to)),
    }),

    send_quote_email: tool({
        description:
            'Envía la cotización por correo con el PDF adjunto. Requiere confirmación. Antes llama a preview_email(kind quote) en la misma respuesta.',
        inputSchema: z.object({
            quote_id: uuidSchema,
            quote_number: z.string().min(1),
            client_name: clientNameField,
            to: emailField.describe('Copia EXACTAMENTE el campo "to" que devolvió preview_email para este mismo documento; nunca lo inventes ni lo modifiques.'),
        }),
        execute: async ({ quote_id, to }) => run(() => actions.sendDocumentEmail('quote', quote_id, to)),
    }),

    send_payment_thanks: tool({
        description:
            'Envía al cliente el correo de agradecimiento por el pago de una factura (ya marcada como pagada), con la factura sellada como PAGADA adjunta. Requiere confirmación. Antes llama a preview_email(kind payment_thanks) en la misma respuesta.',
        inputSchema: z.object({
            invoice_id: uuidSchema,
            invoice_number: z.string().min(1),
            client_name: clientNameField,
            to: emailField.describe('Copia EXACTAMENTE el campo "to" que devolvió preview_email para este mismo documento; nunca lo inventes ni lo modifiques.'),
        }),
        execute: async ({ invoice_id, to }) => run(() => actions.sendDocumentEmail('payment_thanks', invoice_id, to)),
    }),

    update_client_email: tool({
        description: 'Guarda o corrige el correo electrónico de un cliente en su ficha. Requiere confirmación. Úsala cuando falte el correo para enviar un documento y el usuario te lo dicte.',
        inputSchema: z.object({ client_id: uuidSchema, client_name: clientNameField, email: emailField }),
        execute: async ({ client_id, client_name, email }) =>
            run(async () => {
                const c = await actions.setClientEmail(client_id, email)
                return { client_name, email: c.email }
            }),
    }),

    set_client_payment_terms: tool({
        description:
            'Guarda o corrige las condiciones de pago de un cliente (ej. "Pagar en los primeros 10 días de cada mes"). Es un texto VISIBLE para el cliente: sale impreso en cada factura (PDF y DOCX) y en el correo que se le envíe, no es una nota interna. Requiere confirmación. Máximo 300 caracteres. Pasa payment_terms vacío ("") para quitarlas.',
        inputSchema: z.object({ client_id: uuidSchema, client_name: clientNameField, payment_terms: z.string().max(300) }),
        execute: async ({ client_id, client_name, payment_terms }) =>
            run(async () => {
                const c = await actions.setClientPaymentTerms(client_id, payment_terms || null)
                return { client_name, payment_terms: c.payment_terms ?? null }
            }),
    }),

    create_lead: tool({
        description:
            'Crea un prospecto (lead) nuevo en el CRM: un cliente en etapa "lead". Requiere confirmación. Úsala cuando el usuario mencione un cliente potencial que no está en la lista. No hace falta para cotizar: create_quote crea el lead solo si no existe.',
        inputSchema: z.object({
            name: z.string().min(2).describe('Nombre de la empresa o persona'),
            email: optionalText.describe('Correo, si el usuario lo da'),
            contact_name: optionalText,
            source: optionalText.describe('De dónde salió: referido, web, Instagram…'),
            note: optionalText.describe('Contexto que dio el usuario (qué necesita, presupuesto, etc.)'),
        }),
        execute: async (input) =>
            run(async () => {
                const c = await actions.createLead({ ...input, email: input.email as string | undefined })
                return { client_id: c.id, name: c.name, email: c.email ?? null, stage: c.stage ?? 'lead' }
            }),
    }),

    update_client_stage: tool({
        description: 'Cambia la etapa comercial de un cliente: lead, quoted (cotizado), active (cliente activo) o inactive. Requiere confirmación.',
        inputSchema: z.object({
            client_id: uuidSchema,
            client_name: clientNameField,
            stage: z.enum(['lead', 'quoted', 'active', 'inactive']),
        }),
        execute: async ({ client_id, client_name, stage }) =>
            run(async () => {
                await actions.setClientStage(client_id, stage)
                return { client_name, stage }
            }),
    }),

    add_client_note: tool({
        description: 'Guarda una nota en la ficha del cliente ("anota que…", "recuerda que…"). Requiere confirmación.',
        inputSchema: z.object({ client_id: uuidSchema, client_name: clientNameField, body: z.string().min(2).max(2000) }),
        execute: async ({ client_id, client_name, body }) =>
            run(async () => {
                const n = await actions.addClientNote(client_id, body)
                return { client_name, body: n.body, created_at: n.created_at }
            }),
    }),

    list_tasks: tool({
        description:
            'Tareas del tablero (id, título, estado, cliente, fecha, horas/monto). Estados: todo (por hacer), doing (en curso), done (hecha). Úsala para "¿qué tengo pendiente?", "mis tareas", o para resolver el id de una tarea antes de completarla.',
        inputSchema: z.object({
            client_id: uuidSchema.optional().describe('Filtrar por cliente'),
            open_only: z.boolean().optional().describe('true para excluir las ya hechas'),
        }),
        execute: async ({ client_id, open_only }) =>
            run(async () => {
                const [rows, signals] = await Promise.all([
                    actions.listTasks({ client_id, open_only }),
                    actions.getClientSignals().catch(() => emptySignals()),
                ])
                return sortByPriority(rows, signals).map((t) => {
                    const p = scoreTask(t, signals)
                    return {
                        id: t.id,
                        title: t.title,
                        status: t.status,
                        client_name: t.clients?.name ?? null,
                        due_date: t.due_date ?? null,
                        hours: t.hours ?? null,
                        amount: t.amount ?? null,
                        already_registered: !!t.log_id,
                        // Prioridad calculada: now = hazla ya, frog = importante y sin forma clara,
                        // quick = mecánica y corta, later = puede esperar.
                        priority: p.label,
                        urgency: p.urgency,
                        why: p.reason,
                    }
                })
            }),
    }),

    get_day_plan: tool({
        description:
            'El plan de un día: qué tareas están comprometidas para ese día, cuáles se arrastran de días anteriores sin cerrarse, cuáles están disponibles para elegir, y cuánto tiempo estimado suman contra lo que cabe en un día realista (capacity_minutes). Úsala al armar el plan de la mañana y al revisar el cierre del día. Sin fecha, usa hoy.',
        inputSchema: z.object({ date: optionalDate.describe('YYYY-MM-DD; omítelo para hoy') }),
        execute: async ({ date }) =>
            run(async () => {
                const [plan, signals] = await Promise.all([
                    actions.getDayPlan(date),
                    actions.getClientSignals().catch(() => emptySignals()),
                ])
                const brief = (t: (typeof plan.planned)[number]) => {
                    const p = scoreTask(t, signals)
                    return {
                        id: t.id,
                        title: t.title,
                        status: t.status,
                        client_name: t.clients?.name ?? null,
                        due_date: t.due_date ?? null,
                        estimated_minutes: t.estimated_minutes ?? null,
                        postponed_count: t.postponed_count ?? 0,
                        priority: p.label,
                        why: p.reason,
                    }
                }
                return {
                    date: plan.date,
                    planned: plan.planned.map(brief),
                    carried_over: plan.carriedOver.map(brief),
                    available: sortByPriority(plan.available, signals).slice(0, 12).map(brief),
                    estimated_minutes: plan.estimatedMinutes,
                    capacity_minutes: plan.capacityMinutes,
                    over_capacity: plan.estimatedMinutes > plan.capacityMinutes,
                }
            }),
    }),

    plan_task: tool({
        description:
            'Compromete una tarea para un día (o la saca del plan si date se omite). Requiere confirmación. Úsala al armar el plan de la mañana ("hoy hago estas tres") o al mover algo a mañana en la revisión del cierre. Si la tarea ya estaba comprometida para un día anterior, moverla cuenta como posposición y el sistema lo registra.',
        inputSchema: z.object({
            task_id: uuidSchema,
            title: z.string().min(1).describe('Título de la tarea, para la confirmación'),
            date: optionalDate.describe('YYYY-MM-DD. Omítelo SOLO si el usuario quiere sacarla del plan.'),
        }),
        execute: async ({ task_id, title, date }) =>
            run(async () => {
                const task = await actions.planTask(task_id, date ?? null)
                return { title, planned_for: task.planned_for ?? null, postponed_count: task.postponed_count ?? 0 }
            }),
    }),

    what_should_i_do_now: tool({
        description:
            'Qué conviene hacer AHORA MISMO, según la hora del día y la prioridad calculada de las tareas abiertas. Úsala para "¿qué hago ahora?", "¿por dónde empiezo?", "¿qué es lo más urgente?". Devuelve la franja del día, por qué esa franja sirve para cierto tipo de trabajo, y hasta 3 tareas sugeridas con su razón. No escribe nada.',
        inputSchema: z.object({}),
        execute: async () =>
            run(async () => {
                const [rows, signals] = await Promise.all([
                    actions.listTasks({ open_only: true }),
                    actions.getClientSignals().catch(() => emptySignals()),
                ])
                const block = currentBlock()
                return {
                    block,
                    block_title: BLOCK_META[block].title,
                    block_hint: BLOCK_META[block].hint,
                    suggestions: suggestNow(rows, signals).map(({ task, priority }) => ({
                        id: task.id,
                        title: task.title,
                        client_name: task.clients?.name ?? null,
                        priority: priority.label,
                        why: priority.reason,
                    })),
                }
            }),
    }),

    create_task: tool({
        description:
            'Crea una tarea en el tablero ("recuérdame llamar a X el lunes", "anota que tengo que hacer Y"). Requiere confirmación. El cliente, la fecha, las horas y el monto son opcionales: pásalos SOLO si el usuario los menciona. consequence y clarity son las dos respuestas de las que sale la prioridad calculada: dedúcelas del mensaje si están claras y, si no, pregúntalas ANTES de proponer la tarea (ver regla de TAREAS). Si indica horas o un monto y un cliente, luego esa tarea se puede registrar como ítem facturable.',
        inputSchema: z.object({
            title: z.string().min(3).max(300).describe('Qué hay que hacer'),
            notes: optionalText.describe('Detalle adicional, solo si lo da'),
            client_id: uuidSchema.optional().describe('SOLO si la tarea es de un cliente concreto'),
            client_name: optionalText.describe('Nombre del cliente, para la confirmación'),
            due_date: optionalDate.describe('SOLO si el usuario indica para cuándo'),
            hours: z.number().positive().optional().describe('SOLO si el usuario dice cuántas horas de trabajo son'),
            amount: z.number().positive().optional().describe('SOLO si el usuario dice cuánto se cobra por la tarea'),
            consequence: z
                .enum(['none', 'client_waiting', 'payment_delayed', 'client_at_risk'])
                .optional()
                .describe('Qué pasa si no se hace esta semana: none (nada), client_waiting (un cliente espera), payment_delayed (se retrasa un cobro), client_at_risk (puedo perder el cliente)'),
            clarity: z
                .enum(['known', 'partial', 'unknown'])
                .optional()
                .describe('Si ya sabe cómo hacerla: known (mecánica, la ha hecho antes), partial (hay que investigar un poco), unknown (no sabe por dónde empezar)'),
            estimated_minutes: z.number().int().positive().optional().describe('SOLO si el usuario dice cuánto cree que le toma, en minutos'),
        }),
        execute: async ({ title, notes, client_id, client_name, due_date, hours, amount, consequence, clarity, estimated_minutes }) =>
            run(async () => {
                const task = await actions.createTask({ title, notes, client_id, due_date, hours, amount, consequence, clarity, estimated_minutes })
                const priority = scoreTask(task, await actions.getClientSignals().catch(() => emptySignals()))
                return {
                    id: task.id,
                    title: task.title,
                    client_name: task.clients?.name ?? client_name ?? null,
                    due_date: task.due_date ?? null,
                    hours: task.hours ?? null,
                    amount: task.amount ?? null,
                    priority: priority.label,
                    why: priority.reason,
                }
            }),
    }),

    complete_task: tool({
        description: 'Marca una tarea del tablero como hecha. Requiere confirmación. Resuelve antes el task_id con list_tasks.',
        inputSchema: z.object({
            task_id: uuidSchema,
            title: z.string().min(1).describe('Título de la tarea, para la confirmación'),
        }),
        execute: async ({ task_id, title }) =>
            run(async () => {
                const task = await actions.moveTask(task_id, 'done')
                return { title, client_name: task.clients?.name ?? null }
            }),
    }),

    register_task_as_log: tool({
        description:
            'Registra una tarea del tablero como ítem PENDIENTE DE FACTURAR del cliente, para que entre en la facturación normal. Requiere confirmación. La tarea necesita cliente y monto (u horas si el cliente es de bolsa de horas). Resuelve antes el task_id con list_tasks; si already_registered es true, ya se registró y no debes repetirlo.',
        inputSchema: z.object({
            task_id: uuidSchema,
            title: z.string().min(1).describe('Título de la tarea, para la confirmación'),
            client_name: clientNameField,
            category: optionalText.describe('Categoría de servicio SOLO si el usuario la menciona'),
        }),
        execute: async ({ task_id, title, client_name, category }) =>
            run(async () => {
                const log = await actions.registerTaskAsLog(task_id, category)
                return { title, client_name, amount_usd: log.value, hours: log.hours ?? null }
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
