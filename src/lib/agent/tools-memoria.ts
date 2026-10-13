/**
 * Memoria de largo plazo compartida por todos los agentes (tabla agent_memoria, schema_update_memoria.sql):
 * reglas, preferencias y hechos que José pide recordar. Se inyecta en las instrucciones del chat (web y
 * Telegram) y de los informes automáticos. `recordar` y `olvidar` pasan por confirmación.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/actions/validation'
import { DEPARTAMENTOS, type Departamento } from './shared'

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try {
        return { ok: true, data: await fn() }
    } catch (e) {
        console.error('[memoria tool]', e)
        return { ok: false, error: errorMessage(e) }
    }
}

export type Recuerdo = { id: string; created_at: string; departamento: Departamento | null; hecho: string }
const MAX_EN_PROMPT = 60

export async function listarMemoria(): Promise<Recuerdo[]> {
    const { data, error } = await supabase.from('agent_memoria').select('id, created_at, departamento, hecho').eq('activo', true).order('created_at', { ascending: true }).limit(MAX_EN_PROMPT)
    if (error) throw new Error(error.message)
    return (data ?? []) as Recuerdo[]
}

/** Bloque para las instrucciones del sistema. Si la tabla no responde, el asistente sigue sin memoria. */
export async function memoriaParaPrompt(dep?: Departamento): Promise<string> {
    const todos = await listarMemoria().catch(() => [])
    const aplican = dep ? todos.filter((r) => !r.departamento || r.departamento === dep) : todos
    if (aplican.length === 0) return ''
    const lineas = aplican.map((r) => `- ${r.departamento ? `[${DEPARTAMENTOS[r.departamento].nombre}] ` : ''}${r.hecho} (desde el ${r.created_at.slice(0, 10)})`)
    return `\n\nMEMORIA — lo que José te pidió recordar (vale para todas las conversaciones y por encima de tus suposiciones; si algo choca con los datos, avísale):\n${lineas.join('\n')}`
}

const DEP = z.enum(Object.keys(DEPARTAMENTOS) as [Departamento, ...Departamento[]])

export const memoriaTools = {
    memoria_listar: tool({
        description: 'Lo que los agentes recuerdan de forma permanente (reglas, preferencias y hechos que José pidió recordar), con su id. Úsala para "¿qué recuerdas?" o antes de olvidar algo.',
        inputSchema: z.object({}),
        execute: async () => run(() => listarMemoria()),
    }),

    recordar: tool({
        description:
            'Guarda un recuerdo permanente para todos los agentes: una regla o preferencia de José ("en los análisis de ingresos ignora mayo y julio de 2026: eran facturas de prueba"), un hecho del negocio o una decisión. Propónla cuando José diga "recuerda", "a partir de ahora", "olvida X" (como regla), "no vuelvas a…" o corrija un dato que deberías tener en cuenta siempre. Escribe el recuerdo completo y autoexplicativo, con fechas absolutas. Requiere confirmación.',
        inputSchema: z.object({
            hecho: z.string().min(3).max(600).describe('El recuerdo, en una o dos frases claras y con fechas absolutas'),
            departamento: DEP.optional().describe('Solo si aplica a un departamento; vacío = para todos'),
        }),
        execute: async ({ hecho, departamento }) =>
            run(async () => {
                const { data, error } = await supabase.from('agent_memoria').insert({ hecho: hecho.trim(), departamento: departamento ?? null }).select('id, hecho, departamento').single()
                if (error) throw new Error(error.message)
                return data
            }),
    }),

    olvidar: tool({
        description: 'Deja de recordar algo que estaba en la memoria permanente (porque ya no aplica o era un error). Resuelve el id con memoria_listar. Requiere confirmación.',
        inputSchema: z.object({ recuerdo_id: z.string().uuid(), hecho: z.string().min(1).describe('El recuerdo, para la confirmación') }),
        execute: async ({ recuerdo_id }) =>
            run(async () => {
                const { data, error } = await supabase.from('agent_memoria').update({ activo: false, olvidado_at: new Date().toISOString() }).eq('id', recuerdo_id).select('hecho').single()
                if (error) throw new Error(error.message)
                return data
            }),
    }),
}
