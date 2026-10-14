/**
 * Proyectos de la Oficina (tabla proyectos, schema_update_proyectos.sql): Wapalink, un cliente o algo interno.
 * Cada uno tiene su propio cerebro, objetivos, planes, encargos, entregables y conversaciones; `null` es
 * JAM Tech (la empresa). Las rutinas de los lunes miran todos a la vez (alcance «todos»).
 */
import { supabase } from '@/lib/supabase'

/** null = JAM Tech. */
export type ProyectoId = string | null
/** Para leer: un proyecto, JAM Tech o todos (las rutinas). */
export type Alcance = ProyectoId | 'todos'

export type TipoProyecto = 'producto' | 'cliente' | 'interno'
export type Proyecto = {
    id: string; created_at: string; nombre: string; tipo: TipoProyecto; descripcion: string | null
    color: string | null; client_id: string | null; estado: 'activo' | 'pausado' | 'archivado'
}

export const TIPOS_PROYECTO: Record<TipoProyecto, string> = { producto: 'Producto propio', cliente: 'Cliente', interno: 'Interno' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esProyectoId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** Filtra una consulta de Supabase por alcance (proyecto_id). */
export function porAlcance<Q>(q: Q, a: Alcance): Q {
    const f = q as unknown as { is: (c: string, v: null) => Q; eq: (c: string, v: string) => Q }
    return a === 'todos' ? q : a === null ? f.is('proyecto_id', null) : f.eq('proyecto_id', a)
}

export async function listarProyectos(o: { incluirArchivados?: boolean } = {}): Promise<Proyecto[]> {
    let q = supabase.from('proyectos').select('*')
    if (!o.incluirArchivados) q = q.neq('estado', 'archivado')
    const { data, error } = await q.order('created_at')
    if (error) throw new Error(error.message)
    return (data ?? []) as Proyecto[]
}

export async function leerProyecto(id: ProyectoId): Promise<Proyecto | null> {
    if (!id) return null
    const { data } = await supabase.from('proyectos').select('*').eq('id', id).maybeSingle()
    return (data as Proyecto | null) ?? null
}

export async function crearProyecto(p: { nombre: string; tipo: TipoProyecto; descripcion?: string | null; color?: string | null; client_id?: string | null }): Promise<Proyecto> {
    const nombre = p.nombre.trim()
    if (nombre.length < 2) throw new Error('Ponle un nombre al proyecto.')
    const { data, error } = await supabase.from('proyectos').insert({
        nombre, tipo: p.tipo, descripcion: p.descripcion?.trim() || null, color: p.color || null, client_id: p.client_id || null,
    }).select('*').single()
    if (error) throw new Error(`No se pudo crear el proyecto: ${error.message}`)
    return data as Proyecto
}

export async function actualizarProyecto(id: string, p: Partial<Pick<Proyecto, 'nombre' | 'descripcion' | 'estado' | 'tipo' | 'color'>>): Promise<void> {
    const { error } = await supabase.from('proyectos').update(p).eq('id', id)
    if (error) throw new Error(error.message)
}

/** Línea de contexto para las instrucciones del agente cuando trabaja dentro de un proyecto. */
export function contextoProyecto(p: Proyecto | null): string {
    if (!p) return ''
    return `\n\nPROYECTO ACTIVO: «${p.nombre}» (${TIPOS_PROYECTO[p.tipo].toLowerCase()})${p.descripcion ? `: ${p.descripcion}` : ''}. José eligió trabajar en este proyecto: TODO lo que respondas va centrado en él.
- Son del proyecto: su cerebro, sus objetivos, sus planes, sus encargos y sus entregables (lo que crees queda en él). El cerebro del proyecto manda sobre el de la empresa cuando hablen de lo mismo.
- Son de toda la empresa (no se separan por proyecto): tareas, plan del día, clientes, cotizaciones, facturas, cobros y correo. No los traigas a la conversación salvo que José los pida, que tengan que ver con ${p.nombre}, o que haya algo urgente; en ese caso, una sola línea al final marcada «De toda la empresa: …».
- Preguntas generales («¿qué hago hoy?», «¿cómo vamos?») se responden para ${p.nombre}: sus objetivos, el paso que toca de sus planes y sus encargos. Si el proyecto aún no tiene cerebro, objetivos ni plan, dilo claro y propone el siguiente paso concreto para ${p.nombre} (completar su cerebro, fijar un objetivo, armar el plan) en vez de rellenar con lo de la empresa.`
}
