/**
 * Ejecución de las tareas guiadas y biblioteca de entregables (tabla entregables). Una tarea guiada corre con
 * la persona de su agente, el cerebro de la empresa, la memoria y SOLO herramientas de lectura; el resultado
 * se guarda como entregable (borrador → aprobado). Si viene de un paso de un plan, recibe la meta del plan y
 * los entregables de los pasos anteriores para encadenar el trabajo.
 */
import { stepCountIs, streamText } from 'ai'
import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/actions/validation'
import { DEPARTAMENTOS, TOOL_LABELS, type Departamento } from './shared'
import { TAREA, tituloEntregable } from './tareas-catalogo'
import { cerebroParaPrompt } from './cerebro'
import { memoriaParaPrompt } from './tools-memoria'
import { herramientasLectura } from './rutinas'
import { leerPlan } from './planes'
import { modeloPara } from './modelo'
import { registrarEvento } from './eventos'
import { contextoProyecto, leerProyecto, porAlcance, type Alcance, type ProyectoId } from './proyectos'

export type Entregable = {
    id: string; created_at: string; departamento: Departamento; tarea: string; titulo: string
    entradas: Record<string, string>; contenido: string; estado: 'borrador' | 'aprobado' | 'archivado'; plan_paso_id: string | null
}

/** Lo que la página ve mientras el agente trabaja: el texto en vivo, cada consulta de datos y el resultado. */
export type EventoTarea =
    | { t: 'paso' }
    | { t: 'texto'; d: string }
    | { t: 'herramienta'; n: string }
    | { t: 'fin'; entregable: Entregable }
    | { t: 'error'; mensaje: string }

const COLS = 'id, created_at, departamento, tarea, titulo, entradas, contenido, estado, plan_paso_id'
const MAX_VALOR = 3000

export async function listarEntregables(o: { departamento?: Departamento; limite?: number; alcance?: Alcance } = {}): Promise<Entregable[]> {
    let q = porAlcance(supabase.from('entregables').select(COLS), o.alcance ?? null).neq('estado', 'archivado')
    if (o.departamento) q = q.eq('departamento', o.departamento)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(o.limite ?? 20)
    if (error) throw new Error(error.message)
    return (data ?? []) as Entregable[]
}

export async function cambiarEstadoEntregable(id: string, estado: Entregable['estado']): Promise<void> {
    const { error } = await supabase.from('entregables').update({ estado }).eq('id', id)
    if (error) throw new Error(error.message)
}

/** Contexto del plan para un paso: la meta, dónde va y lo que dejaron hechos los pasos anteriores. */
async function contextoDePaso(pasoId: string): Promise<string> {
    const { data: p } = await supabase.from('plan_pasos').select('plan_id').eq('id', pasoId).maybeSingle()
    const plan = p ? await leerPlan(p.plan_id) : null
    if (!plan) return ''
    const paso = plan.pasos.find((s) => s.id === pasoId)!
    const previos = plan.pasos.filter((s) => s.orden < paso.orden && s.entregable).slice(-3)
        .map((s) => `### Paso ${s.orden} · ${s.titulo} (${DEPARTAMENTOS[s.departamento].persona})\n${s.entregable!.contenido.slice(0, 2500)}`)
    return `\n\nEsta tarea es el PASO ${paso.orden} de ${plan.pasos.length} del plan «${plan.titulo}».
META DEL PLAN: ${plan.meta}${plan.fecha_limite ? ` (fecha límite ${plan.fecha_limite})` : ''}
ESTE PASO: ${paso.titulo}${paso.descripcion ? `. ${paso.descripcion}` : ''}
Orienta el entregable a esa meta.${previos.length ? `\n\nLO QUE YA PRODUJERON LOS PASOS ANTERIORES (úsalo, no lo repitas):\n${previos.join('\n\n')}` : ''}`
}

/** `onEvento`: recibe el avance en vivo (cada paso del agente empieza de cero; el entregable es el texto del último). */
export async function ejecutarTarea(tareaId: string, valores: Record<string, string>, opts: { pasoId?: string | null; proyecto?: ProyectoId; onEvento?: (e: EventoTarea) => void } = {}): Promise<Entregable> {
    const t = TAREA.get(tareaId)
    if (!t) throw new Error('Esa tarea guiada no existe.')
    const limpios = Object.fromEntries(t.campos.map((c) => [c.key, String(valores[c.key] ?? '').trim().slice(0, MAX_VALOR)]).filter(([, v]) => v))
    const falta = t.campos.find((c) => c.requerido && !limpios[c.key])
    if (falta) throw new Error(`Falta: ${falta.etiqueta}`)
    const info = DEPARTAMENTOS[t.departamento]

    // Un paso de un plan trabaja en el proyecto de su plan; si no, en el proyecto activo.
    const proyecto = opts.pasoId ? (await supabase.from('plan_pasos').select('planes(proyecto_id)').eq('id', opts.pasoId).maybeSingle()).data?.planes as unknown as { proyecto_id: string | null } | null : null
    const enProyecto: ProyectoId = opts.pasoId ? proyecto?.proyecto_id ?? null : opts.proyecto ?? null
    const [cerebro, memoria, plan, p] = await Promise.all([
        cerebroParaPrompt(enProyecto), memoriaParaPrompt(t.departamento), opts.pasoId ? contextoDePaso(opts.pasoId) : Promise.resolve(''), leerProyecto(enProyecto),
    ])
    const datos = t.campos.filter((c) => limpios[c.key]).map((c) => `- ${c.etiqueta}: ${limpios[c.key]}`).join('\n')
    const tools = herramientasLectura(t.herramientas, t.web, enProyecto)
    const { model, providerOptions } = modeloPara('chat')

    await registrarEvento({ departamento: t.departamento, tipo: 'herramienta', titulo: `Tarea guiada: ${t.titulo}`, estado: 'en_curso', fuente: 'chat' })
    try {
        // En streaming: una tarea con búsqueda web puede tardar minutos y una petición larga sin bytes se corta.
        let fallo: unknown = null
        const r = streamText({
            model, providerOptions, tools,
            onError: ({ error }) => { fallo = error },
            stopWhen: stepCountIs(10),
            maxOutputTokens: 6000,
            system: `Eres ${info.persona}, de ${info.nombre} en JAM Tech (${info.descripcion}). Trabajas para José, el dueño. Fecha de hoy: ${todayISO()}.
Estás haciendo la tarea guiada «${t.titulo}»: ${t.para}
Entrega el documento FINAL, listo para usar o enviar, no un borrador de ideas ni preguntas. En markdown ligero: títulos con ##, listas con guion y **negritas** para lo importante; sin tablas.
Las cifras de la empresa salen de las herramientas o del cerebro; nunca las inventes. Si falta un dato imprescindible (un precio, un nombre), déjalo marcado como [completar: qué falta] y sigue.
Respeta la voz de marca y las reglas del cerebro. Nunca recomiendes ni menciones competidores de Wapalink ni de JAM Tech.
Termina con una línea «**Siguiente paso:** …» con lo primero que debe hacer José con este entregable.${contextoProyecto(p)}${cerebro}${memoria}${plan}`,
            prompt: `${t.encargo}${datos ? `\n\nDATOS QUE DIO JOSÉ:\n${datos}` : ''}`,
        })
        for await (const part of r.fullStream) {
            if (part.type === 'start-step') opts.onEvento?.({ t: 'paso' })
            else if (part.type === 'text-delta') opts.onEvento?.({ t: 'texto', d: part.text })
            else if (part.type === 'tool-call') opts.onEvento?.({ t: 'herramienta', n: part.toolName === 'web_search' ? 'Buscando en la web' : TOOL_LABELS[part.toolName] ?? part.toolName })
        }
        let text: string
        try { text = await r.text } catch (e) { throw fallo ?? e }
        if (fallo) throw fallo
        const contenido = text.trim()
        if (contenido.length < 40) throw new Error('El agente no devolvió un entregable. Inténtalo de nuevo.')
        const { data, error } = await supabase.from('entregables').insert({
            departamento: t.departamento, tarea: t.id, titulo: tituloEntregable(t, limpios), entradas: limpios, contenido, plan_paso_id: opts.pasoId ?? null, proyecto_id: enProyecto,
        }).select(COLS).single()
        if (error) throw new Error(`No se pudo guardar el entregable: ${error.message}`)
        await registrarEvento({ departamento: t.departamento, tipo: 'herramienta', titulo: `Entregable listo: ${data.titulo}`, estado: 'hecho', fuente: 'chat', detalle: { tarea: t.id, entregable: data.id } })
        return data as Entregable
    } catch (e) {
        await registrarEvento({ departamento: t.departamento, tipo: 'herramienta', titulo: `Falló la tarea guiada: ${t.titulo}`, estado: 'error', fuente: 'chat', detalle: { error: e instanceof Error ? e.message : String(e) } })
        throw e
    }
}
