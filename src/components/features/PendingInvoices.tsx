'use client'

import { useEffect, useState } from 'react'
import { CircleDollarSign } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ClientAmountCard } from './ClientList'

interface PendingInvoiceItem {
    clientName: string
    total: number
}

/** Facturas emitidas y aún no cobradas, agrupadas por cliente. */
export function PendingInvoices({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
    const [pendingInvoices, setPendingInvoices] = useState<PendingInvoiceItem[]>([])
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        let active = true
        const run = async () => {
            const { data, error } = await supabase
                .from('invoices')
                .select(`
                    total_amount,
                    clients (name)
                `)
                .neq('status', 'paid')
            if (!active) return
            if (!error && data) {
                const grouped: Record<string, number> = {}
                ;(data as unknown as { total_amount: number | null; clients: { name: string } | null }[]).forEach((invoice) => {
                    const name = invoice.clients?.name || 'Desconocido'
                    grouped[name] = (grouped[name] || 0) + (invoice.total_amount || 0)
                })
                setPendingInvoices(
                    Object.entries(grouped)
                        .map(([clientName, total]) => ({ clientName, total }))
                        .sort((a, b) => b.total - a.total)
                )
            }
            setLoading(false)
        }
        run()
        return () => {
            active = false
        }
    }, [refreshTrigger])

    return (
        <ClientAmountCard
            title="Por cobrar"
            icon={CircleDollarSign}
            items={pendingInvoices}
            loading={loading}
            emptyText="Todo pagado 🎉"
            count={pendingInvoices.length}
            countTone="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
            actionLabel="Ver facturas"
            onAction={() => router.push('/invoices')}
        />
    )
}
