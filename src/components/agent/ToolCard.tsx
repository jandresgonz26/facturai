'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, CircleCheck, CircleX, Download, FileText, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { TOOL_LABELS, dateLabel, fmtMoney, fmtUsd, isWriteTool, periodLabel } from '@/lib/agent/shared'
import { downloadInvoice } from '@/lib/invoice-download'

export interface AnyToolPart {
    type: string
    toolCallId: string
    state: string
    input?: unknown
    output?: unknown
    errorText?: string
    approval?: { id: string; approved?: boolean; reason?: string }
}

type Row = { label: string; value: string }
type Rec = Record<string, unknown>

const str = (v: unknown) => (v == null || v === '' ? undefined : String(v))
const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? undefined : Number(v))

function describeInput(tool: string, raw: unknown): { title: string; rows: Row[]; items?: string[]; note?: string } {
    const input = (raw ?? {}) as Rec
    const client = str(input.client_name) ?? 'Cliente'
    switch (tool) {
        case 'add_log': {
            const rows: Row[] = [
                { label: 'Cliente', value: client },
                { label: 'Descripción', value: str(input.description) ?? '-' },
            ]
            if (input.amount != null) rows.push({ label: 'Monto', value: `${num(input.amount)?.toFixed(2)} (moneda del cliente)` })
            if (input.hours != null) rows.push({ label: 'Horas', value: `${num(input.hours)}h` })
            if (input.category) rows.push({ label: 'Categoría', value: str(input.category)! })
            rows.push({ label: 'Fecha', value: dateLabel(str(input.date)) })
            return { title: `Registrar actividad para ${client}`, rows, note: 'Se guardará como ítem puntual pendiente de facturar.' }
        }
        case 'load_recurring_services':
            return {
                title: `Cargar servicios fijos de ${client}`,
                rows: [{ label: 'Periodo', value: periodLabel(str(input.period)) }],
                note: 'Solo se cargan los servicios que aún no estén cargados en el periodo.',
            }
        case 'bill_client_month': {
            const extras = Array.isArray(input.extra_items) ? (input.extra_items as Rec[]) : []
            const rows: Row[] = [
                { label: 'Cliente', value: client },
                { label: 'Periodo', value: periodLabel(str(input.period)) },
                { label: 'Servicios fijos', value: input.load_recurring ? 'Cargar los que falten' : 'No cargar' },
                { label: 'Fecha de emisión', value: dateLabel(str(input.issue_date)) },
            ]
            if (input.due_date) rows.push({ label: 'Vencimiento', value: dateLabel(str(input.due_date)) })
            rows.push({ label: 'Nº de factura', value: str(input.invoice_number) ?? 'Automático' })
            if (input.expected_total_usd != null) rows.push({ label: 'Total estimado', value: fmtUsd(num(input.expected_total_usd)) })
            return {
                title: `Facturar ${periodLabel(str(input.period))} a ${client}`,
                rows,
                items: extras.map((e) => `${str(e.description)} — ${num(e.amount)?.toFixed(2)}`),
                note: 'Se emitirá la factura con todos los ítems pendientes del cliente y sus subclientes.',
            }
        }
        case 'mark_invoice_paid':
            return {
                title: `Marcar como pagada la factura #${str(input.invoice_number) ?? ''}`,
                rows: [{ label: 'Cliente', value: client }],
            }
        case 'add_recurring_service':
            return {
                title: `Crear servicio fijo para ${client}`,
                rows: [
                    { label: 'Descripción', value: str(input.description) ?? '-' },
                    { label: 'Monto mensual', value: `${num(input.amount)?.toFixed(2)} (moneda del cliente)` },
                    ...(input.category ? [{ label: 'Categoría', value: str(input.category)! }] : []),
                ],
                note: 'Se cobrará todos los meses al cargar los servicios fijos.',
            }
        default:
            return { title: TOOL_LABELS[tool] ?? tool, rows: [] }
    }
}

function describeResult(tool: string, raw: unknown): { title: string; lines: string[]; invoiceId?: string } {
    const d = (raw ?? {}) as Rec
    switch (tool) {
        case 'add_log':
            return {
                title: 'Actividad registrada',
                lines: [
                    `${str(d.description)} · ${d.hours != null ? `${num(d.hours)}h` : fmtMoney(num(d.original_amount), str(d.currency))}${
                        d.currency === 'EUR' && d.value_usd != null ? ` (≈ ${fmtUsd(num(d.value_usd))})` : ''
                    }`,
                    `${str(d.client_name) ?? ''} · ${dateLabel(str(d.date))}`,
                ],
            }
        case 'load_recurring_services': {
            const loaded = Array.isArray(d.loaded) ? (d.loaded as Rec[]) : []
            const skipped = Array.isArray(d.skipped) ? (d.skipped as string[]) : []
            return {
                title: loaded.length ? `${loaded.length} servicios fijos cargados` : 'Nada que cargar',
                lines: [
                    ...loaded.map((l) => `${str(l.description)} · ${fmtUsd(num(l.value_usd))}`),
                    ...(skipped.length ? [`Ya estaban cargados: ${skipped.join(', ')}`] : []),
                ],
            }
        }
        case 'bill_client_month':
            return {
                title: `Factura #${str(d.invoice_number)} creada para ${str(d.client_name)}`,
                lines: [
                    `Total ${fmtUsd(num(d.total_amount))} · ${num(d.items_count)} ítems · emitida ${dateLabel(str(d.issue_date))}`,
                    `Fijos cargados: ${num(d.recurring_loaded) ?? 0} · Ítems nuevos: ${num(d.extras_added) ?? 0}`,
                ],
                invoiceId: str(d.invoice_id),
            }
        case 'mark_invoice_paid':
            return {
                title: `Factura #${str(d.invoice_number)} marcada como pagada`,
                lines: [`${str(d.client_name)} · ${fmtUsd(num(d.total_amount))}`],
            }
        case 'add_recurring_service':
            return {
                title: 'Servicio fijo creado',
                lines: [`${str(d.description)} · ${fmtUsd(num(d.amount_usd))} al mes · ${str(d.client_name)}`],
            }
        default:
            return { title: TOOL_LABELS[tool] ?? tool, lines: [] }
    }
}

function InvoiceDownloadButtons({ invoiceId }: { invoiceId: string }) {
    const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null)
    const go = async (format: 'pdf' | 'docx') => {
        setBusy(format)
        try {
            await downloadInvoice(invoiceId, format)
        } finally {
            setBusy(null)
        }
    }
    return (
        <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => go('pdf')} disabled={!!busy}>
                {busy === 'pdf' ? <LoaderCircle className="animate-spin" /> : <FileText />}
                PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => go('docx')} disabled={!!busy}>
                {busy === 'docx' ? <LoaderCircle className="animate-spin" /> : <Download />}
                DOCX
            </Button>
        </div>
    )
}

interface Snapshot {
    client: { id: string; name: string; currency: string }
    period: string
    eur_usd_rate: number
    next_invoice_number: string
    pending_logs: { description: string; value_usd: number | null; client_name: string | null }[]
    pending_total_usd: number
    recurring_services: {
        already_loaded_this_period: { description: string; amount_usd: number }[]
        to_load: { description: string; amount_usd: number }[]
        to_load_total_usd: number
    }
}

/** Busca en la misma respuesta el snapshot de facturación del cliente para mostrar cifras reales. */
function findSnapshot(context: AnyToolPart[] | undefined, clientId: string | undefined): Snapshot | undefined {
    if (!context || !clientId) return undefined
    let found: Snapshot | undefined
    for (const p of context) {
        if (p.type !== 'tool-get_billing_snapshot' || p.state !== 'output-available') continue
        const out = p.output as { ok?: boolean; data?: Snapshot } | undefined
        if (out?.ok && out.data?.client?.id === clientId) found = out.data
    }
    return found
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-muted-foreground text-[11px] uppercase tracking-wide mb-1">{title}</p>
            {children}
        </div>
    )
}

function Line({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 text-sm">
            <span className="truncate">{label}</span>
            <span className="font-mono shrink-0">{value}</span>
        </div>
    )
}

function BillingPreview({ input, snapshot }: { input: Rec; snapshot: Snapshot }) {
    const extras = Array.isArray(input.extra_items) ? (input.extra_items as Rec[]) : []
    const rate = snapshot.client.currency === 'EUR' ? snapshot.eur_usd_rate : 1
    const extrasUsd = extras.reduce((sum, e) => sum + (num(e.amount) ?? 0) * rate, 0)
    const loadRecurring = !!input.load_recurring
    const toLoad = loadRecurring ? snapshot.recurring_services.to_load : []
    const toLoadTotal = loadRecurring ? snapshot.recurring_services.to_load_total_usd : 0
    const total = snapshot.pending_total_usd + toLoadTotal + extrasUsd
    const sym = snapshot.client.currency === 'EUR' ? '€' : '$'
    return (
        <div className="space-y-3">
            <Section title="Servicios fijos">
                {toLoad.length > 0 ? (
                    toLoad.map((s, i) => <Line key={i} label={s.description} value={fmtUsd(s.amount_usd)} />)
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {loadRecurring
                            ? snapshot.recurring_services.already_loaded_this_period.length > 0
                                ? `Ya cargados este mes (${snapshot.recurring_services.already_loaded_this_period.length})`
                                : 'No hay servicios fijos configurados'
                            : 'No se cargarán'}
                    </p>
                )}
            </Section>
            <Section title={`Pendientes existentes (${snapshot.pending_logs.length})`}>
                {snapshot.pending_logs.length > 0 ? (
                    <>
                        {snapshot.pending_logs.slice(0, 6).map((l, i) => (
                            <Line key={i} label={l.description} value={fmtUsd(l.value_usd)} />
                        ))}
                        {snapshot.pending_logs.length > 6 && (
                            <p className="text-xs text-muted-foreground">… y {snapshot.pending_logs.length - 6} más</p>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">Ninguno</p>
                )}
            </Section>
            {extras.length > 0 && (
                <Section title="Ítems nuevos">
                    {extras.map((e, i) => (
                        <Line
                            key={i}
                            label={str(e.description) ?? ''}
                            value={`${sym}${(num(e.amount) ?? 0).toFixed(2)}${rate !== 1 ? ` ≈ ${fmtUsd((num(e.amount) ?? 0) * rate)}` : ''}`}
                        />
                    ))}
                </Section>
            )}
            <div className="flex justify-between items-baseline border-t pt-2">
                <span className="text-sm font-semibold">Total proyectado</span>
                <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{fmtUsd(total)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
                Factura Nº {str(input.invoice_number) ?? snapshot.next_invoice_number} · emitida {dateLabel(str(input.issue_date))}
                {input.due_date ? ` · vence ${dateLabel(str(input.due_date))}` : ''}
                {rate !== 1 ? ` · tasa EUR/USD ${snapshot.eur_usd_rate.toFixed(4)}` : ''}
            </p>
        </div>
    )
}

interface Props {
    toolName: string
    part: AnyToolPart
    onApprove: (approvalId: string) => void
    onDeny: (approvalId: string) => void
    busy: boolean
    /** Otras partes del mismo mensaje (para leer el snapshot de facturación). */
    context?: AnyToolPart[]
}

export function ToolCard({ toolName, part, onApprove, onDeny, busy, context }: Props) {
    const label = TOOL_LABELS[toolName] ?? toolName
    const write = isWriteTool(toolName)

    // ── Lecturas: una línea discreta ──
    if (!write) {
        if (part.state === 'output-error') {
            return <p className="text-xs text-destructive flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" /> {label}: {part.errorText}</p>
        }
        const out = part.output as { ok?: boolean; error?: string } | undefined
        if (part.state === 'output-available' && out && out.ok === false) {
            return <p className="text-xs text-destructive flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" /> {label}: {out.error}</p>
        }
        const done = part.state === 'output-available'
        return (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {done ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                {label}
            </p>
        )
    }

    // ── Escrituras ──
    if (part.state === 'approval-requested' || part.state === 'approval-responded') {
        const { title, rows, items, note } = describeInput(toolName, part.input)
        const responded = part.state === 'approval-responded'
        const approved = part.approval?.approved
        const snapshot = toolName === 'bill_client_month' ? findSnapshot(context, str((part.input as Rec | undefined)?.client_id)) : undefined
        return (
            <div className="rounded-xl border border-teal-500/40 bg-card shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-teal-600/10 border-b border-teal-500/30 text-sm font-semibold text-teal-700 dark:text-teal-300">
                    {responded ? (approved ? 'Confirmado' : 'Cancelado') : 'Confirmar'}: {title}
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                    {snapshot ? (
                        <BillingPreview input={(part.input ?? {}) as Rec} snapshot={snapshot} />
                    ) : (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        {rows.map((r) => (
                            <div key={r.label} className="contents">
                                <dt className="text-muted-foreground">{r.label}</dt>
                                <dd className="font-medium text-right">{r.value}</dd>
                            </div>
                        ))}
                    </dl>
                    )}
                    {!snapshot && items && items.length > 0 && (
                        <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Ítems nuevos</p>
                            <ul className="list-disc pl-5 space-y-0.5">
                                {items.map((it, i) => (
                                    <li key={i}>{it}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {note && <p className="text-xs text-muted-foreground">{note}</p>}
                </div>
                {!responded ? (
                    <div className="px-4 py-3 border-t flex gap-2 justify-end bg-muted/40">
                        <Button size="sm" variant="outline" onClick={() => part.approval && onDeny(part.approval.id)} disabled={busy}>
                            <X /> Cancelar
                        </Button>
                        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => part.approval && onApprove(part.approval.id)} disabled={busy}>
                            <Check /> Confirmar
                        </Button>
                    </div>
                ) : (
                    <div className="px-4 py-2 border-t text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/40">
                        {approved ? (
                            <>
                                <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Ejecutando…
                            </>
                        ) : (
                            <>
                                <CircleX className="w-3.5 h-3.5" /> No se realizó ningún cambio
                            </>
                        )}
                    </div>
                )}
            </div>
        )
    }

    if (part.state === 'output-denied') {
        return (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CircleX className="w-3.5 h-3.5" /> {label}: cancelado, sin cambios
            </p>
        )
    }

    if (part.state === 'output-error') {
        return (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
                <p className="font-semibold text-destructive flex items-center gap-1.5"><TriangleAlert className="w-4 h-4" /> {label} falló</p>
                <p className="text-muted-foreground mt-1">{part.errorText}</p>
            </div>
        )
    }

    if (part.state === 'output-available') {
        const out = part.output as { ok: boolean; data?: unknown; error?: string }
        if (!out?.ok) {
            return (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
                    <p className="font-semibold text-destructive flex items-center gap-1.5"><TriangleAlert className="w-4 h-4" /> {label}: no se realizó</p>
                    <p className="text-muted-foreground mt-1">{out?.error ?? 'Error desconocido'}</p>
                </div>
            )
        }
        const { title, lines, invoiceId } = describeResult(toolName, out.data)
        return (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"><CircleCheck className="w-4 h-4" /> {title}</p>
                {lines.map((l, i) => (
                    <p key={i} className="text-muted-foreground">{l}</p>
                ))}
                {invoiceId && <InvoiceDownloadButtons invoiceId={invoiceId} />}
            </div>
        )
    }

    // input-streaming / input-available de una escritura (antes de pedir aprobación)
    return (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Preparando: {label}
        </p>
    )
}
