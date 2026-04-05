'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Client, Log } from '@/types'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { generateInvoiceDoc } from '@/lib/invoice-generator'

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
        // Simple logic: get last invoice number and increment
        // In a real app, this might be more complex or handled by DB sequence
        const { data, error } = await supabase
            .from('invoices')
            .select('invoice_number')
            .order('created_at', { ascending: false })
            .limit(1)

        if (data && data.length > 0) {
            const lastNum = parseInt(data[0].invoice_number)
            if (!isNaN(lastNum)) {
                setInvoiceNumber((lastNum + 1).toString().padStart(4, '0'))
            } else {
                setInvoiceNumber('0538')
            }
        } else {
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
            // 1. Create Invoice Record
            const { data: invoiceData, error: invoiceError } = await supabase
                .from('invoices')
                .insert({
                    invoice_number: invoiceNumber,
                    client_id: client.id,
                    issue_date: issueDate,
                    total_amount: totalAmount,
                    status: 'draft'
                })
                .select()
                .single()

            if (invoiceError) throw invoiceError

            // 2. Update Logs
            const logIds = items.map(i => i.id)
            const { error: logsError } = await supabase
                .from('logs')
                .update({
                    invoice_id: invoiceData.id,
                    status: 'billed'
                })
                .in('id', logIds)

            if (logsError) throw logsError

            // 3. Generate Docx
            await generateInvoiceDoc(invoiceData, items, client)

            toast.success(`Factura #${invoiceNumber} generada y descargada`)
            onSuccess()
            onOpenChange(false)

        } catch (error: any) {
            console.error(error)
            toast.error('Error al generar factura: ' + error.message)
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
