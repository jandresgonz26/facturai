/** Conversación persistente de cada agente (su página en la Oficina). Se guarda en el servidor: igual en el Mac y en el teléfono. */
import type { UIMessage } from 'ai'
import { supabase } from '@/lib/supabase'
import type { Departamento } from './shared'

export const MAX_MENSAJES_HILO = 60

export async function leerHilo(dep: Departamento): Promise<UIMessage[]> {
    const { data, error } = await supabase.from('agent_hilos').select('messages').is('proyecto_id', null).eq('departamento', dep).maybeSingle()
    if (error) throw new Error(error.message)
    return Array.isArray(data?.messages) ? (data!.messages as UIMessage[]) : []
}

export async function guardarHilo(dep: Departamento, messages: UIMessage[]): Promise<void> {
    const recortados = messages.slice(-MAX_MENSAJES_HILO)
    const { data } = await supabase.from('agent_hilos').select('id').is('proyecto_id', null).eq('departamento', dep).maybeSingle()
    const fila = { messages: recortados, updated_at: new Date().toISOString() }
    const { error } = data
        ? await supabase.from('agent_hilos').update(fila).eq('id', data.id)
        : await supabase.from('agent_hilos').insert({ ...fila, departamento: dep })
    if (error) console.error('[hilo] no se pudo guardar', dep, error.message)
}

export async function borrarHilo(dep: Departamento): Promise<void> {
    await supabase.from('agent_hilos').delete().is('proyecto_id', null).eq('departamento', dep)
}
