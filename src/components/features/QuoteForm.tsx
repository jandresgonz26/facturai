'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { QuoteItem } from '@/types'

type QuoteType = 'amount' | 'hours'
type QuoteTemplate = 'jamtech' | 'asiri'

type EditableItem = {
    service: string
    description: string
    quantity: string
    unit_price: string
    hours: string
}

const emptyItem = (): EditableItem => ({
    service: '',
    description: '',
    quantity: '1',
    unit_price: '',
    hours: '',
})

const generateQuoteNumber = async (): Promise<string> => {
    const { data } = await supabase
        .from('quotes')
        .select('quote_number')
        .order('created_at', { ascending: false })
        .limit(1)

    let next = 1
    if (data && data.length > 0) {
        const match = String(data[0].quote_number).match(/(\d+)\s*$/)
        if (match) next = parseInt(match[1], 10) + 1
    }
    return `COT-${String(next).padStart(4, '0')}`
}

export function QuoteForm({ onCreated }: { onCreated?: () => void }) {
    const [clientName, setClientName] = useState('')
    const [companyName, setCompanyName] = useState('')
    const [quoteType, setQuoteType] = useState<QuoteType>('amount')
    const [template, setTemplate] = useState<QuoteTemplate>('jamtech')
    const [currency, setCurrency] = useState<'USD' | 'EUR'>('USD')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [items, setItems] = useState<EditableItem[]>([emptyItem()])
    const [loading, setLoading] = useState(false)

    const isHours = quoteType === 'hours'
    const symbol = currency === 'EUR' ? '€' : '$'

    const updateItem = (index: number, field: keyof EditableItem, value: string) => {
        setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
    }

    const addItem = () => setItems((prev) => [...prev, emptyItem()])

    const removeItem = (index: number) => {
        setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
    }

    const totalAmount = items.reduce((sum, it) => {
        const qty = parseFloat(it.quantity) || 0
        const unit = parseFloat(it.unit_price) || 0
        return sum + qty * unit
    }, 0)

    const totalHours = items.reduce((sum, it) => sum + (parseFloat(it.hours) || 0), 0)

    const resetForm = () => {
        setClientName('')
        setCompanyName('')
        setQuoteType('amount')
        setTemplate('jamtech')
        setCurrency('USD')
        setDate(new Date().toISOString().split('T')[0])
        setItems([emptyItem()])
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!clientName.trim()) {
            toast.error('Por favor escribe el nombre del cliente')
            return
        }

        const validItems: QuoteItem[] = items
            .filter((it) =>
                isHours
                    ? it.description.trim() || it.hours.trim()
                    : it.description.trim() || it.unit_price.trim()
            )
            .map((it) => ({
                service: it.service.trim() || 'Servicio Profesional',
                description: it.description.trim(),
                quantity: parseFloat(it.quantity) || 1,
                unit_price: parseFloat(it.unit_price) || 0,
                hours: parseFloat(it.hours) || 0,
            }))

        if (validItems.length === 0) {
            toast.error(
                isHours
                    ? 'Agrega al menos una tarea con descripción u horas'
                    : 'Agrega al menos una tarea con descripción o monto'
            )
            return
        }

        setLoading(true)
        try {
            const quoteNumber = await generateQuoteNumber()
            const { error } = await supabase.from('quotes').insert({
                quote_number: quoteNumber,
                client_name: clientName.trim(),
                company_name: companyName.trim() || null,
                quote_type: quoteType,
                template,
                currency,
                items: validItems,
                total_amount: isHours ? 0 : parseFloat(totalAmount.toFixed(2)),
                total_hours: isHours ? parseFloat(totalHours.toFixed(2)) : 0,
                issue_date: date,
                created_at: new Date().toISOString(),
            })

            if (error) throw error

            toast.success(`Cotización ${quoteNumber} creada`)
            resetForm()
            onCreated?.()
        } catch (err) {
            console.error(err)
            toast.error('Error al crear la cotización')
        } finally {
            setLoading(false)
        }
    }

    const inputCls =
        'block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm py-2 px-3 shadow-sm transition-all'
    const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wider'
    const subLabelCls = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wider'

    return (
        <section aria-labelledby="add-quote-title" className="relative z-10">
            <div className="bg-white dark:bg-[#1E293B] rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                {/* Dark gradient header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-teal-500/20 rounded text-teal-400">
                            <span className="material-symbols-rounded text-xl">request_quote</span>
                        </div>
                        <h2 className="text-base font-semibold text-white" id="add-quote-title">
                            Nueva Cotización
                        </h2>
                    </div>
                </div>

                {/* Form */}
                <div className="p-6">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        {/* Quote type toggle */}
                        <div className="space-y-1">
                            <label className={labelCls}>Tipo de cotización</label>
                            <div className="grid grid-cols-2 gap-2 max-w-md">
                                <button
                                    type="button"
                                    onClick={() => setQuoteType('amount')}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                                        !isHours
                                            ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'
                                    }`}
                                >
                                    <span className="material-symbols-rounded text-base">payments</span>
                                    Con importe
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setQuoteType('hours')}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                                        isHours
                                            ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'
                                    }`}
                                >
                                    <span className="material-symbols-rounded text-base">schedule</span>
                                    Solo horas
                                </button>
                            </div>
                        </div>

                        {/* Template / visual format selector */}
                        <div className="space-y-1">
                            <label className={labelCls}>Formato visual</label>
                            <div className="grid grid-cols-2 gap-2 max-w-md">
                                <button
                                    type="button"
                                    onClick={() => setTemplate('jamtech')}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                                        template === 'jamtech'
                                            ? 'border-sky-600 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'
                                    }`}
                                >
                                    <span className="material-symbols-rounded text-base">corporate_fare</span>
                                    JAMTech
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTemplate('asiri')}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-semibold transition-all ${
                                        template === 'asiri'
                                            ? 'border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'
                                    }`}
                                >
                                    <span className="material-symbols-rounded text-base">palette</span>
                                    Asiri
                                </button>
                            </div>
                        </div>

                        {/* Row 1: Client + Company */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                            <div className="md:col-span-6 space-y-1">
                                <label className={labelCls} htmlFor="quote-client">
                                    Cliente
                                </label>
                                <input
                                    className={inputCls}
                                    id="quote-client"
                                    placeholder="Nombre del cliente..."
                                    type="text"
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                />
                            </div>
                            <div className="md:col-span-6 space-y-1">
                                <label className={labelCls} htmlFor="quote-company">
                                    Tu Empresa
                                </label>
                                <input
                                    className={inputCls}
                                    id="quote-company"
                                    placeholder="Nombre de tu empresa..."
                                    type="text"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Row 2: Date + Currency */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                            <div className="md:col-span-4 space-y-1">
                                <label className={labelCls} htmlFor="quote-date">
                                    Fecha
                                </label>
                                <input
                                    className={`${inputCls} font-mono`}
                                    id="quote-date"
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                            {!isHours && (
                                <div className="md:col-span-4 space-y-1">
                                    <label className={labelCls} htmlFor="quote-currency">
                                        Moneda
                                    </label>
                                    <select
                                        className={inputCls}
                                        id="quote-currency"
                                        value={currency}
                                        onChange={(e) => setCurrency(e.target.value as 'USD' | 'EUR')}
                                    >
                                        <option value="USD">USD ($)</option>
                                        <option value="EUR">EUR (€)</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Line items */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className={labelCls}>Tareas</label>
                                <button
                                    type="button"
                                    onClick={addItem}
                                    className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"
                                >
                                    <span className="material-symbols-rounded text-base">add</span>
                                    Agregar tarea
                                </button>
                            </div>

                            {items.map((item, index) => (
                                <div
                                    key={index}
                                    className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border border-gray-100 dark:border-gray-700 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-800/30"
                                >
                                    <div className={`${isHours ? 'md:col-span-3' : 'md:col-span-3'} space-y-1`}>
                                        <label className={subLabelCls}>Servicio</label>
                                        <input
                                            className={inputCls}
                                            placeholder="Servicio Profesional"
                                            type="text"
                                            value={item.service}
                                            onChange={(e) => updateItem(index, 'service', e.target.value)}
                                        />
                                    </div>
                                    <div className={`${isHours ? 'md:col-span-6' : 'md:col-span-4'} space-y-1`}>
                                        <label className={subLabelCls}>Descripción</label>
                                        <input
                                            className={inputCls}
                                            placeholder="Detalle de la tarea..."
                                            type="text"
                                            value={item.description}
                                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                                        />
                                    </div>

                                    {isHours ? (
                                        <div className="md:col-span-2 space-y-1">
                                            <label className={subLabelCls}>Horas</label>
                                            <input
                                                className={`${inputCls} text-right font-mono`}
                                                placeholder="0.00"
                                                type="number"
                                                step="0.25"
                                                min="0"
                                                value={item.hours}
                                                onChange={(e) => updateItem(index, 'hours', e.target.value)}
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className={subLabelCls}>Cant.</label>
                                                <input
                                                    className={`${inputCls} text-right font-mono`}
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={item.quantity}
                                                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className={subLabelCls}>P. Unit. ({symbol})</label>
                                                <div className="relative rounded-md shadow-sm">
                                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                                        <span className="text-gray-500 text-sm">{symbol}</span>
                                                    </div>
                                                    <input
                                                        className={`${inputCls} pl-7 text-right font-mono`}
                                                        placeholder="0.00"
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={item.unit_price}
                                                        onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <div className="md:col-span-1 flex justify-center">
                                        <button
                                            type="button"
                                            onClick={() => removeItem(index)}
                                            disabled={items.length === 1}
                                            className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent"
                                            title="Eliminar tarea"
                                        >
                                            <span className="material-symbols-rounded text-lg">delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Total + Submit */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                            <div className="text-sm text-gray-500">
                                Total:{' '}
                                {isHours ? (
                                    <span className="text-xl font-bold text-purple-600 font-mono">
                                        {totalHours.toFixed(2)} h
                                    </span>
                                ) : (
                                    <span className="text-xl font-bold text-emerald-600 font-mono">
                                        {symbol}
                                        {totalAmount.toFixed(2)}
                                    </span>
                                )}
                            </div>
                            <button
                                className="w-full md:w-auto flex justify-center items-center py-2 px-6 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                                type="submit"
                                disabled={loading}
                            >
                                {loading ? 'Guardando...' : 'Guardar Cotización'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    )
}
