'use client'

import confetti from 'canvas-confetti'
import { BRAND } from './brand'

/**
 * Efectos al completar tareas: un empujón pequeño de dopamina para que
 * cerrar algo se sienta bien, no solo un cambio de color en la tarjeta.
 *
 * La preferencia vive en localStorage (por navegador, no por cuenta): es una
 * conveniencia de "este viewer en esta máquina", no un dato del negocio que
 * tenga sentido sincronizar entre dispositivos.
 */

const SOUND_KEY = 'facturai:completion-effects'

export function effectsEnabled(): boolean {
    try {
        return localStorage.getItem(SOUND_KEY) !== 'off'
    } catch {
        return true
    }
}

export function setEffectsEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off')
    } catch {
        // Almacenamiento bloqueado (privado, cuota, etc.): sin persistir, se
        // vuelve a preguntar la próxima vez, pero no rompe nada.
    }
}

const BRAND_COLORS = [BRAND.colors.blue, BRAND.colors.cyan, BRAND.colors.green]

/** Un "pop" corto y agudo, sin archivo de audio: un oscilador con una caída rápida de volumen. */
function playPop(): void {
    try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return
        const ctx = new Ctx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08)
        gain.gain.setValueAtTime(0.18, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.2)
        osc.onended = () => ctx.close()
    } catch {
        // Sin audio disponible (política del navegador, entorno sin audio): se
        // sigue solo con el confeti, que es el efecto principal.
    }
}

/** Tarea puntual completada: un chispazo breve, no un espectáculo. */
export function celebrateTaskDone(origin?: { x: number; y: number }): void {
    if (!effectsEnabled()) return
    confetti({
        particleCount: 26,
        spread: 55,
        startVelocity: 28,
        gravity: 1.1,
        scalar: 0.8,
        colors: BRAND_COLORS,
        origin: origin ?? { y: 0.7 },
    })
    playPop()
}

/** Se cerró el plan completo del día: el momento sí merece algo más grande. */
export function celebrateDayDone(): void {
    if (!effectsEnabled()) return
    const end = Date.now() + 600
    ;(function frame() {
        confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors: BRAND_COLORS })
        confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors: BRAND_COLORS })
        if (Date.now() < end) requestAnimationFrame(frame)
    })()
    playPop()
    setTimeout(playPop, 150)
}
