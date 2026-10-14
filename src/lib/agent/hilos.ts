/** Conversación persistente de cada agente (su página en la Oficina). Se guarda en el servidor: igual en el Mac y en el teléfono. */
import type { UIMessage } from 'ai'
import { supabase } from '@/lib/supabase'
import type { Departamento } from './shared'
import { porAlcance, type ProyectoId } from './proyectos'

export const MAX_MENSAJES_HILO = 60
/** Cada agente tiene una conversación por proyecto; «equipo» es la puerta de entrada de la Oficina. */
export type HiloDe = Departamento | 'equipo'

export async function leerHilo(dep: HiloDe, proyecto: ProyectoId = null): Promise<UIMessage[]> {
    const { data, error } = await porAlcance(supabase.from('agent_hilos').select('messages'), proyecto).eq('departamento', dep).maybeSingle()
    if (error) throw new Error(error.message)
    return Array.isArray(data?.messages) ? (data!.messages as UIMessage[]) : []
}

export async function guardarHilo(dep: HiloDe, messages: UIMessage[], proyecto: ProyectoId = null): Promise<void> {
    const recortados = messages.slice(-MAX_MENSAJES_HILO)
    const { data } = await porAlcance(supabase.from('agent_hilos').select('id'), proyecto).eq('departamento', dep).maybeSingle()
    const fila = { messages: recortados, updated_at: new Date().toISOString() }
    const { error } = data
        ? await supabase.from('agent_hilos').update(fila).eq('id', data.id)
        : await supabase.from('agent_hilos').insert({ ...fila, departamento: dep, proyecto_id: proyecto })
    if (error) console.error('[hilo] no se pudo guardar', dep, error.message)
}

export async function borrarHilo(dep: HiloDe, proyecto: ProyectoId = null): Promise<void> {
    await porAlcance(supabase.from('agent_hilos').delete(), proyecto).eq('departamento', dep)
}
