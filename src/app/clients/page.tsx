'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, Clock, Pencil, Plus, Search, Settings2, Trash2, UserRound } from 'lucide-react'
import { Client } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientForm } from '@/components/features/ClientForm'
import { RecurringServicesPanel } from '@/components/features/RecurringServicesPanel'
import { createClient, deleteClient, getClientStats, listClients, updateClient, type ClientInput } from '@/lib/actions'
import { emitDataChanged, useDataChanged } from '@/lib/events'
import { normalizeText } from '@/lib/actions/validation'

type Stats = Awaited<ReturnType<typeof getClientStats>>
type Tab = 'datos' | 'fijos'

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([])
    const [stats, setStats] = useState<Stats>({})
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')
    const [sheetOpen, setSheetOpen] = useState(false)
    const [editing, setEditing] = useState<Client | null>(null)
    const [tab, setTab] = useState<Tab>('datos')
    const [saving, setSaving] = useState(false)
    const [toDelete, setToDelete] = useState<Client | null>(null)
    const [deleting, setDeleting] = useState(false)

    const load = async () => {
        try {
            const [c, s] = await Promise.all([listClients(), getClientStats()])
            setClients(c)
            setStats(s)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar clientes')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])
    useDataChanged(load)

    const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
    const filtered = useMemo(() => {
        const q = normalizeText(query)
        if (!q) return clients
        return clients.filter((c) => normalizeText(c.name).includes(q) || normalizeText(c.contact_name ?? '').includes(q) || normalizeText(c.email ?? '').includes(q))
    }, [clients, query])
    // Padres primero, con sus subclientes anidados debajo
    const grouped = useMemo(() => {
        const parents = filtered.filter((c) => !c.parent_client_id)
        const orphans = filtered.filter((c) => c.parent_client_id && !filtered.some((p) => p.id === c.parent_client_id))
        return [...parents, ...orphans].map((p) => ({ client: p, children: filtered.filter((c) => c.parent_client_id === p.id) }))
    }, [filtered])

    const openNew = () => {
        setEditing(null)
        setTab('datos')
        setSheetOpen(true)
    }
    const openEdit = (c: Client, t: Tab = 'datos') => {
        setEditing(c)
        setTab(t)
        setSheetOpen(true)
    }

    const handleSubmit = async (values: ClientInput) => {
        setSaving(true)
        try {
            if (editing) {
                const updated = await updateClient(editing.id, values)
                toast.success('Cliente actualizado')
                setEditing(updated)
            } else {
                const created = await createClient(values)
                toast.success('Cliente creado')
                setEditing(created)
            }
            emitDataChanged()
            await load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar el cliente')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!toDelete) return
        setDeleting(true)
        try {
            await deleteClient(toDelete.id)
            toast.success('Cliente eliminado')
            setToDelete(null)
            if (editing?.id === toDelete.id) setSheetOpen(false)
            emitDataChanged()
            await load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo eliminar')
        } finally {
            setDeleting(false)
        }
    }

    const ClientRow = ({ c, child }: { c: Client; child?: boolean }) => {
        const st = stats[c.id]
        const isBag = c.billing_modality === 'hour_bag'
        return (
            <div className={`flex items-center gap-3 px-4 py-3 ${child ? 'pl-10 bg-muted/20' : ''}`}>
                {child && <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <button type="button" onClick={() => openEdit(c)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{c.name}</span>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{c.preferred_input_currency}</span>
                        {isBag && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Bolsa 10h{c.hour_bag_price ? ` · €${c.hour_bag_price}` : ''}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                        {[c.contact_name, c.email, c.city].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </p>
                </button>
                <div className="hidden sm:block text-right text-xs shrink-0 w-36">
                    {st && st.pending_count > 0 ? (
                        <>
                            <p className="font-mono font-semibold text-amber-600 dark:text-amber-400">{isBag ? `${st.pending_count} registros` : `$${st.pending_total.toFixed(2)}`}</p>
                            <p className="text-muted-foreground">{isBag ? 'en la bolsa' : 'sin facturar'}</p>
                        </>
                    ) : (
                        <p className="text-muted-foreground">{st?.last_invoice_date ? `Últ. factura ${st.last_invoice_date.split('-').reverse().join('/')}` : 'Sin pendientes'}</p>
                    )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                    {!isBag && (
                        <Button size="icon-sm" variant="ghost" title="Servicios fijos" onClick={() => openEdit(c, 'fijos')}>
                            <Settings2 className="text-teal-600" />
                        </Button>
                    )}
                    <Button size="icon-sm" variant="ghost" title="Editar" onClick={() => openEdit(c)}>
                        <Pencil className="text-muted-foreground" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" title="Eliminar" onClick={() => setToDelete(c)}>
                        <Trash2 className="text-destructive" />
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Clientes</h1>
                    <p className="text-sm text-muted-foreground mt-1">{clients.length} clientes · toca uno para ver su ficha</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 w-full sm:w-56" />
                    </div>
                    <Button onClick={openNew} className="bg-teal-600 hover:bg-teal-700 text-white">
                        <Plus /> Nuevo cliente
                    </Button>
                </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm divide-y">
                {loading ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">Cargando…</p>
                ) : grouped.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">{query ? 'Sin resultados.' : 'Aún no hay clientes.'}</p>
                ) : (
                    grouped.map(({ client, children }) => (
                        <div key={client.id}>
                            <ClientRow c={client} />
                            {children.map((ch) => (
                                <ClientRow key={ch.id} c={ch} child />
                            ))}
                        </div>
                    ))
                )}
            </div>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden">
                    <SheetHeader className="px-5 py-4 border-b space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
                                <UserRound className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <SheetTitle className="truncate">{editing ? editing.name : 'Nuevo cliente'}</SheetTitle>
                                <SheetDescription className="text-xs">
                                    {editing
                                        ? [editing.preferred_input_currency, editing.billing_modality === 'hour_bag' ? 'Bolsa de 10 h' : 'Estándar', editing.parent_client_id ? `subcliente de ${byId.get(editing.parent_client_id)?.name ?? ''}` : null].filter(Boolean).join(' · ')
                                        : 'Solo el nombre es obligatorio. El resto sale en la factura si lo rellenas.'}
                                </SheetDescription>
                            </div>
                        </div>
                        {editing && editing.billing_modality !== 'hour_bag' && (
                            <div className="flex gap-1 pt-3">
                                {(['datos', 'fijos'] as Tab[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTab(t)}
                                        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${tab === t ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                                    >
                                        {t === 'datos' ? 'Datos' : 'Servicios fijos'}
                                    </button>
                                ))}
                            </div>
                        )}
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-5 py-5">
                        {tab === 'fijos' && editing ? (
                            <RecurringServicesPanel client={editing} />
                        ) : (
                            <ClientForm
                                key={editing?.id ?? 'new'}
                                clients={clients}
                                initial={editing}
                                submitting={saving}
                                onSubmit={handleSubmit}
                                onCancel={() => setSheetOpen(false)}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <Dialog open={!!toDelete} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar cliente</DialogTitle>
                        <DialogDescription>
                            ¿Eliminar <strong>{toDelete?.name}</strong>? Se borrarán también todos sus registros de actividad y sus facturas. Esta acción no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? 'Eliminando…' : 'Eliminar'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
