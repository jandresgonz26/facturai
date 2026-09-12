'use client'

import { useEffect, useState } from 'react'
import type { DayBlock } from '@/lib/task-priority'
import { DayScene } from './DayScene'

/**
 * Cabecera del día: paisaje ilustrado según la hora, con el saludo, la fecha y
 * la hora encima. El texto se apoya en un velo degradado para que se lea igual
 * de bien tanto si detrás hay cielo claro, el sol o un cerro oscuro.
 */

/**
 * Cada escena define su velo. Van dos, uno por cada extremo donde hay texto,
 * en vez de uno solo de izquierda a derecha: así la hora de la derecha también
 * queda protegida y la ilustración se mantiene limpia en el centro.
 */
const SCENES: Record<DayBlock, { label: string; left: string; right: string; text: string; sub: string }> = {
    morning: {
        label: 'Buenos días',
        left: 'from-white/95 via-white/55 to-transparent',
        right: 'from-white/92 via-white/40 to-transparent',
        // Oscuro pero no negro puro: un azulado profundo, no gris frío.
        text: 'text-slate-700',
        sub: 'text-slate-700',
    },
    afternoon: {
        label: 'Buenas tardes',
        left: 'from-white/95 via-white/55 to-transparent',
        right: 'from-white/92 via-white/40 to-transparent',
        text: 'text-slate-700',
        sub: 'text-slate-700',
    },
    evening: {
        label: 'Buenas noches',
        left: 'from-slate-950/90 via-slate-950/65 to-transparent',
        right: 'from-slate-950/85 via-slate-950/45 to-transparent',
        text: 'text-slate-50',
        sub: 'text-slate-300',
    },
}

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

    // La hora se compone a mano: el formato español devuelve "a. m." con
    // espacios, y aquí el meridiano debe ser un detalle pequeño.
    const h24 = now?.getHours() ?? 0
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    const minutos = String(now?.getMinutes() ?? 0).padStart(2, '0')
    const meridiano = h24 < 12 ? 'AM' : 'PM'

    // En español el resultado viene en minúsculas; se capitaliza solo la
    // primera letra, no cada palabra.
    const fechaRaw = now?.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }) ?? ''
    const fecha = fechaRaw ? fechaRaw.charAt(0).toUpperCase() + fechaRaw.slice(1) : ''

    return (
        <section className="relative overflow-hidden rounded-2xl mb-6 min-h-[190px] shadow-sm">
            <DayScene block={block} />

            {/* Velos bajo el texto. Estrechos a propósito: si se tocan en el medio
                lavan toda la ilustración, que es justo lo que hay que preservar. */}
            <div className={`absolute inset-y-0 left-0 w-[42%] bg-gradient-to-r ${scene.left}`} aria-hidden />
            <div className={`absolute inset-y-0 right-0 w-[26%] bg-gradient-to-l ${scene.right}`} aria-hidden />

            <div className={`relative px-6 py-7 sm:px-8 sm:py-8 ${scene.text}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
                    <div>
                        {/* El saludo: sans geométrica, semigruesa (menos "volt" que antes). */}
                        <h1 className="font-display font-semibold text-[2.5rem] sm:text-[3.25rem] leading-[0.95] tracking-[-0.03em]">
                            {scene.label}
                        </h1>
                        <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] ${scene.sub} opacity-80`}>
                            {fecha}
                        </p>
                    </div>

                    <p className="flex items-baseline gap-1.5 leading-none drop-shadow-sm">
                        <span className="font-display text-[2.75rem] sm:text-[3.25rem] font-bold tabular-nums tracking-[-0.03em]">
                            {h12}:{minutos}
                        </span>
                        <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${scene.sub} opacity-80`}>
                            {meridiano}
                        </span>
                    </p>
                </div>
                {children && <div className="mt-6">{children}</div>}
            </div>
        </section>
    )
}
