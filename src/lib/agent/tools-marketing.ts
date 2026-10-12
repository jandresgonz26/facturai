/**
 * Herramientas del departamento de Marketing: listas y campañas de Brevo, leads que
 * llegan por la web y el borrador del boletín "Aprende con Jami". Todas son de
 * lectura: redactar un borrador no cambia nada hasta que el usuario lo guarde o envíe.
 */
import { generateText, tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/actions/validation'
import { anthropicProvider, modeloRutinas } from './modelo'

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try {
        return { ok: true, data: await fn() }
    } catch (e) {
        console.error('[marketing tool]', e)
        return { ok: false, error: errorMessage(e) }
    }
}

async function brevo<T>(path: string): Promise<T> {
    const key = process.env.BREVO_API_KEY
    if (!key) throw new Error('Falta BREVO_API_KEY en el servidor (la misma clave que usa la web).')
    const r = await fetch(`https://api.brevo.com/v3${path}`, {
        headers: { 'api-key': key, accept: 'application/json', 'user-agent': 'FacturAI/1.0' },
        cache: 'no-store',
    })
    if (!r.ok) throw new Error(`Brevo respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return (await r.json()) as T
}

/** Reglas editoriales del boletín, tal como las fijó el dueño. */
export const REGLAS_BOLETIN = `REGLAS EDITORIALES DE "APRENDE CON JAMI" (boletín quincenal de JAM Tech para dueños de pequeños negocios en Latinoamérica):
- Formato mixto: 📰 una o dos noticias de IA/tecnología verificadas y recientes, 💡 un consejo práctico para aplicar esa misma semana, 🤖 un truco o herramienta de IA para el negocio.
- Cada noticia responde "¿y a mí qué?": qué cambia para un negocio pequeño que vende por WhatsApp, tiene una web o una tienda.
- NUNCA menciones ni promociones competidores de Wapalink (asistentes de IA para WhatsApp de terceros, el agente de IA de Meta, etc.) ni de JAM Tech.
- Lenguaje claro, sin tecnicismos, tuteo, frases cortas. Nada inventado: cita la fuente de cada noticia con su enlace.
- Cierra con un llamado suave a usar a Jami en jamtech.cloud/asistente.html (mensajes de WhatsApp gratis) o a responder el correo.
- Firma: Jami de JAM Tech. Marca: "JAM Tech" en el texto, "JAM Tech Corp" solo en el pie.`

export const marketingTools = {
    brevo_resumen: tool({
        description:
            'Listas de contactos de Brevo con su número de suscriptores (leads del asistente, lista de espera de Wapalink y newsletter Aprende con Jami). Úsala para "¿cuántos suscriptores tengo?", "¿cómo va la lista?".',
        inputSchema: z.object({}),
        execute: async () =>
            run(async () => {
                const r = await brevo<{ lists: { id: number; name: string; totalSubscribers: number; totalBlacklisted: number }[] }>('/contacts/lists?limit=50')
                return r.lists.map((l) => ({ id: l.id, nombre: l.name, suscriptores: l.totalSubscribers, dados_de_baja: l.totalBlacklisted }))
            }),
    }),

    brevo_campanas: tool({
        description:
            'Últimas campañas de correo de Brevo (boletines enviados o en borrador) con aperturas y clics. Úsala para "¿cómo fue el último boletín?", "¿qué ediciones hay en borrador?".',
        inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional().describe('Cuántas campañas traer (por defecto 5)') }),
        execute: async ({ limit }) =>
            run(async () => {
                const r = await brevo<{ campaigns: Record<string, unknown>[] }>(`/emailCampaigns?limit=${limit ?? 5}&sort=desc`)
                return (r.campaigns ?? []).map((c) => {
                    const stats = (c.statistics as { globalStats?: Record<string, number> } | undefined)?.globalStats ?? {}
                    return {
                        id: c.id,
                        nombre: c.name,
                        asunto: c.subject,
                        estado: c.status,
                        enviada: c.sentDate ?? null,
                        enviados: stats.sent ?? 0,
                        entregados: stats.delivered ?? 0,
                        aperturas: stats.uniqueViews ?? 0,
                        clics: stats.uniqueClicks ?? 0,
                        bajas: stats.unsubscriptions ?? 0,
                    }
                })
            }),
    }),

    leads_web: tool({
        description:
            'Leads que llegaron por la web de JAM Tech (regalo de mensajes de Jami, newsletter, lista de espera de Wapalink) en los últimos días, con negocio y rubro. Úsala para "¿quién llegó por la web?", "¿hay leads nuevos del regalo?".',
        inputSchema: z.object({ dias: z.number().int().min(1).max(90).optional().describe('Ventana en días (por defecto 14)') }),
        execute: async ({ dias }) =>
            run(async () => {
                const desde = new Date(Date.now() - (dias ?? 14) * 86_400_000).toISOString()
                const { data, error } = await supabase
                    .schema('public')
                    .from('leads')
                    .select('nombre, negocio, rubro, whatsapp, source, wapalink_waitlist, newsletter, created_at')
                    .gte('created_at', desde)
                    .order('created_at', { ascending: false })
                    .limit(50)
                if (error) throw new Error(error.message)
                return (data ?? []).map((l) => ({
                    nombre: l.nombre,
                    negocio: l.negocio,
                    rubro: l.rubro,
                    whatsapp: l.whatsapp,
                    origen: l.source,
                    lista_espera_wapalink: l.wapalink_waitlist,
                    newsletter: l.newsletter,
                    fecha: l.created_at,
                }))
            }),
    }),

    redactar_boletin: tool({
        description:
            'Redacta un BORRADOR completo de la próxima edición del boletín "Aprende con Jami" investigando noticias recientes en la web. Tarda hasta un minuto. No envía ni guarda nada: devuelve el texto para que el usuario lo revise. Úsala para "redacta el boletín", "prepara la edición de la quincena", "¿qué noticias pongo?".',
        inputSchema: z.object({
            tema: z.string().optional().describe('Tema o enfoque que pidió el usuario (opcional)'),
            numero: z.number().int().optional().describe('Número de edición si el usuario lo dijo (opcional)'),
        }),
        execute: async ({ tema, numero }) =>
            run(async () => {
                const anthropic = anthropicProvider()
                const { text, sources } = await generateText({
                    model: anthropic(modeloRutinas()),
                    system: `Eres Jami, la redactora del boletín de JAM Tech. ${REGLAS_BOLETIN}\nBusca en la web noticias de las últimas 3 semanas antes de escribir. Devuelve el boletín listo para pegar en Brevo, en markdown ligero, con el asunto propuesto en la primera línea ("Asunto: ...").`,
                    prompt: `Redacta la edición${numero ? ` #${numero}` : ''} del boletín.${tema ? ` Enfoque pedido por el dueño: ${tema}.` : ''} Fecha de hoy: ${new Date().toISOString().slice(0, 10)}.`,
                    tools: { web_search: anthropic.tools.webSearch_20260209({ maxUses: 6 }) },
                    providerOptions: { anthropic: { effort: 'medium' } },
                    maxOutputTokens: 4000,
                })
                return {
                    borrador: text,
                    fuentes: (sources ?? []).filter((s) => s.sourceType === 'url').map((s) => ({ titulo: s.title ?? '', url: s.url })),
                    nota: 'Es un borrador: revisa cifras y enlaces antes de pegarlo en Brevo.',
                }
            }),
    }),
}

export type MarketingTools = typeof marketingTools
