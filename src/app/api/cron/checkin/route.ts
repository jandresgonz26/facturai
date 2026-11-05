import { NextRequest, NextResponse } from 'next/server'
import { momentFor } from '@/lib/actions/assistant-checkin'
import { pruneExpiredEmailBodies } from '@/lib/actions/inbox'
import { retomarAtascados } from '@/lib/agent/encargos'
import { avisarCambios } from '@/lib/agent/checklist'
import { armarParte, botonesDeParte, esLunes, lineaVideosSeo, parteYaEnviadoHoy, registrarParte } from '@/lib/agent/parte'
import { sendMessage } from '@/lib/telegram/api'
import { mdToTelegramHtml } from '@/lib/telegram/format'
import { appendAssistantMessage } from '@/lib/telegram/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * El parte del día: UN mensaje por la mañana con lo nuevo de toda la empresa (ver lib/agent/parte.ts). Lo dispara
 * un Schedule Job de Dokploy a las 7:30. Si lo llaman más de una vez en la mañana, solo sale el primero; a mediodía
 * y por la noche ya no se manda nada (lo urgente va por su lado: recordatorios y avisos del Seguimiento de Tareas).
 *
 *   POST /api/cron/checkin              manda el parte (si es por la mañana y no ha salido hoy)
 *   ...?dry_run=1                       lo arma y lo devuelve sin mandarlo ni marcar nada como dicho
 *   ...?forzar=1                        lo manda aunque ya haya salido hoy o no sea por la mañana
 *
 * Protegido con CRON_SECRET.
 */
export async function POST(req: NextRequest) {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ ok: false, error: 'Falta CRON_SECRET en el servidor' }, { status: 500 })
    if (req.headers.get('x-cron-secret') !== secret) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

    const chatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (chatIds.length === 0) return NextResponse.json({ ok: false, error: 'No hay chat de Telegram configurado' }, { status: 500 })

    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
    const forzar = req.nextUrl.searchParams.get('forzar') === '1'
    const now = new Date()

    // Mantenimiento: si falla, no debe impedir el parte.
    if (!dryRun) {
        await pruneExpiredEmailBodies().catch((e) => console.warn('[cron/checkin] no se pudo limpiar cuerpos vencidos', e))
        await retomarAtascados().catch((e) => console.error('[cron/checkin] retomar encargos', e))
        await avisarCambios().catch((e) => console.error('[cron/checkin] avisos del checklist', e))
    }

    if (!dryRun && !forzar) {
        if (momentFor(now) !== 'morning') return NextResponse.json({ ok: true, sent: false, reason: 'solo hay parte por la mañana' })
        if (await parteYaEnviadoHoy(now)) return NextResponse.json({ ok: true, sent: false, reason: 'el parte de hoy ya salió' })
    }

    try {
        const parte = await armarParte(now, { guardar: !dryRun })
        const videos = !dryRun && esLunes(now) ? await lineaVideosSeo().catch(() => null) : null
        if (dryRun || (!parte.texto && !videos)) {
            // Sin nada nuevo se deja constancia (así no se vuelve a armar esta mañana), salvo que alguna rutina haya
            // fallado: entonces la siguiente llamada de la mañana lo reintenta.
            if (!dryRun && Object.keys(parte.errores).length === 0) await registrarParte(parte, now)
            return NextResponse.json({
                ok: true, sent: false, dry_run: dryRun, reason: parte.texto ? undefined : 'nada nuevo que contar',
                texto: parte.texto, resto: parte.resto, callados: parte.callados, items: parte.items, errores: parte.errores,
                ...(dryRun ? { informes: parte.informes } : {}),
            })
        }

        const botones = await botonesDeParte(parte.items).catch((e) => { console.error('[cron/checkin] botones del parte', e); return [] })
        const markup = botones.length ? { inline_keyboard: botones.map((b) => [{ text: `▶️ ${b.etiqueta}`, callback_data: `acc:${b.id}` }]) } : undefined
        const html = [parte.texto ? mdToTelegramHtml(parte.texto) : null, videos].filter(Boolean).join('\n\n')
        // En la conversación del bot va también lo que no cupo, para que pueda responder «¿qué más hay?».
        const memoria = [`[Parte del día enviado automáticamente]`, parte.texto ?? '', parte.resto.length ? `No cupo en el mensaje:\n${parte.resto.map((l) => `- ${l}`).join('\n')}` : ''].filter(Boolean).join('\n\n')
        for (const chatId of chatIds) {
            await sendMessage(chatId, html, markup)
            await appendAssistantMessage(chatId, memoria).catch((e) => console.warn('[cron/checkin] no se pudo guardar el parte en la conversación', e))
        }
        await registrarParte(parte, now)
        return NextResponse.json({ ok: true, sent: true, items: parte.items.length, resto: parte.resto.length, callados: parte.callados, errores: parte.errores })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[cron/checkin]', message)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
