'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, CheckCircle, Download, FileDown, FileText, HeartHandshake, Mail, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react'
import { Client, EmailKind, EmailLog, Invoice, Log, ServiceCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pagination } from '@/components/ui/Pagination'
import {
    deleteInvoice,
    getEmailStatusByInvoice,
    getInvoiceWithItems,
    listCategories,
    listClients,
    listInvoices,
    markInvoicePaid,
    markInvoiceSent,
    revertInvoiceToDraft,
    updateInvoiceDueDate,
    updateInvoiceItem,
} from '@/lib/actions'
import { EmailDialog } from '@/components/features/EmailDialog'
import { downloadInvoice } from '@/lib/invoice-download'
import { emitDataChanged, useDataChanged } from '@/lib/events'
import { periodLabel } from '@/lib/agent/shared'

const STATUS_LABELS: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', paid: 'Pagada' }
const STATUS_CLASS: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    sent: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}
const fmt = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '')
const usd = (n: number) => `$${Number(n).toFixed(2)}`

type Confirm = { kind: 'paid' | 'revert' | 'delete' | 'sent'; invoice: Invoice } | null

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [clientFilter, setClientFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState('all')
    const [monthFilter, setMonthFilter] = useState('all')
    const [page, setPage] = useState(1)
    const perPage = 8
    const [confirm, setConfirm] = useState<Confirm>(null)
    const [working, setWorking] = useState(false)
    const [toDownload, setToDownload] = useState<Invoice | null>(null)
    const [dueEdit, setDueEdit] = useState<Invoice | null>(null)
    const [dueValue, setDueValue] = useState('')
    const [emailStatus, setEmailStatus] = useState<Record<string, { invoice?: EmailLog; payment_thanks?: EmailLog }>>({})
    const [emailDialog, setEmailDialog] = useState<{ kind: EmailKind; id: string } | null>(null)
    const [paidDate, setPaidDate] = useState('')
    const [itemsEdit, setItemsEdit] = useState<Invoice | null>(null)
    const [itemsToEdit, setItemsToEdit] = useState<Log[]>([])
    const [itemDescriptions, setItemDescriptions] = useState<Record<string, string>>({})
    const [itemCategories, setItemCategories] = useState<Record<string, string>>({})
    const [categories, setCategories] = useState<ServiceCategory[]>([])
    const [loadingItems, setLoadingItems] = useState(false)
    const [savingItems, setSavingItems] = useState(false)

    const load = async () => {
        try {
            const [inv, cl, es] = await Promise.all([listInvoices(), listClients(), getEmailStatusByInvoice().catch(() => ({}))])
            setInvoices(inv)
            setClients(cl)
            setEmailStatus(es)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar facturas')
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => {
        load()
    }, [])
    useDataChanged(load)

    const months = useMemo(() => [...new Set(invoices.map((i) => i.issue_date.slice(0, 7)))].sort().reverse(), [invoices])
    const filtered = useMemo(
        () =>
            invoices.filter(
                (i) =>
                    (clientFilter === 'all' || i.client_id === clientFilter) &&
                    (statusFilter === 'all' || i.status === statusFilter) &&
                    (monthFilter === 'all' || i.issue_date.startsWith(monthFilter))
            ),
        [invoices, clientFilter, statusFilter, monthFilter]
    )
    useEffect(() => setPage(1), [clientFilter, statusFilter, monthFilter])
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    const current = filtered.slice((page - 1) * perPage, page * perPage)
    const sumFiltered = filtered.reduce((s, i) => s + Number(i.total_amount || 0), 0)
    const sumUnpaid = filtered.filter((i) => i.status !== 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0)
    const today = new Date().toISOString().split('T')[0]

    const run = async (fn: () => Promise<unknown>, ok: string) => {
        setWorking(true)
        try {
            await fn()
            toast.success(ok)
            setConfirm(null)
            emitDataChanged()
            await load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error')
        } finally {
            setWorking(false)
        }
    }

    const executeConfirm = () => {
        if (!confirm) return
        const { kind, invoice } = confirm
        if (kind === 'paid') return run(() => markInvoicePaid(invoice.id, paidDate || undefined), 'Factura marcada como pagada')
        if (kind === 'sent') return run(() => markInvoiceSent(invoice.id), 'Factura marcada como enviada')
        if (kind === 'revert') return run(() => revertInvoiceToDraft(invoice.id), 'Factura devuelta a borrador')
        if (kind === 'delete') return run(() => deleteInvoice(invoice.id), 'Factura eliminada; sus ítems vuelven a pendientes')
    }

    const saveDue = () => {
        if (!dueEdit) return
        const inv = dueEdit
        setDueEdit(null)
        return run(() => updateInvoiceDueDate(inv.id, dueValue || null), dueValue ? 'Vencimiento guardado' : 'Vencimiento eliminado')
    }

    const openItemsEdit = async (inv: Invoice) => {
        setItemsEdit(inv)
        setLoadingItems(true)
        try {
            const [{ items }, cats] = await Promise.all([getInvoiceWithItems(inv.id), listCategories()])
            setItemsToEdit(items)
            setCategories(cats)
            setItemDescriptions(Object.fromEntries(items.map((it) => [it.id, it.description])))
            setItemCategories(Object.fromEntries(items.map((it) => [it.id, it.category_id ?? ''])))
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar los ítems')
            setItemsEdit(null)
        } finally {
            setLoadingItems(false)
        }
    }

    const saveItemDescriptions = async () => {
        if (!itemsEdit) return
        const changed = itemsToEdit
            .map((it) => {
                const updates: { description?: string; category_id?: string | null } = {}
                const newDesc = (itemDescriptions[it.id] ?? '').trim()
                if (newDesc !== it.description) updates.description = newDesc
                const newCat = itemCategories[it.id] || null
                if (newCat !== (it.category_id ?? null)) updates.category_id = newCat
                return { id: it.id, updates }
            })
            .filter((c) => Object.keys(c.updates).length > 0)
        if (changed.length === 0) {
            setItemsEdit(null)
            return
        }
        setSavingItems(true)
        try {
            await Promise.all(changed.map((c) => updateInvoiceItem(c.id, c.updates)))
            toast.success(changed.length === 1 ? 'Ítem corregido' : `${changed.length} ítems corregidos`)
            setItemsEdit(null)
            emitDataChanged()
            await load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al guardar')
        } finally {
            setSavingItems(false)
        }
    }

    const confirmCopy: Record<NonNullable<Confirm>['kind'], { title: string; body: string; cta: string; cls: string }> = {
        paid: { title: 'Confirmar pago', body: 'Indica cuándo pagó el cliente: esta fecha queda en el recibo y en el correo de agradecimiento.', cta: 'Marcar pagada', cls: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
        sent: { title: 'Marcar como enviada', body: '¿Ya le enviaste esta factura al cliente?', cta: 'Sí, enviada', cls: 'bg-sky-600 hover:bg-sky-700 text-white' },
        revert: { title: 'Revertir a borrador', body: 'Se eliminará la fecha de pago.', cta: 'Revertir', cls: 'bg-amber-600 hover:bg-amber-700 text-white' },
        delete: { title: 'Eliminar factura', body: 'Sus ítems volverán a estar pendientes en Facturación. Esta acción no se puede deshacer.', cta: 'Eliminar', cls: 'bg-destructive hover:bg-destructive/90 text-white' },
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-2xl font-bold">Facturas</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {filtered.length} factura{filtered.length === 1 ? '' : 's'} · {usd(sumFiltered)}
                        {sumUnpaid > 0 && <> · <span className="text-amber-600 dark:text-amber-400">por cobrar {usd(sumUnpaid)}</span></>}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Select value={clientFilter} onValueChange={setClientFilter}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Cliente" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los clientes</SelectItem>
                            {clients.filter((c) => c.billing_modality !== 'hour_bag').map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="draft">Borrador</SelectItem>
                            <SelectItem value="sent">Enviada</SelectItem>
                            <SelectItem value="paid">Pagada</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={monthFilter} onValueChange={setMonthFilter}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Mes" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los meses</SelectItem>
                            {months.map((m) => <SelectItem key={m} value={m}>{periodLabel(m)}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm divide-y">
                {loading ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">Cargando…</p>
                ) : current.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">No hay facturas con esos filtros.</p>
                ) : (
                    current.map((inv) => {
                        const overdue = inv.status !== 'paid' && inv.due_date && inv.due_date < today
                        return (
                            <div key={inv.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold">#{inv.invoice_number}</span>
                                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_CLASS[inv.status]}`}>{STATUS_LABELS[inv.status] ?? inv.status}</span>
                                        {overdue && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Vencida</span>}
                                    </div>
                                    <p className="font-medium text-primary truncate">{inv.clients?.name ?? 'Cliente desconocido'}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Emitida {fmt(inv.issue_date)}
                                        {inv.due_date ? ` · vence ${fmt(inv.due_date)}` : ''}
                                        {inv.status === 'paid' && inv.paid_at ? ` · pagada ${fmt(inv.paid_at.split('T')[0])}` : ''}
                                    </p>
                                    {(emailStatus[inv.id]?.invoice || emailStatus[inv.id]?.payment_thanks) && (
                                        <p className="text-[11px] text-sky-700 dark:text-sky-300 flex flex-wrap gap-x-3">
                                            {emailStatus[inv.id]?.invoice && <span>✉ Enviada {fmt(emailStatus[inv.id].invoice!.sent_at.split('T')[0])} a {emailStatus[inv.id].invoice!.to_email}</span>}
                                            {emailStatus[inv.id]?.payment_thanks && <span>🙏 Agradecimiento {fmt(emailStatus[inv.id].payment_thanks!.sent_at.split('T')[0])}</span>}
                                        </p>
                                    )}
                                </div>
                                <div className="font-bold text-lg font-mono sm:text-right sm:w-28">{usd(inv.total_amount)}</div>
                                <div className="flex items-center gap-1 flex-wrap">
                                    <Button variant="outline" size="icon" title={inv.status === 'paid' ? 'Reenviar factura por correo' : 'Enviar factura por correo'} className="text-teal-600" onClick={() => setEmailDialog({ kind: 'invoice', id: inv.id })}>
                                        <Mail />
                                    </Button>
                                    {inv.status === 'paid' && (
                                        <Button variant="outline" size="icon" title="Enviar agradecimiento de pago" className="text-emerald-600" onClick={() => setEmailDialog({ kind: 'payment_thanks', id: inv.id })}>
                                            <HeartHandshake />
                                        </Button>
                                    )}
                                    {inv.status === 'draft' && (
                                        <Button variant="outline" size="icon" title="Corregir conceptos" className="text-indigo-600" onClick={() => openItemsEdit(inv)}>
                                            <Pencil />
                                        </Button>
                                    )}
                                    {inv.status === 'draft' && (
                                        <Button variant="outline" size="icon" title="Marcar como enviada" className="text-sky-600" onClick={() => setConfirm({ kind: 'sent', invoice: inv })}>
                                            <Send />
                                        </Button>
                                    )}
                                    {inv.status !== 'paid' ? (
                                        <Button variant="outline" size="icon" title="Marcar como pagada" className="text-emerald-600" onClick={() => { setPaidDate(today); setConfirm({ kind: 'paid', invoice: inv }) }}>
                                            <CheckCircle />
                                        </Button>
                                    ) : (
                                        <Button variant="outline" size="icon" title="Revertir a borrador" className="text-amber-600" onClick={() => setConfirm({ kind: 'revert', invoice: inv })}>
                                            <RotateCcw />
                                        </Button>
                                    )}
                                    {inv.status !== 'paid' && (
                                        <Button variant="outline" size="icon" title="Fecha de vencimiento" onClick={() => { setDueEdit(inv); setDueValue(inv.due_date ?? '') }}>
                                            <CalendarDays />
                                        </Button>
                                    )}
                                    <Button variant="outline" size="icon" title="Descargar" onClick={() => setToDownload(inv)}>
                                        <Download />
                                    </Button>
                                    <Button variant="outline" size="icon" title="Eliminar" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setConfirm({ kind: 'delete', invoice: inv })}>
                                        <Trash2 />
                                    </Button>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

            <Dialog open={!!confirm} onOpenChange={(o) => !o && !working && setConfirm(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirm ? confirmCopy[confirm.kind].title : ''}</DialogTitle>
                        <DialogDescription>
                            Factura <strong>#{confirm?.invoice.invoice_number}</strong> · {confirm?.invoice.clients?.name} · {confirm ? usd(confirm.invoice.total_amount) : ''}. {confirm ? confirmCopy[confirm.kind].body : ''}
                        </DialogDescription>
                    </DialogHeader>
                    {confirm?.kind === 'paid' && (
                        <div className="space-y-1">
                            <Label htmlFor="paid-date">Fecha de pago</Label>
                            <Input id="paid-date" type="date" max={today} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirm(null)} disabled={working}>Cancelar</Button>
                        <Button className={confirm ? confirmCopy[confirm.kind].cls : ''} onClick={executeConfirm} disabled={working}>
                            {working ? 'Procesando…' : confirm ? confirmCopy[confirm.kind].cta : ''}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!dueEdit} onOpenChange={(o) => !o && setDueEdit(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Fecha de vencimiento</DialogTitle>
                        <DialogDescription>Factura #{dueEdit?.invoice_number}. Sale en el documento como «Pagar antes de» y se usa para marcarla vencida.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1">
                        <Label htmlFor="due">Vence el</Label>
                        <Input id="due" type="date" value={dueValue} onChange={(e) => setDueValue(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDueEdit(null)}>Cancelar</Button>
                        <Button onClick={saveDue} disabled={working}>Guardar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!itemsEdit} onOpenChange={(o) => !o && !savingItems && setItemsEdit(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Corregir conceptos · Factura #{itemsEdit?.invoice_number}</DialogTitle>
                        <DialogDescription>
                            Solo se puede mientras la factura siga en borrador. El monto de cada ítem no cambia, solo el texto.
                        </DialogDescription>
                    </DialogHeader>
                    {loadingItems ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">Cargando…</p>
                    ) : (
                        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                            {itemsToEdit.map((it) => (
                                <div key={it.id} className="space-y-2 pb-3 border-b last:border-0">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>Ítem</span>
                                        <span className="font-mono font-semibold">{usd(Number(it.value ?? 0))}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Concepto (descripción)</Label>
                                        <Input
                                            value={itemDescriptions[it.id] ?? ''}
                                            onChange={(e) => setItemDescriptions((prev) => ({ ...prev, [it.id]: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Categoría (PRODUCTO / SERVICIO en el documento)</Label>
                                        <Select
                                            value={itemCategories[it.id] || 'none'}
                                            onValueChange={(v) => setItemCategories((prev) => ({ ...prev, [it.id]: v === 'none' ? '' : v }))}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Servicio Profesional" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Servicio Profesional (sin categoría)</SelectItem>
                                                {categories.map((c) => (
                                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setItemsEdit(null)} disabled={savingItems}>Cancelar</Button>
                        <Button onClick={saveItemDescriptions} disabled={savingItems || loadingItems}>
                            {savingItems ? 'Guardando…' : 'Guardar cambios'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <EmailDialog
                kind={emailDialog?.kind ?? 'invoice'}
                id={emailDialog?.id ?? null}
                open={!!emailDialog}
                onOpenChange={(o) => !o && setEmailDialog(null)}
                onSent={load}
            />

            <Dialog open={!!toDownload} onOpenChange={(o) => !o && setToDownload(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Descargar factura #{toDownload?.invoice_number}</DialogTitle>
                        <DialogDescription>Elige el formato.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-2">
                        <Button variant="outline" className="h-24 flex flex-col gap-2 hover:border-red-400" onClick={() => { const id = toDownload!.id; setToDownload(null); downloadInvoice(id, 'pdf') }}>
                            <FileText className="w-8 h-8 text-red-500" /> <span className="font-semibold">PDF</span>
                        </Button>
                        <Button variant="outline" className="h-24 flex flex-col gap-2 hover:border-blue-400" onClick={() => { const id = toDownload!.id; setToDownload(null); downloadInvoice(id, 'docx') }}>
                            <FileDown className="w-8 h-8 text-blue-500" /> <span className="font-semibold">DOCX</span>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
