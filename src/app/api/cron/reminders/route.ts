import { NextRequest, NextResponse } from 'next/server'
import { claimDueReminders, formatReminderTime } from '@/lib/actions/reminders'
import { sendMessage } from '@/lib/telegram/api'
import { mdToTelegramHtml } from '@/lib/telegram/format'
import { appendAssistantMessage } from '@/lib/telegram/session'

export const dynamic = 'force-dynamic'

/** Si el aviso sale con más retraso que esto (cron caído, deploy), se dice para cuándo era. */
const LATE_AFTER_MS = 15 * 60000

/**
 * Manda los recordatorios cuya hora ya llegó. Lo dispara un Schedule Job de
 * Dokploy cada 5 minutos; si no hay nada que mandar, no hace nada.
 *
 * Protegido con CRON_SECRET, igual que /api/cron/checkin.
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

    try {
        const now = new Date()
        const due = await claimDueReminders(now)
        let sent = 0
        let skipped = 0
        for (const r of due) {
            // La tarea ya se hizo antes de la hora: el aviso sobra.
            if (r.tasks?.status === 'done') {
                skipped++
                continue
            }
            const late = now.getTime() - new Date(r.remind_at).getTime() > LATE_AFTER_MS
            const lines = [`⏰ **Recordatorio**: ${r.text}`]
            if (r.tasks && r.tasks.title !== r.text) lines.push(`Tarea: ${r.tasks.title}`)
            if (late) lines.push(`(era para el ${formatReminderTime(r.remind_at)})`)
            const body = lines.join('\n')
            for (const chatId of chatIds) {
                try {
                    await sendMessage(chatId, mdToTelegramHtml(body))
                    await appendAssistantMessage(chatId, `[Recordatorio enviado el ${formatReminderTime(now.toISOString())}]\n\n${body}`).catch((e) =>
                        console.warn('[cron/reminders] no se pudo guardar en la conversación', e)
                    )
                    sent++
                } catch (e) {
                    console.error('[cron/reminders] no se pudo mandar', r.id, e)
                }
            }
        }
        return NextResponse.json({ ok: true, due: due.length, sent, skipped })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[cron/reminders]', message)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
