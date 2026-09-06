import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Log, RecurringService } from '@/types'
import { getEurToUsdRate } from '@/lib/currency'
import { getClient, getBillableClientIds } from './clients'
import { resolveCategoryId } from './categories'
import {
    ActionError,
    descriptionSchema,
    moneySchema,
    normalizeText,
    parseInput,
    periodRange,
    round2,
    uuidSchema,
} from './validation'
import { LOG_SELECT } from './logs'

/** Postgres 42703: la columna no existe (migración pendiente). */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
    return error.code === '42703' || /column .* does not exist/i.test(error.message ?? '')
}

export async function listRecurringServices(clientId: string, includeSubClients = true): Promise<RecurringService[]> {
    const ids = includeSubClients ? await getBillableClientIds(clientId) : [clientId]
    const { data, error } = await supabase
        .from('recurring_services')
        .select('*, service_categories(name)')
        .in('client_id', ids)
        .eq('is_active', true)
        .order('created_at')
    if (error) throw new ActionError(`No se pudieron cargar los servicios fijos: ${error.message}`)
    return (data || []) as RecurringService[]
}

export interface RecurringLoadStatus {
    services: RecurringService[]
    loaded: RecurringService[]
    toLoad: RecurringService[]
}

/**
 * Qué servicios fijos ya fueron cargados en el periodo y cuáles faltan.
 * Considera cargado un servicio si existe un log del periodo enlazado por
 * recurring_service_id, o (compatibilidad con cargas antiguas) un log del
 * mismo cliente creado dentro del mes con la misma descripción.
 */
export async function getRecurringLoadStatus(clientId: string, period: string): Promise<RecurringLoadStatus> {
    const services = await listRecurringServices(clientId)
    if (services.length === 0) return { services, loaded: [], toLoad: [] }

    const ids = await getBillableClientIds(clientId)
    const { start, end } = periodRange(period)

    const [{ data: linked, error: e1 }, { data: sameMonth, error: e2 }] = await Promise.all([
        supabase
            .from('logs')
            .select('recurring_service_id')
            .eq('billing_period', period)
            .in('recurring_service_id', services.map((s) => s.id)),
        supabase
            .from('logs')
            .select('client_id, description')
            .in('client_id', ids)
            .in('status', ['pending', 'billed'])
            .gte('created_at', start)
            .lt('created_at', end),
    ])
    // Si aún no se ejecutó schema_update_agent.sql, las columnas no existen:
    // seguimos solo con la comparación por descripción dentro del mes.
    if (e1 && !isMissingColumn(e1)) throw new ActionError(`No se pudo verificar los servicios cargados: ${e1.message}`)
    if (e2) throw new ActionError(`No se pudo verificar los servicios cargados: ${e2.message}`)

    const linkedIds = new Set((linked || []).map((l: { recurring_service_id: string }) => l.recurring_service_id))
    const monthKeys = new Set(
        (sameMonth || []).map((l: { client_id: string; description: string }) => `${l.client_id}|${normalizeText(l.description)}`)
    )

    const loaded: RecurringService[] = []
    const toLoad: RecurringService[] = []
    for (const s of services) {
        const key = `${s.client_id}|${normalizeText(s.description)}`
        if (linkedIds.has(s.id) || monthKeys.has(key)) loaded.push(s)
        else toLoad.push(s)
    }
    return { services, loaded, toLoad }
}

/**
 * Carga como pendientes los servicios fijos del cliente (y subclientes)
 * que aún no se hayan cargado en el periodo. Idempotente.
 */
export async function loadRecurringServices(clientId: string, period: string): Promise<{ inserted: Log[]; skipped: RecurringService[] }> {
    const { toLoad, loaded } = await getRecurringLoadStatus(clientId, period)
    if (toLoad.length === 0) return { inserted: [], skipped: loaded }

    const rate = await getEurToUsdRate()
    const defaultCategory = await resolveCategoryId()

    const rows = toLoad.map((s) => {
        const currency = s.currency || 'USD'
        const original = round2(s.original_amount ?? s.amount)
        const value = currency === 'EUR' ? round2(original * rate) : round2(s.amount)
        return {
            client_id: s.client_id,
            description: s.description,
            value,
            original_amount: original,
            currency,
            category_id: s.category_id || defaultCategory,
            status: 'pending',
            recurring_service_id: s.id,
            billing_period: period,
        }
    })

    let { data, error } = await supabase.from('logs').insert(rows).select(LOG_SELECT)
    if (error && isMissingColumn(error)) {
        // Sin migración: insertamos sin las columnas de trazabilidad.
        const legacyRows = rows.map(({ client_id, description, value, original_amount, currency, category_id, status }) => ({
            client_id, description, value, original_amount, currency, category_id, status,
        }))
        ;({ data, error } = await supabase.from('logs').insert(legacyRows).select(LOG_SELECT))
    }
    if (error) throw new ActionError(`No se pudieron cargar los servicios fijos: ${error.message}`)
    return { inserted: (data || []) as Log[], skipped: loaded }
}

export const addRecurringServiceSchema = z.object({
    client_id: uuidSchema,
    description: descriptionSchema,
    amount: moneySchema,
    category: z.string().trim().min(1).optional(),
})
export type AddRecurringServiceInput = z.infer<typeof addRecurringServiceSchema>

export async function addRecurringService(raw: AddRecurringServiceInput): Promise<RecurringService> {
    const input = parseInput(addRecurringServiceSchema, raw)
    const client = await getClient(input.client_id)
    const category_id = await resolveCategoryId(input.category)
    const currency = client.preferred_input_currency || 'USD'
    const original = round2(input.amount)
    const amount = currency === 'EUR' ? round2(original * (await getEurToUsdRate())) : original

    const existing = await listRecurringServices(client.id, false)
    if (existing.some((s) => normalizeText(s.description) === normalizeText(input.description))) {
        throw new ActionError(`${client.name} ya tiene un servicio fijo llamado "${input.description}".`)
    }

    const { data, error } = await supabase
        .from('recurring_services')
        .insert({
            client_id: client.id,
            description: input.description,
            amount,
            original_amount: original,
            currency,
            category_id,
            is_active: true,
        })
        .select('*, service_categories(name)')
        .single()
    if (error) throw new ActionError(`No se pudo crear el servicio fijo: ${error.message}`)
    return data as RecurringService
}

export async function deleteRecurringService(id: string): Promise<void> {
    const { error } = await supabase.from('recurring_services').delete().eq('id', id)
    if (error) throw new ActionError(`No se pudo eliminar el servicio fijo: ${error.message}`)
}

export async function setRecurringServiceActive(id: string, is_active: boolean): Promise<void> {
    const { error } = await supabase.from('recurring_services').update({ is_active }).eq('id', id)
    if (error) throw new ActionError(`No se pudo actualizar el servicio fijo: ${error.message}`)
}

/** Todos los servicios fijos de un cliente (activos e inactivos), para administrarlos. */
export async function listAllRecurringServices(clientId: string): Promise<RecurringService[]> {
    const { data, error } = await supabase
        .from('recurring_services')
        .select('*, service_categories(name)')
        .eq('client_id', clientId)
        .order('created_at')
    if (error) throw new ActionError(`No se pudieron cargar los servicios fijos: ${error.message}`)
    return (data || []) as RecurringService[]
}
