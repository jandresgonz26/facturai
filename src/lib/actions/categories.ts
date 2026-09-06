import { supabase } from '@/lib/supabase'
import { ServiceCategory } from '@/types'
import { ActionError, normalizeText } from './validation'

export async function listCategories(): Promise<ServiceCategory[]> {
    const { data, error } = await supabase.from('service_categories').select('*').order('name')
    if (error) throw new ActionError(`No se pudieron cargar las categorías: ${error.message}`)
    return (data || []) as ServiceCategory[]
}

/**
 * Búsqueda tolerante de categoría: exacta, contenida en cualquier dirección,
 * o con una palabra significativa en común ("ads" ↔ "Gestión Google ADS").
 */
export function matchCategory(cats: ServiceCategory[], query: string): ServiceCategory | null {
    const q = normalizeText(query)
    if (!q) return null
    const byId = cats.find((c) => c.id === query)
    if (byId) return byId
    const exact = cats.find((c) => normalizeText(c.name) === q)
    if (exact) return exact
    const contains = cats.find((c) => normalizeText(c.name).includes(q) || q.includes(normalizeText(c.name)))
    if (contains) return contains
    const tokens = q.split(' ').filter((t) => t.length >= 3)
    return cats.find((c) => normalizeText(c.name).split(' ').some((t) => t.length >= 3 && tokens.includes(t))) ?? null
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
        const found = matchCategory(cats, nameOrId)
        if (found) return found.id
        throw new ActionError(`La categoría "${nameOrId}" no existe. Disponibles: ${cats.map((c) => c.name).join(', ')}`, 'CATEGORY_NOT_FOUND')
    }
    return (cats.find((c) => c.name === 'Desarrollo Web') || cats[0]).id
}

export async function addServiceCategory(rawName: string): Promise<ServiceCategory> {
    const name = (rawName ?? '').trim().replace(/\s+/g, ' ')
    if (name.length < 2) throw new ActionError('El nombre de la categoría es demasiado corto')
    if (name.length > 60) throw new ActionError('El nombre de la categoría es demasiado largo')
    const cats = await listCategories()
    const dup = cats.find((c) => normalizeText(c.name) === normalizeText(name))
    if (dup) throw new ActionError(`La categoría "${dup.name}" ya existe.`)
    const { data, error } = await supabase.from('service_categories').insert({ name }).select('*').single()
    if (error) {
        throw new ActionError(error.code === '23505' ? `La categoría "${name}" ya existe.` : `No se pudo crear la categoría: ${error.message}`)
    }
    return data as ServiceCategory
}
