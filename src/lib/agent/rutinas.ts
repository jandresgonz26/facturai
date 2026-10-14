/**
 * Rutinas automáticas de cada departamento. Corren por cron (sin nadie delante), así
 * que SOLO leen: revisan su área, detectan lo que necesita atención y redactan un
 * informe corto con propuestas. Las acciones las decide el dueño respondiendo al
 * informe en Telegram o en el chat, donde cada escritura pasa por confirmación.
 */
import { generateObject, generateText, stepCountIs } from 'ai'
import { z } from 'zod'
import { guardarConsejos } from './tools-direccion'
import { memoriaParaPrompt } from './tools-memoria'
import { cerebroParaPrompt } from './cerebro'
import { herramientasPara } from './caja'
import type { Alcance } from './proyectos'
import { anthropicProvider, modeloPara, proveedorActivo } from './modelo'
import { registrarEvento } from './eventos'
import { DEPARTAMENTOS, isWriteTool, type Departamento } from './shared'
import { todayISO } from '@/lib/actions/validation'
import { supabase } from '@/lib/supabase'

/**
 * Solo las herramientas de LECTURA de la lista (las de escritura se descartan siempre), más la búsqueda web
 * nativa de Claude si se pide. Lo comparten las rutinas (que miran todos los proyectos) y las tareas guiadas
 * (que miran el suyo), que corren sin confirmación.
 */
export function herramientasLectura(nombres: string[], web = false, alcance: Alcance = 'todos'): Record<string, never> {
    const todas = herramientasPara(alcance === 'todos' ? null : alcance, alcance) as Record<string, unknown>
    const tools = Object.fromEntries([...new Set(nombres)].filter((t) => t in todas && !isWriteTool(t)).map((t) => [t, todas[t]])) as Record<string, unknown>
    if (web && proveedorActivo() === 'anthropic') tools.web_search = anthropicProvider().tools.webSearch_20260209({ maxUses: 4 })
    return tools as Record<string, never>
}

/** Contexto inicial de la empresa: con él se sembró la sección «Quiénes somos» del cerebro (schema_update_procesos.sql). */
export const EMPRESA = `JAM Tech Corp (marca "JAM Tech") es una agencia de software y marketing de Puerto Ordaz, Venezuela, dirigida por José González (pronto con una socia). Líneas de negocio: desarrollo web y de apps; SEO para clientes con una plataforma propia; automatización e IA para pequeños negocios (asistente Jami, regalo de mensajes de WhatsApp y boletín "Aprende con Jami"); Wapalink, su producto de asistente de IA para WhatsApp (en lista de espera); y comisiones como Hostinger Partner (20 % en ventas nuevas). Clientes: sobre todo pequeños negocios de Venezuela y Latinoamérica; cobra en USD y EUR.`

type Rutina = {
    herramientas: string[]
    encargo: string
    /** Dirección razona con el modelo del chat (el más capaz) y puede buscar en la web. */
    modelo?: 'chat' | 'rutinas'
    web?: boolean
    maxTokens?: number
    pasos?: number
    /** Qué hacer con el informe ya escrito (Dirección guarda sus consejos). */
    despues?: (informe: string) => Promise<unknown>
}

/** Qué revisa cada departamento y con qué herramientas (todas de lectura). */
const RUTINAS: Record<Departamento, Rutina> = {
    ventas: {
        herramientas: ['list_pipeline', 'get_client_timeline', 'list_quotes', 'list_client_notes', 'leads_web', 'list_tasks'],
        encargo: `Revisa el pipeline comercial:
- Leads y cotizados con next_action vencida o sin próxima acción.
- Cotizaciones pendientes de respuesta desde hace más de 5 días.
- Leads nuevos que llegaron por la web (leads_web) y todavía no tienen seguimiento.
Para cada caso propone UNA acción concreta (un mensaje de seguimiento listo para enviar por WhatsApp, pasar a inactivo, etc.). Máximo 5 puntos.`,
    },
    finanzas: {
        herramientas: ['get_briefing', 'get_revenue_summary', 'list_invoices', 'get_pending_logs', 'list_pipeline'],
        encargo: `Revisa el dinero:
- Facturas enviadas y vencidas sin pagar (quién, cuánto, desde cuándo) y un recordatorio de cobro listo para enviar.
- Trabajo registrado sin facturar que ya debería facturarse.
- Servicios fijos del mes sin cargar.
- Cómo va el mes frente a la meta mensual.
Cifras exactas, en USD con dos decimales. Máximo 5 puntos.`,
    },
    operaciones: {
        herramientas: ['get_day_plan', 'list_tasks', 'list_reminders', 'list_inbox_items', 'list_active_alerts'],
        encargo: `Revisa la carga de trabajo:
- Tareas arrastradas (carried_over) y las que lleven más de dos semanas sin planificarse.
- Correos de personas reales que parecen esperar respuesta (ignora notificaciones automáticas).
- Si el plan de hoy se pasa de la capacidad.
Propón qué hacer hoy, qué partir y qué soltar. Máximo 5 puntos.`,
    },
    marketing: {
        herramientas: ['brevo_resumen', 'brevo_campanas', 'leads_web'],
        encargo: `Revisa el marketing:
- Cómo crecieron las listas de Brevo y qué trajo la web (leads del regalo de Jami, newsletter, lista de espera).
- Resultado del último boletín (aperturas y clics) y si toca preparar la próxima edición (sale cada 15 días, los martes).
Propón una acción concreta (por ejemplo, "redactar la edición #N" o "reenviar a quienes no abrieron"). Máximo 4 puntos.`,
    },
    seo: {
        herramientas: ['seo_cartera', 'seo_cliente'],
        encargo: `Revisa el SEO de los clientes de la agencia (seo_cartera; abre seo_cliente solo para los que lo ameriten):
- Clientes con caída de clics de más de 15 % frente al mes anterior: qué consultas o páginas explican la caída.
- Alertas activas, sobre todo las de posible hackeo o spam (son urgentes).
- Reportes del mes todavía pendientes o en borrador.
- Recomendaciones de prioridad alta que siguen abiertas.
Para cada caso propone UNA acción concreta. Si un reporte ya está enviado y tiene enlace público, ofrece un mensaje corto de WhatsApp para mandárselo al cliente. Máximo 5 puntos.`,
    },
    direccion: {
        herramientas: ['panorama_empresa', 'consejos_direccion', 'seo_cartera', 'brevo_resumen', 'leads_web', 'list_pipeline'],
        modelo: 'chat', web: true, maxTokens: 4000, pasos: 12,
        encargo: `Haz la revisión semanal de TODA la empresa como su director y consejero (quién es la empresa, su oferta y sus metas están en el CEREBRO DE LA EMPRESA).

Empieza siempre con panorama_empresa y consejos_direccion; usa las demás herramientas solo si aportan. Busca en la web solo para validar una oportunidad de mercado concreta (tendencias, precios o demanda en Venezuela y Latinoamérica) y cita la fuente con su enlace.

Entrega exactamente, en este orden:
- Una línea de cómo va el mes frente a la meta (cifras de panorama_empresa).
- **Oportunidades**: 3 formas concretas de ganar más dinero o escalar, cada una con el impacto esperado y el primer paso de esta semana.
- **Riesgos**: 3 riesgos o fallos de la empresa con su evidencia en cifras (dependencia de un cliente, cobros, recurrencia baja, pipeline vacío, sobrecarga…).
- **Decisión de la semana**: 1 decisión que José debe tomar, con tu recomendación y por qué.
- **Planes**: una línea por plan activo (planes_listar): en qué paso va y si va a tiempo. Si el cerebro de la empresa tiene secciones vacías, recuerda en una línea cuál completar.

Reglas: sé franco, sin suavizar. Separa los hechos (cifras de las herramientas) de tus hipótesis. Si un consejo anterior sigue "propuesta" desde hace más de dos semanas, recuérdalo en vez de inventar uno nuevo parecido; no repitas los "descartada". Nunca recomiendes ni menciones competidores de Wapalink ni de JAM Tech. Máximo 350 palabras.`,
        despues: async (informe) => {
            // Un segundo paso, barato, extrae los consejos del informe para guardarlos y seguirlos.
            const { model, providerOptions } = modeloPara('rutinas')
            const { object } = await generateObject({
                model, providerOptions,
                schema: z.object({
                    consejos: z.array(z.object({
                        tipo: z.enum(['oportunidad', 'riesgo', 'decision']),
                        titulo: z.string().describe('Máximo 12 palabras'),
                        detalle: z.string().describe('El consejo completo tal como aparece en el informe, con su primer paso o evidencia'),
                        impacto: z.enum(['alto', 'medio', 'bajo']),
                    })),
                }),
                prompt: `Extrae del informe de Dirección cada oportunidad, cada riesgo y la decisión de la semana, sin inventar nada que no esté en el texto.\n\nINFORME:\n${informe}`,
            })
            return guardarConsejos(object.consejos.slice(0, 7))
        },
    },
}

/** `guardar: false` (prueba con dry_run): el informe se escribe pero no se guarda nada derivado (consejos de Dirección). */
export async function correrRutina(dep: Departamento, opts: { guardar?: boolean } = {}): Promise<{ informe: string; herramientas_usadas: string[] }> {
    const cfg = RUTINAS[dep]
    const info = DEPARTAMENTOS[dep]
    // Todas las rutinas revisan además sus objetivos (roadmap) y los pasos de los planes que les tocan.
    // Búsqueda web nativa de Claude solo para las rutinas que la piden (Dirección) y con proveedor Anthropic.
    const tools = herramientasLectura([...cfg.herramientas, 'objetivos_listar', 'planes_listar', 'encargos_listar'], cfg.web)
    const { model, providerOptions } = modeloPara(cfg.modelo ?? 'rutinas')
    const usadas: string[] = []
    // Finanzas compara el mes con la meta de Ajustes; el resto no la necesita.
    const meta = dep === 'finanzas' ? (await supabase.from('company_settings').select('monthly_goal').limit(1).maybeSingle()).data?.monthly_goal : null
    const contexto = meta ? `\nMETA MENSUAL DE FACTURACIÓN: $${Number(meta).toFixed(2)} USD.` : ''

    const [memoria, cerebro] = await Promise.all([memoriaParaPrompt(dep), cerebroParaPrompt()])
    await registrarEvento({ departamento: dep, tipo: 'rutina', titulo: `Revisión automática de ${info.nombre}`, estado: 'en_curso', fuente: 'cron' })
    try {
        const { text } = await generateText({
            model,
            providerOptions,
            system: `Eres ${info.persona}, del departamento de ${info.nombre} de JAM Tech (${info.descripcion}). Trabajas para el dueño, José. Fecha de hoy: ${todayISO()}.${contexto}
Redacta un informe breve en markdown ligero. José lo lee en Telegram, en el teléfono: tiene que entenderse de un vistazo.
FORMATO:
- Primera línea: "${info.emoji} ${info.persona} · ${info.nombre}".
- Si hay más de 3 puntos, agrúpalos con un subtítulo corto en negrita en su propia línea (**Cobros**, **Ventas**…).
- Cada punto es una viñeta "- **Etiqueta corta:** …" con 1 o 2 frases cortas (máximo unas 30 palabras). Los detalles van en sub-viñetas con dos espacios delante ("  - …"), no en frases encadenadas.
- Lo que propones hacer va en una frase aparte que empieza por "Primer paso:"; usa también "Impacto:" o "Hecho:" cuando aporten.
- Un mensaje listo para enviar a un cliente va en una línea propia que empieza por "> ".
- Negrita solo en la etiqueta de cada punto y, como mucho, en una cifra clave; no pongas en negrita todas las cifras ni los nombres.
- Montos con punto de miles y coma decimal ($1.851,88; €95,00), porcentajes con un decimal (33,7 %) y fechas como "5 oct" (nunca 2026-10-05). Sin tablas ni líneas "---".
Si no hay nada que amerite atención, responde exactamente "SIN_NOVEDADES". No inventes datos: todo sale de las herramientas. No prometas que harás algo: solo propón, el dueño decide.
Si tienes objetivos activos (objetivos_listar con departamento ${dep}), cierra con una línea **Objetivos:** que diga cómo va cada uno frente a su fecha y el siguiente paso.
Empieza por tus encargos (encargos_listar con departamento ${dep}): si alguno espera una respuesta de José, recuérdalo arriba del todo con su pregunta.
Si tienes pasos de planes pendientes (planes_listar con departamento ${dep}), añade una línea **Planes:** con el paso que te toca ahora y su fecha; si ya venció, dilo.${cerebro}${memoria}`,
            prompt: cfg.encargo,
            tools,
            stopWhen: stepCountIs(cfg.pasos ?? 6),
            maxOutputTokens: cfg.maxTokens ?? 1500,
            onStepFinish: ({ toolCalls }) => { for (const c of toolCalls) usadas.push(c.toolName) },
        })
        const informe = text.trim()
        let guardados: unknown = null
        if (cfg.despues && informe !== 'SIN_NOVEDADES' && opts.guardar !== false) {
            try { guardados = await cfg.despues(informe) } catch (e) { console.error(`[rutina ${dep}] después del informe`, e) }
        }
        await registrarEvento({
            departamento: dep, tipo: 'rutina', titulo: `Informe de ${info.nombre}`, estado: 'hecho', fuente: 'cron',
            detalle: { informe: informe.slice(0, 4000), herramientas: usadas, ...(guardados !== null ? { guardados } : {}) },
        })
        return { informe, herramientas_usadas: usadas }
    } catch (e) {
        await registrarEvento({ departamento: dep, tipo: 'rutina', titulo: `Falló la revisión de ${info.nombre}`, estado: 'error', fuente: 'cron', detalle: { error: e instanceof Error ? e.message : String(e) } })
        throw e
    }
}

export const DEPARTAMENTOS_CON_RUTINA = Object.keys(RUTINAS) as Departamento[]

/**
 * Botones del informe en Telegram: hasta 3 acciones concretas que el informe propone, cada una con el pedido
 * completo que se le hará al asistente al tocarla (como si José lo escribiera). El botón solo lleva el id.
 */
export async function accionesDeInforme(dep: Departamento, informe: string): Promise<{ id: string; etiqueta: string }[]> {
    const { model, providerOptions } = modeloPara('rutinas')
    const { object } = await generateObject({
        model, providerOptions,
        schema: z.object({
            acciones: z.array(z.object({
                etiqueta: z.string().describe('Texto del botón, máximo 24 caracteres, empieza con verbo: «Enviar recordatorio», «Crear la tarea»'),
                pedido: z.string().describe('Lo que José le pediría al asistente para hacerlo, completo y autoexplicativo, con nombres, números de factura y montos tal como aparecen en el informe'),
            })).describe('Entre 0 y 3 acciones, solo las que el informe propone de forma concreta; vacío si no propone ninguna'),
        }),
        prompt: `Del informe de ${DEPARTAMENTOS[dep].persona} (${DEPARTAMENTOS[dep].nombre}), extrae las acciones concretas que propone y que el asistente puede ejecutar o preparar (enviar un recordatorio, crear una tarea, preparar una propuesta, revisar un cliente…). No inventes nada que no esté en el texto.\n\nINFORME:\n${informe}`,
    })
    const acciones = object.acciones.filter((a) => a.etiqueta.trim() && a.pedido.trim()).slice(0, 3)
    if (acciones.length === 0) return []
    const { data, error } = await supabase.from('telegram_acciones').insert(acciones.map((a) => ({
        departamento: dep, etiqueta: a.etiqueta.trim().slice(0, 32), pedido: a.pedido.trim().slice(0, 1500),
    }))).select('id, etiqueta')
    if (error) throw new Error(error.message)
    return (data ?? []) as { id: string; etiqueta: string }[]
}
