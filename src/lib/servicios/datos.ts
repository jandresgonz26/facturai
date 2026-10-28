/**
 * Catálogo de servicios en el servidor (detrás de la sesión de José). Solo mis precios: no se cruza con facturas,
 * salvo que las categorías son las mismas de facturación (por eso aquí nunca se borran ni se renombran sin avisar).
 */
import { supabase } from '@/lib/supabase'
import { ActionError } from '@/lib/actions/validation'
import type { Area, Catalogo, Categoria, Servicio, UnidadServicio } from './tipos'

const UNIDADES: UnidadServicio[] = ['mes', 'unico', 'hora', 'porcentaje', 'ninguna']
const ahora = () => new Date().toISOString()

function servicio(r: Record<string, unknown>): Servicio {
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    return {
        id: String(r.id), category_id: (r.category_id as string | null) ?? null, nombre: String(r.nombre ?? ''), precio: n(r.precio), precio_max: n(r.precio_max),
        unidad: (r.unidad as UnidadServicio) ?? 'mes', moneda: r.moneda === 'USD' ? 'USD' : 'EUR', resumen: (r.resumen as string | null) ?? null,
        incluye: lista(r.incluye), no_incluye: lista(r.no_incluye), destacado: r.destacado === true, orden: Number(r.orden ?? 0), activo: r.activo !== false,
    }
}

export async function listarCatalogo(o: { soloActivos?: boolean } = {}): Promise<Catalogo> {
    let qs = supabase.from('servicios').select('*').neq('tipo', 'politica').order('orden')
    if (o.soloActivos) qs = qs.eq('activo', true)
    const [a, c, s] = await Promise.all([
        supabase.from('service_areas').select('*').order('orden'),
        supabase.from('service_categories').select('id, name, area_id, nota, orden').order('name'),
        qs,
    ])
    const error = a.error ?? c.error ?? s.error
    if (error) throw new ActionError(`No se pudo cargar el catálogo: ${error.message}`)
    return {
        areas: (a.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, color: x.color, orden: Number(x.orden ?? 0) })) as Area[],
        categorias: (c.data ?? []).map((x) => ({ id: x.id, name: x.name, area_id: x.area_id ?? null, nota: x.nota ?? null, orden: Number(x.orden ?? 0) })) as Categoria[],
        servicios: (s.data ?? []).map(servicio),
    }
}

// ─── Servicios ───────────────────────────────────────────────────────────────

export type ServicioInput = {
    category_id: string; nombre: string; precio: string; precio_max: string; unidad: UnidadServicio; moneda: 'USD' | 'EUR'
    resumen: string; incluye: string; no_incluye: string; destacado: boolean
}

const lineas = (t: string) => String(t ?? '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 40)
function monto(v: string): number | null {
    // «1.200,50» (español) o «1200.5» (campo numérico): con coma, el punto es separador de miles.
    const raw = String(v ?? '').trim()
    const s = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
    if (!s) return null
    const n = Math.round(Number(s) * 100) / 100
    if (!Number.isFinite(n) || n < 0) throw new ActionError('Revisa el precio.')
    return n
}

function limpiar(i: ServicioInput) {
    const nombre = String(i.nombre ?? '').trim().slice(0, 120)
    if (nombre.length < 2) throw new ActionError('Ponle un nombre al servicio.')
    const precio = monto(i.precio)
    const precio_max = monto(i.precio_max)
    if (precio !== null && precio_max !== null && precio_max < precio) throw new ActionError('El precio máximo no puede ser menor que el mínimo.')
    return {
        category_id: i.category_id || null, nombre, unidad: UNIDADES.includes(i.unidad) ? i.unidad : 'mes', moneda: i.moneda === 'USD' ? 'USD' : 'EUR',
        precio, precio_max, resumen: String(i.resumen ?? '').trim().slice(0, 1000) || null, incluye: lineas(i.incluye), no_incluye: lineas(i.no_incluye),
        destacado: Boolean(i.destacado), tipo: i.destacado ? 'paquete' : 'adicional', updated_at: ahora(),
    }
}

async function siguienteOrden(categoryId: string | null): Promise<number> {
    let q = supabase.from('servicios').select('orden').order('orden', { ascending: false }).limit(1)
    q = categoryId ? q.eq('category_id', categoryId) : q.is('category_id', null)
    const { data } = await q
    return Number(data?.[0]?.orden ?? 0) + 1
}

export async function crearServicio(i: ServicioInput): Promise<Servicio> {
    const row = limpiar(i)
    const { data, error } = await supabase.from('servicios').insert({ ...row, orden: await siguienteOrden(row.category_id) }).select('*').single()
    if (error) throw new ActionError(`No se pudo crear: ${error.message}`)
    return servicio(data)
}

export async function actualizarServicio(id: string, i: ServicioInput): Promise<Servicio> {
    const { data, error } = await supabase.from('servicios').update(limpiar(i)).eq('id', id).select('*').single()
    if (error) throw new ActionError(`No se pudo guardar: ${error.message}`)
    return servicio(data)
}

export async function duplicarServicio(id: string): Promise<Servicio> {
    const { data: o, error } = await supabase.from('servicios').select('*').eq('id', id).single()
    if (error || !o) throw new ActionError('Servicio no encontrado.')
    const resto: Record<string, unknown> = { ...o }
    delete resto.id; delete resto.clave; delete resto.created_at
    const { data, error: e2 } = await supabase.from('servicios').insert({ ...resto, nombre: `${o.nombre} (copia)`, orden: Number(o.orden ?? 0) + 0.5, updated_at: ahora() }).select('*').single()
    if (e2) throw new ActionError(`No se pudo duplicar: ${e2.message}`)
    return servicio(data)
}

/** Sube o baja un servicio dentro de su categoría (intercambia el orden con el vecino). */
export async function moverServicio(id: string, dir: -1 | 1): Promise<void> {
    const { data: s } = await supabase.from('servicios').select('id, category_id, orden').eq('id', id).single()
    if (!s) throw new ActionError('Servicio no encontrado.')
    let q = supabase.from('servicios').select('id, orden').neq('tipo', 'politica')
    q = s.category_id ? q.eq('category_id', s.category_id) : q.is('category_id', null)
    const { data: hermanos } = await q.order('orden')
    const lista = hermanos ?? []
    const i = lista.findIndex((x) => x.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= lista.length) return
    // Reescribe el orden 1..n con el par intercambiado (así nunca quedan empates).
    const nuevo = [...lista]
    ;[nuevo[i], nuevo[j]] = [nuevo[j]!, nuevo[i]!]
    await Promise.all(nuevo.map((x, k) => supabase.from('servicios').update({ orden: k + 1 }).eq('id', x.id)))
}

/** Archivar o reactivar (no se borra: una propuesta vieja puede haberlo usado). */
export async function setServicioActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await supabase.from('servicios').update({ activo, updated_at: ahora() }).eq('id', id)
    if (error) throw new ActionError(`No se pudo guardar: ${error.message}`)
}

// ─── Áreas y categorías ──────────────────────────────────────────────────────

const COLOR = /^#[0-9a-f]{6}$/i

export async function crearArea(nombre: string, color: string): Promise<Area> {
    const n = String(nombre ?? '').trim().slice(0, 60)
    if (n.length < 2) throw new ActionError('Ponle un nombre al área.')
    const { data: ult } = await supabase.from('service_areas').select('orden').order('orden', { ascending: false }).limit(1)
    const { data, error } = await supabase.from('service_areas').insert({ nombre: n, color: COLOR.test(color) ? color : '#0d9488', orden: Number(ult?.[0]?.orden ?? 0) + 1 }).select('*').single()
    if (error) throw new ActionError(error.code === '23505' ? 'Ya existe un área con ese nombre.' : `No se pudo crear: ${error.message}`)
    return { id: data.id, nombre: data.nombre, color: data.color, orden: Number(data.orden) }
}

export async function actualizarArea(id: string, nombre: string, color: string): Promise<void> {
    const n = String(nombre ?? '').trim().slice(0, 60)
    if (n.length < 2) throw new ActionError('Ponle un nombre al área.')
    const { error } = await supabase.from('service_areas').update({ nombre: n, ...(COLOR.test(color) ? { color } : {}) }).eq('id', id)
    if (error) throw new ActionError(error.code === '23505' ? 'Ya existe un área con ese nombre.' : `No se pudo guardar: ${error.message}`)
}

/** Borra un área: sus categorías no se tocan, quedan «Sin área». */
export async function borrarArea(id: string): Promise<void> {
    const { error } = await supabase.from('service_areas').delete().eq('id', id)
    if (error) throw new ActionError(`No se pudo borrar: ${error.message}`)
}

export async function crearCategoria(name: string, areaId: string | null): Promise<Categoria> {
    const n = String(name ?? '').trim().slice(0, 80)
    if (n.length < 2) throw new ActionError('Ponle un nombre a la categoría.')
    const { data: igual } = await supabase.from('service_categories').select('id').ilike('name', n).limit(1)
    if (igual?.length) throw new ActionError('Ya existe una categoría con ese nombre (en Ajustes o en otra área).')
    const { data, error } = await supabase.from('service_categories').insert({ name: n, area_id: areaId || null }).select('id, name, area_id, nota, orden').single()
    if (error) throw new ActionError(`No se pudo crear: ${error.message}`)
    return { id: data.id, name: data.name, area_id: data.area_id ?? null, nota: data.nota ?? null, orden: Number(data.orden ?? 0) }
}

/** Mover de área, renombrar (el nombre sale en las facturas nuevas) o escribir sus condiciones. */
export async function actualizarCategoria(id: string, c: { name?: string; area_id?: string | null; nota?: string | null }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (c.name !== undefined) {
        const n = String(c.name).trim().slice(0, 80)
        if (n.length < 2) throw new ActionError('Ponle un nombre a la categoría.')
        row.name = n
    }
    if (c.area_id !== undefined) row.area_id = c.area_id || null
    if (c.nota !== undefined) row.nota = String(c.nota ?? '').trim().slice(0, 4000) || null
    const { error } = await supabase.from('service_categories').update(row).eq('id', id)
    if (error) throw new ActionError(`No se pudo guardar: ${error.message}`)
}
