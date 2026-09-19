import { NextRequest, NextResponse } from 'next/server'
import { buildCheckin, recordCheckin } from '@/lib/actions/assistant-checkin'
import { buildMorningEmailDigest } from '@/lib/actions/email-digest'
import { pruneExpiredEmailBodies } from '@/lib/actions/inbox'
import { USER_TIMEZONE } from '@/lib/actions/validation'
import { sendMessage } from '@/lib/telegram/api'
import { mdToTelegramHtml } from '@/lib/telegram/format'
import { appendAssistantMessage } from '@/lib/telegram/session'

export const dynamic = 'force-dynamic'

/**
 * Aviso proactivo del asistente. Lo dispara un programador externo (workflow de
 * GitHub Actions) varias veces al día; decide por su cuenta si hay algo que
 * merezca interrumpir y, si no lo hay, no manda nada.
 *
 * Protegido con CRON_SECRET para que no lo pueda disparar cualquiera.
 */
export async function POST(req: NextRequest) {
    const secret = process.env.CRON_SECRET
    if (!secret) {
        return NextResponse.json({ ok: false, error: 'Falta CRON_SECRET en el servidor' }, { status: 500 })
    }
    if (req.headers.get('x-cron-secret') !== secret) {
        return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const chatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    if (chatIds.length === 0) {
        return NextResponse.json({ ok: false, error: 'No hay chat de Telegram configurado' }, { status: 500 })
    }

    // dry_run permite probar qué diría sin mandarle nada al usuario.
    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'

    // Mantenimiento aparte del aviso en sí: si falla, no debe impedir que el
    // check-in se mande igual.
    if (!dryRun) {
        await pruneExpiredEmailBodies().catch((e) => console.warn('[cron/checkin] no se pudo limpiar cuerpos vencidos', e))
    }

    try {
        const checkin = await buildCheckin()
        // Por la mañana, además del aviso: qué le escribieron mientras no
        // estaba. Va aparte para no diluirlo entre los pendientes, y se
        // genera solo si hay varios correos (si no, el aviso suelto basta).
        const digest = checkin.moment === 'morning' ? await buildMorningEmailDigest().catch((e) => {
            console.warn('[cron/checkin] no se pudo resumir el correo', e)
            return null
        }) : null
        const digestMessage = digest ? `📬 **Mientras no estabas** · ${digest.thread_count} correos\n\n${digest.text}` : null

        if (!checkin.message && !digestMessage) {
            return NextResponse.json({ ok: true, moment: checkin.moment, sent: false, reason: 'nada que amerite escribir' })
        }
        if (dryRun) {
            return NextResponse.json({
                ok: true,
                moment: checkin.moment,
                sent: false,
                dry_run: true,
                message: checkin.message,
                email_digest: digestMessage,
                items: checkin.items,
            })
        }

        // mdToTelegramHtml escapa el contenido dinámico y convierte las negritas.
        // El aviso se deja además en la conversación del bot: si el usuario
        // responde ("muévelas a mañana", "sí", "la primera"), el asistente tiene
        // que saber a qué está respondiendo. La marca de hora importa porque la
        // respuesta puede llegar al día siguiente.
        const sentAt = new Intl.DateTimeFormat('es-VE', {
            timeZone: USER_TIMEZONE,
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date())
        const toSend = [checkin.message, digestMessage].filter((m): m is string => !!m)
        for (const chatId of chatIds) {
            for (const body of toSend) {
                await sendMessage(chatId, mdToTelegramHtml(body))
                await appendAssistantMessage(chatId, `[Aviso automático enviado el ${sentAt}]\n\n${body}`).catch((e) =>
                    console.warn('[cron/checkin] no se pudo guardar el aviso en la conversación', e)
                )
            }
        }
        await recordCheckin(checkin.items)

        return NextResponse.json({
            ok: true,
            moment: checkin.moment,
            sent: true,
            items: checkin.items.length,
            email_digest_threads: digest?.thread_count ?? 0,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[cron/checkin]', message)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
