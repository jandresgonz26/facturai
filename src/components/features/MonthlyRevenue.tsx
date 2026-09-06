'use client'

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { getMonthlyRevenue, type MonthlyRevenue as Revenue } from '@/lib/actions/dashboard'
import { useDataChanged } from '@/lib/events'

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function MonthlyRevenue({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
    const [data, setData] = useState<Revenue | null>(null)
    const [loading, setLoading] = useState(true)

    const load = async () => {
        try {
            setData(await getMonthlyRevenue())
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [refreshTrigger])

    useDataChanged(load)

    const invoiced = data?.invoiced ?? 0
    const goal = data?.goal ?? 5500
    const progressPercent = Math.min((invoiced / goal) * 100, 100)

    return (
        <div className="bg-card p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Facturado este mes</h3>
            <p className="text-[11px] text-gray-400 mb-3">Facturas emitidas en el mes, por fecha de emisión</p>
            <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {loading ? '...' : money(invoiced)}
                </span>
                {!loading && invoiced > 0 && (
                    <span className="text-sm font-medium text-emerald-500 flex items-center">
                        <TrendingUp className="w-4 h-4" />
                        {Math.round(progressPercent)}%
                    </span>
                )}
            </div>
            <div className="mt-4 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full transition-all duration-700" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>
                    {loading ? '' : `${data?.count ?? 0} factura${data?.count === 1 ? '' : 's'}`}
                </span>
                <span>Meta: ${goal.toLocaleString('en-US')}</span>
            </div>
            {!loading && data && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <p className="text-gray-400">Cobrado</p>
                        <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{money(data.paid)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-gray-400">Por cobrar</p>
                        <p className="font-mono font-semibold text-amber-600 dark:text-amber-400">{money(data.unpaid)}</p>
                    </div>
                </div>
            )}
        </div>
    )
}
