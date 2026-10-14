/**
 * Cerebro de la empresa (tabla empresa_cerebro, schema_update_procesos.sql): oferta, cliente ideal, voz,
 * metas, reglas… Todos los agentes lo leen (chat, informes, tareas guiadas y planes). José lo edita en
 * /oficina/cerebro o se lo cuenta a Ramón, que lo guarda con cerebro_actualizar (con confirmación).
 */
import { tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/actions/validation'
import { SECCIONES, completitud, type SeccionCerebro } from './cerebro-secciones'

export type Cerebro = Partial<Record<SeccionCerebro, string>>

export async function leerCerebro(): Promise<Cerebro> {
    const { data, error } = await supabase.from('empresa_cerebro').select('seccion, contenido').is('proyecto_id', null)
    if (error) throw new Error(error.message)
    return Object.fromEntries((data ?? []).map((r) => [r.seccion as SeccionCerebro, String(r.contenido ?? '')]))
}

export async function guardarSeccion(seccion: SeccionCerebro, contenido: string): Promise<void> {
    if (!SECCIONES.some((s) => s.key === seccion)) throw new Error('Sección no válida')
    const texto = contenido.trim().slice(0, 6000)
    const { data } = await supabase.from('empresa_cerebro').select('id').is('proyecto_id', null).eq('seccion', seccion).maybeSingle()
    const fila = { contenido: texto, updated_at: new Date().toISOString() }
    const { error } = data
        ? await supabase.from('empresa_cerebro').update(fila).eq('id', data.id)
        : await supabase.from('empresa_cerebro').insert({ ...fila, seccion })
    if (error) throw new Error(`No se pudo guardar: ${error.message}`)
}

/** Bloque para las instrucciones de los agentes. Si la tabla no responde, siguen sin cerebro. */
export async function cerebroParaPrompt(): Promise<string> {
    const c = await leerCerebro().catch(() => ({} as Cerebro))
    const lineas = SECCIONES.filter((s) => (c[s.key] ?? '').trim()).map((s) => `## ${s.titulo}\n${c[s.key]!.trim()}`)
    if (lineas.length === 0) return ''
    const { faltan } = completitud(c)
    const aviso = faltan.length ? `\n(Secciones todavía vacías o muy cortas: ${faltan.map((k) => SECCIONES.find((s) => s.key === k)!.titulo).join(', ')}. Si un trabajo depende de ellas, dilo y no las inventes.)` : ''
    return `\n\nCEREBRO DE LA EMPRESA — lo que José definió de JAM Tech. Úsalo en todo lo que redactes y propongas (precios, cliente ideal, tono, reglas):\n${lineas.join('\n\n')}${aviso}`
}

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try { return { ok: true, data: await fn() } } catch (e) { console.error('[cerebro tool]', e); return { ok: false, error: errorMessage(e) } }
}

const SECCION = z.enum(SECCIONES.map((s) => s.key) as [SeccionCerebro, ...SeccionCerebro[]])

export const cerebroTools = {
    cerebro_leer: tool({
        description: `Lee el cerebro de la empresa: cada sección con su contenido, qué tan completo está y qué falta. Secciones: ${SECCIONES.map((s) => `${s.key} = ${s.titulo}`).join('; ')}. Úsala antes de entrevistar a José para completarlo.`,
        inputSchema: z.object({}),
        execute: async () => run(async () => {
            const c = await leerCerebro()
            const comp = completitud(c)
            return { completo_pct: comp.pct, faltan: comp.faltan, secciones: SECCIONES.map((s) => ({ seccion: s.key, titulo: s.titulo, contenido: c[s.key] ?? '', guia: s.preguntas })) }
        }),
    }),

    cerebro_actualizar: tool({
        description: 'Guarda el contenido de una sección del cerebro de la empresa con lo que José contó (reemplaza el texto anterior de esa sección, así que incluye lo que ya había y siga valiendo). Escribe en frases claras, con cifras y nombres concretos, sin inventar nada que él no dijo. Requiere confirmación.',
        inputSchema: z.object({ seccion: SECCION, contenido: z.string().min(3).max(6000) }),
        execute: async ({ seccion, contenido }) => run(async () => { await guardarSeccion(seccion, contenido); return { seccion, guardado: true } }),
    }),
}
