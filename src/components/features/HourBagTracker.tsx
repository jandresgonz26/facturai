'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Client } from '@/types'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { HourBagDetailModal } from './HourBagDetailModal'

interface HourBagClient {
    client: Client
    totalHours: number
    pendingLogIds: string[]
    parentClientName: string
}

export function HourBagTracker({ refreshTrigger = 0, onPackaged }: { refreshTrigger?: number; onPackaged?: () => void }) {
    const [hourBagClients, setHourBagClients] = useState<HourBagClient[]>([])
    const [loading, setLoading] = useState(true)
    const [clientToPackage, setClientToPackage] = useState<HourBagClient | null>(null)
    const [isPackaging, setIsPackaging] = useState(false)
    const [detailClient, setDetailClient] = useState<HourBagClient | null>(null)

    useEffect(() => {
        fetchHourBagData()
    }, [refreshTrigger])

    const fetchHourBagData = async () => {
        setLoading(true)

        const { data: clients, error: clientsError } = await supabase
            .from('clients')
            .select('*')
            .eq('billing_modality', 'hour_bag')
            .order('name')

        if (clientsError || !clients || clients.length === 0) {
            setHourBagClients([])
            setLoading(false)
            return
        }

        const parentIds = [...new Set(clients.map(c => c.parent_client_id).filter(Boolean))]
        let parentMap: Record<string, string> = {}
        if (parentIds.length > 0) {
            const { data: parents } = await supabase
                .from('clients')
                .select('id, name')
                .in('id', parentIds)
            if (parents) {
                parentMap = Object.fromEntries(parents.map(p => [p.id, p.name]))
            }
        }

        const results: HourBagClient[] = []
        for (const client of clients) {
            const { data: logs } = await supabase
                .from('logs')
                .select('id, hours')
                .eq('client_id', client.id)
                .eq('status', 'pending')
                .not('hours', 'is', null)
                .order('created_at', { ascending: true })

            const totalHours = (logs || []).reduce((sum, log) => sum + (log.hours || 0), 0)
            results.push({
                client,
                totalHours,
                pendingLogIds: (logs || []).map(l => l.id),
                parentClientName: client.parent_client_id ? (parentMap[client.parent_client_id] || 'Desconocido') : 'Sin padre'
            })
        }

        setHourBagClients(results)
        setLoading(false)
    }

    const handlePackage = async () => {
        if (!clientToPackage) return
        setIsPackaging(true)

        const client = clientToPackage.client

        try {
            const { error: updateError } = await supabase
                .from('logs')
                .update({ status: 'packaged' })
                .in('id', clientToPackage.pendingLogIds)

            if (updateError) throw updateError

            if (client.parent_client_id) {
                const { data: cats } = await supabase
                    .from('service_categories')
                    .select('id')
                    .limit(1)

                const bagPrice = client.hour_bag_price || 0
                const { error: insertError } = await supabase
                    .from('logs')
                    .insert({
                        client_id: client.parent_client_id,
                        description: `Bolsa de 10 horas consumida por ${client.name} (${clientToPackage.totalHours.toFixed(1)}h acumuladas)`,
                        value: bagPrice,
                        original_amount: bagPrice,
                        currency: client.preferred_input_currency || 'EUR',
                        category_id: cats?.[0]?.id || null,
                        status: 'pending',
                    })

                if (insertError) throw insertError
            }

            toast.success(`Bolsa empaquetada: ${clientToPackage.totalHours.toFixed(1)}h de ${client.name} transferidas a ${clientToPackage.parentClientName}`)
            fetchHourBagData()
            onPackaged?.()
        } catch (error) {
            console.error('Error packaging hour bag:', error)
            toast.error('Error al empaquetar la bolsa de horas')
        }

        setIsPackaging(false)
        setClientToPackage(null)
    }

    if (loading) return null
    if (hourBagClients.length === 0) return null

    return (
        <>
            <section className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-rounded text-purple-600">hourglass_top</span>
                        Bolsas de Horas
                    </h2>
                    <span className="text-xs text-muted-foreground">Haz clic en una tarjeta para ver el detalle</span>
                </div>

                <div className="grid gap-3">
                    {hourBagClients.map((item) => {
                        const progress = Math.min((item.totalHours / 10) * 100, 100)
                        const isComplete = item.totalHours >= 10
                        const progressColor = isComplete
                            ? 'bg-green-500'
                            : progress >= 70
                                ? 'bg-amber-500'
                                : 'bg-purple-500'

                        return (
                            <div
                                key={item.client.id}
                                onClick={() => setDetailClient(item)}
                                className={`p-4 rounded-lg border shadow-sm transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${isComplete
                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 ring-2 ring-green-300 dark:ring-green-700'
                                        : 'bg-white dark:bg-[#1E293B] border-gray-100 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-gray-900 dark:text-white">
                                                {item.client.name}
                                            </span>
                                            <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold">
                                                ↗ {item.parentClientName}
                                            </span>
                                            {item.client.hour_bag_price && (
                                                <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded font-mono font-semibold">
                                                    €{item.client.hour_bag_price}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {item.pendingLogIds.length} registro{item.pendingLogIds.length !== 1 ? 's' : ''} pendiente{item.pendingLogIds.length !== 1 ? 's' : ''} · <span className="text-purple-500 hover:underline">Ver detalle ›</span>
                                        </span>
                                    </div>

                                    <div className="text-right">
                                        <span className={`text-2xl font-bold font-mono ${isComplete ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                            {item.totalHours.toFixed(1)}
                                        </span>
                                        <span className="text-sm text-muted-foreground"> / 10h</span>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                                        style={{ width: `${Math.min(progress, 100)}%` }}
                                    />
                                </div>

                                {isComplete && (
                                    <Button
                                        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
                                        onClick={(e) => { e.stopPropagation(); setClientToPackage(item) }}
                                    >
                                        <span className="material-symbols-rounded text-lg mr-2">package_2</span>
                                        Empaquetar y facturar a {item.parentClientName}
                                    </Button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </section>

            {/* Package confirmation dialog */}
            <Dialog open={!!clientToPackage} onOpenChange={(open) => !open && !isPackaging && setClientToPackage(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Empaquetar Bolsa de Horas</DialogTitle>
                        <DialogDescription>
                            {clientToPackage && (
                                <>
                                    Esto marcará {clientToPackage.pendingLogIds.length} registros de <strong>{clientToPackage.client.name}</strong> como empaquetados
                                    y creará un nuevo registro en <strong>{clientToPackage.parentClientName}</strong> por{' '}
                                    <strong>€{clientToPackage.client.hour_bag_price || 0}</strong> ({clientToPackage.totalHours.toFixed(1)}h acumuladas).
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setClientToPackage(null)} disabled={isPackaging}>
                            Cancelar
                        </Button>
                        <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handlePackage} disabled={isPackaging}>
                            {isPackaging ? 'Procesando...' : 'Confirmar Empaquetado'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Detail modal */}
            <HourBagDetailModal
                client={detailClient?.client ?? null}
                parentClientName={detailClient?.parentClientName ?? ''}
                open={!!detailClient}
                onClose={() => setDetailClient(null)}
                onDataChanged={() => { fetchHourBagData(); onPackaged?.() }}
            />
        </>
    )
}
