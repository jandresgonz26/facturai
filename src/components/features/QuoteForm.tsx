'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { QuoteItem, Quote } from '@/types'

type QuoteType = 'amount' | 'hours'
type QuoteTemplate = 'jamtech' | 'asiri'

// Empresas disponibles. La empresa elegida define el formato visual del PDF.
const COMPANIES: { name: string; template: QuoteTemplate }[] = [
    { name: 'JAM Tech, C.A.', template: 'jamtech' },
    { name: 'Asiri Marketing', template: 'asiri' },
]

const templateForCompany = (companyName: string): QuoteTemplate =>
    COMPANIES.find((c) => c.name === companyName)?.template || 'jamtech'

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

export function QuoteForm({
    onSaved,
    quoteToEdit,
    onCancelEdit,
}: {
    onSaved?: () => void
    quoteToEdit?: Quote | null
    onCancelEdit?: () => void
}) {
    const isEditing = !!quoteToEdit

    const [clientName, setClientName] = useState('')
    const [companyName, setCompanyName] = useState(COMPANIES[0].name)
    const [docTitle, setDocTitle] = useState('COTIZACIÓN')
    const [quoteType, setQuoteType] = useState<QuoteType>('amount')
    const [currency, setCurrency] = useState<'USD' | 'EUR'>('USD')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [items, setItems] = useState<EditableItem[]>([emptyItem()])
    const [loading, setLoading] = useState(false)

    const isHours = quoteType === 'hours'
    const symbol = currency === 'EUR' ? '€' : '$'
    const template = templateForCompany(companyName)

    // Load the quote being edited into the form
    useEffect(() => {
        if (!quoteToEdit) return
        setClientName(quoteToEdit.client_name || '')
        setDocTitle(quoteToEdit.doc_title || 'COTIZACIÓN')
        // Use the saved company if it matches a known one; otherwise default by template
        const matched = COMPANIES.find((c) => c.name === quoteToEdit.company_name)
        if (matched) {
            setCompanyName(matched.name)
        } else {
            setCompanyName(
                (COMPANIES.find((c) => c.template === quoteToEdit.template) || COMPANIES[0]).name
            )
        }
        setQuoteType(quoteToEdit.quote_type)
        setCurrency(quoteToEdit.currency)
        setDate(quoteToEdit.issue_date)
        setItems(
            quoteToEdit.items && quoteToEdit.items.length > 0
                ? quoteToEdit.items.map((it) => ({
                      service: it.service || '',
                      description: it.description || '',
                      quantity: String(it.quantity ?? 1),
                      unit_price: it.unit_price ? String(it.unit_price) : '',
                      hours: it.hours ? String(it.hours) : '',
                  }))
                : [emptyItem()]
        )
    }, [quoteToEdit])

    const updateItem = (index: number, field: keyof EditableItem, value: string) => {
        setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
    }

    const addItem = () => setItems((prev) => [...prev, emptyItem()])

    const removeItem = (index: number) => {
        setItems((prev) => (prev.length === 1 ? prev : prev.filter((_item, i) => i !== index)))
    }

    const totalAmount = items.reduce((sum, it) => {
        const qty = parseFloat(it.quantity) || 0
        const unit = parseFloat(it.unit_price) || 0
        return sum + qty * unit
    }, 0)

    const totalHours = items.reduce((sum, it) => sum + (parseFloat(it.hours) || 0), 0)

    const resetForm = () => {
        setClientName('')
        setCompanyName(COMPANIES[0].name)
        setDocTitle('COTIZACIÓN')
        setQuoteType('amount')
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

        const payload = {
            client_name: clientName.trim(),
            company_name: companyName,
            doc_title: docTitle.trim() || 'COTIZACIÓN',
            quote_type: quoteType,
            template,
            currency,
            items: validItems,
            total_amount: isHours ? 0 : parseFloat(totalAmount.toFixed(2)),
            total_hours: isHours ? parseFloat(totalHours.toFixed(2)) : 0,
            issue_date: date,
        }

        setLoading(true)
        try {
            if (isEditing && quoteToEdit) {
                const { error } = await supabase
                    .from('quotes')
                    .update(payload)
                    .eq('id', quoteToEdit.id)
                if (error) throw error
                toast.success(`Cotización ${quoteToEdit.quote_number} actualizada`)
            } else {
                const quoteNumber = await generateQuoteNumber()
                const { error } = await supabase.from('quotes').insert({
                    ...payload,
                    quote_number: quoteNumber,
                    created_at: new Date().toISOString(),
                })
                if (error) throw error
                toast.success(`Cotización ${quoteNumber} creada`)
                resetForm()
            }
            onSaved?.()
        } catch (err) {
            console.error(err)
            const detail =
                (err as { message?: string })?.message ||
                (typeof err === 'string' ? err : 'Error desconocido')
            toast.error(
                `${isEditing ? 'Error al actualizar la cotización' : 'Error al crear la cotización'}: ${detail}`
            )
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
                            {isEditing ? `Editar Cotización #${quoteToEdit?.quote_number}` : 'Nueva Cotización'}
                        </h2>
                    </div>
                    {isEditing && (
                        <button
                            type="button"
                            onClick={() => onCancelEdit?.()}
                            className="text-xs text-gray-300 hover:text-white flex items-center gap-1"
                        >
                            <span className="material-symbols-rounded text-base">close</span>
                            Cancelar edición
                        </button>
                    )}
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

                        {/* Document title */}
                        <div className="space-y-1">
                            <label className={labelCls} htmlFor="quote-doc-title">
                                Título del documento
                            </label>
                            <input
                                className={inputCls}
                                id="quote-doc-title"
                                placeholder="COTIZACIÓN"
                                type="text"
                                value={docTitle}
                                onChange={(e) => setDocTitle(e.target.value)}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">
                                Es el texto grande que aparece arriba en el PDF (ej.: COTIZACIÓN, CONTROL DE HORAS,
                                PRESUPUESTO).
                            </p>
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
                                <select
                                    className={inputCls}
                                    id="quote-company"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                >
                                    {COMPANIES.map((c) => (
                                        <option key={c.name} value={c.name}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Define el formato visual del PDF:{' '}
                                    <span
                                        className={
                                            template === 'asiri' ? 'text-purple-500 font-semibold' : 'text-sky-500 font-semibold'
                                        }
                                    >
                                        {template === 'asiri' ? 'Asiri (morado)' : 'JAMTech (azul)'}
                                    </span>
                                </p>
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
                                    <div className="md:col-span-3 space-y-1">
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
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                {isEditing && (
                                    <button
                                        type="button"
                                        onClick={() => onCancelEdit?.()}
                                        className="flex-1 md:flex-none py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                        Cancelar
                                    </button>
                                )}
                                <button
                                    className="flex-1 md:flex-none flex justify-center items-center py-2 px-6 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                                    type="submit"
                                    disabled={loading}
                                >
                                    {loading
                                        ? 'Guardando...'
                                        : isEditing
                                        ? 'Guardar Cambios'
                                        : 'Guardar Cotización'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    )
}
