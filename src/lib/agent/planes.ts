/**
 * Planes guiados: una meta convertida en pasos ordenados, cada uno asignado al agente correcto y, si aplica,
 * a una de sus tareas guiadas. La Oficina muestra «Paso 3 de 7» y lleva a José paso a paso hasta terminar.
 * Ramón los genera (generarPlan) a partir del cerebro, la memoria, los objetivos y las cifras de hoy; quedan
 * en borrador hasta que José los activa. Tablas planes / plan_pasos (schema_update_procesos.sql).
 */
import { generateObject, tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { createTask } from '@/lib/actions/tasks'
import { errorMessage, todayISO } from '@/lib/actions/validation'
import { DEPARTAMENTOS, type Departamento } from './shared'
import { METRICA, METRICAS, valorDe, type Unidad } from './metricas'
import { crearObjetivo, listarObjetivos } from './objetivos'
import { cerebroParaPrompt } from './cerebro'
import { memoriaParaPrompt } from './tools-memoria'
import { modeloPara } from './modelo'
import { TAREA, TAREAS } from './tareas-catalogo'
import { contextoProyecto, leerProyecto, porAlcance, type Alcance, type ProyectoId } from './proyectos'

export type EstadoPlan = 'borrador' | 'activo' | 'completado' | 'pausado' | 'descartado'
export type EstadoPaso = 'pendiente' | 'hecho' | 'omitido'
export type ObjetivoPropuesto = { departamento: Departamento; titulo: string; metrica: string; unidad: Unidad; valor_meta: number | null }
export type Paso = {
    id: string; plan_id: string; orden: number; departamento: Departamento; titulo: string; descripcion: string | null
    tarea_guiada: string | null; datos: Record<string, string>; fecha: string | null; estado: EstadoPaso; completado_at: string | null; task_id: string | null
    entregable: { id: string; titulo: string; estado: string; contenido: string; created_at: string } | null
}
export type Plan = {
    id: string; created_at: string; titulo: string; meta: string; resumen: string | null; fecha_limite: string | null
    estado: EstadoPlan; objetivo_id: string | null; objetivo_propuesto: ObjetivoPropuesto | null; fuente: string
    proyecto_id: string | null; proyecto: string | null
}
export type PlanConPasos = Plan & { pasos: Paso[]; actual: Paso | null; hechos: number; total: number }

const PLAN_COLS = 'id, created_at, titulo, meta, resumen, fecha_limite, estado, objetivo_id, objetivo_propuesto, fuente, proyecto_id, proyectos(nombre)'
const plan = (r: Record<string, unknown>): Plan => ({ ...(r as unknown as Plan), proyecto: (r.proyectos as { nombre?: string } | null)?.nombre ?? null })

function armar(plan: Plan, pasos: Paso[]): PlanConPasos {
    const ordenados = pasos.filter((p) => p.plan_id === plan.id).sort((a, b) => a.orden - b.orden)
    const vivos = ordenados.filter((p) => p.estado !== 'omitido')
    return {
        ...plan, pasos: ordenados, total: vivos.length, hechos: vivos.filter((p) => p.estado === 'hecho').length,
        actual: plan.estado === 'activo' ? ordenados.find((p) => p.estado === 'pendiente') ?? null : null,
    }
}

async function pasosDe(planIds: string[], conEntregables: boolean): Promise<Paso[]> {
    if (planIds.length === 0) return []
    const { data, error } = await supabase.from('plan_pasos').select('*').in('plan_id', planIds).order('orden')
    if (error) throw new Error(error.message)
    const pasos = (data ?? []).map((r) => ({ ...(r as Paso), datos: (r.datos ?? {}) as Record<string, string>, entregable: null })) as Paso[]
    if (conEntregables && pasos.length) {
        const { data: ents } = await supabase.from('entregables').select('id, titulo, estado, contenido, created_at, plan_paso_id').in('plan_paso_id', pasos.map((p) => p.id)).neq('estado', 'archivado').order('created_at', { ascending: false })
        for (const p of pasos) {
            const e = (ents ?? []).find((x) => x.plan_paso_id === p.id)
            if (e) p.entregable = { id: e.id, titulo: e.titulo, estado: e.estado, contenido: e.contenido, created_at: e.created_at }
        }
    }
    return pasos
}

export async function listarPlanes(o: { estados?: EstadoPlan[]; alcance?: Alcance } = {}): Promise<PlanConPasos[]> {
    const q = porAlcance(supabase.from('planes').select(PLAN_COLS), o.alcance ?? null).in('estado', o.estados ?? ['borrador', 'activo', 'pausado'])
    const { data, error } = await q.order('created_at', { ascending: false }).limit(30)
    if (error) throw new Error(error.message)
    const planes = (data ?? []).map((r) => plan(r as Record<string, unknown>))
    const pasos = await pasosDe(planes.map((p) => p.id), false)
    return planes.map((p) => armar(p, pasos))
}

export async function leerPlan(id: string): Promise<PlanConPasos | null> {
    const { data, error } = await supabase.from('planes').select(PLAN_COLS).eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return armar(plan(data as Record<string, unknown>), await pasosDe([id], true))
}

/** Pasos pendientes de un agente en los planes activos (el primero de cada plan es «el que toca»). */
export async function pasosDelAgente(dep: Departamento, alcance: Alcance = null): Promise<{ plan: Pick<Plan, 'id' | 'titulo' | 'proyecto'>; paso: Paso; toca: boolean; numero: number; total: number }[]> {
    const planes = await listarPlanes({ estados: ['activo'], alcance })
    return planes.flatMap((p) => p.pasos
        .filter((s) => s.departamento === dep && s.estado === 'pendiente')
        .map((s) => ({ plan: { id: p.id, titulo: p.titulo, proyecto: p.proyecto }, paso: s, toca: p.actual?.id === s.id, numero: p.pasos.filter((x) => x.estado !== 'omitido').findIndex((x) => x.id === s.id) + 1, total: p.total })))
}

const sumarDias = (iso: string, dias: number) => {
    const d = new Date(`${iso}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + dias)
    return d.toISOString().slice(0, 10)
}

export type NuevoPaso = { departamento: Departamento; titulo: string; descripcion?: string | null; tarea_guiada?: string | null; datos?: Record<string, string>; fecha?: string | null; dias?: number }
export type NuevoPlan = {
    titulo: string; meta: string; resumen?: string | null; fecha_limite?: string | null; objetivo_propuesto?: ObjetivoPropuesto | null
    pasos: NuevoPaso[]; estado?: EstadoPlan; fuente?: 'web' | 'chat' | 'telegram'; proyecto_id?: ProyectoId
}

export async function crearPlan(n: NuevoPlan): Promise<PlanConPasos> {
    if (n.pasos.length === 0) throw new Error('El plan necesita al menos un paso.')
    const hoy = todayISO()
    const { data: plan, error } = await supabase.from('planes').insert({
        titulo: n.titulo.trim().slice(0, 200), meta: n.meta.trim().slice(0, 1000), resumen: n.resumen?.trim() || null,
        fecha_limite: n.fecha_limite || null, objetivo_propuesto: n.objetivo_propuesto ?? null, estado: n.estado ?? 'borrador', fuente: n.fuente ?? 'web',
        proyecto_id: n.proyecto_id ?? null,
    }).select(PLAN_COLS).single()
    if (error || !plan) throw new Error(`No se pudo crear el plan: ${error?.message}`)
    const filas = n.pasos.slice(0, 12).map((p, i) => {
        let fecha = p.fecha ?? (p.dias !== undefined ? sumarDias(hoy, Math.max(0, Math.round(p.dias))) : null)
        if (fecha && n.fecha_limite && fecha > n.fecha_limite) fecha = n.fecha_limite
        const tarea = p.tarea_guiada && TAREA.has(p.tarea_guiada) ? p.tarea_guiada : null
        return {
            plan_id: plan.id, orden: i + 1, departamento: p.departamento, titulo: p.titulo.trim().slice(0, 200), descripcion: p.descripcion?.trim() || null,
            tarea_guiada: tarea, datos: tarea ? Object.fromEntries(Object.entries(p.datos ?? {}).filter(([k, v]) => TAREA.get(tarea)!.campos.some((c) => c.key === k) && v?.trim())) : {}, fecha,
        }
    })
    const { error: e2 } = await supabase.from('plan_pasos').insert(filas)
    if (e2) {
        await supabase.from('planes').delete().eq('id', plan.id)
        throw new Error(`No se pudieron guardar los pasos: ${e2.message}`)
    }
    if ((n.estado ?? 'borrador') === 'activo') await crearObjetivoDelPlan(plan.id)
    return (await leerPlan(plan.id))!
}

async function crearObjetivoDelPlan(planId: string): Promise<void> {
    const { data: p } = await supabase.from('planes').select('objetivo_id, objetivo_propuesto, fecha_limite, proyecto_id').eq('id', planId).single()
    const o = p?.objetivo_propuesto as ObjetivoPropuesto | null
    if (!p || p.objetivo_id || !o || o.valor_meta === null) return
    const creado = await crearObjetivo({ departamento: o.departamento, titulo: o.titulo, metrica: o.metrica, unidad: o.unidad, valor_meta: o.valor_meta, fecha_limite: p.fecha_limite, proyecto_id: p.proyecto_id })
    await supabase.from('planes').update({ objetivo_id: creado.id }).eq('id', planId)
}

export async function cambiarEstadoPlan(id: string, estado: EstadoPlan): Promise<void> {
    const { error } = await supabase.from('planes').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    if (estado === 'activo') await crearObjetivoDelPlan(id)
}

/** Marca un paso. Si ya no queda ninguno pendiente, el plan pasa a completado. */
export async function actualizarPaso(id: string, estado: EstadoPaso): Promise<{ paso: string; plan_completado: boolean; siguiente: string | null }> {
    const { data: paso, error } = await supabase.from('plan_pasos')
        .update({ estado, completado_at: estado === 'pendiente' ? null : new Date().toISOString() }).eq('id', id).select('plan_id, titulo, task_id').single()
    if (error || !paso) throw new Error(`No se pudo actualizar el paso: ${error?.message}`)
    // Si el paso tenía tarea en el tablero, la tarea acompaña al paso.
    if (paso.task_id && estado !== 'omitido') await supabase.from('tasks').update({ status: estado === 'hecho' ? 'done' : 'todo', completed_at: estado === 'hecho' ? new Date().toISOString() : null }).eq('id', paso.task_id)
    const { data: resto } = await supabase.from('plan_pasos').select('titulo, estado, orden').eq('plan_id', paso.plan_id).order('orden')
    const pendientes = (resto ?? []).filter((r) => r.estado === 'pendiente')
    const { data: plan } = await supabase.from('planes').select('estado').eq('id', paso.plan_id).single()
    let completado = false
    if (pendientes.length === 0 && plan?.estado === 'activo') { await cambiarEstadoPlan(paso.plan_id, 'completado'); completado = true }
    if (pendientes.length > 0 && plan?.estado === 'completado') await cambiarEstadoPlan(paso.plan_id, 'activo')
    return { paso: paso.titulo, plan_completado: completado, siguiente: pendientes[0]?.titulo ?? null }
}

export async function quitarPaso(id: string): Promise<void> {
    const { data: paso } = await supabase.from('plan_pasos').select('plan_id').eq('id', id).single()
    if (!paso) return
    const { data: plan } = await supabase.from('planes').select('estado').eq('id', paso.plan_id).single()
    if (plan?.estado !== 'borrador') throw new Error('Solo se quitan pasos de un plan en borrador; en uno activo, omítelo.')
    await supabase.from('plan_pasos').delete().eq('id', id)
}

/** Lleva el paso al tablero de Tareas (con su fecha) para que entre en el plan del día. */
export async function pasoATarea(id: string): Promise<string> {
    const { data: p, error } = await supabase.from('plan_pasos').select('id, titulo, descripcion, fecha, task_id, departamento, plan_id, planes(titulo, objetivo_id)').eq('id', id).single()
    if (error || !p) throw new Error('Paso no encontrado')
    if (p.task_id) return p.task_id as string
    const plan = (Array.isArray(p.planes) ? p.planes[0] : p.planes) as { titulo: string; objetivo_id: string | null } | null
    const t = await createTask({ title: p.titulo, due_date: p.fecha ?? undefined, notes: `Paso del plan «${plan?.titulo ?? ''}» (${DEPARTAMENTOS[p.departamento as Departamento].persona}).${p.descripcion ? `\n${p.descripcion}` : ''}` })
    await supabase.from('plan_pasos').update({ task_id: t.id }).eq('id', id)
    if (plan?.objetivo_id) await supabase.from('tasks').update({ objetivo_id: plan.objetivo_id }).eq('id', t.id)
    return t.id
}

// ───────────── Generador de planes (Ramón) ─────────────

const DEPS = Object.keys(DEPARTAMENTOS) as [Departamento, ...Departamento[]]
const CLAVES = ['manual', ...METRICAS.map((m) => m.key)] as [string, ...string[]]
const IDS_TAREA = ['ninguna', ...TAREAS.map((t) => t.id)] as [string, ...string[]]

const esquemaPlan = z.object({
    titulo: z.string().describe('Nombre corto del plan, máximo 8 palabras'),
    resumen: z.string().describe('2 o 3 frases: la estrategia y por qué este camino, con las cifras de hoy que lo justifican'),
    objetivo: z.object({
        departamento: z.enum(DEPS),
        titulo: z.string().describe('La meta medible, ej. «Facturar $6.000 al mes»'),
        metrica: z.enum(CLAVES).describe('Métrica automática que la mide, o manual'),
        unidad: z.enum(['usd', 'numero', 'pct']),
        valor_meta: z.number().nullable(),
    }).nullable().describe('Objetivo medible que resume la meta; null si la meta no se puede medir con una cifra'),
    pasos: z.array(z.object({
        departamento: z.enum(DEPS).describe('El agente que lleva el paso'),
        titulo: z.string().describe('Acción concreta que empieza con verbo, máximo 12 palabras'),
        descripcion: z.string().describe('Qué hacer y cómo saber que está hecho, en 1 o 2 frases'),
        tarea_guiada: z.enum(IDS_TAREA).describe('Tarea guiada del catálogo que produce el entregable de este paso, o ninguna'),
        datos: z.array(z.object({ campo: z.string(), valor: z.string() })).describe('Datos ya conocidos para prellenar los campos de la tarea guiada (por su key); vacío si no aplica'),
        dias: z.number().int().describe('Días desde hoy para tenerlo hecho'),
    })).describe('Entre 4 y 9 pasos en orden de ejecución'),
})

export async function generarPlan(i: { meta: string; fecha_limite?: string | null; contexto?: string | null; proyecto?: ProyectoId }): Promise<PlanConPasos> {
    const proyecto = i.proyecto ?? null
    const meta = i.meta.trim()
    if (meta.length < 8) throw new Error('Cuéntame la meta con un poco más de detalle.')
    const hoy = todayISO()
    const [cerebro, memoria, objetivos, cifras, p] = await Promise.all([
        cerebroParaPrompt(proyecto),
        memoriaParaPrompt('direccion'),
        listarObjetivos({ alcance: proyecto }).catch(() => []),
        Promise.all(METRICAS.map(async (m) => `- ${m.etiqueta} (${m.key}, ${DEPARTAMENTOS[m.departamento].nombre}): ${(await valorDe(m.key)) ?? 'sin dato'}`)),
        leerProyecto(proyecto).catch(() => null),
    ])
    const catalogo = TAREAS.map((t) => `- ${t.id} · ${DEPARTAMENTOS[t.departamento].persona} (${DEPARTAMENTOS[t.departamento].nombre}) · ${t.titulo}: ${t.para} Campos: ${t.campos.map((c) => c.key).join(', ')}`).join('\n')
    const equipo = Object.entries(DEPARTAMENTOS).map(([k, d]) => `- ${k}: ${d.persona}, ${d.nombre} (${d.descripcion})`).join('\n')
    const { model, providerOptions } = modeloPara('chat')
    const { object } = await generateObject({
        model, providerOptions, schema: esquemaPlan,
        system: `Eres Ramón, director de JAM Tech. Conviertes una meta de José en un plan que la Oficina le guía paso a paso. Fecha de hoy: ${hoy}.${contextoProyecto(p)}${cerebro}${memoria}

EQUIPO (cada paso lo lleva uno):
${equipo}

TAREAS GUIADAS DISPONIBLES (cada una produce un entregable listo para usar):
${catalogo}

CIFRAS DE HOY:
${cifras.join('\n')}

OBJETIVOS ACTIVOS: ${objetivos.length ? objetivos.map((o) => `${o.titulo} (${DEPARTAMENTOS[o.departamento].nombre})`).join('; ') : 'ninguno'}

Reglas del plan:
- Pasos concretos y en orden lógico: primero lo que desbloquea a los demás. Cada paso con un solo responsable.
- Usa una tarea guiada cuando el paso produce un documento (propuesta, plan de contenido, secuencia de correos, guion…); las acciones de José (llamar, publicar, decidir) van sin tarea guiada.
- Prellena en datos solo lo que se sabe por la meta, el contexto o el cerebro; no inventes nombres, cifras ni precios.
- Fechas realistas para una persona que dirige la empresa sola; todo antes de la fecha límite si la hay.
- Nunca propongas ni menciones competidores de Wapalink ni de JAM Tech.`,
        prompt: `META: ${meta}${i.fecha_limite ? `\nFECHA LÍMITE: ${i.fecha_limite}` : ''}${i.contexto?.trim() ? `\nCONTEXTO QUE DIO JOSÉ: ${i.contexto.trim()}` : ''}`,
    })
    const objetivo = object.objetivo && object.objetivo.valor_meta !== null
        ? { ...object.objetivo, unidad: METRICA.get(object.objetivo.metrica)?.unidad ?? object.objetivo.unidad } as ObjetivoPropuesto
        : null
    return crearPlan({
        titulo: object.titulo, meta, resumen: object.resumen, fecha_limite: i.fecha_limite || null, objetivo_propuesto: objetivo, estado: 'borrador', proyecto_id: proyecto,
        pasos: object.pasos.map((p) => ({
            departamento: p.departamento, titulo: p.titulo, descripcion: p.descripcion, dias: p.dias,
            tarea_guiada: p.tarea_guiada === 'ninguna' ? null : p.tarea_guiada,
            datos: Object.fromEntries(p.datos.map((d) => [d.campo, d.valor])),
        })),
    })
}

// ───────────── Herramientas del chat ─────────────

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try { return { ok: true, data: await fn() } } catch (e) { console.error('[planes tool]', e); return { ok: false, error: errorMessage(e) } }
}
const DEP = z.enum(DEPS)
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** `proyecto`: dónde se crean los planes; `lectura`: qué se lista (las rutinas leen todos los proyectos). */
export const planesTools = (proyecto: ProyectoId = null, lectura: Alcance = proyecto) => ({
    planes_listar: tool({
        description: 'Planes guiados (una meta convertida en pasos, cada uno con su agente): estado, paso actual («el que toca»), avance y pasos con su id, responsable, fecha y estado. Con departamento, solo los pasos pendientes de ese agente. Úsala para «¿cómo va el plan?», «¿qué toca ahora?» y en los informes.',
        inputSchema: z.object({ departamento: DEP.optional(), incluir_cerrados: z.boolean().optional() }),
        execute: async ({ departamento, incluir_cerrados }) => run(async () => {
            if (departamento) return (await pasosDelAgente(departamento, lectura)).map((x) => ({ plan: x.plan.titulo, ...(lectura === 'todos' ? { proyecto: x.plan.proyecto ?? 'JAM Tech' } : {}), plan_id: x.plan.id, paso_id: x.paso.id, paso: x.paso.titulo, numero: `${x.numero} de ${x.total}`, toca_ahora: x.toca, fecha: x.paso.fecha, tarea_guiada: x.paso.tarea_guiada ? TAREA.get(x.paso.tarea_guiada)?.titulo : null }))
            const planes = await listarPlanes({ estados: incluir_cerrados ? ['borrador', 'activo', 'pausado', 'completado'] : ['borrador', 'activo', 'pausado'], alcance: lectura })
            return planes.map((p) => ({
                id: p.id, titulo: p.titulo, ...(lectura === 'todos' ? { proyecto: p.proyecto ?? 'JAM Tech' } : {}), meta: p.meta, estado: p.estado, fecha_limite: p.fecha_limite, avance: `${p.hechos} de ${p.total} pasos`,
                paso_actual: p.actual ? `${p.actual.titulo} (${DEPARTAMENTOS[p.actual.departamento].persona})` : null, enlace: `/oficina/planes/${p.id}`,
                pasos: p.pasos.map((s) => ({ id: s.id, orden: s.orden, titulo: s.titulo, responsable: DEPARTAMENTOS[s.departamento].persona, fecha: s.fecha, estado: s.estado })),
            }))
        }),
    }),

    plan_crear: tool({
        description: `Crea un plan guiado ya activo cuando José y tú acordaron una meta y sus pasos en la conversación (para que la Oficina lo guíe paso a paso). Cada paso con un responsable y, si produce un documento, su tarea guiada: ${TAREAS.map((t) => `${t.id} (${DEPARTAMENTOS[t.departamento].persona}: ${t.titulo})`).join('; ')}. Entre 3 y 10 pasos. Requiere confirmación.`,
        inputSchema: z.object({
            titulo: z.string().min(3).max(120), meta: z.string().min(3).max(1000), fecha_limite: fecha.optional(),
            pasos: z.array(z.object({
                departamento: DEP, titulo: z.string().min(3).max(200), descripcion: z.string().max(600).optional(),
                tarea_guiada: z.string().optional().describe('id de la tarea guiada, si aplica'), fecha: fecha.optional(),
            })).min(1).max(12),
        }),
        execute: async (i) => run(async () => {
            const p = await crearPlan({ ...i, estado: 'activo', fuente: 'chat', proyecto_id: proyecto })
            return { id: p.id, titulo: p.titulo, pasos: p.total, enlace: `/oficina/planes/${p.id}` }
        }),
    }),

    plan_paso_actualizar: tool({
        description: 'Marca un paso de un plan como hecho, omitido o de nuevo pendiente (cuando José dice que ya lo hizo o que lo salta). Resuelve el id con planes_listar. Requiere confirmación.',
        inputSchema: z.object({ paso_id: z.string().uuid(), paso_titulo: z.string().describe('Para la confirmación'), estado: z.enum(['hecho', 'omitido', 'pendiente']) }),
        execute: async ({ paso_id, estado }) => run(() => actualizarPaso(paso_id, estado)),
    }),
})
