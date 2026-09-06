import { supabase } from '@/lib/supabase'
import { Client } from '@/types'
import { ActionError, errorMessage, normalizeText } from './validation'

export async function listClients(): Promise<Client[]> {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error) throw new ActionError(`No se pudieron cargar los clientes: ${error.message}`)
    return (data || []) as Client[]
}

export async function getClient(id: string): Promise<Client> {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
    if (error) throw new ActionError(`No se pudo consultar el cliente: ${error.message}`)
    if (!data) throw new ActionError('El cliente indicado no existe', 'NOT_FOUND')
    return data as Client
}

export async function getSubClients(parentId: string): Promise<Client[]> {
    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('parent_client_id', parentId)
        .order('name')
    if (error) throw new ActionError(`No se pudieron cargar los subclientes: ${error.message}`)
    return (data || []) as Client[]
}

/** Ids del cliente y de sus subclientes (los subclientes se facturan al padre). */
export async function getBillableClientIds(clientId: string): Promise<string[]> {
    const subs = await getSubClients(clientId)
    return [clientId, ...subs.map((s) => s.id)]
}

/**
 * Búsqueda tolerante por nombre: exacta, luego por prefijo, luego contiene.
 * Devuelve varios resultados si hay ambigüedad para que quien llame pregunte.
 */
export async function findClients(query: string): Promise<Client[]> {
    const q = normalizeText(query)
    if (!q) return []
    const all = await listClients()
    const exact = all.filter((c) => normalizeText(c.name) === q)
    if (exact.length) return exact
    const starts = all.filter((c) => normalizeText(c.name).startsWith(q))
    if (starts.length) return starts
    return all.filter((c) => {
        const n = normalizeText(c.name)
        return n.includes(q) || q.includes(n)
    })
}

export function describeClientError(e: unknown): string {
    return errorMessage(e)
}
