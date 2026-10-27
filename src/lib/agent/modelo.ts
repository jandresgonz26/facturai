/**
 * Proveedor y modelos del asistente. Desde octubre de 2026 el asistente corre con
 * Claude (API de Anthropic). Si no hay ANTHROPIC_API_KEY pero sí OPENAI_API_KEY,
 * sigue funcionando con OpenAI para no dejar la app sin asistente.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { JSONValue, LanguageModel } from 'ai'

export const MODELO_CHAT_DEFECTO = 'claude-opus-5-5'
export const MODELO_RUTINAS_DEFECTO = 'claude-sonnet-5-5'

export function proveedorActivo(): 'anthropic' | 'openai' | null {
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
    if (process.env.OPENAI_API_KEY) return 'openai'
    return null
}

export function anthropicProvider() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('Falta configurar ANTHROPIC_API_KEY en el servidor.')
    // Las claves de usuario (sk-ant-usr-…) no van atadas a un workspace y la API exige indicarlo en una cabecera.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID
    return createAnthropic({ apiKey, headers: workspace ? { 'anthropic-workspace-id': workspace } : undefined })
}

/** Modelo del chat (web y Telegram): el más capaz, porque conversa y decide escrituras. */
export function modeloChat(): string {
    return process.env.ANTHROPIC_MODEL || MODELO_CHAT_DEFECTO
}

/** Modelo de las rutinas automáticas y los borradores: más barato, corre varias veces al día. */
export function modeloRutinas(): string {
    return process.env.ANTHROPIC_MODEL_RUTINAS || MODELO_RUTINAS_DEFECTO
}

/** Esfuerzo de razonamiento de Claude (low | medium | high). */
export function esfuerzo(): 'low' | 'medium' | 'high' {
    const e = process.env.ANTHROPIC_EFFORT
    return e === 'low' || e === 'high' ? e : 'medium'
}

/**
 * `cache: true` en las llamadas de varios pasos (rutinas, encargos, chat): Claude guarda en caché todo lo que ya
 * leyó (instrucciones, cerebro, resultados de herramientas) y en el paso siguiente lo relee a un 5 % del precio.
 * En una llamada de un solo paso no compensa: escribir en caché cuesta un 25 % más y nadie lo vuelve a leer.
 */
export function modeloPara(uso: 'chat' | 'rutinas', opts: { cache?: boolean } = {}): { model: LanguageModel; providerOptions: Record<string, Record<string, JSONValue>> } {
    const proveedor = proveedorActivo()
    if (proveedor === 'anthropic') {
        const anthropic = anthropicProvider()
        return {
            model: anthropic(uso === 'chat' ? modeloChat() : modeloRutinas()),
            providerOptions: { anthropic: { effort: esfuerzo(), ...(opts.cache ? { cacheControl: { type: 'ephemeral' } } : {}) } },
        }
    }
    if (proveedor === 'openai') {
        const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
        return { model: openai(process.env.OPENAI_MODEL || 'gpt-5.4-mini'), providerOptions: {} }
    }
    throw new Error('Falta configurar ANTHROPIC_API_KEY (o OPENAI_API_KEY) en el servidor.')
}
