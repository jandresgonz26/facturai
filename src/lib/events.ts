'use client'

import { useEffect, useRef } from 'react'

/** Evento global que avisa a las vistas de que el asistente (u otro módulo) cambió datos. */
export const DATA_CHANGED_EVENT = 'facturai:data-changed'

export function emitDataChanged() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
}

/** Ejecuta `handler` cada vez que se emite el evento de cambio de datos. */
export function useDataChanged(handler: () => void) {
    const ref = useRef(handler)
    useEffect(() => {
        ref.current = handler
    })
    useEffect(() => {
        const listener = () => ref.current()
        window.addEventListener(DATA_CHANGED_EVENT, listener)
        return () => window.removeEventListener(DATA_CHANGED_EVENT, listener)
    }, [])
}
