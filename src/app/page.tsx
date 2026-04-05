'use client'

import { useState } from 'react'
import { Feed } from '@/components/features/Feed'
import { QuickEntry } from '@/components/features/QuickEntry'
import { HourBagTracker } from '@/components/features/HourBagTracker'
import { MonthlyRevenue } from '@/components/features/MonthlyRevenue'
import { PendingPayments } from '@/components/features/PendingPayments'
import { PendingInvoices } from '@/components/features/PendingInvoices'

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleActivityChange = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return (
    <div className="flex flex-col xl:flex-row gap-8">
      {/* Main Content */}
      <div className="flex-1 space-y-8">
        {/* Title */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              Resumen Ejecutivo
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Vista general de rendimiento y facturación.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm">
              <span className="material-symbols-rounded align-bottom text-lg mr-1">calendar_today</span>
              Este Mes
            </button>
          </div>
        </div>

        {/* Quick Entry */}
        <QuickEntry onEntryAdded={handleActivityChange} />

        {/* Hour Bag Tracker */}
        <HourBagTracker refreshTrigger={refreshTrigger} onPackaged={handleActivityChange} />

        {/* Activity Feed */}
        <section aria-labelledby="recent-activity-title" className="space-y-6 pt-2">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
            <h2
              className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2"
              id="recent-activity-title"
            >
              <span className="material-symbols-rounded text-teal-600">history_edu</span>
              Auditoría de Actividad
            </h2>
            <a
              className="text-xs font-semibold uppercase tracking-wider text-teal-600 hover:text-teal-700 dark:text-teal-400 transition-colors cursor-pointer"
              href="/invoices"
            >
              Ver Completo
            </a>
          </div>
          <Feed refreshTrigger={refreshTrigger} onActivityChanged={handleActivityChange} />
        </section>
      </div>

      {/* Right Sidebar KPIs */}
      <aside className="w-full xl:w-80 flex flex-col gap-6">
        <MonthlyRevenue refreshTrigger={refreshTrigger} />
        <PendingPayments refreshTrigger={refreshTrigger} />
        <PendingInvoices refreshTrigger={refreshTrigger} />
      </aside>
    </div>
  )
}
