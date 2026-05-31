'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Quote } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Trash2 } from 'lucide-react'
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

    useEffect(() => {
        fetchQuotes()
    }, [])

    const fetchQuotes = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('quotes')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error(error)
            toast.error('Error al cargar cotizaciones')
        } else {
            setQuotes((data as Quote[]) || [])
        }
        setLoading(false)
    }

    const saveBlobToFile = async (blob: Blob, fileName: string) => {
        const fileType = { description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } }
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: fileName,
                    types: [fileType],
                })
                const writable = await handle.createWritable()
                await writable.write(blob)
                await writable.close()
                toast.dismiss()
                toast.success('Cotización guardada')
                return
            } catch (pickerError: any) {
                if (pickerError?.name === 'AbortError') {
                    toast.dismiss()
                    return
                }
            }
        }
        // Fallback
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        setTimeout(() => {
            URL.revokeObjectURL(url)
            document.body.removeChild(a)
        }, 200)
        toast.dismiss()
        toast.success('Cotización descargada')
    }

    const handleDownloadPdf = async (quote: Quote) => {
        toast.loading('Generando PDF...')
        try {
            const { blob, fileName } = await generateQuotePdf(quote)
            await saveBlobToFile(blob, fileName)
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
                <QuoteForm onCreated={fetchQuotes} />
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
                                        </div>
                                        <div className="font-medium text-primary">{quote.client_name}</div>
                                        {quote.company_name && (
                                            <div className="text-xs text-muted-foreground">{quote.company_name}</div>
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
                                                onClick={() => handleDownloadPdf(quote)}
                                                title="Descargar PDF"
                                            >
                                                <Download className="w-4 h-4" />
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
