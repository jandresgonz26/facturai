import { supabase } from '@/lib/supabase'
import { ActionError } from './validation'

/**
 * Memoria de lo que el asistente ya le dijo al usuario.
 *
 * La regla de fondo: un aviso repetido igual todos los días se vuelve ruido y
 * termina silenciado. Así que cada aviso lleva la cuenta de cuántas veces se
 * mandó, para poder escalar el tono, y el usuario puede posponerlo o soltarlo.
 */

export interface NudgeState {
    id: string
    kind: string
    ref_id: string
    times_sent: number
    last_sent_at: string | null
    snoozed_until: string | null
    dismissed: boolean
}

export type NudgeKey = { kind: string; ref_id?: string }

const key = (k: NudgeKey) => ({ kind: k.kind, ref_id: k.ref_id ?? '' })

export async function listNudges(): Promise<NudgeState[]> {
    const { data, error } = await supabase.from('nudges').select('*')
    if (error) throw new ActionError(`No se pudo leer el historial de avisos: ${error.message}`)
    return (data || []) as NudgeState[]
}

/**
 * ¿Se puede volver a mencionar esto ahora? Respeta lo soltado, lo pospuesto y
 * un mínimo de horas entre repeticiones del mismo aviso.
 */
export function canSend(state: NudgeState | undefined, now = new Date(), minHoursBetween = 20): boolean {
    if (!state) return true
    if (state.dismissed) return false
    if (state.snoozed_until && new Date(state.snoozed_until) > now) return false
    if (!state.last_sent_at) return true
    const hours = (now.getTime() - new Date(state.last_sent_at).getTime()) / 3600000
    return hours >= minHoursBetween
}

/** Deja constancia de que se acaba de mencionar, subiendo el contador. */
export async function markSent(k: NudgeKey): Promise<void> {
    const { kind, ref_id } = key(k)
    const { data: existing } = await supabase.from('nudges').select('id, times_sent').eq('kind', kind).eq('ref_id', ref_id).maybeSingle()
    if (existing) {
        await supabase
            .from('nudges')
            .update({ times_sent: (existing.times_sent ?? 0) + 1, last_sent_at: new Date().toISOString() })
            .eq('id', existing.id)
        return
    }
    await supabase.from('nudges').insert({ kind, ref_id, times_sent: 1, last_sent_at: new Date().toISOString() })
}

/** "No me lo recuerdes hasta mañana / la semana que viene". */
export async function snoozeNudge(k: NudgeKey, until: Date): Promise<void> {
    const { kind, ref_id } = key(k)
    const { error } = await supabase
        .from('nudges')
        .upsert({ kind, ref_id, snoozed_until: until.toISOString() }, { onConflict: 'kind,ref_id' })
    if (error) throw new ActionError(`No se pudo posponer el aviso: ${error.message}`)
}

/** "Suéltalo, no me lo menciones más". */
export async function dismissNudge(k: NudgeKey): Promise<void> {
    const { kind, ref_id } = key(k)
    const { error } = await supabase
        .from('nudges')
        .upsert({ kind, ref_id, dismissed: true }, { onConflict: 'kind,ref_id' })
    if (error) throw new ActionError(`No se pudo descartar el aviso: ${error.message}`)
}

/** Cuando el asunto se resuelve solo (se pagó, se cerró la tarea), se olvida. */
export async function clearNudge(k: NudgeKey): Promise<void> {
    const { kind, ref_id } = key(k)
    await supabase.from('nudges').delete().eq('kind', kind).eq('ref_id', ref_id)
}
