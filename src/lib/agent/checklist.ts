/**
 * Seguimiento de Tareas (Checklists Dev, tasks.jamtech.cloud): el avance real de los proyectos de clientes.
 * Vive en otro proyecto de Supabase; se lee con su clave pública (la misma que va en el sitio publicado), así que
 * solo se ven los proyectos marcados como públicos. Los agentes lo usan para «¿cómo va Perfect Trainer?», los
 * informes lo mencionan y, si el cliente cambia un estado desde su enlace, se avisa por Telegram.
 */
import { createClient } from '@supabase/supabase-js'
import { tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/actions/validation'

// Valores públicos del sitio tasks.jamtech.cloud (no son secretos); se pueden cambiar por entorno.
const URL_CHECKLIST = process.env.CHECKLIST_SUPABASE_URL || 'https://cgkrargpsmgqfyplukau.supabase.co'
const CLAVE_CHECKLIST = process.env.CHECKLIST_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNna3Jhcmdwc21ncWZ5cGx1a2F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTUyMzYsImV4cCI6MjEwNTE5MTIzNn0.rW4Psno_jVngsX_eXvzMfXcsryHWNlNT-aDwWGMKOp8'
export const SITIO_CHECKLIST = 'https://tasks.jamtech.cloud'

let cliente: ReturnType<typeof createClient> | null = null
const db = () => (cliente ??= createClient(URL_CHECKLIST, CLAVE_CHECKLIST, { auth: { persistSession: false, autoRefreshToken: false } }))

export const ESTADOS = ['pendiente', 'desarrollo', 'pruebas', 'listo', 'produccion'] as const
export type EstadoTarea = (typeof ESTADOS)[number]
export const ETIQUETA_ESTADO: Record<EstadoTarea, string> = { pendiente: 'Pendiente', desarrollo: 'En desarrollo', pruebas: 'En pruebas', listo: 'Listo', produccion: 'En producción' }
const etiqueta = (s: string | null | undefined) => (s && s in ETIQUETA_ESTADO ? ETIQUETA_ESTADO[s as EstadoTarea] : s ?? '—')

type FilaTarea = { id: string; position: number; text_es: string | null; text_en: string | null; sprint_id?: string | null; task_status: { status: string } | { status: string }[] | null }
type FilaSeccion = { id: string; position: number; title_es: string | null; title_en: string | null; flag: string | null; tasks: FilaTarea[] }
type FilaProyecto = { id: string; slug: string; name: string; sections: FilaSeccion[]; sprints?: { id: string; name: string; state: string; position: number }[] }

const estadoDe = (t: FilaTarea): EstadoTarea => {
    const s = Array.isArray(t.task_status) ? t.task_status[0]?.status : t.task_status?.status
    return (s && (ESTADOS as readonly string[]).includes(s) ? s : 'pendiente') as EstadoTarea
}
const titulo = (s: { title_es: string | null; title_en: string | null }) => s.title_es || s.title_en || 'Sin título'
const texto = (t: FilaTarea) => t.text_es || t.text_en || 'Sin texto'

export type AvanceProyecto = {
    slug: string; nombre: string; total: number; terminadas: number; porEstado: Record<EstadoTarea, number>; pendientesAprobacion: number
    sprint: { nombre: string; total: number; terminadas: number } | null; enlace: string
}

const SELECT = 'id, slug, name, sections(id, position, title_es, title_en, flag, tasks(id, position, text_es, text_en, sprint_id, task_status(status))), sprints(id, name, state, position)'

async function leer(slug?: string): Promise<FilaProyecto[]> {
    let q = db().from('projects').select(SELECT)
    if (slug) q = q.eq('slug', slug)
    let { data, error } = await q.order('name')
    // Si la base del checklist aún no tiene sprints, se lee sin ellos.
    if (error && /sprint/i.test(error.message)) {
        let q2 = db().from('projects').select('id, slug, name, sections(id, position, title_es, title_en, flag, tasks(id, position, text_es, text_en, task_status(status)))')
        if (slug) q2 = q2.eq('slug', slug)
        ;({ data, error } = await q2.order('name'))
    }
    if (error) throw new Error(`Seguimiento de Tareas no respondió: ${error.message}`)
    return (data ?? []) as unknown as FilaProyecto[]
}

/** Avance de un proyecto: las fases «En pausa» no cuentan (igual que en el checklist). */
function avanceDe(p: FilaProyecto): AvanceProyecto {
    const cuentan = p.sections.filter((s) => s.flag !== 'paused')
    const tareas = cuentan.flatMap((s) => s.tasks.map((t) => ({ t, s })))
    const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoTarea, number>
    for (const { t } of tareas) porEstado[estadoDe(t)]++
    const activo = p.sprints?.find((s) => s.state === 'active') ?? null
    const delSprint = activo ? p.sections.flatMap((s) => s.tasks).filter((t) => t.sprint_id === activo.id) : []
    return {
        slug: p.slug, nombre: p.name, total: tareas.length, terminadas: porEstado.produccion, porEstado,
        pendientesAprobacion: tareas.filter(({ t, s }) => s.flag === 'pending' && estadoDe(t) === 'pendiente').length,
        sprint: activo ? { nombre: activo.name, total: delSprint.length, terminadas: delSprint.filter((t) => estadoDe(t) === 'produccion').length } : null,
        enlace: `${SITIO_CHECKLIST}/p/${p.slug}`,
    }
}

export async function avanceProyectos(): Promise<AvanceProyecto[]> {
    return (await leer()).map(avanceDe)
}

export async function avanceDeProyecto(slug: string): Promise<AvanceProyecto | null> {
    const [p] = await leer(slug)
    return p ? avanceDe(p) : null
}

/** Detalle para los agentes: fases con sus tareas y estados, el sprint activo y los últimos cambios. */
export async function detalleProyecto(slug: string) {
    const [p] = await leer(slug)
    if (!p) throw new Error(`No encuentro el proyecto «${slug}» en Seguimiento de Tareas (o no es público).`)
    const av = avanceDe(p)
    const activo = p.sprints?.find((s) => s.state === 'active') ?? null
    const fases = [...p.sections].sort((a, b) => a.position - b.position).map((s) => ({
        fase: titulo(s), etiqueta: s.flag === 'paused' ? 'En pausa' : s.flag === 'pending' ? 'Pendiente de aprobación' : null,
        tareas: [...s.tasks].sort((a, b) => a.position - b.position).map((t) => ({ tarea: texto(t), estado: etiqueta(estadoDe(t)), ...(activo && t.sprint_id === activo.id ? { en_sprint: true } : {}) })),
    }))
    return {
        proyecto: p.name, enlace_publico: av.enlace, total_tareas: av.total, en_produccion: av.terminadas,
        tareas_en_pausa: p.sections.filter((s) => s.flag === 'paused').reduce((n, s) => n + s.tasks.length, 0),
        nota: 'Como en el checklist, las fases «En pausa» no cuentan en el total ni en el avance.',
        por_estado: Object.fromEntries(ESTADOS.map((e) => [ETIQUETA_ESTADO[e], av.porEstado[e]])),
        pendientes_de_aprobacion: av.pendientesAprobacion,
        sprint_activo: av.sprint ? `${av.sprint.nombre}: ${av.sprint.terminadas} de ${av.sprint.total} en producción` : 'ninguno',
        fases, ultimos_cambios: await ultimosCambios(p.id).catch(() => []),
    }
}

type Cambio = { id: number; task_id: string; project_id: string; from_status: string | null; to_status: string; actor: string; created_at: string }

async function ultimosCambios(projectId: string) {
    const { data, error } = await db().from('status_log').select('id, task_id, from_status, to_status, actor, created_at').eq('project_id', projectId).order('id', { ascending: false }).limit(10)
    if (error) return [] // el registro de cambios llega con la migración 0004 del checklist
    return ((data ?? []) as unknown as Cambio[]).map((c) => ({ cuando: String(c.created_at).slice(0, 16).replace('T', ' '), de: etiqueta(c.from_status), a: etiqueta(c.to_status), quien: c.actor === 'anon' ? 'el cliente (enlace público)' : 'JAM Tech' }))
}

// ───────────── Avisos por Telegram cuando el cliente cambia un estado ─────────────

let enCurso: Promise<number> | null = null

/**
 * Lee los cambios nuevos del registro (status_log) desde el último avisado y manda un resumen por Telegram de los
 * que hizo el cliente desde su enlace. Idempotente: el cursor (checklist_avisos) avanza siempre. Sin la migración
 * 0004 en el checklist, no hace nada.
 */
export function avisarCambios(): Promise<number> {
    return (enCurso ??= hacerAvisos().finally(() => { enCurso = null }))
}

async function hacerAvisos(): Promise<number> {
    const { data: cur } = await supabase.from('checklist_avisos').select('ultimo_id').eq('id', 1).maybeSingle()
    const desde = Number(cur?.ultimo_id ?? 0)
    const { data, error } = await db().from('status_log').select('id, task_id, project_id, from_status, to_status, actor, created_at').gt('id', desde).order('id').limit(200)
    if (error || !data?.length) return 0
    const cambios = data as unknown as Cambio[]
    const ultimo = cambios[cambios.length - 1].id
    // Primera vez: no se avisa de todo el historial, solo se marca el punto de partida.
    if (desde === 0) { await supabase.from('checklist_avisos').update({ ultimo_id: ultimo, updated_at: new Date().toISOString() }).eq('id', 1); return 0 }
    const delCliente = cambios.filter((c) => c.actor === 'anon')
    let avisados = 0
    if (delCliente.length) {
        const proyectos = await leer()
        const tareaDe = new Map(proyectos.flatMap((p) => p.sections.flatMap((s) => s.tasks.map((t) => [t.id, { tarea: texto(t), fase: titulo(s), proyecto: p.name, slug: p.slug }] as const))))
        const porProyecto = new Map<string, string[]>()
        for (const c of delCliente) {
            const info = tareaDe.get(c.task_id)
            const nombre = info?.proyecto ?? 'Un proyecto'
            const linea = `- **${info?.tarea ?? 'Una tarea'}**${info ? ` (${info.fase})` : ''}: ${etiqueta(c.from_status)} → **${etiqueta(c.to_status)}**`
            porProyecto.set(nombre, [...(porProyecto.get(nombre) ?? []), linea])
        }
        const slugDe = new Map(proyectos.map((p) => [p.name, p.slug]))
        const bloques = [...porProyecto].map(([nombre, lineas]) => `📋 **${nombre}: el cliente actualizó ${lineas.length === 1 ? 'una tarea' : `${lineas.length} tareas`}**\n\n${lineas.join('\n')}\n\nVer: ${SITIO_CHECKLIST}/p/${slugDe.get(nombre) ?? ''}`)
        const mensaje = bloques.join('\n\n')
        avisados = delCliente.length
        await enviarTelegram(mensaje)
        const { registrarEvento } = await import('./eventos')
        await registrarEvento({ departamento: 'operaciones', tipo: 'aviso', titulo: `El cliente actualizó ${avisados} ${avisados === 1 ? 'tarea' : 'tareas'} en Seguimiento de Tareas`, estado: 'hecho', fuente: 'cron', detalle: { cambios: delCliente.map((c) => c.id) } })
    }
    await supabase.from('checklist_avisos').update({ ultimo_id: ultimo, updated_at: new Date().toISOString() }).eq('id', 1)
    return avisados
}

async function enviarTelegram(texto: string): Promise<void> {
    const chatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (chatIds.length === 0 || !process.env.TELEGRAM_BOT_TOKEN) return
    const [{ sendMessage }, { mdToTelegramHtml }, { appendAssistantMessage }] = await Promise.all([import('@/lib/telegram/api'), import('@/lib/telegram/format'), import('@/lib/telegram/session')])
    for (const chatId of chatIds) {
        await sendMessage(chatId, mdToTelegramHtml(texto))
        await appendAssistantMessage(chatId, `[Aviso de Seguimiento de Tareas]\n\n${texto}`)
    }
}

// ───────────── Herramientas del chat (solo lectura) ─────────────

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try { return { ok: true, data: await fn() } } catch (e) { console.error('[checklist tool]', e); return { ok: false, error: errorMessage(e) } }
}

/** `slugActivo`: el checklist del proyecto activo de la Oficina (si tiene uno enlazado). */
export const checklistTools = (slugActivo: string | null = null) => ({
    checklist_proyectos: tool({
        description: `Avance de los proyectos de clientes en Seguimiento de Tareas (${SITIO_CHECKLIST}): por proyecto, tareas por estado (Pendiente, En desarrollo, En pruebas, Listo, En producción), cuántas esperan aprobación del cliente y el sprint activo. Úsala para «¿cómo van los proyectos?» y en los informes.`,
        inputSchema: z.object({}),
        execute: async () => run(async () => (await avanceProyectos()).map((a) => ({
            proyecto: a.nombre, slug: a.slug, en_produccion: `${a.terminadas} de ${a.total}`,
            por_estado: Object.fromEntries(ESTADOS.map((e) => [ETIQUETA_ESTADO[e], a.porEstado[e]])), pendientes_de_aprobacion: a.pendientesAprobacion,
            sprint_activo: a.sprint ? `${a.sprint.nombre}: ${a.sprint.terminadas} de ${a.sprint.total} en producción` : 'ninguno', enlace: a.enlace,
        }))),
    }),
    checklist_proyecto: tool({
        description: `Detalle de un proyecto en Seguimiento de Tareas: cada fase con sus tareas y su estado, qué está en el sprint activo y los últimos cambios (y si los hizo el cliente desde su enlace). ${slugActivo ? `Sin slug, es el del proyecto activo (${slugActivo}).` : 'Resuelve el slug con checklist_proyectos.'} Úsala para «¿cómo va Perfect Trainer?», «¿qué falta?», «¿qué cambió el cliente?».`,
        inputSchema: z.object({ slug: z.string().optional() }),
        execute: async ({ slug }) => run(async () => {
            const s = slug || slugActivo
            if (!s) throw new Error('Falta el proyecto: usa checklist_proyectos para ver cuáles hay.')
            return detalleProyecto(s)
        }),
    }),
})
