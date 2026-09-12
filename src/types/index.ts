export type ClientStage = 'lead' | 'quoted' | 'active' | 'inactive'

export interface Client {
    id: string
    name: string
    preferred_input_currency: 'USD' | 'EUR'
    stage?: ClientStage
    source?: string | null
    next_action?: string | null
    next_action_at?: string | null
    payment_terms?: string | null
    tax_id?: string
    contact_name?: string
    billing_address?: string
    postal_code?: string
    city?: string
    email?: string
    parent_client_id?: string | null
    billing_modality: 'standard' | 'hour_bag'
    hour_bag_price?: number | null
    created_at: string
    parent_client?: { name: string } | null
}

export interface ServiceCategory {
    id: string
    name: string
    created_at: string
}

export interface Log {
    id: string
    client_id: string
    description: string
    value: number
    original_amount?: number
    currency?: string
    hours?: number | null
    status: 'pending' | 'billed' | 'packaged'
    packaged_batch_id?: string | null
    packaged_at?: string | null
    category?: string
    category_id?: string
    invoice_id?: string
    recurring_service_id?: string | null
    billing_period?: string | null
    created_at: string
    clients?: { name: string; billing_modality?: string; parent_client_id?: string | null }
    service_categories?: { name: string }
    invoices?: { status: 'draft' | 'sent' | 'paid' } | null
}

export interface Invoice {
    id: string
    invoice_number: string
    client_id: string
    issue_date: string
    total_amount: number
    status: 'draft' | 'sent' | 'paid'
    paid_at?: string
    due_date?: string | null
    sent_at?: string | null
    /**
     * Override por factura de la condición de pago que se imprime en el documento y el correo.
     * undefined/null = usa clients.payment_terms (el default permanente del cliente).
     * ''             = override explícito "sin nota", aunque el cliente tenga una.
     * 'texto...'     = nota propia de esta factura puntual.
     */
    payment_note?: string | null
    created_at: string
    clients?: Client
}

export interface CompanySettings {
    id: string
    company_name: string
    rif: string
    phone: string
    email: string
    logo_url: string | null
    eur_usd_rate?: number | null
    monthly_goal?: number | null
    created_at: string
    updated_at: string
}

export interface QuoteItem {
    service: string
    description: string
    quantity: number
    unit_price: number
    hours: number
}

export interface Quote {
    id: string
    quote_number: string
    client_name: string
    client_id?: string | null
    company_name?: string | null
    doc_title?: string | null
    quote_type: 'amount' | 'hours'
    template: 'jamtech' | 'asiri'
    currency: 'USD' | 'EUR'
    items: QuoteItem[]
    total_amount: number
    total_hours: number
    issue_date: string
    /** Respuesta del cliente: pendiente por defecto; aprobada al convertirla en factura. */
    status: QuoteStatus
    decided_at?: string | null
    /** Factura generada a partir de esta cotización (null si aún no se convirtió). */
    invoice_id?: string | null
    invoiced_at?: string | null
    created_at: string
}

export type QuoteStatus = 'pending' | 'approved' | 'rejected'

export interface RecurringService {
    id: string
    client_id: string
    description: string
    amount: number
    original_amount?: number
    currency?: string
    category_id?: string
    is_active: boolean
    created_at: string
    service_categories?: { name: string }
}

export type EmailKind = 'invoice' | 'quote' | 'payment_thanks'

export interface EmailLog {
    id: string
    kind: EmailKind
    invoice_id?: string | null
    quote_id?: string | null
    client_id?: string | null
    to_email: string
    subject: string
    provider_id?: string | null
    status: 'sent' | 'failed'
    error?: string | null
    redirected: boolean
    sent_at: string
}

export interface ClientNote {
    id: string
    client_id: string
    body: string
    created_at: string
}

export type TaskStatus = 'todo' | 'doing' | 'done'

/** Respuesta a "si esto no se hace esta semana, ¿qué pasa?". */
export type TaskConsequence = 'none' | 'client_waiting' | 'payment_delayed' | 'client_at_risk'
/** Respuesta a "¿ya sabes exactamente cómo hacerlo?". */
export type TaskClarity = 'known' | 'partial' | 'unknown'

export type TaskRecurrenceFreq = 'daily' | 'weekly' | 'monthly'

export interface TaskRecurrence {
    freq: TaskRecurrenceFreq
    /** Cada cuántas unidades de `freq` se repite (2 + weekly = cada 2 semanas). */
    interval: number
    /** Solo para weekly: 0=domingo … 6=sábado. Vacío = mismo día de la semana que la fecha base. */
    days_of_week?: number[] | null
}

export interface TaskSubtask {
    id: string
    task_id: string
    title: string
    done: boolean
    position: number
    created_at: string
}

export interface Task {
    id: string
    title: string
    notes?: string | null
    status: TaskStatus
    position: number
    /** Cliente relacionado (opcional): habilita registrar la tarea como ítem facturable. */
    client_id?: string | null
    due_date?: string | null
    hours?: number | null
    amount?: number | null
    consequence?: TaskConsequence | null
    clarity?: TaskClarity | null
    /** Minutos que creías que tomaba, para medir después contra los reales. */
    estimated_minutes?: number | null
    actual_minutes?: number | null
    /** Día para el que te comprometiste a hacerla. */
    planned_for?: string | null
    /** Veces que se empujó a otro día: delata la tarea que estás evitando. */
    postponed_count?: number | null
    /** Correo del que nació la tarea, si vino de la bandeja. */
    source_email_id?: string | null
    /** Ítem facturable ya generado desde esta tarea; si existe, no se puede registrar de nuevo. */
    log_id?: string | null
    completed_at?: string | null
    /** Si se repite, la regla de cuándo generar la siguiente al completarla. */
    recurrence?: TaskRecurrence | null
    created_at: string
    clients?: { name: string; billing_modality?: string; preferred_input_currency?: string } | null
    task_subtasks?: TaskSubtask[] | null
}
