'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function MonthlyRevenue({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
    const [totalRevenue, setTotalRevenue] = useState(0)
    const [goal] = useState(5500)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchMonthlyRevenue()
    }, [refreshTrigger])

    const fetchMonthlyRevenue = async () => {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

        const { data, error } = await supabase
            .from('logs')
            .select('value')
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth)
            .not('value', 'is', null)

        if (!error && data) {
            const total = data.reduce((sum, log) => sum + (log.value || 0), 0)
            setTotalRevenue(total)
        }
        setLoading(false)
    }

    const progressPercent = Math.min((totalRevenue / goal) * 100, 100)

    return (
        <div className="bg-white dark:bg-[#1E293B] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Ingresos Mes Actual
            </h3>
            <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {loading ? '...' : `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
                </span>
                {!loading && totalRevenue > 0 && (
                    <span className="text-sm font-medium text-emerald-500 flex items-center">
                        <span className="material-symbols-rounded text-base">trending_up</span>
                        {Math.round(progressPercent)}%
                    </span>
                )}
            </div>
            <div className="mt-4 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-700"
                    style={{ width: `${progressPercent}%` }}
                />
            </div>
            <p className="mt-2 text-xs text-gray-500 text-right">
                Meta: ${goal.toLocaleString('en-US')}
            </p>
        </div>
    )
}
