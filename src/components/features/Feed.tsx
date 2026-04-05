'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Log } from '@/types'
import { toast } from 'sonner'
import { Pagination } from '@/components/ui/Pagination'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

// Icon/color mapping for visual variety
const activityIcons = [
    { icon: 'description', borderColor: 'border-teal-100 dark:border-teal-900', hoverBorder: 'group-hover:border-teal-500', iconColor: 'text-teal-600' },
    { icon: 'build', borderColor: 'border-indigo-100 dark:border-indigo-900', hoverBorder: 'group-hover:border-indigo-500', iconColor: 'text-indigo-600' },
    { icon: 'campaign', borderColor: 'border-orange-100 dark:border-orange-900', hoverBorder: 'group-hover:border-orange-500', iconColor: 'text-orange-600' },
    { icon: 'code', borderColor: 'border-sky-100 dark:border-sky-900', hoverBorder: 'group-hover:border-sky-500', iconColor: 'text-sky-600' },
    { icon: 'support_agent', borderColor: 'border-purple-100 dark:border-purple-900', hoverBorder: 'group-hover:border-purple-500', iconColor: 'text-purple-600' },
]

function getIconForIndex(index: number) {
    return activityIcons[index % activityIcons.length]
}

function formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr)
    const today = new Date()

    // Normalize to dates only for comparison
    const dateOnly = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const yesterdayOnly = new Date(todayOnly)
    yesterdayOnly.setDate(todayOnly.getDate() - 1)

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

    if (dateOnly.getTime() === todayOnly.getTime()) {
        return `Hoy, ${date.getUTCDate()} ${months[date.getUTCMonth()]}`
    }
    if (dateOnly.getTime() === yesterdayOnly.getTime()) {
        return `Ayer, ${date.getUTCDate()} ${months[date.getUTCMonth()]}`
    }
    return `${date.getUTCDate()} ${months[date.getUTCMonth()]}`
}

function getDateKey(dateStr: string): string {
    const date = new Date(dateStr)
    return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
}

export function Feed({
    refreshTrigger = 0,
    onActivityChanged
}: {
    refreshTrigger?: number,
    onActivityChanged?: () => void
}) {
    const [logs, setLogs] = useState<Log[]>([])
    const [loading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 8

    // State for delete confirmation dialog
    const [logToDelete, setLogToDelete] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        fetchLogs()
    }, [refreshTrigger])

    const fetchLogs = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('logs')
            .select(`
                *,
                clients (name, billing_modality, parent_client_id)
            `)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error('Error fetching logs:', error)
        } else {
            setLogs(data as any[])
        }
        setLoading(false)
    }

    const confirmDelete = (id: string, e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault()
            e.stopPropagation()
        }
        setLogToDelete(id)
    }

    const executeDelete = async () => {
        if (!logToDelete) return

        setIsDeleting(true)
        console.log('Executing delete for log:', logToDelete)

        const { error } = await supabase.from('logs').delete().eq('id', logToDelete)

        setIsDeleting(false)
        setLogToDelete(null)

        if (error) {
            console.error('Delete error:', error)
            toast.error('Error al eliminar registro')
        } else {
            console.log('Delete successful')
            toast.success('Registro eliminado')
            fetchLogs()
            onActivityChanged?.()
        }
    }

    if (loading) {
        return <div className="text-center py-10 text-gray-400">Cargando actividad...</div>
    }

    if (logs.length === 0) {
        return (
            <div className="text-center py-10 text-gray-400 border rounded-lg border-dashed border-gray-300 dark:border-gray-600">
                No hay registros aún. ¡Agrega uno arriba!
            </div>
        )
    }

    const totalPages = Math.ceil(logs.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const currentLogs = logs.slice(startIndex, endIndex)

    // Group logs by date
    const groupedLogs: { dateLabel: string; dateKey: string; items: Log[] }[] = []
    currentLogs.forEach((log) => {
        const key = getDateKey(log.created_at)
        const existing = groupedLogs.find(g => g.dateKey === key)
        if (existing) {
            existing.items.push(log)
        } else {
            groupedLogs.push({
                dateLabel: formatDateLabel(log.created_at),
                dateKey: key,
                items: [log],
            })
        }
    })

    return (
        <div className="space-y-2">
            <div className="relative">
                {groupedLogs.map((group, groupIdx) => (
                    <div key={group.dateKey} className="mb-8 relative timeline-item">
                        {/* Date header */}
                        <div className="sticky top-0 z-10 bg-[#F8FAFC] dark:bg-[#0F172A] py-2 mb-4 w-full border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-12">
                                {group.dateLabel}
                            </h3>
                        </div>

                        {/* Timeline entries */}
                        <div className="space-y-6 relative timeline-line">
                            {group.items.map((log, itemIdx) => {
                                const iconStyle = getIconForIndex(groupIdx * 10 + itemIdx)
                                const time = new Date(log.created_at).toLocaleTimeString('es-ES', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: 'UTC'
                                })

                                return (
                                    <article key={log.id} className="relative pl-12 group cursor-pointer">
                                        {/* Timeline circle */}
                                        <div className={`absolute left-0 top-1 w-10 h-10 rounded-full bg-white dark:bg-[#1E293B] border-2 ${iconStyle.borderColor} ${iconStyle.hoverBorder} flex items-center justify-center z-10 shadow-sm transition-colors`}>
                                            <span className={`material-symbols-rounded ${iconStyle.iconColor} text-lg`}>
                                                {iconStyle.icon}
                                            </span>
                                        </div>

                                        {/* Card */}
                                        <div className="bg-white dark:bg-[#1E293B] rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all flex justify-between items-center">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-mono text-gray-400 bg-gray-50 dark:bg-gray-800 px-1.5 rounded">
                                                        {time}
                                                    </span>
                                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                        {(log.clients as any)?.name || 'Cliente Desconocido'}
                                                    </h4>
                                                </div>
                                                <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                                                    {log.description}
                                                </p>
                                            </div>
                                            <div className="text-right flex items-center gap-3 ml-4">
                                                <div>
                                                    {log.value && (
                                                        <span className="block text-sm font-bold text-gray-900 dark:text-white font-mono">
                                                            ${log.value.toFixed(2)}
                                                        </span>
                                                    )}
                                                    {log.hours && (
                                                        <span className="block text-[10px] font-mono text-purple-600 dark:text-purple-400">
                                                            {log.hours}h
                                                        </span>
                                                    )}
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${log.status === 'billed'
                                                        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-100 dark:border-green-800'
                                                        : log.status === 'packaged'
                                                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-100 dark:border-purple-800'
                                                            : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-100 dark:border-amber-800'
                                                        }`}>
                                                        {log.status === 'billed' ? 'COBRADO' : log.status === 'packaged' ? 'EMPAQUETADO' : 'PENDIENTE'}
                                                    </span>
                                                </div>
                                                <button
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-red-100 dark:hover:border-red-900/50 transition-all shadow-sm"
                                                    onClick={(e) => confirmDelete(log.id, e)}
                                                    title="Eliminar"
                                                    type="button"
                                                >
                                                    <span className="material-symbols-rounded text-lg">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Sub-components */}
            {totalPages > 1 && (
                <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                    />
                </div>
            )}

            <Dialog open={!!logToDelete} onOpenChange={(open) => !open && setLogToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar eliminación</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro de eliminar este registro? Esta acción es permanente y no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLogToDelete(null)} disabled={isDeleting}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={executeDelete} disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
