'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const navLinks = [
    { href: '/', label: 'Dashboard', icon: 'dashboard' },
    { href: '/clients', label: 'Clientes', icon: 'group' },
    { href: '/month-end', label: 'Facturación', icon: 'receipt_long' },
    { href: '/invoices', label: 'Reportes', icon: 'analytics' },
    { href: '/settings', label: 'Ajustes', icon: 'settings' },
]

export function Sidebar() {
    const pathname = usePathname()
    const [mobileOpen, setMobileOpen] = useState(false)

    return (
        <>
            {/* Mobile toggle */}
            <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-900 text-white rounded-lg shadow-lg"
                aria-label="Toggle menu"
            >
                <span className="material-symbols-rounded text-xl">
                    {mobileOpen ? 'close' : 'menu'}
                </span>
            </button>

            {/* Backdrop */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-30"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <aside className={`
                fixed left-0 top-0 h-screen z-40
                w-64 bg-gray-900 text-white border-r border-gray-800
                flex flex-col py-6 shadow-xl
                transition-transform duration-300
                ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0
            `}>
                {/* Logo */}
                <div className="flex items-center px-6 mb-10">
                    <div className="relative w-8 h-8 flex-shrink-0">
                        <svg className="w-full h-full drop-shadow-[0_0_10px_rgba(45,212,191,0.5)]" viewBox="0 0 100 100">
                            <path d="M10 50 L90 10 L80 90 Z" fill="#38BDF8" opacity="1" />
                            <path d="M10 50 L80 90 L50 95 Z" fill="#2DD4BF" opacity="1" />
                        </svg>
                    </div>
                    <span className="font-bold text-xl tracking-tight text-white ml-3">
                        MicroBill
                        <span className="text-xs font-normal text-gray-400 block -mt-1">Executive</span>
                    </span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 w-full px-3 space-y-1">
                    {navLinks.map((link) => {
                        const isActive = pathname === link.href
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMobileOpen(false)}
                                className={`
                                    sidebar-link relative flex items-center gap-4 px-4 py-3 rounded-lg transition-all group
                                    ${isActive
                                        ? 'active text-white bg-gray-800 border border-gray-700/50'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                    }
                                `}
                            >
                                <span className={`material-symbols-rounded text-2xl ${isActive ? 'text-teal-400' : 'font-light'}`}>
                                    {link.icon}
                                </span>
                                <span className="text-sm font-medium">{link.label}</span>
                            </Link>
                        )
                    })}
                </nav>

                {/* User Profile Footer */}
                <div className="px-3 w-full mt-auto space-y-4">
                    <div className="pt-4 border-t border-gray-800">
                        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer transition-colors">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-teal-500 to-sky-500 p-[2px] flex-shrink-0 shadow-lg shadow-teal-900/50">
                                <div className="h-full w-full rounded-full bg-gray-700 flex items-center justify-center">
                                    <span className="material-symbols-rounded text-white text-sm">person</span>
                                </div>
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-sm font-medium text-white truncate">Admin</p>
                                <p className="text-xs text-gray-400 truncate">Executive View</p>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    )
}
