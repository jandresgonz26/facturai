import { NextRequest, NextResponse } from 'next/server'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import { DEPARTAMENTOS_CON_RUTINA, correrRutina } from '@/lib/agent/rutinas'
import { sendMessage } from '@/lib/telegram/api'
import { mdToTelegramHtml } from '@/lib/telegram/format'
import { appendAssistantMessage } from '@/lib/telegram/session'
import { carteraSeo, videoResumenSeo } from '@/lib/agent/tools-seo'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Rutinas de la oficina: cada departamento revisa su área y manda su informe por
 * Telegram. Lo dispara un programador externo (Dokploy) con CRON_SECRET.
 *
 *   POST /api/cron/oficina?dep=ventas        un departamento
 *   POST /api/cron/oficina                   todos, en orden
 *   ...&dry_run=1                            devuelve los informes sin mandarlos
 *
 * El informe se guarda también en la sesión de Telegram como mensaje del asistente,
 * así el dueño puede responder "hazlo" o "mándale el recordatorio a X" y el
 * asistente sabe de qué habla.
 */
export async function POST(req: NextRequest) {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ ok: false, error: 'Falta CRON_SECRET en el servidor' }, { status: 500 })
    if (req.headers.get('x-cron-secret') !== secret) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
    const pedido = req.nextUrl.searchParams.get('dep')
    const deps: Departamento[] = pedido
        ? pedido.split(',').filter((d): d is Departamento => d in DEPARTAMENTOS)
        : DEPARTAMENTOS_CON_RUTINA
    if (deps.length === 0) return NextResponse.json({ ok: false, error: `Departamento desconocido: ${pedido}` }, { status: 400 })

    const chatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
    const resultados: Record<string, { enviado: boolean; informe?: string; error?: string }> = {}

    for (const dep of deps) {
        try {
            const { informe } = await correrRutina(dep, { guardar: !dryRun })
            if (informe === 'SIN_NOVEDADES' || dryRun || chatIds.length === 0) {
                resultados[dep] = { enviado: false, informe }
                continue
            }
            const texto = `[Informe automático de ${DEPARTAMENTOS[dep].nombre}]\n\n${informe}`
            for (const chatId of chatIds) {
                await sendMessage(chatId, mdToTelegramHtml(informe))
                await appendAssistantMessage(chatId, texto)
            }
            resultados[dep] = { enviado: true, informe }
        } catch (e) {
            resultados[dep] = { enviado: false, error: e instanceof Error ? e.message : String(e) }
        }
    }
    // Los lunes, con el informe de SEO, también van los resúmenes en video (aunque el informe no traiga novedades).
    if (deps.includes('seo') && !dryRun && chatIds.length > 0) {
        try { resultados.seo_videos = { enviado: await enviarVideosSeo(chatIds) } } catch (e) { resultados.seo_videos = { enviado: false, error: e instanceof Error ? e.message : String(e) } }
    }
    return NextResponse.json({ ok: true, dry_run: dryRun, resultados })
}

/**
 * Después del informe de SEO: el resumen en video de cada cliente (la plataforma reutiliza el de la semana si ya
 * existe) y un mensaje con los enlaces. Un cliente que falla no impide los demás; el fallo va en el mensaje.
 */
async function enviarVideosSeo(chatIds: string[]): Promise<boolean> {
    let clientes: { slug: string; nombre: string }[]
    try { clientes = (await carteraSeo()).clientes } catch { return false }
    if (clientes.length === 0) return false
    const lineas: string[] = []
    for (const c of clientes) {
        try {
            const v = await videoResumenSeo(c.slug)
            lineas.push(v.enlace ? `• <b>${esc(c.nombre)}</b>: ${esc(v.titular ?? 'resumen')}\n<a href="${esc(v.enlace)}">Ver el video (${esc(v.periodo)})</a>` : `• <b>${esc(c.nombre)}</b>: video listo, sin enlace (falta APP_URL en la plataforma)`)
        } catch (e) {
            lineas.push(`• <b>${esc(c.nombre)}</b>: no se pudo generar el video (${esc(e instanceof Error ? e.message : String(e)).slice(0, 140)})`)
        }
    }
    const html = `🎬 <b>Resúmenes SEO en video de esta semana</b>\n\n${lineas.join('\n\n')}`
    for (const chatId of chatIds) await sendMessage(chatId, html)
    return true
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
