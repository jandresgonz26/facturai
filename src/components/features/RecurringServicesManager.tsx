'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Client, RecurringService, ServiceCategory } from '@/types'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Trash2, Plus, Loader2, Euro, DollarSign } from 'lucide-react'
import { getEurToUsdRate } from '@/lib/currency'

interface Props {
    client: Client
    onClose: () => void
}

export function RecurringServicesManager({ client, onClose }: Props) {
    const [services, setServices] = useState<RecurringService[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [newDesc, setNewDesc] = useState('')
    const [newAmount, setNewAmount] = useState('')
    const [eurAmount, setEurAmount] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [categories, setCategories] = useState<ServiceCategory[]>([])
    const [rate, setRate] = useState<number>(1.08)

    useEffect(() => {
        fetchServices()
        fetchCategories()
        fetchRate()
    }, [client.id])

    const fetchRate = async () => {
        const r = await getEurToUsdRate()
        setRate(r)
    }

    const fetchServices = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('recurring_services')
            .select('*')
            .eq('client_id', client.id)
            .order('created_at')

        if (error) {
            console.error('Error fetching services:', error)
            toast.error('Error al cargar servicios')
        } else {
            setServices(data || [])
        }
        setLoading(false)
    }

    const fetchCategories = async () => {
        const { data } = await supabase
            .from('service_categories')
            .select('*')
            .order('name')
        setCategories(data || [])
        if (data && data.length > 0) {
            const defaultCat = data.find(c => c.name === 'Desarrollo Web') || data[0]
            setCategoryId(defaultCat.id)
        }
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newDesc.trim() || !newAmount) return

        setAdding(true)
        const { error } = await supabase.from('recurring_services').insert({
            client_id: client.id,
            description: newDesc.trim(),
            amount: parseFloat(newAmount),
            original_amount: client.preferred_input_currency === 'EUR' ? parseFloat(eurAmount) : parseFloat(newAmount),
            currency: client.preferred_input_currency,
            category_id: categoryId,
            is_active: true
        })

        if (error) {
            toast.error('Error al agregar servicio')
        } else {
            toast.success('Servicio agregado')
            setNewDesc('')
            setNewAmount('')
            setEurAmount('')
            fetchServices()
        }
        setAdding(false)
    }

    const handleEurChange = (val: string) => {
        setEurAmount(val)
        if (val && !isNaN(parseFloat(val))) {
            const usd = (parseFloat(val) * rate).toFixed(2)
            setNewAmount(usd)
        } else {
            setNewAmount('')
        }
    }

    const handleDelete = async (id: string) => {
        const { error } = await supabase
            .from('recurring_services')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('Error al eliminar servicio')
        } else {
            toast.success('Servicio eliminado')
            fetchServices()
        }
    }

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Servicios Fijos - {client.name}</DialogTitle>
                </DialogHeader>

                <div className="py-4">
                    <form onSubmit={handleAdd} className="flex gap-2 mb-6">
                        <div className="flex-1 flex flex-col gap-2">
                            <Input
                                placeholder="Descripción (ej: Mantenimiento)"
                                value={newDesc}
                                onChange={(e) => setNewDesc(e.target.value)}
                            />
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {client.preferred_input_currency === 'EUR' ? (
                            <>
                                <div className="w-24">
                                    <div className="relative">
                                        <Euro className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="number"
                                            placeholder="EUR"
                                            value={eurAmount}
                                            onChange={(e) => handleEurChange(e.target.value)}
                                            className="pl-7"
                                        />
                                    </div>
                                </div>
                                <div className="w-24">
                                    <div className="relative">
                                        <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="number"
                                            placeholder="USD"
                                            value={newAmount}
                                            readOnly
                                            className="pl-7 bg-muted"
                                        />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="w-24">
                                <Input
                                    type="number"
                                    placeholder="USD"
                                    value={newAmount}
                                    onChange={(e) => setNewAmount(e.target.value)}
                                />
                            </div>
                        )}
                        <Button type="submit" disabled={adding}>
                            <Plus className="w-4 h-4" />
                        </Button>
                    </form>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                        {loading ? (
                            <div className="flex justify-center py-4">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : services.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                                No hay servicios fijos configurados.
                            </div>
                        ) : (
                            services.map((service) => (
                                <div key={service.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{service.description}</span>
                                            {service.currency && service.currency !== 'USD' && (
                                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                                    {service.currency}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <span className="text-xs text-emerald-600 font-medium">${service.amount.toFixed(2)} USD</span>
                                            {service.currency === 'EUR' && service.original_amount && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    ({service.original_amount.toFixed(2)} €)
                                                </span>
                                            )}
                                            {service.service_categories && (
                                                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                                    {service.service_categories.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => handleDelete(service.id)}
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
