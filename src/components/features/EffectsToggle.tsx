'use client'

import { useEffect, useState } from 'react'
import { PartyPopper } from 'lucide-react'
import { effectsEnabled, setEffectsEnabled } from '@/lib/celebrate'

/**
 * Confeti + sonido al completar una tarea, con salida: por defecto activado,
 * pero en una oficina compartida un sonido puede sobrar. Vive en
 * localStorage (por navegador), no en company_settings: es una preferencia
 * de quien está mirando la pantalla en ese momento, no del negocio.
 */
export function EffectsToggle() {
    const [on, setOn] = useState(true)
    // Se lee en el siguiente tick, no dentro del efecto: localStorage no existe
    // en el servidor, así que el primer render siempre asume "activado" y se
    // corrige enseguida si el navegador dice lo contrario.
    useEffect(() => {
        const id = setTimeout(() => setOn(effectsEnabled()), 0)
        return () => clearTimeout(id)
    }, [])

    const toggle = () => {
        const next = !on
        setOn(next)
        setEffectsEnabled(next)
    }

    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
                <PartyPopper className="w-4 h-4 text-brand-blue dark:text-brand-cyan shrink-0" />
                <div className="min-w-0">
                    <p className="text-sm font-medium">Efectos al completar tareas</p>
                    <p className="text-xs text-muted-foreground">Confeti y un sonido corto al marcar una tarea como hecha.</p>
                </div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={toggle}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand-blue' : 'bg-muted'}`}
            >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
        </div>
    )
}
