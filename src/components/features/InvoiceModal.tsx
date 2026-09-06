'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Client, Log } from '@/types'
import { createInvoice, getNextInvoiceNumber } from '@/lib/actions'
import { toast } from 'sonner'
import { downloadInvoice } from '@/lib/invoice-download'

interface InvoiceModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    client: Client | null
    items: Log[]
    onSuccess: () => void
}

export function InvoiceModal({ open, onOpenChange, client, items, onSuccess }: InvoiceModalProps) {
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(false)

    const totalAmount = items.reduce((sum, item) => sum + (item.value || 0), 0)

    useEffect(() => {
        if (open) {
            fetchNextInvoiceNumber()
        }
    }, [open])

    const fetchNextInvoiceNumber = async () => {
        try {
            setInvoiceNumber(await getNextInvoiceNumber())
        } catch (e) {
            console.error(e)
            setInvoiceNumber('0538')
        }
    }

    const handleGenerate = async () => {
        if (!client) return
        if (!invoiceNumber) {
            toast.error('Número de factura requerido')
            return
        }

        setLoading(true)
        try {
            const { invoice } = await createInvoice({
                client_id: client.id,
                log_ids: items.map((i) => i.id),
                invoice_number: invoiceNumber,
                issue_date: issueDate,
            })
            toast.success(`Factura #${invoice.invoice_number} generada`)
            onSuccess()
            onOpenChange(false)
            await downloadInvoice(invoice.id, 'docx')
        } catch (error) {
            console.error(error)
            toast.error(error instanceof Error ? error.message : 'Error al generar factura')
        } finally {
            setLoading(false)
        }
    }

    if (!client) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Generar Factura</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Cliente</Label>
                            <div className="font-medium mt-1">{client.name}</div>
                        </div>
                        <div>
                            <Label>Total a Facturar</Label>
                            <div className="font-medium mt-1 text-emerald-600 font-mono">
                                ${totalAmount.toFixed(2)}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="invoice-number">Número de Factura</Label>
                        <Input
                            id="invoice-number"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="issue-date">Fecha de Emisión</Label>
                        <Input
                            id="issue-date"
                            type="date"
                            value={issueDate}
                            onChange={(e) => setIssueDate(e.target.value)}
                        />
                    </div>

                    <div className="text-sm text-muted-foreground mt-2">
                        Se facturarán {items.length} ítems pendientes.
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleGenerate} disabled={loading}>
                        {loading ? 'Generando...' : 'Confirmar y Generar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
