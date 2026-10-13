/**
 * Herramientas del departamento de SEO: leen la plataforma SEO de la agencia
 * (seoagency.jamtech.cloud) por su API externa de solo lectura. Nada aquí escribe:
 * los reportes se editan y se marcan como enviados en la propia plataforma.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { errorMessage } from '@/lib/actions/validation'

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try {
        return { ok: true, data: await fn() }
    } catch (e) {
        console.error('[seo tool]', e)
        return { ok: false, error: errorMessage(e) }
    }
}

const MES = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe('Mes YYYY-MM. Vacío = último mes completo')

async function seo<T>(path: string, mes?: string): Promise<T> {
    const token = process.env.SEO_API_TOKEN
    if (!token) throw new Error('Falta SEO_API_TOKEN en el servidor (el mismo valor que EXTERNAL_API_TOKEN en la plataforma SEO).')
    const base = (process.env.SEO_API_URL || 'https://seoagency.jamtech.cloud').replace(/\/+$/, '')
    const url = `${base}/api/externo${path}${mes ? `?mes=${mes}` : ''}`
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(60_000) })
    if (r.status === 404) throw new Error('Ese cliente no existe en la plataforma SEO. Usa seo_cartera para ver los slugs.')
    if (!r.ok) throw new Error(`La plataforma SEO respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return (await r.json()) as T
}

export const seoTools = {
    seo_cartera: tool({
        description:
            'Resumen SEO de todos los clientes de la agencia en un mes: clics, impresiones, CTR y posición de Google Search Console, usuarios orgánicos y visitas desde IA de GA4, variación contra el mes anterior, estado del reporte mensual, alertas y recomendaciones abiertas. Úsala para "¿cómo va el SEO de mis clientes?", "¿quién bajó?", "¿qué reportes faltan?". Devuelve el slug de cada cliente para seo_cliente.',
        inputSchema: z.object({ mes: MES }),
        execute: async ({ mes }) => run(() => seo('/cartera', mes)),
    }),

    seo_cliente: tool({
        description:
            'Ficha SEO de un cliente de la agencia: KPIs del mes y del anterior, clics de los últimos 12 meses, top 10 consultas y páginas, recomendaciones abiertas de los agentes SEO, reportes con su enlace público para mandárselo al cliente, bitácora de acciones y últimas sincronizaciones. Necesita el slug (sácalo de seo_cartera).',
        inputSchema: z.object({ slug: z.string().min(1).describe('Slug del cliente en la plataforma SEO'), mes: MES }),
        execute: async ({ slug, mes }) => run(() => seo(`/clientes/${encodeURIComponent(slug)}`, mes)),
    }),
}
