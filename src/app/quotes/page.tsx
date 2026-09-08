'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { EmailLog, Quote } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Mail, Pencil, Trash2 } from 'lucide-react'
import { EmailDialog } from '@/components/features/EmailDialog'
import { getEmailStatusByQuote } from '@/lib/actions/email'
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

    const loadQuotes = async (): Promise<{ quotes: Quote[]; emailStatus: Record<string, EmailLog> } | null> => {
        const { data, error } = await supabase
            .from('quotes')
            .select('*')
            .order('created_at', { ascending: false })
        if (error) {
            console.error(error)
            toast.error('Error al cargar cotizaciones')
            return null
        }
        const emailStatus = await getEmailStatusByQuote().catch(() => ({}))
        return { quotes: (data as Quote[]) || [], emailStatus }
    }

    const fetchQuotes = () =>
        loadQuotes().then((r) => {
            if (r) {
                setQuotes(r.quotes)
                setEmailStatus(r.emailStatus)
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
                                                title="Editar cotización"
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
