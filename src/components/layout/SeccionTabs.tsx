'use client'
/**
 * Pestañas de una sección que vive en varias rutas (Ajustes → General / Servicios; Propuestas → Con enlace /
 * Cotizaciones rápidas). Así el menú lateral tiene una sola entrada por sección y las rutas de siempre siguen.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type Pestana = { href: string; label: string }

export const PESTANAS_AJUSTES: Pestana[] = [
    { href: '/settings', label: 'General' },
    { href: '/servicios', label: 'Servicios y precios' },
]

export const PESTANAS_PROPUESTAS: Pestana[] = [
    { href: '/propuestas', label: 'Propuestas con enlace' },
    { href: '/quotes', label: 'Cotizaciones rápidas' },
]

export function SeccionTabs({ pestanas, label }: { pestanas: Pestana[]; label: string }) {
    const pathname = usePathname()
    return (
        <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b">
            {pestanas.map((p) => {
                const activa = pathname === p.href || pathname?.startsWith(`${p.href}/`)
                return (
                    <Link
                        key={p.href}
                        href={p.href}
                        aria-current={activa ? 'page' : undefined}
                        className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${activa ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    >
                        {p.label}
                    </Link>
                )
            })}
        </nav>
    )
}
