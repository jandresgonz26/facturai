'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Client, EmailLog, Quote } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Mail, Pencil, Receipt, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { EmailDialog } from '@/components/features/EmailDialog'
import { ClientForm } from '@/components/features/ClientForm'
import { getEmailStatusByQuote } from '@/lib/actions/email'
import { convertQuoteToInvoice } from '@/lib/actions/quotes'
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

export default function QuotesPage() {
    const [quotes, setQuotes] = useState<Quote[]>([])
    const [loading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const totalPages = Math.ceil(quotes.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const currentQuotes = quotes.slice(startIndex, startIndex + itemsPerPage)

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
                <h2 className="text-lg font-semibold mb-4">Historial de Cotizaciones</h2>
                <div className="grid gap-4">
                    {currentQuotes.map((quote) => {
                        const isHours = quote.quote_type === 'hours'
                        const symbol = quote.currency === 'EUR' ? '€' : '$'
                        const invoiced = !!quote.invoice_id && !!invoiceNumbers[quote.id]
                        return (
                            <Card key={quote.id}>
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-lg">#{quote.quote_number}</span>
                                            <span className="text-muted-foreground">
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
                            </Card>
                        )
                    })}

                    {quotes.length === 0 && !loading && (
                        <div className="text-center py-10 text-muted-foreground border rounded-lg border-dashed">
                            No hay cotizaciones guardadas.
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
