'use client'

import { useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ClientAmountCard } from './ClientList'

interface PendingItem {
    clientName: string
    total: number
}

/** Actividad registrada que todavía no se ha pasado a factura, por cliente. */
export function PendingPayments({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
    const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    const computePending = async (): Promise<PendingItem[]> => {
        const { data, error } = await supabase
            .from('logs')
            .select(`
                value,
                clients (name)
            `)
            .eq('status', 'pending')
            .not('value', 'is', null)
        if (error || !data) return []
        const grouped: Record<string, number> = {}
        ;(data as unknown as { value: number | null; clients: { name: string } | null }[]).forEach((log) => {
            const name = log.clients?.name || 'Desconocido'
            grouped[name] = (grouped[name] || 0) + (log.value || 0)
        })
        return Object.entries(grouped)
            .map(([clientName, total]) => ({ clientName, total }))
            .sort((a, b) => b.total - a.total)
    }

    useEffect(() => {
        let active = true
        computePending().then((items) => {
            if (!active) return
            setPendingItems(items)
            setLoading(false)
        })
        return () => {
            active = false
        }
    }, [refreshTrigger])

    return (
        <ClientAmountCard
            title="Pendiente por facturar"
            icon={Hourglass}
            items={pendingItems}
            loading={loading}
            emptyText="No hay registros pendientes 🎉"
            count={pendingItems.length}
            countTone="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            actionLabel="Facturar pendientes"
            onAction={() => router.push('/month-end')}
        />
    )
}
