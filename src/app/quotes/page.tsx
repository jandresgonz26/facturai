'use client'

import { useMemo, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Client, EmailLog, Quote, QuoteStatus } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Download, Mail, Pencil, Receipt, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { EmailDialog } from '@/components/features/EmailDialog'
import { ClientForm } from '@/components/features/ClientForm'
import { getEmailStatusByQuote } from '@/lib/actions/email'
import { QUOTE_STATUSES, convertQuoteToInvoice, setQuoteStatus } from '@/lib/actions/quotes'
import { getClient, listClients, updateClient, type ClientInput } from '@/lib/actions/clients'
import { ActionError, errorMessage } from '@/lib/actions/validation'
import { saveBlobToFile } from '@/lib/invoice-download'
import { useDataChanged } from '@/lib/events'
import { generateQuotePdf } from '@/lib/quote-pdf-generator'
import { formatDate } from '@/lib/date-utils'
import { toast } from 'sonner'
import { Pagination } from '@/components/ui/Pagination'
import { QuoteForm } from '@/components/features/QuoteForm'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

type StatusFilter = 'all' | QuoteStatus | 'invoiced'

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'pending', label: 'Pendientes' },
    { id: 'approved', label: 'Aprobadas' },
    { id: 'invoiced', label: 'Facturadas' },
    { id: 'rejected', label: 'Rechazadas' },
]

/** Estado visible de la cotización: facturada manda sobre aprobada. */
function quoteState(quote: Quote, invoiced: boolean) {
    if (invoiced) {
        return {
            label: 'Facturada',
            dot: 'bg-green-600',
            className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
            border: 'border-l-green-500',
        }
    }
    if (quote.status === 'approved') {
        return {
            label: 'Aprobada',
            dot: 'bg-emerald-500',
            className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            border: 'border-l-emerald-500',
        }
    }
    if (quote.status === 'rejected') {
        return {
            label: 'Rechazada',
            dot: 'bg-gray-400',
            className: 'bg-muted text-muted-foreground',
            border: 'border-l-gray-300 dark:border-l-gray-600',
        }
    }
    return {
        label: 'Pendiente',
        dot: 'bg-amber-500',
        className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        border: 'border-l-amber-500',
    }
}

export default function QuotesPage() {
    const [quotes, setQuotes] = useState<Quote[]>([])
    const [loading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [savingStatus, setSavingStatus] = useState<string | null>(null)
    const itemsPerPage = 6
    const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [quoteToEdit, setQuoteToEdit] = useState<Quote | null>(null)
    const [emailStatus, setEmailStatus] = useState<Record<string, EmailLog>>({})
    const [emailQuoteId, setEmailQuoteId] = useState<string | null>(null)
    // Número de la factura generada por cada cotización convertida (quote.id → "0577")
    const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({})
    const [quoteToConvert, setQuoteToConvert] = useState<Quote | null>(null)
    const [isConverting, setIsConverting] = useState(false)
    // Cuando convertir se topa con un cliente sin ficha completa (lead/cotizado), se le pide
    // completarla aquí y, al guardar, se reintenta la conversión de esta cotización pendiente.
    const [clientToComplete, setClientToComplete] = useState<Client | null>(null)
    const [pendingQuote, setPendingQuote] = useState<Quote | null>(null)
    const [allClients, setAllClients] = useState<Client[]>([])
    const [isSavingClient, setIsSavingClient] = useState(false)

    const loadQuotes = async (): Promise<{ quotes: Quote[]; emailStatus: Record<string, EmailLog>; invoiceNumbers: Record<string, string> } | null> => {
        const { data, error } = await supabase
            .from('quotes')
            .select('*')
            .order('created_at', { ascending: false })
        if (error) {
            console.error(error)
            toast.error('Error al cargar cotizaciones')
            return null
        }
        const quotes = (data as Quote[]) || []
        const emailStatus = await getEmailStatusByQuote().catch(() => ({}))
        // Se consulta aparte (y no con un join) para que la página siga funcionando
        // aunque todavía no se haya ejecutado schema_update_quote_to_invoice.sql.
        const invoiceNumbers: Record<string, string> = {}
        const invoiceIds = quotes.map((q) => q.invoice_id).filter((id): id is string => !!id)
        if (invoiceIds.length) {
            const { data: invs } = await supabase.from('invoices').select('id, invoice_number').in('id', invoiceIds)
            const byId = new Map((invs || []).map((i) => [i.id as string, i.invoice_number as string]))
            for (const q of quotes) if (q.invoice_id && byId.has(q.invoice_id)) invoiceNumbers[q.id] = byId.get(q.invoice_id)!
        }
        return { quotes, emailStatus, invoiceNumbers }
    }

    const fetchQuotes = () =>
        loadQuotes().then((r) => {
            if (r) {
                setQuotes(r.quotes)
                setEmailStatus(r.emailStatus)
                setInvoiceNumbers(r.invoiceNumbers)
            }
            setLoading(false)
        })

    useEffect(() => {
        let active = true
        loadQuotes().then((r) => {
            if (!active) return
            if (r) {
                setQuotes(r.quotes)
                setEmailStatus(r.emailStatus)
                setInvoiceNumbers(r.invoiceNumbers)
            }
            setLoading(false)
        })
        return () => {
            active = false
        }
    }, [])
    useDataChanged(() => void fetchQuotes())

    const startEdit = (quote: Quote) => {
        setQuoteToEdit(quote)
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }

    const handleSaved = () => {
        setQuoteToEdit(null)
        fetchQuotes()
    }

    const handleDownloadPdf = async (quote: Quote) => {
        toast.loading('Generando PDF...')
        try {
            const { blob, fileName } = await generateQuotePdf(quote)
            const r = await saveBlobToFile(blob, fileName, { description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } })
            toast.dismiss()
            if (r === 'saved') toast.success('Cotización guardada')
        } catch (e) {
            console.error(e)
            toast.dismiss()
            toast.error('Error al generar PDF')
        }
    }

    const executeDeleteQuote = async () => {
        if (!quoteToDelete) return
        setIsDeleting(true)

        const { error } = await supabase.from('quotes').delete().eq('id', quoteToDelete.id)

        setIsDeleting(false)
        setQuoteToDelete(null)

        if (error) {
            console.error(error)
            toast.error('Error al eliminar cotización')
        } else {
            toast.success('Cotización eliminada')
            setQuotes((prev) => prev.filter((q) => q.id !== quoteToDelete.id))
        }
    }

    const runConvert = async (quote: Quote) => {
        setIsConverting(true)
        try {
            const r = await convertQuoteToInvoice({ quote_id: quote.id })
            toast.success(`Factura #${r.invoice.invoice_number} creada en borrador desde ${quote.quote_number}`)
            setQuoteToConvert(null)
            await fetchQuotes()
        } catch (e) {
            if (e instanceof ActionError && e.code === 'CLIENT_NEEDS_REVIEW' && quote.client_id) {
                const [client, list] = await Promise.all([
                    getClient(quote.client_id).catch(() => null),
                    listClients().catch(() => []),
                ])
                setAllClients(list)
                // Se fuerza "cliente activo" como punto de partida del formulario: viene de una
                // cotización (lead/cotizado) y esta pantalla existe justo para revisarlo y confirmarlo.
                setClientToComplete(client ? { ...client, stage: 'active' } : null)
                setPendingQuote(quote)
                setQuoteToConvert(null)
            } else {
                console.error(e)
                toast.error(errorMessage(e))
            }
        } finally {
            setIsConverting(false)
        }
    }

    const executeConvert = () => quoteToConvert && runConvert(quoteToConvert)

    const handleCompleteClient = async (values: ClientInput) => {
        if (!clientToComplete) return
        setIsSavingClient(true)
        try {
            await updateClient(clientToComplete.id, values)
            toast.success('Ficha del cliente actualizada')
            const quote = pendingQuote
            setClientToComplete(null)
            setPendingQuote(null)
            if (quote) await runConvert(quote)
        } catch (e) {
            console.error(e)
            toast.error(errorMessage(e))
        } finally {
            setIsSavingClient(false)
        }
    }

    const changeStatus = async (quote: Quote, status: QuoteStatus) => {
        setSavingStatus(quote.id)
        try {
            const updated = await setQuoteStatus(quote.id, status)
            setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, status: updated.status, decided_at: updated.decided_at } : q)))
            toast.success(status === 'approved' ? 'Marcada como aprobada' : status === 'rejected' ? 'Marcada como rechazada' : 'Vuelve a quedar pendiente')
        } catch (e) {
            console.error(e)
            toast.error(errorMessage(e))
        } finally {
            setSavingStatus(null)
        }
    }

    const counts = useMemo(() => {
        const c = { pending: 0, approved: 0, rejected: 0, pendingAmount: 0 }
        for (const q of quotes) {
            if (q.status === 'approved') c.approved += 1
            else if (q.status === 'rejected') c.rejected += 1
            else {
                c.pending += 1
                if (q.quote_type !== 'hours') c.pendingAmount += Number(q.total_amount || 0)
            }
        }
        return c
    }, [quotes])

    const filtered = useMemo(() => {
        if (statusFilter === 'all') return quotes
        if (statusFilter === 'invoiced') return quotes.filter((q) => !!q.invoice_id)
        return quotes.filter((q) => q.status === statusFilter)
    }, [quotes, statusFilter])

    useEffect(() => setCurrentPage(1), [statusFilter])

    const totalPages = Math.ceil(filtered.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const currentQuotes = filtered.slice(startIndex, startIndex + itemsPerPage)

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold mb-6">Cotizaciones</h1>
                <QuoteForm
                    onSaved={handleSaved}
                    quoteToEdit={quoteToEdit}
                    onCancelEdit={() => setQuoteToEdit(null)}
                />
            </div>

            <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
                    <div>
                        <h2 className="text-lg font-semibold">Historial de Cotizaciones</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {counts.pending} pendiente{counts.pending === 1 ? '' : 's'} · {counts.approved} aprobada{counts.approved === 1 ? '' : 's'} · {counts.rejected} rechazada{counts.rejected === 1 ? '' : 's'}
                            {counts.pendingAmount > 0 && <> · <span className="text-amber-600 dark:text-amber-400">${counts.pendingAmount.toFixed(2)} en juego</span></>}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setStatusFilter(f.id)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                    statusFilter === f.id
                                        ? 'bg-teal-600 border-teal-600 text-white'
                                        : 'border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-teal-400'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="grid gap-4">
                    {currentQuotes.map((quote) => {
                        const isHours = quote.quote_type === 'hours'
                        const symbol = quote.currency === 'EUR' ? '€' : '$'
                        const invoiced = !!quote.invoice_id && !!invoiceNumbers[quote.id]
                        const state = quoteState(quote, invoiced)
                        const expanded = expandedId === quote.id
                        const items = Array.isArray(quote.items) ? quote.items : []
                        return (
                            <Card key={quote.id} className={`border-l-4 ${state.border}`}>
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-lg">#{quote.quote_number}</span>
                                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${state.className}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${state.dot}`} />
                                                {state.label}
                                            </span>
                                            <span className="text-muted-foreground text-sm">
                                                • {formatDate(quote.issue_date)}
                                            </span>
                                            <span
                                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                                                    quote.template === 'asiri'
                                                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                        : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                                                }`}
                                            >
                                                {quote.template === 'asiri' ? 'Asiri' : 'JAMTech'}
                                            </span>
                                        </div>
                                        <div className="font-medium text-primary">{quote.client_name}</div>
                                        {quote.company_name && (
                                            <div className="text-xs text-muted-foreground">{quote.company_name}</div>
                                        )}
                                        {emailStatus[quote.id] && (
                                            <div className="text-[11px] text-sky-700 dark:text-sky-300">✉ Enviada {formatDate(emailStatus[quote.id].sent_at.split('T')[0])} a {emailStatus[quote.id].to_email}</div>
                                        )}
                                        {invoiced && (
                                            <Link
                                                href="/invoices"
                                                className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-green-700 dark:text-green-400 hover:underline"
                                                title="Ver en Facturas"
                                            >
                                                <Receipt className="w-3 h-3" /> Facturada · #{invoiceNumbers[quote.id]}
                                            </Link>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(expanded ? null : quote.id)}
                                            className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground hover:text-teal-600"
                                        >
                                            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                            {items.length} ítem{items.length === 1 ? '' : 's'}
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            {isHours ? (
                                                <div className="font-bold text-lg text-purple-600">
                                                    {quote.total_hours} h
                                                </div>
                                            ) : (
                                                <div className="font-bold text-lg">
                                                    {symbol}
                                                    {quote.total_amount.toFixed(2)}
                                                </div>
                                            )}
                                            <div className="text-xs font-bold uppercase text-muted-foreground">
                                                {isHours ? 'Horas' : quote.currency}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {!isHours && (
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40"
                                                    onClick={() => setQuoteToConvert(quote)}
                                                    disabled={invoiced}
                                                    title={invoiced ? `Ya convertida en la factura #${invoiceNumbers[quote.id]}` : 'Convertir en factura (cotización aprobada)'}
                                                >
                                                    <Receipt className="w-4 h-4" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="text-teal-600"
                                                onClick={() => setEmailQuoteId(quote.id)}
                                                title="Enviar por correo"
                                            >
                                                <Mail className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => handleDownloadPdf(quote)}
                                                title="Descargar PDF"
                                            >
                                                <Download className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                                                onClick={() => startEdit(quote)}
                                                disabled={invoiced}
                                                title={invoiced ? 'No se puede editar: ya se convirtió en factura' : 'Editar cotización'}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-100 dark:border-red-900/50 dark:hover:bg-red-900/20"
                                                onClick={() => setQuoteToDelete(quote)}
                                                title="Eliminar cotización"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>

                                {expanded && (
                                    <div className="border-t bg-muted/30 px-4 py-3 space-y-3">
                                        <ul className="space-y-1.5">
                                            {items.map((it, i) => (
                                                <li key={i} className="flex items-start justify-between gap-3 text-sm">
                                                    <div className="min-w-0">
                                                        <span className="font-medium">{it.service || 'Servicio Profesional'}</span>
                                                        <span className="text-muted-foreground"> · {it.description}</span>
                                                    </div>
                                                    <span className="font-mono text-xs shrink-0 pt-0.5">
                                                        {isHours
                                                            ? `${it.hours} h`
                                                            : `${it.quantity > 1 ? `${it.quantity} × ` : ''}${symbol}${Number(it.unit_price).toFixed(2)}`}
                                                    </span>
                                                </li>
                                            ))}
                                            {items.length === 0 && <li className="text-sm text-muted-foreground">Sin ítems.</li>}
                                        </ul>

                                        {!invoiced && (
                                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                                                <span className="text-xs text-muted-foreground">¿Qué respondió el cliente?</span>
                                                {QUOTE_STATUSES.map((s) => (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        onClick={() => changeStatus(quote, s.id)}
                                                        disabled={savingStatus === quote.id || quote.status === s.id}
                                                        title={s.hint}
                                                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-100 ${
                                                            quote.status === s.id
                                                                ? 'bg-teal-600 border-teal-600 text-white'
                                                                : 'border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-teal-400'
                                                        }`}
                                                    >
                                                        {s.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        )
                    })}

                    {currentQuotes.length === 0 && !loading && (
                        <div className="text-center py-10 text-muted-foreground border rounded-lg border-dashed">
                            {quotes.length === 0 ? 'No hay cotizaciones guardadas.' : 'No hay cotizaciones con ese filtro.'}
                        </div>
                    )}

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                    />
                </div>
            </div>

            <EmailDialog kind="quote" id={emailQuoteId} open={!!emailQuoteId} onOpenChange={(o) => !o && setEmailQuoteId(null)} onSent={fetchQuotes} />

            <Dialog open={!!quoteToConvert} onOpenChange={(open) => !open && !isConverting && setQuoteToConvert(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Convertir cotización en factura</DialogTitle>
                        <DialogDescription>
                            {quoteToConvert ? (
                                <>
                                    Se creará una factura <strong>en borrador</strong> para{' '}
                                    <strong>{quoteToConvert.client_name}</strong> con los {quoteToConvert.items?.length ?? 0} ítems de la
                                    cotización <strong>{quoteToConvert.quote_number}</strong> por un total de{' '}
                                    <strong>
                                        {quoteToConvert.currency === 'EUR' ? '€' : '$'}
                                        {Number(quoteToConvert.total_amount).toFixed(2)}
                                    </strong>
                                    . No se enviará al cliente hasta que tú lo hagas desde Facturas.
                                </>
                            ) : (
                                ''
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setQuoteToConvert(null)} disabled={isConverting}>
                            Cancelar
                        </Button>
                        <Button onClick={executeConvert} disabled={isConverting}>
                            {isConverting ? 'Creando factura...' : 'Crear factura'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={!!clientToComplete}
                onOpenChange={(open) => {
                    if (!open && !isSavingClient) {
                        setClientToComplete(null)
                        setPendingQuote(null)
                    }
                }}
            >
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Completa la ficha de {clientToComplete?.name}</DialogTitle>
                        <DialogDescription>
                            Este cliente viene de una cotización y todavía no se revisó como cliente real. Completa y
                            guarda sus datos (o al menos confirma la etapa como &quot;Cliente activo&quot;) para poder
                            facturarlo. La factura se creará automáticamente al guardar.
                        </DialogDescription>
                    </DialogHeader>
                    {clientToComplete && (
                        <ClientForm
                            clients={allClients}
                            initial={clientToComplete}
                            submitting={isSavingClient}
                            onSubmit={handleCompleteClient}
                            onCancel={() => {
                                setClientToComplete(null)
                                setPendingQuote(null)
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={!!quoteToDelete} onOpenChange={(open) => !open && !isDeleting && setQuoteToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar eliminación</DialogTitle>
                        <DialogDescription>
                            {quoteToDelete ? (
                                <>
                                    ¿Estás seguro de eliminar la cotización{' '}
                                    <strong>#{quoteToDelete.quote_number}</strong>? Esta acción no se puede deshacer.
                                </>
                            ) : (
                                ''
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setQuoteToDelete(null)} disabled={isDeleting}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={executeDeleteQuote} disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
