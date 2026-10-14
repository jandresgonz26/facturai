/**
 * Nivel de confianza de cada agente (tabla agent_ajustes): con autonomía, sus escrituras internas
 * (INTERNAL_WRITE_TOOLS) se hacen sin tarjeta de confirmación. Por defecto, encendida.
 */
import { supabase } from '@/lib/supabase'
import { DEPARTAMENTOS, INTERNAL_WRITE_TOOLS, WRITE_TOOLS, departamentoDe, type Departamento } from './shared'

export type Autonomias = Record<Departamento, boolean>

export async function leerAutonomias(): Promise<Autonomias> {
    const todas = Object.fromEntries(Object.keys(DEPARTAMENTOS).map((d) => [d, true])) as Autonomias
    const { data } = await supabase.from('agent_ajustes').select('departamento, autonomia')
    for (const r of data ?? []) if (r.departamento in todas) todas[r.departamento as Departamento] = Boolean(r.autonomia)
    return todas
}

export async function guardarAutonomia(dep: Departamento, autonomia: boolean): Promise<void> {
    const { error } = await supabase.from('agent_ajustes').upsert({ departamento: dep, autonomia, updated_at: new Date().toISOString() }, { onConflict: 'departamento' })
    if (error) throw new Error(error.message)
}

/** ¿Este agente puede hacer esta escritura sin preguntar? */
export const sinPreguntar = (tool: string, a: Autonomias) => (INTERNAL_WRITE_TOOLS as readonly string[]).includes(tool) && a[departamentoDe(tool)]

/** Configuración de aprobaciones para el modelo: solo las escrituras que siguen necesitando la tarjeta. */
export function aprobacionesPara(a: Autonomias): Record<string, 'user-approval'> {
    return Object.fromEntries(WRITE_TOOLS.filter((t) => !sinPreguntar(t, a)).map((t) => [t, 'user-approval']))
}
