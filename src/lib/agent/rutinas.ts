/**
 * Rutinas automáticas de cada departamento. Corren por cron (sin nadie delante), así
 * que SOLO leen: revisan su área, detectan lo que necesita atención y redactan un
 * informe corto con propuestas. Las acciones las decide el dueño respondiendo al
 * informe en Telegram o en el chat, donde cada escritura pasa por confirmación.
 */
import { generateText, stepCountIs } from 'ai'
import { agentTools } from './tools'
import { marketingTools } from './tools-marketing'
import { seoTools } from './tools-seo'
import { modeloPara } from './modelo'
import { registrarEvento } from './eventos'
import { DEPARTAMENTOS, isWriteTool, type Departamento } from './shared'
import { todayISO } from '@/lib/actions/validation'
import { supabase } from '@/lib/supabase'

const todas = { ...agentTools, ...marketingTools, ...seoTools } as Record<string, unknown>

/** Qué revisa cada departamento y con qué herramientas (todas de lectura). */
const RUTINAS: Record<Departamento, { herramientas: string[]; encargo: string }> = {
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
}

export async function correrRutina(dep: Departamento): Promise<{ informe: string; herramientas_usadas: string[] }> {
    const cfg = RUTINAS[dep]
    const info = DEPARTAMENTOS[dep]
    const tools = Object.fromEntries(cfg.herramientas.filter((t) => t in todas && !isWriteTool(t)).map((t) => [t, todas[t]])) as Record<string, never>
    const { model, providerOptions } = modeloPara('rutinas')
    const usadas: string[] = []
    // Finanzas compara el mes con la meta de Ajustes; el resto no la necesita.
    const meta = dep === 'finanzas' ? (await supabase.from('company_settings').select('monthly_goal').limit(1).maybeSingle()).data?.monthly_goal : null
    const contexto = meta ? `\nMETA MENSUAL DE FACTURACIÓN: $${Number(meta).toFixed(2)} USD.` : ''

    await registrarEvento({ departamento: dep, tipo: 'rutina', titulo: `Revisión automática de ${info.nombre}`, estado: 'en_curso', fuente: 'cron' })
    try {
        const { text } = await generateText({
            model,
            providerOptions,
            system: `Eres el departamento de ${info.nombre} de JAM Tech (${info.descripcion}). Trabajas para el dueño, José. Fecha de hoy: ${todayISO()}.${contexto}
Redacta un informe breve en markdown ligero para Telegram: título "${info.emoji} ${info.nombre}", luego viñetas con guion, **negritas** solo en montos, nombres y fechas, sin tablas. Si no hay nada que amerite atención, responde exactamente "SIN_NOVEDADES". No inventes datos: todo sale de las herramientas. No prometas que harás algo: solo propón, el dueño decide.`,
            prompt: cfg.encargo,
            tools,
            stopWhen: stepCountIs(6),
            maxOutputTokens: 1500,
            onStepFinish: ({ toolCalls }) => { for (const c of toolCalls) usadas.push(c.toolName) },
        })
        const informe = text.trim()
        await registrarEvento({
            departamento: dep, tipo: 'rutina', titulo: `Informe de ${info.nombre}`, estado: 'hecho', fuente: 'cron',
            detalle: { informe: informe.slice(0, 4000), herramientas: usadas },
        })
        return { informe, herramientas_usadas: usadas }
    } catch (e) {
        await registrarEvento({ departamento: dep, tipo: 'rutina', titulo: `Falló la revisión de ${info.nombre}`, estado: 'error', fuente: 'cron', detalle: { error: e instanceof Error ? e.message : String(e) } })
        throw e
    }
}

export const DEPARTAMENTOS_CON_RUTINA = Object.keys(RUTINAS) as Departamento[]
