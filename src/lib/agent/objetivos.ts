/**
 * Roadmap de cada agente: objetivos con una cifra y una fecha, su avance (automático desde METRICAS o manual)
 * y sus hitos, que son tareas normales enlazadas (tasks.objetivo_id) para que aparezcan en el plan del día.
 * proyecto_id null = JAM Tech (los proyectos llegan en la fase 2).
 */
import { supabase } from '@/lib/supabase'
import { createTask } from '@/lib/actions/tasks'
import type { Departamento } from './shared'
import { METRICA, avance, valorDe, type Unidad } from './metricas'

export type EstadoObjetivo = 'activo' | 'logrado' | 'pausado' | 'descartado'
export type Objetivo = {
    id: string; departamento: Departamento; titulo: string; descripcion: string | null; metrica: string; unidad: Unidad
    valor_inicial: number | null; valor_meta: number | null; valor_actual: number | null; fecha_limite: string | null
    estado: EstadoObjetivo; orden: number; created_at: string
}
export type Hito = { id: string; title: string; status: 'todo' | 'doing' | 'done'; due_date: string | null; objetivo_id: string }
export type ObjetivoConAvance = Objetivo & { valor: number | null; avance: number | null; automatica: boolean; etiquetaMetrica: string | null; hitos: Hito[] }

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const normal = (r: Record<string, unknown>): Objetivo => ({
    ...(r as unknown as Objetivo), valor_inicial: num(r.valor_inicial), valor_meta: num(r.valor_meta), valor_actual: num(r.valor_actual),
})

/** Objetivos (de un departamento o de todos) con su valor de hoy, su avance y sus hitos. */
export async function listarObjetivos(o: { departamento?: Departamento; incluirCerrados?: boolean } = {}): Promise<ObjetivoConAvance[]> {
    let q = supabase.from('objetivos').select('*').is('proyecto_id', null)
    if (o.departamento) q = q.eq('departamento', o.departamento)
    if (!o.incluirCerrados) q = q.in('estado', ['activo', 'pausado'])
    const { data, error } = await q.order('orden').order('created_at')
    if (error) throw new Error(error.message)
    const objetivos = (data ?? []).map((r) => normal(r as Record<string, unknown>))
    const ids = objetivos.map((x) => x.id)
    const { data: tareas, error: e2 } = ids.length
        ? await supabase.from('tasks').select('id, title, status, due_date, objetivo_id').in('objetivo_id', ids).order('position')
        : { data: [], error: null }
    if (e2) throw new Error(e2.message)
    const valores = new Map<string, number | null>()
    await Promise.all([...new Set(objetivos.map((x) => x.metrica).filter((m) => METRICA.has(m)))].map(async (m) => valores.set(m, await valorDe(m))))
    return objetivos.map((x) => {
        const m = METRICA.get(x.metrica)
        const valor = m ? valores.get(x.metrica) ?? null : x.valor_actual
        return { ...x, valor, avance: avance(x, valor, m?.menorEsMejor), automatica: Boolean(m), etiquetaMetrica: m?.etiqueta ?? null, hitos: ((tareas ?? []) as Hito[]).filter((t) => t.objetivo_id === x.id) }
    })
}

export type NuevoObjetivo = {
    departamento: Departamento; titulo: string; descripcion?: string | null; metrica?: string; unidad?: Unidad
    valor_meta?: number | null; valor_inicial?: number | null; valor_actual?: number | null; fecha_limite?: string | null
}

export async function crearObjetivo(n: NuevoObjetivo): Promise<Objetivo> {
    const m = n.metrica && METRICA.get(n.metrica)
    // Con métrica automática, el punto de partida es el valor de hoy (si no se indicó otro).
    const inicial = n.valor_inicial ?? (m ? await valorDe(m.key) : null)
    const { data, error } = await supabase.from('objetivos').insert({
        departamento: n.departamento, titulo: n.titulo.trim(), descripcion: n.descripcion?.trim() || null,
        metrica: m ? m.key : 'manual', unidad: m ? m.unidad : n.unidad ?? 'numero',
        valor_meta: n.valor_meta ?? null, valor_inicial: inicial, valor_actual: m ? null : n.valor_actual ?? null, fecha_limite: n.fecha_limite || null,
    }).select('*').single()
    if (error) throw new Error(`No se pudo crear el objetivo: ${error.message}`)
    return normal(data as Record<string, unknown>)
}

export async function actualizarObjetivo(id: string, p: Partial<Pick<Objetivo, 'titulo' | 'descripcion' | 'valor_meta' | 'valor_actual' | 'fecha_limite' | 'estado'>>): Promise<Objetivo> {
    const { data, error } = await supabase.from('objetivos').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
    if (error) throw new Error(`No se pudo actualizar el objetivo: ${error.message}`)
    return normal(data as Record<string, unknown>)
}

/** Un hito es una tarea normal enlazada al objetivo (entra en Tareas y en el plan del día). */
export async function crearHito(objetivoId: string, h: { titulo: string; fecha?: string | null }): Promise<Hito> {
    const { data: o, error } = await supabase.from('objetivos').select('id, titulo').eq('id', objetivoId).single()
    if (error || !o) throw new Error('Objetivo no encontrado')
    const t = await createTask({ title: h.titulo, due_date: h.fecha ?? undefined, notes: `Hito del objetivo «${o.titulo}».` })
    const { error: e2 } = await supabase.from('tasks').update({ objetivo_id: objetivoId }).eq('id', t.id)
    if (e2) throw new Error(e2.message)
    return { id: t.id, title: t.title, status: t.status, due_date: t.due_date ?? null, objetivo_id: objetivoId }
}
