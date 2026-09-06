import { supabase } from '@/lib/supabase'
import { ServiceCategory } from '@/types'
import { ActionError, normalizeText } from './validation'

export async function listCategories(): Promise<ServiceCategory[]> {
    const { data, error } = await supabase.from('service_categories').select('*').order('name')
    if (error) throw new ActionError(`No se pudieron cargar las categorías: ${error.message}`)
    return (data || []) as ServiceCategory[]
}

/**
 * Resuelve una categoría por id o nombre. Sin argumento devuelve la
 * predeterminada ("Desarrollo Web" o la primera). Nunca devuelve null.
 */
export async function resolveCategoryId(nameOrId?: string | null): Promise<string> {
    const cats = await listCategories()
    if (cats.length === 0) {
        throw new ActionError('No hay categorías de servicio configuradas. Crea una en Ajustes antes de registrar actividades.')
    }
    if (nameOrId) {
        const byId = cats.find((c) => c.id === nameOrId)
        if (byId) return byId.id
        const n = normalizeText(nameOrId)
        const byName =
            cats.find((c) => normalizeText(c.name) === n) ||
            cats.find((c) => normalizeText(c.name).includes(n))
        if (byName) return byName.id
        throw new ActionError(`La categoría "${nameOrId}" no existe. Disponibles: ${cats.map((c) => c.name).join(', ')}`)
    }
    return (cats.find((c) => c.name === 'Desarrollo Web') || cats[0]).id
}
