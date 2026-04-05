'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Client, ServiceCategory } from '@/types'
import { getEurToUsdRate } from '@/lib/currency'

export function QuickEntry({ onEntryAdded }: { onEntryAdded?: () => void }) {
    const [description, setDescription] = useState('')
    const [clientId, setClientId] = useState<string>('')
    const [value, setValue] = useState('')
    const [eurValue, setEurValue] = useState('')
    const [hours, setHours] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [clients, setClients] = useState<Client[]>([])
    const [categories, setCategories] = useState<ServiceCategory[]>([])
    const [loading, setLoading] = useState(false)
    const [rate, setRate] = useState<number>(1.08)
    const [selectedClient, setSelectedClient] = useState<Client | null>(null)

    useEffect(() => {
        fetchClients()
        fetchCategories()
        fetchRate()
    }, [])

    const fetchRate = async () => {
        const r = await getEurToUsdRate()
        setRate(r)
    }

    const fetchClients = async () => {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('name')

        if (error) {
            console.error('Error fetching clients:', error)
        } else {
            setClients(data || [])
        }
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

    const handleClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value
        setClientId(id)
        const newClient = clients.find(c => c.id === id) || null

        // Preserve typed amount when switching currencies
        const oldCurrency = selectedClient?.preferred_input_currency || 'USD'
        const newCurrency = newClient?.preferred_input_currency || 'USD'

        if (oldCurrency !== newCurrency && value) {
            if (newCurrency === 'EUR') {
                setEurValue(value)
                const usd = (parseFloat(value) * rate).toFixed(2)
                setValue(!isNaN(parseFloat(usd)) ? usd : '')
            } else {
                setValue(eurValue || value) // Fallback to value if eurValue is empty for some reason
                setEurValue('')
            }
        }

        setSelectedClient(newClient)
    }

    const handleEurChange = (val: string) => {
        setEurValue(val)
        if (val && !isNaN(parseFloat(val))) {
            const usd = (parseFloat(val) * rate).toFixed(2)
            setValue(usd)
        } else {
            setValue('')
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!description || !clientId) {
            toast.error('Por favor completa la descripción y el cliente')
            return
        }

        setLoading(true)
        const { error } = await supabase.from('logs').insert({
            description,
            client_id: clientId,
            value: value ? parseFloat(value) : null,
            original_amount: selectedClient?.preferred_input_currency === 'EUR' ? parseFloat(eurValue) : (value ? parseFloat(value) : null),
            currency: selectedClient?.preferred_input_currency || 'USD',
            category_id: categoryId,
            hours: hours ? parseFloat(hours) : null,
            created_at: date ? `${date}T12:00:00Z` : new Date().toISOString(),
            status: 'pending',
        })

        setLoading(false)

        if (error) {
            toast.error('Error al agregar la entrada')
            console.error(error)
        } else {
            toast.success('Entrada agregada correctamente')
            setDescription('')
            setValue('')
            setEurValue('')
            setHours('')
            setDate(new Date().toISOString().split('T')[0])
            onEntryAdded?.()
        }
    }

    const isEurClient = selectedClient?.preferred_input_currency === 'EUR'
    const isHourBagClient = selectedClient?.billing_modality === 'hour_bag'

    return (
        <section aria-labelledby="add-activity-title" className="relative z-10">
            <div className="bg-white dark:bg-[#1E293B] rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                {/* Dark gradient header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-teal-500/20 rounded text-teal-400">
                            <span className="material-symbols-rounded text-xl">add_task</span>
                        </div>
                        <h2 className="text-base font-semibold text-white" id="add-activity-title">
                            Registro Rápido
                        </h2>
                    </div>
                    <span className="text-xs text-gray-400 font-mono">
                        ID: #NEW-{new Date().getFullYear().toString().slice(-2)}{String(new Date().getMonth() + 1).padStart(2, '0')}
                    </span>
                </div>

                {/* Form */}
                <div className="p-6">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        {/* Row 1: Description + Amount */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                            <div className="md:col-span-6 space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider" htmlFor="description">
                                    Descripción
                                </label>
                                <input
                                    className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm py-2 px-3 shadow-sm transition-all"
                                    id="description"
                                    placeholder="Detalle de la actividad..."
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <div className="md:col-span-3 space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider" htmlFor="date">
                                    Fecha
                                </label>
                                <input
                                    className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm py-2 px-3 shadow-sm transition-all font-mono"
                                    id="date"
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                            <div className="md:col-span-3 space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider" htmlFor="amount">
                                    {isEurClient ? 'Monto (EUR)' : 'Monto'}
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                        <span className="text-gray-500 text-sm">{isEurClient ? '€' : '$'}</span>
                                    </div>
                                    <input
                                        className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm py-2 pl-7 px-3 text-right font-mono"
                                        id="amount"
                                        placeholder="0.00"
                                        type="number"
                                        step="0.01"
                                        value={isEurClient ? eurValue : value}
                                        onChange={(e) => isEurClient ? handleEurChange(e.target.value) : setValue(e.target.value)}
                                    />
                                </div>
                                {isEurClient && value && (
                                    <p className="text-[10px] text-teal-600 font-mono mt-1">
                                        ≈ ${value} USD (tasa: {rate.toFixed(4)})
                                    </p>
                                )}
                            </div>

                            {/* Hours field - only for hour_bag clients */}
                            {isHourBagClient && (
                                <div className="md:col-span-12 space-y-1">
                                    <label className="text-xs font-semibold text-purple-500 uppercase tracking-wider flex items-center gap-1" htmlFor="hours">
                                        <span className="material-symbols-rounded text-sm">schedule</span>
                                        Horas (Bolsa de 10h)
                                    </label>
                                    <div className="relative rounded-md shadow-sm">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                            <span className="text-purple-500 text-sm">⏱</span>
                                        </div>
                                        <input
                                            className="block w-full rounded-lg border border-purple-300 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-900/20 text-gray-900 dark:text-white placeholder-gray-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-sm py-2 pl-8 px-3 text-right font-mono"
                                            id="hours"
                                            placeholder="0.00"
                                            type="number"
                                            step="0.25"
                                            min="0"
                                            value={hours}
                                            onChange={(e) => setHours(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Row 2: Client + Category + Submit */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
                            <div className="md:col-span-5 space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider" htmlFor="client">
                                    Cliente
                                </label>
                                <select
                                    className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm py-2 px-3 shadow-sm"
                                    id="client"
                                    value={clientId}
                                    onChange={handleClientChange}
                                >
                                    <option value="">Seleccionar cliente...</option>
                                    {clients.map((client) => (
                                        <option key={client.id} value={client.id}>
                                            {client.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-4 space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider" htmlFor="category">
                                    Categoría
                                </label>
                                <select
                                    className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm py-2 px-3 shadow-sm"
                                    id="category"
                                    value={categoryId}
                                    onChange={(e) => setCategoryId(e.target.value)}
                                >
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-3">
                                <button
                                    className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                                    type="submit"
                                    disabled={loading}
                                >
                                    {loading ? 'Registrando...' : 'Registrar'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    )
}
