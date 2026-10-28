/**
 * Catálogo de servicios en el servidor (detrás de la sesión de José). Solo mis precios: no se cruza con facturas.
 */
import { supabase } from '@/lib/supabase'
import { ActionError } from '@/lib/actions/validation'
import type { Servicio, TipoServicio, UnidadServicio } from './tipos'

const TIPOS: TipoServicio[] = ['paquete', 'adicional', 'politica']
const UNIDADES: UnidadServicio[] = ['mes', 'unico', 'hora', 'porcentaje', 'ninguna']

function fila(r: Record<string, unknown>): Servicio {
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    return {
        id: String(r.id), tipo: r.tipo as TipoServicio, nombre: String(r.nombre ?? ''), precio: n(r.precio), precio_max: n(r.precio_max),
        unidad: (r.unidad as UnidadServicio) ?? 'mes', moneda: r.moneda === 'USD' ? 'USD' : 'EUR', resumen: (r.resumen as string | null) ?? null,
        incluye: lista(r.incluye), no_incluye: lista(r.no_incluye), orden: Number(r.orden ?? 0), activo: r.activo !== false,
    }
}

export async function listarServicios(o: { soloActivos?: boolean } = {}): Promise<Servicio[]> {
    let q = supabase.from('servicios').select('*').order('tipo').order('orden').order('nombre')
    if (o.soloActivos) q = q.eq('activo', true)
    const { data, error } = await q
    if (error) throw new ActionError(`No se pudo cargar el catálogo: ${error.message}`)
    return (data ?? []).map(fila)
}

export type ServicioInput = {
    tipo: TipoServicio; nombre: string; precio: string; precio_max: string; unidad: UnidadServicio; moneda: 'USD' | 'EUR'
    resumen: string; incluye: string; no_incluye: string
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
    if (!TIPOS.includes(i.tipo)) throw new ActionError('Tipo no válido.')
    const unidad = UNIDADES.includes(i.unidad) ? i.unidad : 'mes'
    const precio = monto(i.precio)
    const precio_max = monto(i.precio_max)
    if (precio !== null && precio_max !== null && precio_max < precio) throw new ActionError('El precio máximo no puede ser menor que el mínimo.')
    return {
        tipo: i.tipo, nombre, unidad: i.tipo === 'politica' ? 'ninguna' : unidad, moneda: i.moneda === 'USD' ? 'USD' : 'EUR',
        precio: i.tipo === 'politica' ? null : precio, precio_max: i.tipo === 'politica' ? null : precio_max,
        resumen: String(i.resumen ?? '').trim().slice(0, 1000) || null, incluye: lineas(i.incluye), no_incluye: lineas(i.no_incluye),
        updated_at: new Date().toISOString(),
    }
}

export async function crearServicio(i: ServicioInput): Promise<Servicio> {
    const row = limpiar(i)
    const { data: ult } = await supabase.from('servicios').select('orden').eq('tipo', row.tipo).order('orden', { ascending: false }).limit(1)
    const { data, error } = await supabase.from('servicios').insert({ ...row, orden: Number(ult?.[0]?.orden ?? 0) + 1 }).select('*').single()
    if (error) throw new ActionError(`No se pudo crear: ${error.message}`)
    return fila(data)
}

export async function actualizarServicio(id: string, i: ServicioInput): Promise<Servicio> {
    const { data, error } = await supabase.from('servicios').update(limpiar(i)).eq('id', id).select('*').single()
    if (error) throw new ActionError(`No se pudo guardar: ${error.message}`)
    return fila(data)
}

/** Archivar o reactivar (no se borra: una propuesta vieja puede haberlo usado). */
export async function setServicioActivo(id: string, activo: boolean): Promise<void> {
    const { error } = await supabase.from('servicios').update({ activo, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new ActionError(`No se pudo guardar: ${error.message}`)
}
