import type { UIMessage } from 'ai'
import { getToolName, isToolUIPart } from 'ai'
import { describeInput, describeResult, findEmailPreview, num, str, type Rec } from '@/lib/agent/describe'
import { TOOL_LABELS, fmtUsd, isWriteTool } from '@/lib/agent/shared'

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Partes de una idea que van en su propia línea dentro de una viñeta larga («… Primer paso: …»). */
const ETIQUETAS_EN_LINEA = ['Primer paso', 'Siguiente paso', 'Impacto', 'Hecho', 'Hechos', 'Hipótesis', 'Mi hipótesis', 'Mi lectura', 'Evidencia', 'Dato de mercado', 'Acción', 'Propuesta', 'Por qué', 'Riesgo', 'Recomendación', 'Fuente']
const SALTO_ETIQUETA = new RegExp(`(?<=[.!?)])\\s+(?=(?:${ETIQUETAS_EN_LINEA.join('|')})\\s*:)`, 'g')
const LARGA = 120

/** Negritas, cursivas, código y enlaces markdown → HTML de Telegram (sobre texto ya escapado). */
function inline(raw: string): string {
    return escapeHtml(raw)
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => `<a href="${u.replace(/"/g, '&quot;')}">${t}</a>`)
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '<i>$1</i>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
}

/** Mensaje listo para enviar entre comillas dentro de una viñeta → cita aparte, fácil de copiar. */
const citas = (html: string) => html.replace(/[:\s]*[“"«]([^"”»]{80,})[”"»]\.?/g, (_, t: string) => `\n<blockquote>${t.trim()}</blockquote>`)

type Linea =
    | { tipo: 'titulo'; html: string }
    | { tipo: 'vineta'; nivel: 0 | 1; ordinal: string | null; raw: string }
    | { tipo: 'cita'; html: string }
    | { tipo: 'texto'; html: string }
    | { tipo: 'blanco' }

function clasificar(raw: string): Linea {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim() || /^\s*([-*_])\1{2,}\s*$/.test(line)) return { tipo: 'blanco' }
    const h = /^#{1,4}\s+(.*)$/.exec(line) ?? /^\s*\*\*([^*]+)\*\*:?\s*$/.exec(line)
    if (h) return { tipo: 'titulo', html: `<b>${inline(h[1].replace(/\*\*/g, ''))}</b>` }
    const q = /^\s*>\s?(.*)$/.exec(line)
    if (q) return { tipo: 'cita', html: inline(q[1]) }
    const v = /^(\s*)(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(line)
    if (v) return { tipo: 'vineta', nivel: v[1].replace(/\t/g, '  ').length >= 2 ? 1 : 0, ordinal: v[3] ?? null, raw: v[4] }
    return { tipo: 'texto', html: inline(line) }
}

/**
 * Viñeta principal: si es larga y empieza por «**Etiqueta:**», la etiqueta va sola en su línea y el resto debajo;
 * «Impacto:», «Primer paso:»… pasan a su propia línea con →; un mensaje listo para enviar va como cita.
 */
function vineta(raw: string, ordinal: string | null, densa: boolean): string {
    const marca = ordinal ? `${ordinal}.` : '•'
    const m = /^\*\*([^*]{2,80}?):?\*\*:?\s+(.+)$/.exec(raw)
    // En un mensaje con viñetas largas, todas las que tienen etiqueta se parten igual, para que la lista sea pareja.
    const larga = raw.length > LARGA || densa
    const cuerpo = (t: string) => citas(inline(t.replace(SALTO_ETIQUETA, '\n'))).replace(/^\n+/, '')
        .split('\n').map((l, i) => (i === 0 || l.startsWith('<blockquote>') ? l : `→ ${l}`)).join('\n')
    if (m && larga) {
        const resto = m[2].replace(/^\p{Ll}/u, (c) => c.toUpperCase()) // «la factura…» → «La factura…»
        return `${marca} <b>${inline(m[1].replace(/[.:]$/, ''))}</b>\n${cuerpo(resto)}`
    }
    return `${marca} ${cuerpo(raw)}`
}

const ES_ACCION = new RegExp(`^(?:${ETIQUETAS_EN_LINEA.join('|')})\\s*:`)

/** Sub-viñeta: «Primer paso: …» con flecha, un mensaje para el cliente («> …») como cita, el resto con ◦. */
function subvineta(raw: string): string {
    const cita = /^>\s?(.*)$/.exec(raw)
    if (cita) return `<blockquote>${inline(cita[1])}</blockquote>`
    return `    ${ES_ACCION.test(raw) ? '→' : '◦'} ${citas(inline(raw))}`
}

/**
 * Markdown ligero del asistente → HTML de Telegram, pensado para leerse en el teléfono: títulos con aire, viñetas
 * largas separadas por una línea en blanco, sub-viñetas con sangría, enlaces y citas.
 */
export function mdToTelegramHtml(text: string): string {
    const lineas = text.replace(/\r/g, '').split('\n').map(clasificar)
    // Una lista es «densa» si alguna viñeta principal es larga: entonces cada viñeta lleva aire alrededor.
    const densa = lineas.some((l) => l.tipo === 'vineta' && l.nivel === 0 && l.raw.length > LARGA)
    const out: string[] = []
    let cita: string[] = []
    const cerrarCita = () => { if (cita.length) { out.push(`<blockquote>${cita.join('\n')}</blockquote>`); cita = [] } }
    const aire = () => { if (out.length && out[out.length - 1] !== '') out.push('') }
    // La primera línea corta que empieza por emoji es el título del informe («🧭 Dirección»): en negrita.
    const i0 = lineas.findIndex((l) => l.tipo !== 'blanco')
    const l0 = lineas[i0]
    if (l0?.tipo === 'texto' && l0.html.length <= 60 && !l0.html.includes('<b>') && /^\p{Extended_Pictographic}/u.test(l0.html)) lineas[i0] = { tipo: 'titulo', html: `<b>${l0.html}</b>` }
    let previa: Linea['tipo'] | null = null
    for (const l of lineas) {
        if (l.tipo !== 'cita') cerrarCita()
        switch (l.tipo) {
            case 'blanco': aire(); break
            case 'titulo': aire(); out.push(l.html); break
            case 'cita': cita.push(l.html); break
            case 'texto': if (previa === 'vineta') aire(); out.push(l.html); break
            case 'vineta':
                if (l.nivel === 1) { out.push(subvineta(l.raw)); break }
                if (densa && previa === 'vineta') aire()
                out.push(vineta(l.raw, l.ordinal, densa))
                break
        }
        if (l.tipo !== 'blanco') previa = l.tipo
    }
    cerrarCita()
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Texto plano de respaldo si Telegram rechaza el HTML (una etiqueta mal cerrada no debe perder el mensaje). */
export function htmlATexto(html: string): string {
    return html.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, '$2 ($1)').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
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
