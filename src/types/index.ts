export interface Client {
    id: string
    name: string
    preferred_input_currency: 'USD' | 'EUR'
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
    created_at: string
    clients?: { name: string; billing_modality?: string; parent_client_id?: string | null }
    service_categories?: { name: string }
}

export interface Invoice {
    id: string
    invoice_number: string
    client_id: string
    issue_date: string
    total_amount: number
    status: 'draft' | 'sent' | 'paid'
    paid_at?: string
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
    company_name?: string | null
    doc_title?: string | null
    quote_type: 'amount' | 'hours'
    template: 'jamtech' | 'asiri'
    currency: 'USD' | 'EUR'
    items: QuoteItem[]
    total_amount: number
    total_hours: number
    issue_date: string
    created_at: string
}

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
