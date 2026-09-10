import { NextRequest, NextResponse } from 'next/server'
import { buildCheckin, recordCheckin } from '@/lib/actions/assistant-checkin'
import { sendMessage } from '@/lib/telegram/api'
import { mdToTelegramHtml } from '@/lib/telegram/format'

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

    try {
        const checkin = await buildCheckin()
        if (!checkin.message) {
            return NextResponse.json({ ok: true, moment: checkin.moment, sent: false, reason: 'nada que amerite escribir' })
        }
        if (dryRun) {
            return NextResponse.json({ ok: true, moment: checkin.moment, sent: false, dry_run: true, message: checkin.message, items: checkin.items })
        }

        // mdToTelegramHtml escapa el contenido dinámico y convierte las negritas.
        for (const chatId of chatIds) {
            await sendMessage(chatId, mdToTelegramHtml(checkin.message))
        }
        await recordCheckin(checkin.items)

        return NextResponse.json({ ok: true, moment: checkin.moment, sent: true, items: checkin.items.length })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[cron/checkin]', message)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
