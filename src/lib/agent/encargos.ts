/**
 * Encargos: trabajo de varios pasos que José le deja a un agente («prepárame la propuesta para X», «investiga
 * Y»). El agente lo trabaja en segundo plano con sus herramientas y, al terminar o si necesita algo de José,
 * avisa por Telegram; José responde ahí mismo y el encargo sigue. Tabla encargos (schema_update_proyectos.sql).
 */
import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { errorMessage, todayISO } from '@/lib/actions/validation'
import { DEPARTAMENTOS, isWriteTool, type Departamento } from './shared'
import { contextoProyecto, leerProyecto, porAlcance, type Alcance, type ProyectoId } from './proyectos'
import { cerebroParaPrompt } from './cerebro'
import { memoriaParaPrompt } from './tools-memoria'
import { leerAutonomias, sinPreguntar } from './confianza'
import { anthropicProvider, modeloPara, proveedorActivo } from './modelo'
import { registrarEvento } from './eventos'

export type EstadoEncargo = 'pendiente' | 'trabajando' | 'esperando' | 'listo' | 'cancelado'
export type Encargo = {
    id: string; created_at: string; updated_at: string; proyecto_id: string | null; proyecto: string | null; departamento: Departamento
    titulo: string; detalle: string; estado: EstadoEncargo; resultado: string | null; pregunta: string | null
    fecha_compromiso: string | null; fuente: 'web' | 'telegram' | 'cron'; intentos: number
}

const COLS = 'id, created_at, updated_at, proyecto_id, departamento, titulo, detalle, estado, resultado, pregunta, fecha_compromiso, fuente, intentos, proyectos(nombre)'
const fila = (r: Record<string, unknown>): Encargo => ({ ...(r as unknown as Encargo), proyecto: (r.proyectos as { nombre?: string } | null)?.nombre ?? null })
const ABIERTOS: EstadoEncargo[] = ['pendiente', 'trabajando', 'esperando']
const MAX_INTENTOS = 3
const MARCA_PREGUNTA = /\n?\**PREGUNTA PARA JOS[ÉE]:?\**:?\s*([\s\S]+)$/i

export async function listarEncargos(o: { alcance?: Alcance; departamento?: Departamento; abiertos?: boolean; limite?: number } = {}): Promise<Encargo[]> {
    let q = porAlcance(supabase.from('encargos').select(COLS), o.alcance ?? null)
    if (o.departamento) q = q.eq('departamento', o.departamento)
    q = o.abiertos ? q.in('estado', ABIERTOS) : q.neq('estado', 'cancelado')
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(o.limite ?? 20)
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => fila(r as Record<string, unknown>))
}

export async function leerEncargo(id: string): Promise<Encargo | null> {
    const { data } = await supabase.from('encargos').select(COLS).eq('id', id).maybeSingle()
    return data ? fila(data as Record<string, unknown>) : null
}

async function actualizar(id: string, p: Partial<Encargo>): Promise<void> {
    const { proyecto: _p, ...resto } = p
    void _p
    await supabase.from('encargos').update({ ...resto, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function crearEncargo(n: { departamento: Departamento; titulo: string; detalle?: string; fecha_compromiso?: string | null; fuente?: Encargo['fuente']; proyecto_id?: ProyectoId }): Promise<Encargo> {
    const { data, error } = await supabase.from('encargos').insert({
        departamento: n.departamento, titulo: n.titulo.trim().slice(0, 200), detalle: (n.detalle ?? '').trim(), fecha_compromiso: n.fecha_compromiso || null,
        fuente: n.fuente ?? 'web', proyecto_id: n.proyecto_id ?? null,
    }).select(COLS).single()
    if (error || !data) throw new Error(`No se pudo anotar el encargo: ${error?.message}`)
    const e = fila(data as Record<string, unknown>)
    lanzar(e.id)
    return e
}

/** Lo trabaja en segundo plano (el servidor sigue vivo: Next en Docker). Un fallo queda en el encargo, nunca rompe el chat. */
export function lanzar(id: string): void {
    void trabajarEncargo(id).catch((e) => console.error('[encargo]', id, e))
}

/** José responde a la pregunta de un encargo: se añade al detalle y el agente sigue. */
export async function responderEncargo(id: string, respuesta: string): Promise<Encargo> {
    const e = await leerEncargo(id)
    if (!e) throw new Error('Encargo no encontrado')
    if (e.estado === 'cancelado') throw new Error('Ese encargo está cancelado.')
    const detalle = `${e.detalle}\n\nRespuesta de José (${todayISO()})${e.pregunta ? ` a «${e.pregunta.slice(0, 200)}»` : ''}: ${respuesta.trim()}`
    await actualizar(id, { detalle, estado: 'pendiente', pregunta: null, intentos: 0 })
    lanzar(id)
    return { ...e, detalle, estado: 'pendiente', pregunta: null }
}

export async function cancelarEncargo(id: string): Promise<void> {
    await actualizar(id, { estado: 'cancelado' })
}

/** Encargos que se quedaron a medias (un reinicio del servidor a mitad de trabajo): se retoman. */
export async function retomarAtascados(): Promise<number> {
    const hace = new Date(Date.now() - 20 * 60_000).toISOString()
    const { data } = await supabase.from('encargos').select('id').in('estado', ['pendiente', 'trabajando']).lt('updated_at', hace).lt('intentos', MAX_INTENTOS).limit(5)
    for (const r of data ?? []) lanzar(r.id)
    return data?.length ?? 0
}

async function trabajarEncargo(id: string): Promise<void> {
    const e = await leerEncargo(id)
    if (!e || !['pendiente', 'trabajando'].includes(e.estado)) return
    const info = DEPARTAMENTOS[e.departamento]
    await actualizar(id, { estado: 'trabajando', intentos: e.intentos + 1 })
    await registrarEvento({ departamento: e.departamento, tipo: 'herramienta', titulo: `Trabajando en: ${e.titulo}`, estado: 'en_curso', fuente: e.fuente === 'telegram' ? 'telegram' : 'chat' })
    try {
        const [{ herramientasPara }, autonomias, cerebro, memoria, proyecto] = await Promise.all([
            import('./caja'), leerAutonomias(), cerebroParaPrompt(e.proyecto_id), memoriaParaPrompt(e.departamento), leerProyecto(e.proyecto_id),
        ])
        // Solo lectura y, si el agente tiene autonomía, sus escrituras internas. Nunca nada que salga de la casa.
        const caja = herramientasPara(e.proyecto_id, e.proyecto_id, proyecto?.checklist_slug ?? null) as Record<string, unknown>
        const tools = Object.fromEntries(Object.entries(caja).filter(([n]) => !n.startsWith('encargo') && (!isWriteTool(n) || sinPreguntar(n, autonomias)))) as Record<string, never>
        if (proveedorActivo() === 'anthropic') (tools as Record<string, unknown>).web_search = anthropicProvider().tools.webSearch_20260209({ maxUses: 5 })
        const { model, providerOptions } = modeloPara('chat', { cache: true })
        const { text } = await generateText({
            model, providerOptions, tools, stopWhen: stepCountIs(14), maxOutputTokens: 6000,
            system: `Eres ${info.persona}, de ${info.nombre} en JAM Tech (${info.descripcion}). Trabajas para José, el dueño. Fecha de hoy: ${todayISO()}.
Estás trabajando un ENCARGO en segundo plano: José no está delante y lo leerá en Telegram cuando termines.
- Haz todo lo que puedas con tus herramientas: consulta los datos, investiga en la web si hace falta (cita la fuente) y redacta.
- Si el encargo lo pide, puedes usar las acciones internas que tienes (crear tareas, notas, objetivos…). Nunca envíes nada a un cliente ni factures: eso lo decide José.
- Entrega el resultado FINAL, listo para usar, no un plan de lo que harías. Si falta un dato, márcalo como [completar: qué falta] y sigue.
- Si para terminar necesitas una decisión o un dato que solo José tiene, haz todo lo demás y cierra con una línea que empiece exactamente por "PREGUNTA PARA JOSÉ:" con una pregunta concreta y corta.
- No inventes cifras. Nunca recomiendes ni menciones competidores de Wapalink ni de JAM Tech.
FORMATO (se lee en el teléfono): viñetas "- **Etiqueta:** …" de 1 o 2 frases, detalles en sub-viñetas, mensajes para clientes en líneas que empiezan por "> ", montos como $1.851,88 y fechas como "5 oct". Sin tablas.${contextoProyecto(proyecto)}${cerebro}${memoria}`,
            prompt: `ENCARGO: ${e.titulo}${e.detalle ? `\n\n${e.detalle}` : ''}${e.fecha_compromiso ? `\n\nPara el ${e.fecha_compromiso}.` : ''}${e.resultado ? `\n\nLO QUE LLEVABAS (continúa desde aquí, no lo repitas entero):\n${e.resultado.slice(0, 4000)}` : ''}`,
        })
        const m = MARCA_PREGUNTA.exec(text.trim())
        const resultado = (m ? text.trim().slice(0, m.index) : text.trim()) || e.resultado || ''
        const pregunta = m ? m[1].trim().slice(0, 1000) : null
        await actualizar(id, { estado: pregunta ? 'esperando' : 'listo', resultado: resultado.slice(0, 12000), pregunta })
        await registrarEvento({ departamento: e.departamento, tipo: 'herramienta', titulo: pregunta ? `Espera tu respuesta: ${e.titulo}` : `Encargo listo: ${e.titulo}`, estado: pregunta ? 'espera_aprobacion' : 'hecho', fuente: 'chat', detalle: { encargo: id } })
        await avisar({ ...e, resultado, pregunta, estado: pregunta ? 'esperando' : 'listo' })
    } catch (err) {
        const fallo = errorMessage(err)
        const agotado = e.intentos + 1 >= MAX_INTENTOS
        await actualizar(id, agotado ? { estado: 'esperando', pregunta: `No pude terminarlo (${fallo.slice(0, 200)}). ¿Lo intento de nuevo o lo cambiamos?` } : { estado: 'pendiente' })
        await registrarEvento({ departamento: e.departamento, tipo: 'herramienta', titulo: `Falló el encargo: ${e.titulo}`, estado: 'error', fuente: 'chat', detalle: { encargo: id, error: fallo } })
        if (agotado) await avisar({ ...e, estado: 'esperando', resultado: null, pregunta: `No pude terminarlo (${fallo.slice(0, 200)}). ¿Lo intento de nuevo o lo cambiamos?` })
    }
}

/** Aviso por Telegram (y en la conversación, para que la respuesta de José llegue al encargo). */
async function avisar(e: Encargo): Promise<void> {
    const chatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (chatIds.length === 0 || !process.env.TELEGRAM_BOT_TOKEN) return
    const info = DEPARTAMENTOS[e.departamento]
    const donde = e.proyecto ? ` (${e.proyecto})` : ''
    const texto = e.estado === 'esperando'
        ? `${info.emoji} **${info.persona} necesita algo para «${e.titulo}»**${donde}\n\n${e.resultado ? `${e.resultado}\n\n` : ''}**Pregunta:** ${e.pregunta}\n\nRespóndeme aquí y sigo.`
        : `${info.emoji} **${info.persona} terminó: ${e.titulo}**${donde}\n\n${e.resultado}`
    const [{ sendMessage }, { mdToTelegramHtml }, { appendAssistantMessage }] = await Promise.all([import('@/lib/telegram/api'), import('@/lib/telegram/format'), import('@/lib/telegram/session')])
    for (const chatId of chatIds) {
        try {
            await sendMessage(chatId, mdToTelegramHtml(texto))
            await appendAssistantMessage(chatId, `[Encargo ${e.id} de ${info.persona}, ${e.estado === 'esperando' ? 'esperando tu respuesta' : 'terminado'}]\n\n${texto}`)
        } catch (err) { console.error('[encargo] no se pudo avisar por Telegram', err) }
    }
}

// ───────────── Herramientas del chat (sin tarjeta: anotar un encargo no toca nada de fuera) ─────────────

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try { return { ok: true, data: await fn() } } catch (e) { console.error('[encargos tool]', e); return { ok: false, error: errorMessage(e) } }
}
const DEP = z.enum(Object.keys(DEPARTAMENTOS) as [Departamento, ...Departamento[]])
const resumen = (e: Encargo) => ({ id: e.id, responsable: DEPARTAMENTOS[e.departamento].persona, titulo: e.titulo, estado: e.estado, pregunta: e.pregunta, ...(e.proyecto ? { proyecto: e.proyecto } : {}), actualizado: e.updated_at.slice(0, 16), resultado: e.resultado ? e.resultado.slice(0, 600) : null })

export const encargosTools = (proyecto: ProyectoId = null, lectura: Alcance = proyecto) => ({
    encargo_crear: tool({
        description: 'Deja un ENCARGO a un agente: un trabajo de varios pasos o que tarda (investigar algo, preparar una propuesta, revisar a fondo un cliente, redactar algo largo). El agente lo trabaja en segundo plano y avisa a José por Telegram al terminar o si necesita algo. No lo uses para lo que puedes responder ya en esta conversación. Pon en detalle todo lo que José dijo (nombres, cifras, plazos) para que el agente no tenga que preguntar.',
        inputSchema: z.object({
            departamento: DEP.describe('Quién lo hace'), titulo: z.string().min(3).max(200).describe('Qué hay que lograr, empezando por verbo'),
            detalle: z.string().max(4000).describe('Todo el contexto que dio José'), fecha_compromiso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }),
        execute: async (i) => run(async () => {
            const e = await crearEncargo({ ...i, proyecto_id: proyecto })
            return { id: e.id, responsable: DEPARTAMENTOS[e.departamento].persona, titulo: e.titulo, aviso: 'Ya está trabajando en segundo plano; avisará por Telegram.' }
        }),
    }),
    encargos_listar: tool({
        description: 'Encargos de los agentes: en qué están trabajando, cuáles esperan una respuesta de José (con su pregunta) y los terminados recientes con su resultado. Úsala para «¿en qué están?», «¿qué te encargué?» o al abrir el informe.',
        inputSchema: z.object({ departamento: DEP.optional(), solo_abiertos: z.boolean().optional() }),
        execute: async ({ departamento, solo_abiertos }) => run(async () => (await listarEncargos({ alcance: lectura, departamento, abiertos: solo_abiertos, limite: 15 })).map(resumen)),
    }),
    encargo_responder: tool({
        description: 'Le pasa a un encargo la respuesta de José a su pregunta (o un cambio de instrucciones) y el agente sigue trabajando. Úsala cuando José conteste a un mensaje «[Encargo … esperando tu respuesta]» o diga cómo seguir con un encargo. Resuelve el id con encargos_listar si no lo tienes.',
        inputSchema: z.object({ encargo_id: z.string().uuid(), respuesta: z.string().min(1).max(3000) }),
        execute: async ({ encargo_id, respuesta }) => run(async () => resumen(await responderEncargo(encargo_id, respuesta))),
    }),
    encargo_cancelar: tool({
        description: 'Cancela un encargo que ya no hace falta.',
        inputSchema: z.object({ encargo_id: z.string().uuid() }),
        execute: async ({ encargo_id }) => run(async () => { await cancelarEncargo(encargo_id); return { cancelado: true } }),
    }),
})
