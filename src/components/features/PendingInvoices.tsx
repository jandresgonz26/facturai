'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface PendingInvoiceItem {
    clientName: string
    total: number
    urgency: 'high' | 'medium' | 'low'
}

export function PendingInvoices({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
    const [pendingInvoices, setPendingInvoices] = useState<PendingInvoiceItem[]>([])
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        fetchPendingInvoices()
    }, [refreshTrigger])

    const fetchPendingInvoices = async () => {
        const { data, error } = await supabase
            .from('invoices')
            .select(`
                total_amount,
                clients (name)
            `)
            .neq('status', 'paid')

        if (!error && data) {
            // Group by client
            const grouped: Record<string, number> = {}
            data.forEach((invoice: any) => {
                const name = invoice.clients?.name || 'Desconocido'
                grouped[name] = (grouped[name] || 0) + (invoice.total_amount || 0)
            })

            const items: PendingInvoiceItem[] = Object.entries(grouped)
                .map(([clientName, total]) => ({
                    clientName,
                    total,
                    urgency: total > 500 ? 'high' : total > 200 ? 'medium' : 'low' as 'high' | 'medium' | 'low',
                }))
                .sort((a, b) => b.total - a.total)

            setPendingInvoices(items)
        }
        setLoading(false)
    }

    const urgencyColors = {
        high: 'bg-red-400',
        medium: 'bg-amber-400',
        low: 'bg-blue-400',
    }

    return (
        <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Pendiente por Pagar
                </h3>
                {pendingInvoices.length > 0 && (
                    <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full font-bold">
                        {pendingInvoices.length}
                    </span>
                )}
            </div>

            {loading ? (
                <p className="text-sm text-gray-400">Cargando...</p>
            ) : pendingInvoices.length === 0 ? (
                <p className="text-sm text-gray-400">Todo pagado 🎉</p>
            ) : (
                <>
                    <ul className="space-y-4">
                        {pendingInvoices.slice(0, 5).map((item, i) => (
                            <li key={i} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${urgencyColors[item.urgency]}`} />
                                    <span className="text-gray-700 dark:text-gray-300">{item.clientName}</span>
                                </div>
                                <span className="font-mono text-gray-900 dark:text-white font-medium">
                                    ${item.total.toFixed(2)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <button
                        onClick={() => router.push('/invoices')}
                        className="w-full mt-6 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                    >
                        Ver Facturas
                    </button>
                </>
            )}
        </div>
    )
}
