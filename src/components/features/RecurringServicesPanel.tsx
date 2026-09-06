'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Euro, DollarSign, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { Client, RecurringService, ServiceCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getEurToUsdRate } from '@/lib/currency'
import { addRecurringService, deleteRecurringService, listAllRecurringServices, listCategories, setRecurringServiceActive } from '@/lib/actions'
import { emitDataChanged } from '@/lib/events'

/** Servicios fijos de un cliente, embebido en la ficha (sin diálogo). */
export function RecurringServicesPanel({ client }: { client: Client }) {
    const [services, setServices] = useState<RecurringService[]>([])
    const [categories, setCategories] = useState<ServiceCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [desc, setDesc] = useState('')
    const [amount, setAmount] = useState('')
    const [category, setCategory] = useState('')
    const [rate, setRate] = useState(1.08)
    const isEur = client.preferred_input_currency === 'EUR'

    const load = async () => {
        setLoading(true)
        try {
            const [s, c, r] = await Promise.all([listAllRecurringServices(client.id), listCategories(), getEurToUsdRate()])
            setServices(s)
            setCategories(c)
            setRate(r)
            if (!category && c.length) setCategory((c.find((x) => x.name === 'Desarrollo Web') || c[0]).id)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar servicios fijos')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.id])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        setAdding(true)
        try {
            await addRecurringService({ client_id: client.id, description: desc, amount: Number(amount), category: category || undefined })
            toast.success('Servicio fijo agregado')
            setDesc('')
            setAmount('')
            emitDataChanged()
            await load()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al agregar servicio')
        } finally {
            setAdding(false)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await deleteRecurringService(id)
            toast.success('Servicio eliminado')
            emitDataChanged()
            await load()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al eliminar')
        }
    }

    const handleToggle = async (s: RecurringService) => {
        try {
            await setRecurringServiceActive(s.id, !s.is_active)
            emitDataChanged()
            await load()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al actualizar')
        }
    }

    const usdPreview = isEur && amount && !isNaN(Number(amount)) ? (Number(amount) * rate).toFixed(2) : null

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
                Cargos que se repiten cada mes. Al facturar el mes se cargan automáticamente los que falten. Los montos van en {client.preferred_input_currency}.
            </p>
            <form onSubmit={handleAdd} className="space-y-2 rounded-lg border p-3 bg-muted/30">
                <Input placeholder="Descripción (ej: Mantenimiento web)" value={desc} onChange={(e) => setDesc(e.target.value)} required minLength={3} />
                <div className="flex gap-2">
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Categoría" /></SelectTrigger>
                        <SelectContent>
                            {categories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="relative w-32">
                        {isEur ? <Euro className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /> : <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />}
                        <Input type="number" step="0.01" min="0" placeholder={client.preferred_input_currency} value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-7" required />
                    </div>
                    <Button type="submit" disabled={adding} className="bg-teal-600 hover:bg-teal-700 text-white">
                        {adding ? <LoaderCircle className="animate-spin" /> : <Plus />}
                    </Button>
                </div>
                {usdPreview && <p className="text-[11px] text-teal-600 font-mono">≈ ${usdPreview} USD (tasa {rate.toFixed(4)})</p>}
            </form>

            {loading ? (
                <div className="flex justify-center py-4"><LoaderCircle className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : services.length === 0 ? (
                <p className="text-center py-4 text-sm text-muted-foreground">Este cliente no tiene servicios fijos.</p>
            ) : (
                <ul className="space-y-2">
                    {services.map((s) => (
                        <li key={s.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${s.is_active ? 'bg-card' : 'bg-muted/40 opacity-70'}`}>
                            <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{s.description}</p>
                                <p className="text-xs text-muted-foreground">
                                    <span className="text-emerald-600 font-medium">${Number(s.amount).toFixed(2)} USD</span>
                                    {s.currency === 'EUR' && s.original_amount != null && <> · {Number(s.original_amount).toFixed(2)} €</>}
                                    {s.service_categories?.name && <> · {s.service_categories.name}</>}
                                    {!s.is_active && <> · <span className="text-amber-600">pausado</span></>}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost" onClick={() => handleToggle(s)} title={s.is_active ? 'Pausar' : 'Reactivar'}>
                                    {s.is_active ? 'Pausar' : 'Activar'}
                                </Button>
                                <Button size="icon-sm" variant="ghost" onClick={() => handleDelete(s.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Eliminar">
                                    <Trash2 />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
