'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight, CircleCheck, Download, FileText, LoaderCircle, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { Client, ServiceCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    addLog,
    createInvoice,
    currentPeriod,
    deleteLog,
    getBillingSnapshot,
    getClientStats,
    listCategories,
    listClients,
    loadRecurringServices,
    refreshEurValues,
    todayISO,
} from '@/lib/actions'
import { downloadInvoice } from '@/lib/invoice-download'
import { emitDataChanged, useDataChanged } from '@/lib/events'
import { periodLabel } from '@/lib/agent/shared'

type Snapshot = Awaited<ReturnType<typeof getBillingSnapshot>>
type Stats = Awaited<ReturnType<typeof getClientStats>>
type Step = 1 | 2 | 3 | 4

const STEPS: { n: Step; label: string }[] = [
    { n: 1, label: 'Cliente' },
    { n: 2, label: 'Servicios fijos' },
    { n: 3, label: 'Ítems del mes' },
    { n: 4, label: 'Revisar y emitir' },
]

const usd = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`

export default function MonthEndPage() {
    const period = currentPeriod()
    const [clients, setClients] = useState<Client[]>([])
    const [stats, setStats] = useState<Stats>({})
    const [categories, setCategories] = useState<ServiceCategory[]>([])
    const [clientId, setClientId] = useState<string>('')
    const [step, setStep] = useState<Step>(1)
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
    const [busy, setBusy] = useState(false)
    // paso 3
    const [desc, setDesc] = useState('')
    const [amount, setAmount] = useState('')
    const [category, setCategory] = useState('')
    // paso 4
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [issueDate, setIssueDate] = useState(todayISO())
    const [dueDate, setDueDate] = useState('')
    const [done, setDone] = useState<{ id: string; number: string; total: number } | null>(null)

    const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId])
    const standardClients = useMemo(() => clients.filter((c) => c.billing_modality !== 'hour_bag' && !c.parent_client_id), [clients])

    const loadBase = async () => {
        try {
            const [c, s, cats] = await Promise.all([listClients(), getClientStats(), listCategories()])
            setClients(c)
            setStats(s)
            setCategories(cats)
            if (!category && cats.length) setCategory((cats.find((x) => x.name === 'Desarrollo Web') || cats[0]).id)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar')
        }
    }
    const loadSnapshot = async (id = clientId) => {
        if (!id) return
        setBusy(true)
        try {
            const snap = await getBillingSnapshot(id, period)
            setSnapshot(snap)
            setInvoiceNumber((n) => n || snap.next_invoice_number)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar el cliente')
        } finally {
            setBusy(false)
        }
    }

    useEffect(() => {
        loadBase()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    useDataChanged(() => {
        loadBase()
        if (clientId && !done) loadSnapshot()
    })

    const pickClient = async (id: string) => {
        setClientId(id)
        setDone(null)
        setInvoiceNumber('')
        setDueDate('')
        setIssueDate(todayISO())
        await loadSnapshot(id)
        setStep(2)
    }

    const handleLoadRecurring = async () => {
        if (!clientId) return
        setBusy(true)
        try {
            const { inserted, skipped } = await loadRecurringServices(clientId, period)
            toast.success(inserted.length ? `${inserted.length} servicios fijos cargados` : skipped.length ? 'Ya estaban todos cargados' : 'No hay servicios fijos')
            emitDataChanged()
            await loadSnapshot()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar servicios fijos')
        } finally {
            setBusy(false)
        }
    }

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!clientId) return
        setBusy(true)
        try {
            await addLog({ client_id: clientId, description: desc, amount: Number(amount), category: category || undefined })
            toast.success('Ítem agregado')
            setDesc('')
            setAmount('')
            emitDataChanged()
            await loadSnapshot()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo agregar el ítem')
        } finally {
            setBusy(false)
        }
    }

    const handleDeleteItem = async (id: string) => {
        setBusy(true)
        try {
            await deleteLog(id)
            emitDataChanged()
            await loadSnapshot()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
        } finally {
            setBusy(false)
        }
    }

    const handleRefreshRates = async () => {
        if (!clientId) return
        setBusy(true)
        try {
            const { updated, rate } = await refreshEurValues(clientId)
            toast.success(updated ? `${updated} ítems actualizados con tasa ${rate.toFixed(4)}` : 'No hay ítems en EUR')
            await loadSnapshot()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al actualizar tasas')
        } finally {
            setBusy(false)
        }
    }

    const handleGenerate = async () => {
        if (!clientId || !snapshot) return
        setBusy(true)
        try {
            const { invoice } = await createInvoice({
                client_id: clientId,
                log_ids: snapshot.pending_logs.map((l) => l.id),
                invoice_number: invoiceNumber || undefined,
                issue_date: issueDate || undefined,
                due_date: dueDate || undefined,
            })
            setDone({ id: invoice.id, number: invoice.invoice_number, total: invoice.total_amount })
            toast.success(`Factura #${invoice.invoice_number} emitida`)
            emitDataChanged()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo emitir la factura')
        } finally {
            setBusy(false)
        }
    }

    const reset = () => {
        setClientId('')
        setSnapshot(null)
        setDone(null)
        setStep(1)
    }

    const pendingTotal = snapshot?.pending_total_usd ?? 0
    const isEur = client?.preferred_input_currency === 'EUR'

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Facturación</h1>
                    <p className="text-sm text-muted-foreground mt-1">Cierre de {periodLabel(period)} paso a paso</p>
                </div>
                {clientId && !done && (
                    <Button variant="ghost" size="sm" onClick={reset}>Cambiar cliente</Button>
                )}
            </div>

            {/* Stepper */}
            <ol className="flex items-center gap-2 mb-6 text-xs">
                {STEPS.map((s, i) => {
                    const active = step === s.n
                    const doneStep = step > s.n || !!done
                    return (
                        <li key={s.n} className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={!clientId || !!done || s.n > step}
                                onClick={() => setStep(s.n)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-colors ${
                                    active ? 'bg-teal-600 border-teal-600 text-white' : doneStep ? 'border-teal-500/40 text-teal-700 dark:text-teal-300' : 'border-border text-muted-foreground'
                                } disabled:cursor-default`}
                            >
                                <span className={`h-4 w-4 rounded-full text-[10px] flex items-center justify-center ${active ? 'bg-white/20' : doneStep ? 'bg-teal-500/20' : 'bg-muted'}`}>
                                    {doneStep && !active ? <Check className="w-3 h-3" /> : s.n}
                                </span>
                                <span className="hidden sm:inline">{s.label}</span>
                            </button>
                            {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        </li>
                    )
                })}
            </ol>

            {/* Paso 1: cliente */}
            {step === 1 && (
                <div className="rounded-xl border bg-card shadow-sm divide-y">
                    {standardClients.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No hay clientes facturables.</p>}
                    {standardClients.map((c) => {
                        const subs = clients.filter((x) => x.parent_client_id === c.id)
                        const pendingTotalC = [c, ...subs].reduce((s, x) => s + (stats[x.id]?.pending_total ?? 0), 0)
                        const pendingCount = [c, ...subs].reduce((s, x) => s + (stats[x.id]?.pending_count ?? 0), 0)
                        return (
                            <button key={c.id} type="button" onClick={() => pickClient(c.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold truncate">{c.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {c.preferred_input_currency}
                                        {subs.length ? ` · ${subs.length} subcliente${subs.length === 1 ? '' : 's'}` : ''}
                                        {stats[c.id]?.last_invoice_date ? ` · últ. factura ${stats[c.id].last_invoice_date!.split('-').reverse().join('/')}` : ''}
                                    </p>
                                </div>
                                <div className="text-right text-xs">
                                    {pendingCount > 0 ? (
                                        <>
                                            <p className="font-mono font-semibold text-amber-600 dark:text-amber-400">{usd(pendingTotalC)}</p>
                                            <p className="text-muted-foreground">{pendingCount} pendiente{pendingCount === 1 ? '' : 's'}</p>
                                        </>
                                    ) : (
                                        <p className="text-muted-foreground">Sin pendientes</p>
                                    )}
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Pasos 2-4 */}
            {step > 1 && client && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
                        <div>
                            <p className="font-semibold">{client.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {snapshot ? `${snapshot.pending_logs.length} pendientes · ${usd(pendingTotal)}` : '…'}
                                {isEur && snapshot ? ` · tasa ${snapshot.eur_usd_rate.toFixed(4)}` : ''}
                            </p>
                        </div>
                        {busy && <LoaderCircle className="w-4 h-4 animate-spin text-muted-foreground" />}
                    </div>

                    {step === 2 && snapshot && (
                        <div className="rounded-xl border bg-card shadow-sm">
                            <div className="px-4 py-3 border-b">
                                <h2 className="font-semibold">Servicios fijos de {periodLabel(period)}</h2>
                                <p className="text-xs text-muted-foreground">Solo se cargan los que falten. Ya cargados: {snapshot.recurring_services.already_loaded_this_period.length}.</p>
                            </div>
                            {snapshot.recurring_services.to_load.length === 0 ? (
                                <p className="px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
                                    <CircleCheck className="w-4 h-4 text-emerald-500" />
                                    {snapshot.recurring_services.already_loaded_this_period.length ? 'Todos los fijos de este mes ya están cargados.' : 'Este cliente no tiene servicios fijos.'}
                                </p>
                            ) : (
                                <>
                                    <ul className="divide-y">
                                        {snapshot.recurring_services.to_load.map((s) => (
                                            <li key={s.id} className="px-4 py-2.5 flex justify-between text-sm">
                                                <span>{s.description}</span>
                                                <span className="font-mono">{usd(s.amount_usd)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="px-4 py-3 border-t flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Total a cargar: <strong className="font-mono text-foreground">{usd(snapshot.recurring_services.to_load_total_usd)}</strong></span>
                                        <Button onClick={handleLoadRecurring} disabled={busy} className="bg-purple-600 hover:bg-purple-700 text-white">
                                            <Sparkles /> Cargar {snapshot.recurring_services.to_load.length} servicios
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {step === 3 && snapshot && (
                        <div className="space-y-4">
                            <form onSubmit={handleAddItem} className="rounded-xl border bg-card shadow-sm p-4 space-y-2">
                                <h2 className="font-semibold">Agregar ítem puntual</h2>
                                <Input placeholder="Descripción del trabajo" value={desc} onChange={(e) => setDesc(e.target.value)} required minLength={3} />
                                <div className="flex gap-2">
                                    <Select value={category} onValueChange={setCategory}>
                                        <SelectTrigger className="flex-1"><SelectValue placeholder="Categoría" /></SelectTrigger>
                                        <SelectContent>
                                            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Input type="number" step="0.01" min="0" placeholder={`Monto ${client.preferred_input_currency}`} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40" required />
                                    <Button type="submit" disabled={busy} className="bg-teal-600 hover:bg-teal-700 text-white"><Plus /> Agregar</Button>
                                </div>
                            </form>
                            <div className="rounded-xl border bg-card shadow-sm">
                                <div className="px-4 py-3 border-b flex items-center justify-between">
                                    <h2 className="font-semibold">Pendientes a facturar ({snapshot.pending_logs.length})</h2>
                                    {isEur && (
                                        <Button variant="outline" size="sm" onClick={handleRefreshRates} disabled={busy}>
                                            <RefreshCw className={busy ? 'animate-spin' : ''} /> Actualizar tasa
                                        </Button>
                                    )}
                                </div>
                                {snapshot.pending_logs.length === 0 ? (
                                    <p className="px-4 py-6 text-sm text-muted-foreground">No hay ítems pendientes. Agrega uno arriba o carga los servicios fijos.</p>
                                ) : (
                                    <ul className="divide-y">
                                        {snapshot.pending_logs.map((l) => (
                                            <li key={l.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                                                <div className="flex-1 min-w-0">
                                                    <p className="truncate">{l.description}</p>
                                                    <p className="text-xs text-muted-foreground">{[l.client_name, l.category, l.date?.split('-').reverse().join('/')].filter(Boolean).join(' · ')}</p>
                                                </div>
                                                <span className="font-mono">
                                                    {l.currency === 'EUR' && l.original_amount != null && <span className="text-xs text-muted-foreground mr-1">({Number(l.original_amount).toFixed(2)} €)</span>}
                                                    {usd(l.value_usd)}
                                                </span>
                                                <Button size="icon-xs" variant="ghost" onClick={() => handleDeleteItem(l.id)} disabled={busy} className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Quitar">
                                                    <Trash2 />
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 4 && snapshot && !done && (
                        <div className="rounded-xl border bg-card shadow-sm">
                            <div className="px-4 py-3 border-b">
                                <h2 className="font-semibold">Revisar y emitir</h2>
                                <p className="text-xs text-muted-foreground">Se facturarán {snapshot.pending_logs.length} ítems por {usd(pendingTotal)}.</p>
                            </div>
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label htmlFor="inv-num">Nº de factura</Label>
                                    <Input id="inv-num" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="inv-date">Fecha de emisión</Label>
                                    <Input id="inv-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="inv-due">Vencimiento (opcional)</Label>
                                    <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                                </div>
                            </div>
                            <ul className="divide-y border-t max-h-64 overflow-y-auto">
                                {snapshot.pending_logs.map((l) => (
                                    <li key={l.id} className="px-4 py-2 flex justify-between text-sm">
                                        <span className="truncate">{l.description}</span>
                                        <span className="font-mono shrink-0">{usd(l.value_usd)}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="px-4 py-3 border-t flex items-center justify-between">
                                <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{usd(pendingTotal)}</span>
                                <Button onClick={handleGenerate} disabled={busy || snapshot.pending_logs.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                    <FileText /> Emitir factura
                                </Button>
                            </div>
                        </div>
                    )}

                    {done && (
                        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center space-y-3">
                            <CircleCheck className="w-10 h-10 text-emerald-500 mx-auto" />
                            <p className="text-lg font-semibold">Factura #{done.number} emitida por {usd(done.total)}</p>
                            <div className="flex justify-center gap-2">
                                <Button variant="outline" onClick={() => downloadInvoice(done.id, 'pdf')}><FileText /> PDF</Button>
                                <Button variant="outline" onClick={() => downloadInvoice(done.id, 'docx')}><Download /> DOCX</Button>
                            </div>
                            <Button variant="ghost" size="sm" onClick={reset}>Facturar otro cliente</Button>
                        </div>
                    )}

                    {!done && (
                        <div className="flex justify-between">
                            <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1) as Step)} disabled={busy}>
                                <ChevronLeft /> Atrás
                            </Button>
                            {step < 4 && (
                                <Button onClick={() => setStep((s) => Math.min(4, s + 1) as Step)} disabled={busy}>
                                    Siguiente <ChevronRight />
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
