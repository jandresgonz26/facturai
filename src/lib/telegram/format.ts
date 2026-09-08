import type { UIMessage } from 'ai'
import { getToolName, isToolUIPart } from 'ai'
import { describeInput, describeResult, findEmailPreview, num, str, type Rec } from '@/lib/agent/describe'
import { TOOL_LABELS, fmtUsd, isWriteTool } from '@/lib/agent/shared'

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Markdown ligero del asistente → HTML de Telegram. */
export function mdToTelegramHtml(text: string): string {
    const lines = text.split('\n').map((raw) => {
        const line = escapeHtml(raw.replace(/\s+$/, ''))
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
        if (bullet) return `• ${bullet[1]}`
        const heading = line.match(/^#{1,3}\s+(.*)$/)
        if (heading) return `<b>${heading[1]}</b>`
        return line
    })
    return lines
        .join('\n')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

export interface ToolPartLike {
    type: string
    toolCallId: string
    state: string
    input?: unknown
    output?: unknown
    errorText?: string
    approval?: { id: string; approved?: boolean; reason?: string }
}

export function toolParts(message: UIMessage): ToolPartLike[] {
    return message.parts.filter(isToolUIPart).map((p) => ({ ...(p as unknown as ToolPartLike), type: p.type }))
}

export function toolNameOf(part: ToolPartLike): string {
    return getToolName(part as unknown as Parameters<typeof getToolName>[0])
}

interface Snapshot {
    client: { id: string; name: string; currency: string }
    eur_usd_rate: number
    next_invoice_number: string
    pending_logs: { description: string; value_usd: number | null }[]
    pending_total_usd: number
    recurring_services: {
        already_loaded_this_period: { description: string }[]
        to_load: { description: string; amount_usd: number }[]
        to_load_total_usd: number
    }
}

function findSnapshot(parts: ToolPartLike[], clientId?: string): Snapshot | undefined {
    let found: Snapshot | undefined
    for (const p of parts) {
        if (p.type !== 'tool-get_billing_snapshot' || p.state !== 'output-available') continue
        const out = p.output as { ok?: boolean; data?: Snapshot } | undefined
        if (out?.ok && out.data?.client?.id === clientId) found = out.data
    }
    return found
}

/** Tarjeta de confirmación en HTML para Telegram (equivale a la tarjeta del chat web). */
export function renderConfirmation(tool: string, input: unknown, siblings: ToolPartLike[]): string {
    const { title, rows, items, note } = describeInput(tool, input)
    const out: string[] = [`<b>⚠️ Confirmar: ${escapeHtml(title)}</b>`, '']
    const inp = (input ?? {}) as Rec
    const snapshot = tool === 'bill_client_month' ? findSnapshot(siblings, str(inp.client_id)) : undefined
    const emailPreview = tool.startsWith('send_') ? findEmailPreview(siblings, tool, input) : undefined

    if (emailPreview) {
        out.push(`<b>Para:</b> ${escapeHtml(str(inp.to) ?? emailPreview.to ?? '-')}`)
        out.push(`<b>De:</b> ${escapeHtml(emailPreview.from)}`)
        out.push(`<b>Asunto:</b> ${escapeHtml(emailPreview.subject)}`)
        out.push(`<b>Adjunto:</b> ${escapeHtml(emailPreview.attachment_name)}`, '')
        out.push(`<i>${escapeHtml(emailPreview.text.slice(0, 1200))}</i>`)
        if (emailPreview.already_sent) out.push('', `⚠️ Ya se envió el ${emailPreview.already_sent.sent_at.split('T')[0].split('-').reverse().join('/')} a ${escapeHtml(emailPreview.already_sent.to)}. Esto sería un reenvío.`)
        if (emailPreview.test_mode_to) out.push(`ℹ️ Modo prueba: se desviará a ${escapeHtml(emailPreview.test_mode_to)}.`)
    } else if (snapshot) {
        const extras = Array.isArray(inp.extra_items) ? (inp.extra_items as Rec[]) : []
        const rate = snapshot.client.currency === 'EUR' ? snapshot.eur_usd_rate : 1
        const sym = snapshot.client.currency === 'EUR' ? '€' : '$'
        const loadRecurring = !!inp.load_recurring
        const toLoad = loadRecurring ? snapshot.recurring_services.to_load : []
        const extrasUsd = extras.reduce((s, e) => s + (num(e.amount) ?? 0) * rate, 0)
        const total = snapshot.pending_total_usd + (loadRecurring ? snapshot.recurring_services.to_load_total_usd : 0) + extrasUsd
        out.push('<b>Servicios fijos</b>')
        if (toLoad.length) toLoad.forEach((s) => out.push(`• ${escapeHtml(s.description)} — ${fmtUsd(s.amount_usd)}`))
        else out.push(loadRecurring ? (snapshot.recurring_services.already_loaded_this_period.length ? '• Ya cargados este mes' : '• No hay servicios fijos') : '• No se cargarán')
        out.push('', `<b>Pendientes existentes (${snapshot.pending_logs.length})</b>`)
        if (snapshot.pending_logs.length) snapshot.pending_logs.slice(0, 8).forEach((l) => out.push(`• ${escapeHtml(l.description)} — ${fmtUsd(l.value_usd)}`))
        else out.push('• Ninguno')
        if (snapshot.pending_logs.length > 8) out.push(`• … y ${snapshot.pending_logs.length - 8} más`)
        if (extras.length) {
            out.push('', '<b>Ítems nuevos</b>')
            extras.forEach((e) => out.push(`• ${escapeHtml(str(e.description) ?? '')} — ${sym}${(num(e.amount) ?? 0).toFixed(2)}`))
        }
        out.push('', `<b>Total proyectado: ${fmtUsd(total)}</b>`, `Factura Nº ${escapeHtml(str(inp.invoice_number) ?? snapshot.next_invoice_number)}`)
    } else {
        rows.forEach((r) => out.push(`<b>${escapeHtml(r.label)}:</b> ${escapeHtml(r.value)}`))
        if (items?.length) {
            out.push('', '<b>Ítems</b>')
            items.forEach((it) => out.push(`• ${escapeHtml(it)}`))
        }
    }
    if (note) out.push('', `<i>${escapeHtml(note)}</i>`)
    return out.join('\n')
}

export function renderResult(tool: string, part: ToolPartLike): string {
    const label = TOOL_LABELS[tool] ?? tool
    if (part.state === 'output-denied') return `❌ <b>${escapeHtml(label)}</b>: cancelado, sin cambios.`
    if (part.state === 'output-error') return `⚠️ <b>${escapeHtml(label)}</b> falló: ${escapeHtml(part.errorText ?? 'error desconocido')}`
    const out = part.output as { ok: boolean; data?: unknown; error?: string } | undefined
    if (!out?.ok) return `⚠️ <b>${escapeHtml(label)}</b>: no se realizó. ${escapeHtml(out?.error ?? 'Error desconocido')}`
    const { title, lines } = describeResult(tool, out.data)
    return [`✅ <b>${escapeHtml(title)}</b>`, ...lines.map((l) => escapeHtml(l))].join('\n')
}

export function isWritePart(part: ToolPartLike): boolean {
    return isWriteTool(toolNameOf(part))
}
