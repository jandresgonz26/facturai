'use client'
import { createContext, useContext } from 'react'
import type { Moneda, Pricing } from '@/lib/propuestas/precios'

/** Lo que el bloque «Inversión» del editor necesita del editor de la propuesta: los precios y cómo abrirlos. */
export type ContextoInversion = { pricing: Pricing; moneda: Moneda; abrirPrecios: () => void; soloLectura: boolean }
export const InversionCtx = createContext<ContextoInversion | null>(null)
export const useInversionCtx = () => useContext(InversionCtx)
