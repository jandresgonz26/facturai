'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Invoice, Log } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, CheckCircle, Trash2, RotateCcw, FileText, FileDown } from 'lucide-react'
import { generateInvoiceDoc } from '@/lib/invoice-generator'
import { generateInvoicePdf } from '@/lib/invoice-pdf-generator'
import { formatDate } from '@/lib/date-utils'
import { toast } from 'sonner'
import { Pagination } from '@/components/ui/Pagination'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [loading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 6
    const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [invoiceToPay, setInvoiceToPay] = useState<Invoice | null>(null)
    const [isPaying, setIsPaying] = useState(false)
    const [invoiceToRevert, setInvoiceToRevert] = useState<Invoice | null>(null)
    const [isReverting, setIsReverting] = useState(false)
    const [invoiceToDownload, setInvoiceToDownload] = useState<Invoice | null>(null)

    useEffect(() => {
        fetchInvoices()
    }, [])

    const fetchInvoices = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('invoices')
            .select('*, clients(*)')
            .order('created_at', { ascending: false })

        if (error) {
            console.error(error)
            toast.error('Error al cargar facturas')
        } else {
            setInvoices(data as any[] || [])
        }
        setLoading(false)
    }

    const openDownloadDialog = (invoice: Invoice, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation()
            e.preventDefault()
        }
        setInvoiceToDownload(invoice)
    }

    const fetchInvoiceItems = async (invoice: Invoice) => {
        if (!invoice.clients) return null
        const { data: items, error } = await supabase
            .from('logs')
            .select('*, service_categories(name)')
            .eq('invoice_id', invoice.id)
        if (error) {
            toast.error('Error al obtener ítems de la factura')
            return null
        }
        return items
    }

    const saveBlobToFile = async (blob: Blob, fileName: string, fileType: { description: string; accept: Record<string, string[]> }) => {
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: fileName,
                    types: [fileType]
                })
                const writable = await handle.createWritable()
                await writable.write(blob)
                await writable.close()
                toast.dismiss()
                toast.success('Factura guardada')
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
        setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a) }, 200)
        toast.dismiss()
        toast.success('Factura descargada')
    }

    const handleDownloadDocx = async () => {
        if (!invoiceToDownload || !invoiceToDownload.clients) return
        setInvoiceToDownload(null)
        toast.loading('Generando DOCX...')

        const items = await fetchInvoiceItems(invoiceToDownload)
        if (!items) return

        try {
            const { base64, fileName } = await generateInvoiceDoc(invoiceToDownload, items, invoiceToDownload.clients)
            const byteCharacters = atob(base64)
            const byteArray = new Uint8Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
                byteArray[i] = byteCharacters.charCodeAt(i)
            }
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
            await saveBlobToFile(blob, fileName, {
                description: 'Documento Word',
                accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }
            })
        } catch (e) {
            console.error(e)
            toast.dismiss()
            toast.error('Error al generar DOCX')
        }
    }

    const handleDownloadPdf = async () => {
        if (!invoiceToDownload || !invoiceToDownload.clients) return
        setInvoiceToDownload(null)
        toast.loading('Generando PDF...')

        const items = await fetchInvoiceItems(invoiceToDownload)
        if (!items) return

        try {
            const { blob, fileName } = await generateInvoicePdf(invoiceToDownload, items, invoiceToDownload.clients)
            await saveBlobToFile(blob, fileName, {
                description: 'Documento PDF',
                accept: { 'application/pdf': ['.pdf'] }
            })
        } catch (e) {
            console.error(e)
            toast.dismiss()
            toast.error('Error al generar PDF')
        }
    }

    const confirmMarkAsPaid = (invoice: Invoice, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation()
            e.preventDefault()
        }
        setInvoiceToPay(invoice)
    }

    const executeMarkAsPaid = async () => {
        if (!invoiceToPay) return
        setIsPaying(true)

        const now = new Date().toISOString()
        const { error } = await supabase
            .from('invoices')
            .update({
                status: 'paid',
                paid_at: now
            })
            .eq('id', invoiceToPay.id)

        if (error) {
            console.error(error)
            toast.error('Error al actualizar el estado de la factura')
        } else {
            toast.success('Factura marcada como pagada')
            // Update local state
            setInvoices(prev => prev.map(inv =>
                inv.id === invoiceToPay.id
                    ? { ...inv, status: 'paid' as const, paid_at: now }
                    : inv
            ))
        }
        setIsPaying(false)
        setInvoiceToPay(null)
    }

    const confirmRevertToDraft = (invoice: Invoice, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation()
            e.preventDefault()
        }
        setInvoiceToRevert(invoice)
    }

    const executeRevertToDraft = async () => {
        if (!invoiceToRevert) return
        setIsReverting(true)

        const { error } = await supabase
            .from('invoices')
            .update({
                status: 'draft',
                paid_at: null
            })
            .eq('id', invoiceToRevert.id)

        if (error) {
            console.error(error)
            toast.error('Error al revertir el estado de la factura')
        } else {
            toast.success('Factura devuelta a Borrador')
            // Update local state
            setInvoices(prev => prev.map(inv =>
                inv.id === invoiceToRevert.id
                    ? { ...inv, status: 'draft' as const, paid_at: undefined }
                    : inv
            ))
        }
        setIsReverting(false)
        setInvoiceToRevert(null)
    }

    const confirmDeleteInvoice = (invoice: Invoice, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation()
            e.preventDefault()
        }
        setInvoiceToDelete(invoice)
    }

    const executeDeleteInvoice = async () => {
        if (!invoiceToDelete) return

        setIsDeleting(true)
        console.log('Attempting to delete invoice:', invoiceToDelete.id)

        console.log('1. Releasing logs...')
        // 1. Liberar los logs (volver a estado pending)
        const { data: logsData, error: logsError } = await supabase
            .from('logs')
            .update({ status: 'pending', invoice_id: null })
            .eq('invoice_id', invoiceToDelete.id)
            .select()

        if (logsError) {
            console.error('Logs release error:', logsError)
            toast.error('Error al desvincular los registros')
            setIsDeleting(false)
            setInvoiceToDelete(null)
            return
        }

        console.log('Logs released successfully:', logsData)

        console.log('2. Deleting invoice...')
        // 2. Eliminar la factura
        const { error: deleteError } = await supabase
            .from('invoices')
            .delete()
            .eq('id', invoiceToDelete.id)

        setIsDeleting(false)
        setInvoiceToDelete(null)

        if (deleteError) {
            console.error('Invoice deletion error:', deleteError)
            toast.error('Error al eliminar factura')
        } else {
            console.log('Invoice deleted successfully')
            toast.success('Factura eliminada')
            setInvoices(prev => prev.filter(inv => inv.id !== invoiceToDelete.id))
        }
    }

    const totalPages = Math.ceil(invoices.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const currentInvoices = invoices.slice(startIndex, endIndex)

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Historial de Facturas</h1>

            <div className="grid gap-4">
                {currentInvoices.map((invoice) => (
                    <Card key={invoice.id}>
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-lg">#{invoice.invoice_number}</span>
                                    <span className="text-muted-foreground">• {formatDate(invoice.issue_date)}</span>
                                </div>
                                <div className="font-medium text-primary">
                                    {invoice.clients?.name || 'Cliente Desconocido'}
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <div className="font-bold text-lg">
                                        ${invoice.total_amount.toFixed(2)}
                                    </div>
                                    <div className={`text-xs font-bold uppercase ${invoice.status === 'paid' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                        {invoice.status === 'paid' ? 'Pagada' : invoice.status}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {invoice.status !== 'paid' && (
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                            onClick={(e) => confirmMarkAsPaid(invoice, e)}
                                            title="Marcar como Pagada"
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                        </Button>
                                    )}
                                    {invoice.status === 'paid' && (
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                            onClick={(e) => confirmRevertToDraft(invoice, e)}
                                            title="Revertir a Borrador"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <Button variant="outline" size="icon" onClick={(e) => openDownloadDialog(invoice, e)} title="Descargar factura">
                                        <Download className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-100 dark:border-red-900/50 dark:hover:bg-red-900/20"
                                        onClick={(e) => confirmDeleteInvoice(invoice, e)}
                                        title="Eliminar factura"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {invoices.length === 0 && !loading && (
                    <div className="text-center py-10 text-muted-foreground border rounded-lg border-dashed">
                        No hay facturas generadas.
                    </div>
                )}

                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>

            <Dialog open={!!invoiceToPay} onOpenChange={(open) => !open && !isPaying && setInvoiceToPay(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Pago</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro que deseas marcar la factura <strong>#{invoiceToPay?.invoice_number}</strong> como pagada?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInvoiceToPay(null)} disabled={isPaying}>
                            Cancelar
                        </Button>
                        <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={executeMarkAsPaid} disabled={isPaying}>
                            {isPaying ? 'Procesando...' : 'Confirmar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!invoiceToRevert} onOpenChange={(open) => !open && !isReverting && setInvoiceToRevert(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Revertir a Borrador</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro que deseas devolver la factura <strong>#{invoiceToRevert?.invoice_number}</strong> al estado Borrador? La fecha de pago se eliminará.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInvoiceToRevert(null)} disabled={isReverting}>
                            Cancelar
                        </Button>
                        <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={executeRevertToDraft} disabled={isReverting}>
                            {isReverting ? 'Procesando...' : 'Revertir a Borrador'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!invoiceToDownload} onOpenChange={(open) => !open && setInvoiceToDownload(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Descargar Factura #{invoiceToDownload?.invoice_number}</DialogTitle>
                        <DialogDescription>
                            Selecciona el formato en que deseas descargar la factura.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <Button
                            variant="outline"
                            className="h-24 flex flex-col gap-2 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={handleDownloadPdf}
                        >
                            <FileText className="w-8 h-8 text-red-500" />
                            <span className="font-semibold">PDF</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="h-24 flex flex-col gap-2 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            onClick={handleDownloadDocx}
                        >
                            <FileDown className="w-8 h-8 text-blue-500" />
                            <span className="font-semibold">DOCX</span>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!invoiceToDelete} onOpenChange={(open) => !open && setInvoiceToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar eliminación de factura</DialogTitle>
                        <DialogDescription>
                            {invoiceToDelete ? (
                                <>¿Estás seguro de eliminar la factura <strong>#{invoiceToDelete.invoice_number}</strong>? Los registros asociados volverán a estar pendientes en Cierre de Mes.</>
                            ) : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInvoiceToDelete(null)} disabled={isDeleting}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={executeDeleteInvoice} disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
