'use client'

import { useEffect, useState } from 'react'
import type { DayBlock } from '@/lib/task-priority'

/**
 * Escena de fondo según la franja del día, dibujada con CSS (sin imágenes que
 * cargar ni dependencias). Da contexto de un vistazo: la hora, la fecha y en
 * qué momento del día estás, que es lo que decide qué conviene hacer.
 */

/**
 * Cada escena define también su velo y su color de texto. El texto se apoya
 * siempre sobre ese velo, así se lee igual de bien tanto si detrás hay cielo
 * claro, el sol o una montaña.
 */
const SCENES: Record<DayBlock, { sky: string; ground: string; accent: string; label: string; scrim: string; text: string }> = {
    morning: {
        sky: 'from-amber-200 via-orange-200 to-sky-300 dark:from-amber-900/70 dark:via-orange-900/50 dark:to-sky-900/60',
        ground: 'text-emerald-700/70 dark:text-emerald-950',
        accent: 'text-amber-500',
        label: 'Buenos días',
        scrim: 'from-white/70 via-white/35 to-transparent dark:from-slate-950/80 dark:via-slate-950/45 dark:to-transparent',
        text: 'text-slate-900 dark:text-slate-50',
    },
    afternoon: {
        sky: 'from-sky-300 via-sky-200 to-amber-100 dark:from-sky-900/70 dark:via-sky-800/50 dark:to-amber-900/40',
        ground: 'text-emerald-800/70 dark:text-emerald-950',
        accent: 'text-amber-400',
        label: 'Buenas tardes',
        scrim: 'from-white/70 via-white/35 to-transparent dark:from-slate-950/80 dark:via-slate-950/45 dark:to-transparent',
        text: 'text-slate-900 dark:text-slate-50',
    },
    evening: {
        sky: 'from-indigo-900 via-slate-900 to-slate-950',
        ground: 'text-slate-950',
        accent: 'text-slate-100',
        label: 'Buenas noches',
        scrim: 'from-slate-950/80 via-slate-950/40 to-transparent',
        text: 'text-slate-50',
    },
}

/** Posiciones fijas para que las estrellas no bailen en cada render. */
const STARS = [
    { x: 12, y: 22, s: 2 }, { x: 24, y: 42, s: 1.5 }, { x: 38, y: 16, s: 2.5 }, { x: 47, y: 34, s: 1.5 },
    { x: 58, y: 20, s: 2 }, { x: 66, y: 44, s: 1.5 }, { x: 74, y: 26, s: 2 }, { x: 83, y: 38, s: 1.5 },
    { x: 91, y: 18, s: 2 }, { x: 30, y: 60, s: 1.5 }, { x: 54, y: 56, s: 1.5 }, { x: 79, y: 62, s: 2 },
]

export function DayBanner({ block, children }: { block: DayBlock; children?: React.ReactNode }) {
    const scene = SCENES[block]
    const [now, setNow] = useState<Date | null>(null)

    // La hora se resuelve en el cliente para no descuadrar la hidratación. El
    // primer valor llega en el siguiente tick, no dentro del efecto, para no
    // encadenar renders.
    useEffect(() => {
        const tick = () => setNow(new Date())
        const first = setTimeout(tick, 0)
        const id = setInterval(tick, 30000)
        return () => {
            clearTimeout(first)
            clearInterval(id)
        }
    }, [])

    const hora = now?.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }) ?? ''
    const fecha = now
        ? now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })
        : ''

    return (
        <section className={`relative overflow-hidden rounded-2xl bg-gradient-to-b ${scene.sky} mb-6`}>
            {/* Cielo */}
            <div className="absolute inset-0" aria-hidden>
                {block === 'evening' ? (
                    <>
                        {STARS.map((s, i) => (
                            <span
                                key={i}
                                className="absolute rounded-full bg-white/80"
                                style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s }}
                            />
                        ))}
                        <div className="absolute right-[12%] top-[18%] h-12 w-12 rounded-full bg-slate-100 shadow-[0_0_40px_10px_rgba(255,255,255,0.25)]" />
                        <div className="absolute right-[10%] top-[15%] h-12 w-12 rounded-full bg-slate-900/95" />
                    </>
                ) : (
                    <div
                        className={`absolute h-16 w-16 rounded-full bg-current ${scene.accent} blur-[1px] shadow-[0_0_60px_20px_currentColor] opacity-90`}
                        style={{
                            right: block === 'morning' ? '18%' : '12%',
                            top: block === 'morning' ? '46%' : '14%',
                        }}
                    />
                )}
            </div>

            {/* Montañas */}
            <svg
                className={`absolute bottom-0 left-0 w-full ${scene.ground}`}
                viewBox="0 0 400 80"
                preserveAspectRatio="none"
                aria-hidden
                style={{ height: 64 }}
            >
                <path d="M0 80 L70 26 L120 60 L175 18 L240 62 L300 34 L360 66 L400 44 L400 80 Z" fill="currentColor" opacity="0.55" />
                <path d="M0 80 L55 46 L110 74 L170 40 L225 76 L290 50 L345 78 L400 58 L400 80 Z" fill="currentColor" />
            </svg>

            {/* Velo bajo el texto: garantiza contraste sin tapar la escena. */}
            <div className={`absolute inset-x-0 bottom-0 h-full bg-gradient-to-t ${scene.scrim}`} aria-hidden />

            {/* Contenido */}
            <div className={`relative px-5 py-6 sm:px-7 sm:py-7 ${scene.text}`}>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                    <div>
                        <h1 className="text-[1.75rem] sm:text-3xl font-semibold leading-none tracking-tight">{scene.label}</h1>
                        <p className="mt-2 text-[13px] font-medium capitalize opacity-75 tracking-wide">{fecha}</p>
                    </div>
                    <p className="text-4xl sm:text-5xl font-extralight tabular-nums leading-none tracking-tight opacity-95">
                        {hora}
                    </p>
                </div>
                {children && <div className="mt-5">{children}</div>}
            </div>
        </section>
    )
}
