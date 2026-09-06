import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Log } from '@/types'
import { getEurToUsdRate } from '@/lib/currency'
import { getClient, getBillableClientIds } from './clients'
import { resolveCategoryId } from './categories'
import {
    ActionError,
    dateSchema,
    descriptionSchema,
    moneySchema,
    parseInput,
    round2,
    uuidSchema,
} from './validation'

export const LOG_SELECT = '*, clients(name, billing_modality, parent_client_id), service_categories(name)'

export const addLogSchema = z.object({
    client_id: uuidSchema,
    description: descriptionSchema,
    amount: moneySchema.optional(),
    hours: z.number().positive('Las horas deben ser mayores que 0').optional(),
    category: z.string().trim().min(1).optional(),
    date: dateSchema.optional(),
})
export type AddLogInput = z.infer<typeof addLogSchema>

/**
 * Registra una actividad puntual. Verifica que el cliente exista, que la
 * descripción sea válida y que el monto u horas correspondan a la modalidad
 * del cliente. Convierte EUR a USD con la tasa vigente.
 */
export async function addLog(raw: AddLogInput): Promise<Log> {
    const input = parseInput(addLogSchema, raw)
    const client = await getClient(input.client_id)
    const isHourBag = client.billing_modality === 'hour_bag'

    if (isHourBag && !input.hours) {
        throw new ActionError(`${client.name} se factura por bolsa de horas: indica cuántas horas registrar.`)
    }
    if (!isHourBag && input.amount == null) {
        throw new ActionError(`Indica el monto a cobrar a ${client.name} por "${input.description}".`)
    }

    const category_id = await resolveCategoryId(input.category)
    const currency = client.preferred_input_currency || 'USD'

    let value: number | null = null
    let original_amount: number | null = null
    if (input.amount != null) {
        original_amount = round2(input.amount)
        value = currency === 'EUR' ? round2(input.amount * (await getEurToUsdRate())) : original_amount
    }

    const created_at = input.date ? `${input.date}T12:00:00Z` : new Date().toISOString()

    const { data, error } = await supabase
        .from('logs')
        .insert({
            client_id: client.id,
            description: input.description,
            value,
            original_amount,
            currency,
            category_id,
            // Las horas solo tienen sentido en bolsa de horas; para clientes estándar se ignoran.
            hours: isHourBag ? input.hours ?? null : null,
            created_at,
            status: 'pending',
        })
        .select(LOG_SELECT)
        .single()

    if (error) throw new ActionError(`No se pudo registrar la actividad: ${error.message}`)
    return data as Log
}

/**
 * Ítems pendientes facturables. Si se indica cliente, incluye sus subclientes.
 * Excluye los pendientes de clientes por bolsa de horas (se facturan al empaquetar).
 */
export async function getPendingLogs(clientId?: string): Promise<Log[]> {
    let query = supabase
        .from('logs')
        .select(LOG_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

    if (clientId) {
        query = query.in('client_id', await getBillableClientIds(clientId))
    }

    const { data, error } = await query
    if (error) throw new ActionError(`No se pudieron cargar los pendientes: ${error.message}`)
    return ((data || []) as Log[]).filter((l) => l.clients?.billing_modality !== 'hour_bag')
}

export async function getLogsByIds(ids: string[]): Promise<Log[]> {
    if (ids.length === 0) return []
    const { data, error } = await supabase.from('logs').select(LOG_SELECT).in('id', ids)
    if (error) throw new ActionError(`No se pudieron cargar los ítems: ${error.message}`)
    return (data || []) as Log[]
}

export interface PastItemMatch {
    description: string
    value_usd: number | null
    original_amount: number | null
    currency: string | null
    date: string
    /** 'pending' = todavía no facturado: una coincidencia aquí puede ser un duplicado, no solo un antecedente de estilo. */
    status: 'pending' | 'billed'
}

/**
 * Actividades pasadas de un cliente (y subclientes) cuya descripción contiene
 * la palabra clave. Sirve para que un servicio nuevo se describa igual que
 * las veces anteriores (ej. "Servicios SEO, App, WEB Pago 6 (junio)"), y para
 * detectar si ya existe un ítem pendiente igual (posible duplicado) antes de
 * registrar uno nuevo.
 */
export async function findPastItems(clientId: string, keyword: string, limit = 5): Promise<PastItemMatch[]> {
    const safeKeyword = keyword.replace(/[%_]/g, '').trim()
    if (safeKeyword.length < 2) return []
    const ids = await getBillableClientIds(clientId)
    const { data, error } = await supabase
        .from('logs')
        .select('description, value, original_amount, currency, created_at, status')
        .in('client_id', ids)
        .in('status', ['pending', 'billed'])
        .ilike('description', `%${safeKeyword}%`)
        .order('created_at', { ascending: false })
        .limit(limit)
    if (error) throw new ActionError(`No se pudo buscar el historial: ${error.message}`)
    return (data || []).map((l) => ({
        description: l.description,
        value_usd: l.value,
        original_amount: l.original_amount ?? null,
        currency: l.currency ?? null,
        date: l.created_at?.split('T')[0] ?? '',
        status: l.status as 'pending' | 'billed',
    }))
}
