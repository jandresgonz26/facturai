'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Client } from '@/types'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { generateHourBagPdf, HourBagLog } from '@/lib/hour-bag-pdf-generator'
const saveBlobToFile = async (blob: Blob, fileName: string) => {
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'PDF Document',
                    accept: { 'application/pdf': ['.pdf'] }
                }]
            })
            const writable = await handle.createWritable()
            await writable.write(blob)
            await writable.close()
            return
        } catch (pickerError: any) {
            if (pickerError?.name === 'AbortError') return
        }
    }
    // Fallback
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a) }, 200)
}

interface PendingLog {
    id: string
    description: string
    hours: number | null
    created_at: string
    service_categories?: { name: string } | null
    category_id?: string | null
    value?: number | null
}

interface PackagedBag {
    /** The date the bag was packaged (derived from when the log entries changed status) */
    packagedAt: string
    totalHours: number
    logs: PendingLog[]
}

interface ServiceCategory {
    id: string
    name: string
}

interface HourBagDetailModalProps {
    client: Client | null
    parentClientName: string
    open: boolean
    onClose: () => void
    onDataChanged: () => void
}

export function HourBagDetailModal({
    client,
    parentClientName,
    open,
    onClose,
    onDataChanged,
}: HourBagDetailModalProps) {
    const [pendingLogs, setPendingLogs] = useState<PendingLog[]>([])
    const [packagedBags, setPackagedBags] = useState<PackagedBag[]>([])
    const [categories, setCategories] = useState<ServiceCategory[]>([])
    const [loading, setLoading] = useState(false)
    const [editingLogId, setEditingLogId] = useState<string | null>(null)
    const [editingLog, setEditingLog] = useState<Partial<PendingLog>>({})
    const [selectedBag, setSelectedBag] = useState<PackagedBag | null>(null)
    const [exportingPdf, setExportingPdf] = useState(false)
    const [view, setView] = useState<'current' | 'history'>('current')
    const [logToDelete, setLogToDelete] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const fetchData = useCallback(async () => {
        if (!client) return
        setLoading(true)

        // Fetch categories
        const { data: cats } = await supabase.from('service_categories').select('id, name').order('name')
        setCategories(cats || [])

        // Fetch pending logs
        const { data: pending } = await supabase
            .from('logs')
            .select('id, description, hours, created_at, category_id, value, service_categories(name)')
            .eq('client_id', client.id)
            .eq('status', 'pending')
            .not('hours', 'is', null)
            .order('created_at', { ascending: true })
        setPendingLogs((pending as unknown as PendingLog[]) || [])

        // Fetch packaged logs (historical bags)
        const { data: packaged } = await supabase
            .from('logs')
            .select('id, description, hours, created_at, category_id, value, service_categories(name)')
            .eq('client_id', client.id)
            .eq('status', 'packaged')
            .not('hours', 'is', null)
            .order('created_at', { ascending: false })

        // Group packaged logs into "bags" — we use a simple heuristic: 
        // group consecutive logs where cumulative hours reach 10h
        if (packaged && packaged.length > 0) {
            const bags: PackagedBag[] = []
            let currentBag: PendingLog[] = []
            let cumHours = 0

            // Sort oldest first for grouping
            const sorted = [...(packaged as unknown as PendingLog[])].reverse()
            for (const log of sorted) {
                currentBag.push(log)
                cumHours += log.hours || 0
                if (cumHours >= 10) {
                    bags.push({
                        packagedAt: currentBag[currentBag.length - 1].created_at,
                        totalHours: cumHours,
                        logs: [...currentBag],
                    })
                    currentBag = []
                    cumHours = 0
                }
            }
            // If there are remaining logs (partial bag)
            if (currentBag.length > 0) {
                bags.push({
                    packagedAt: currentBag[currentBag.length - 1].created_at,
                    totalHours: cumHours,
                    logs: [...currentBag],
                })
            }
            setPackagedBags(bags.reverse()) // Most recent first
        } else {
            setPackagedBags([])
        }

        setLoading(false)
    }, [client])

    useEffect(() => {
        if (open && client) {
            fetchData()
            setView('current')
            setSelectedBag(null)
            setEditingLogId(null)
            setLogToDelete(null)
            setIsDeleting(false)
        }
    }, [open, client, fetchData])

    const startEdit = (log: PendingLog) => {
        setEditingLogId(log.id)
        setEditingLog({
            description: log.description,
            hours: log.hours,
            category_id: log.category_id || undefined,
            created_at: log.created_at,
        })
    }

    const cancelEdit = () => {
        setEditingLogId(null)
        setEditingLog({})
    }

    const saveLogEdit = async (logId: string) => {
        const { error } = await supabase
            .from('logs')
            .update({
                description: editingLog.description,
                hours: editingLog.hours,
                category_id: editingLog.category_id || null,
                created_at: editingLog.created_at
                    ? (editingLog.created_at.includes('T') ? editingLog.created_at : `${editingLog.created_at}T12:00:00Z`)
                    : undefined,
            })
            .eq('id', logId)

        if (error) {
            toast.error('Error al actualizar el registro')
        } else {
            toast.success('Registro actualizado')
            setEditingLogId(null)
            setEditingLog({})
            fetchData()
            onDataChanged()
        }
    }

    const confirmDelete = (id: string) => {
        setLogToDelete(id)
    }

    const executeDelete = async () => {
        if (!logToDelete) return
        setIsDeleting(true)
        const { error } = await supabase.from('logs').delete().eq('id', logToDelete)
        setIsDeleting(false)
        setLogToDelete(null)

        if (error) {
            toast.error('Error al eliminar')
        } else {
            toast.success('Registro eliminado')
            fetchData()
            onDataChanged()
        }
    }

    const exportCurrentBagPdf = async () => {
        if (!client) return
        setExportingPdf(true)
        try {
            const logsForPdf: HourBagLog[] = pendingLogs.map(l => ({
                id: l.id,
                description: l.description,
                hours: l.hours || 0,
                created_at: l.created_at,
                service_categories: l.service_categories,
            }))
            const totalHours = pendingLogs.reduce((s, l) => s + (l.hours || 0), 0)
            const { blob, fileName } = await generateHourBagPdf({
                clientName: client.name,
                parentClientName,
                bagPrice: client.hour_bag_price || 0,
                currency: client.preferred_input_currency || 'EUR',
                totalHours,
                logs: logsForPdf,
            })
            await saveBlobToFile(blob, fileName)
            toast.success('PDF generado correctamente')
        } catch (e) {
            console.error(e)
            toast.error('Error al generar el PDF')
        }
        setExportingPdf(false)
    }

    const exportHistoricalBagPdf = async (bag: PackagedBag) => {
        if (!client) return
        setExportingPdf(true)
        try {
            const logsForPdf: HourBagLog[] = bag.logs.map(l => ({
                id: l.id,
                description: l.description,
                hours: l.hours || 0,
                created_at: l.created_at,
                service_categories: l.service_categories,
            }))
            const { blob, fileName } = await generateHourBagPdf({
                clientName: client.name,
                parentClientName,
                bagPrice: client.hour_bag_price || 0,
                currency: client.preferred_input_currency || 'EUR',
                totalHours: bag.totalHours,
                packagedAt: bag.packagedAt,
                logs: logsForPdf,
            })
            await saveBlobToFile(blob, fileName)
            toast.success('PDF generado correctamente')
        } catch (e) {
            console.error(e)
            toast.error('Error al generar el PDF')
        }
        setExportingPdf(false)
    }

    const totalPendingHours = pendingLogs.reduce((s, l) => s + (l.hours || 0), 0)
    const progress = Math.min((totalPendingHours / 10) * 100, 100)

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

    if (!client) return null

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
                {/* ── Header ── */}
                <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white p-6 rounded-t-lg">
                    <DialogHeader>
                        <DialogTitle className="text-white text-xl font-bold flex items-center gap-2">
                            <span className="text-2xl">⏱</span>
                            {client.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center gap-2 mt-1 text-purple-200 text-sm">
                        <span>↗ Facturar a:</span>
                        <span className="font-semibold text-white">{parentClientName}</span>
                        {client.hour_bag_price && (
                            <span className="ml-auto bg-white/20 px-2 py-0.5 rounded text-white font-mono font-bold">
                                {client.preferred_input_currency === 'EUR' ? '€' : '$'}{client.hour_bag_price} / bolsa
                            </span>
                        )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-purple-200">Progreso bolsa actual</span>
                            <span className="font-bold text-white font-mono">
                                {totalPendingHours.toFixed(1)}h / 10h
                            </span>
                        </div>
                        <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${progress >= 100
                                    ? 'bg-green-400'
                                    : progress >= 70
                                        ? 'bg-amber-400'
                                        : 'bg-white'
                                    }`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <button
                        className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${view === 'current'
                            ? 'border-purple-600 text-purple-700 dark:text-purple-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        onClick={() => { setView('current'); setSelectedBag(null) }}
                    >
                        Bolsa Actual
                        {pendingLogs.length > 0 && (
                            <span className="ml-2 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                {pendingLogs.length}
                            </span>
                        )}
                    </button>
                    <button
                        className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${view === 'history'
                            ? 'border-purple-600 text-purple-700 dark:text-purple-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        onClick={() => { setView('history'); setSelectedBag(null) }}
                    >
                        Historial de Bolsas
                        {packagedBags.length > 0 && (
                            <span className="ml-2 bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                {packagedBags.length}
                            </span>
                        )}
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {loading ? (
                        <div className="text-center py-10 text-muted-foreground text-sm">Cargando...</div>
                    ) : view === 'current' ? (
                        /* ── CURRENT BAG VIEW ── */
                        <>
                            {pendingLogs.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground text-sm">
                                    No hay registros pendientes en la bolsa actual.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {pendingLogs.map((log) => (
                                        <div
                                            key={log.id}
                                            className={`rounded-lg border p-3 transition-all ${editingLogId === log.id
                                                ? 'border-purple-400 bg-purple-50/50 dark:bg-purple-900/10'
                                                : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-[#1E293B]'
                                                }`}
                                        >
                                            {editingLogId === log.id ? (
                                                /* Editing mode */
                                                <div className="space-y-2">
                                                    <input
                                                        className="w-full text-sm border border-purple-300 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                        value={editingLog.description || ''}
                                                        onChange={(e) => setEditingLog({ ...editingLog, description: e.target.value })}
                                                        placeholder="Descripción"
                                                    />
                                                    <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <Select
                                                                value={editingLog.category_id || 'none'}
                                                                onValueChange={(v) => setEditingLog({ ...editingLog, category_id: v === 'none' ? undefined : v })}
                                                            >
                                                                <SelectTrigger className="h-8 text-xs">
                                                                    <SelectValue placeholder="Categoría" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">Sin categoría</SelectItem>
                                                                    {categories.map((c) => (
                                                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <Input
                                                            type="number"
                                                            step="0.25"
                                                            min="0"
                                                            className="w-24 h-8 text-xs font-mono text-right"
                                                            value={editingLog.hours ?? ''}
                                                            onChange={(e) => setEditingLog({ ...editingLog, hours: parseFloat(e.target.value) })}
                                                            placeholder="Horas"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="date"
                                                            className="flex-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 dark:text-white font-mono"
                                                            value={editingLog.created_at ? editingLog.created_at.split('T')[0] : ''}
                                                            onChange={(e) => setEditingLog({ ...editingLog, created_at: e.target.value })}
                                                        />
                                                    </div>
                                                    <div className="flex gap-2 justify-end">
                                                        <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={() => saveLogEdit(log.id)}>
                                                            Guardar
                                                        </Button>
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                                                            Cancelar
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Display mode */
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                                                            {log.description}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {formatDate(log.created_at)}
                                                            </span>
                                                            {log.service_categories?.name && (
                                                                <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                                                    {log.service_categories.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-base font-bold font-mono text-purple-700 dark:text-purple-400">
                                                            {log.hours}h
                                                        </span>
                                                        <button
                                                            onClick={() => startEdit(log)}
                                                            className="text-gray-400 hover:text-purple-600 transition-colors p-1"
                                                            title="Editar"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => confirmDelete(log.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-red-100 dark:hover:border-red-900/50 transition-all shadow-sm"
                                                            title="Eliminar"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Summary row */}
                            {pendingLogs.length > 0 && (
                                <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Total acumulado: <span className="text-purple-600 font-mono">{totalPendingHours.toFixed(1)}h</span>
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400"
                                        onClick={exportCurrentBagPdf}
                                        disabled={exportingPdf}
                                    >
                                        {exportingPdf ? (
                                            <span className="animate-spin mr-1">⏳</span>
                                        ) : (
                                            <span className="mr-1.5">⬇</span>
                                        )}
                                        Exportar PDF
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : selectedBag ? (
                        /* ── HISTORICAL BAG DETAIL VIEW ── */
                        <>
                            <button
                                onClick={() => setSelectedBag(null)}
                                className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 font-medium mb-2"
                            >
                                ← Volver al historial
                            </button>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white">
                                        Bolsa empaquetada
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDate(selectedBag.packagedAt)} · {selectedBag.totalHours.toFixed(1)}h · {selectedBag.logs.length} registros
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    className="bg-purple-600 hover:bg-purple-700 text-white"
                                    onClick={() => exportHistoricalBagPdf(selectedBag)}
                                    disabled={exportingPdf}
                                >
                                    {exportingPdf ? '...' : '⬇ Exportar PDF'}
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {selectedBag.logs.map((log) => (
                                    <div
                                        key={log.id}
                                        className="rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-[#1E293B] p-3 flex items-start justify-between gap-3"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{log.description}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-muted-foreground">{formatDate(log.created_at)}</span>
                                                {log.service_categories?.name && (
                                                    <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                                        {log.service_categories.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-base font-bold font-mono text-gray-600 dark:text-gray-400 shrink-0">
                                            {log.hours}h
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 text-right">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                    Total: <span className="font-mono text-purple-600">{selectedBag.totalHours.toFixed(1)}h</span>
                                    {client.hour_bag_price && (
                                        <span className="ml-3 text-emerald-600 font-mono">
                                            {client.preferred_input_currency === 'EUR' ? '€' : '$'}{client.hour_bag_price}
                                        </span>
                                    )}
                                </span>
                            </div>
                        </>
                    ) : (
                        /* ── HISTORY LIST VIEW ── */
                        <>
                            {packagedBags.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground text-sm">
                                    Aún no hay bolsas empaquetadas para este cliente.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {packagedBags.map((bag, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setSelectedBag(bag)}
                                            className="w-full text-left rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-[#1E293B] p-4 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-sm transition-all group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                                            Bolsa #{packagedBags.length - idx}
                                                        </span>
                                                        <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded font-semibold">
                                                            EMPAQUETADA
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {formatDate(bag.packagedAt)} · {bag.logs.length} registros
                                                    </p>
                                                </div>
                                                <div className="text-right flex items-center gap-3">
                                                    <div>
                                                        <span className="text-lg font-bold font-mono text-purple-600">
                                                            {bag.totalHours.toFixed(1)}h
                                                        </span>
                                                        {client.hour_bag_price && (
                                                            <p className="text-xs font-mono text-emerald-600">
                                                                {client.preferred_input_currency === 'EUR' ? '€' : '$'}{client.hour_bag_price}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className="text-gray-300 group-hover:text-purple-500 transition-colors">›</span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>

            {/* Deletion confirmation dialog */}
            <Dialog open={!!logToDelete} onOpenChange={(open) => !open && setLogToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar eliminación</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro de eliminar este registro de la bolsa? Esta acción es permanente y no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setLogToDelete(null)} disabled={isDeleting}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={executeDelete} disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Dialog>
    )
}
