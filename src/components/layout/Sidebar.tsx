'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
    ClipboardList,
    FileText,
    LayoutDashboard,
    ListTodo,
    Menu,
    ReceiptText,
    Settings,
    SquareKanban,
    Users,
    X,
    type LucideIcon,
} from 'lucide-react'
import { BRAND } from '@/lib/brand'

const navLinks: { href: string; label: string; icon: LucideIcon }[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/tasks', label: 'Tareas', icon: ListTodo },
    { href: '/clients', label: 'Clientes', icon: Users },
    { href: '/pipeline', label: 'Pipeline', icon: SquareKanban },
    { href: '/month-end', label: 'Facturación', icon: ReceiptText },
    { href: '/quotes', label: 'Cotizaciones', icon: ClipboardList },
    { href: '/invoices', label: 'Facturas', icon: FileText },
    { href: '/settings', label: 'Ajustes', icon: Settings },
]

/** Avatar con iniciales y anillo en los tres colores del logo. */
export function BrandAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
    const outer = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
    const text = size === 'sm' ? 'text-xs' : 'text-sm'
    return (
        <div className={`brand-ring ${outer} shrink-0 rounded-full p-[2px]`}>
            <div className={`flex h-full w-full items-center justify-center rounded-full bg-brand-navy font-display font-semibold text-white ${text}`}>
                {BRAND.initials}
            </div>
        </div>
    )
}

export function Sidebar() {
    const pathname = usePathname()
    const [mobileOpen, setMobileOpen] = useState(false)

    return (
        <>
            {/* Mobile toggle */}
            <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden fixed top-3.5 left-4 z-50 p-2 bg-brand-navy text-white rounded-xl shadow-lg"
                aria-label="Abrir menú"
            >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Backdrop */}
            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
            )}

            <aside
                className={`
                fixed left-0 top-0 h-screen z-40 w-64
                flex flex-col text-sidebar-foreground
                bg-[linear-gradient(180deg,#0B3552_0%,#0E4569_100%)]
                shadow-[8px_0_30px_-18px_rgba(11,53,82,0.6)]
                transition-transform duration-300
                ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0
            `}
            >
                {/* Logo: la versión con texto blanco; el isotipo conserva sus colores. */}
                <div className="px-6 pt-7 pb-6">
                    <Link href="/" className="block" title={BRAND.legalName}>
                        <Image src={BRAND.logoOnDark} alt={BRAND.company} width={1064} height={274} priority className="h-8 w-auto" />
                    </Link>
                </div>

                {/* Perfil arriba, como tarjeta: quién está usando la app y de qué empresa. */}
                <Link
                    href="/settings"
                    onClick={() => setMobileOpen(false)}
                    className="mx-4 mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 transition-colors hover:bg-white/[0.12]"
                >
                    <BrandAvatar />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{BRAND.owner}</p>
                        <p className="truncate text-[11px] text-white/60">
                            {BRAND.role} · {BRAND.company}
                        </p>
                    </div>
                    <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-brand-green shadow-[0_0_8px_#68B840]" title="Sesión activa" />
                </Link>

                {/* Navegación: el activo es una pastilla blanca sobre el azul, no un borde tímido. */}
                <nav className="flex-1 w-full px-4 space-y-1">
                    {navLinks.map((link) => {
                        const isActive = pathname === link.href
                        const Icon = link.icon
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMobileOpen(false)}
                                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                                    isActive
                                        ? 'bg-white text-brand-blue shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)]'
                                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-brand-blue' : ''}`} strokeWidth={isActive ? 2.25 : 1.75} />
                                {link.label}
                            </Link>
                        )
                    })}
                </nav>

                <div className="px-6 pb-6 pt-4 text-[11px] leading-relaxed text-white/45">
                    <p className="font-medium text-white/60">{BRAND.legalName}</p>
                    <p>Gestión interna</p>
                </div>
            </aside>
        </>
    )
}
