'use server'
/**
 * Acciones de la página de cada agente. Corren en el servidor (las tablas nuevas no se exponen al navegador)
 * y van detrás del mismo control de sesión que el resto de la app (proxy.ts).
 */
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import { actualizarObjetivo, crearHito, crearObjetivo, type EstadoObjetivo } from '@/lib/agent/objetivos'
import { borrarHilo } from '@/lib/agent/hilos'
import { proyectoActivo } from '@/lib/agent/proyecto-activo'

const ruta = (dep: Departamento) => `/oficina/${dep}`
function dep(d: string): Departamento {
    if (!(d in DEPARTAMENTOS)) throw new Error('Departamento no válido')
    return d as Departamento
}
const numero = (v: FormDataEntryValue | null) => {
    const t = String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
    return t === '' ? null : Number.isFinite(Number(t)) ? Number(t) : null
}
const texto = (v: FormDataEntryValue | null) => String(v ?? '').trim()

export async function crearObjetivoAccion(d: string, f: FormData): Promise<{ ok: boolean; mensaje: string }> {
    const departamento = dep(d)
    const titulo = texto(f.get('titulo'))
    if (titulo.length < 3) return { ok: false, mensaje: 'Escribe el objetivo (al menos 3 letras).' }
    try {
        await crearObjetivo({
            departamento, titulo, descripcion: texto(f.get('descripcion')) || null, metrica: texto(f.get('metrica')) || 'manual',
            unidad: (texto(f.get('unidad')) || 'numero') as 'usd' | 'numero' | 'pct', valor_meta: numero(f.get('meta')),
            valor_actual: numero(f.get('actual')), fecha_limite: texto(f.get('fecha')) || null, proyecto_id: (await proyectoActivo()).id,
        })
    } catch (e) {
        return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo crear.' }
    }
    revalidatePath(ruta(departamento))
    return { ok: true, mensaje: 'Objetivo creado.' }
}

export async function estadoObjetivoAccion(d: string, id: string, estado: EstadoObjetivo): Promise<void> {
    await actualizarObjetivo(id, { estado })
    revalidatePath(ruta(dep(d)))
}

export async function valorObjetivoAccion(d: string, id: string, valor: number): Promise<void> {
    await actualizarObjetivo(id, { valor_actual: valor })
    revalidatePath(ruta(dep(d)))
}

export async function crearHitoAccion(d: string, objetivoId: string, titulo: string, fecha: string | null): Promise<{ ok: boolean; mensaje: string }> {
    if (titulo.trim().length < 3) return { ok: false, mensaje: 'Escribe el hito.' }
    await crearHito(objetivoId, { titulo: titulo.trim(), fecha: fecha || null })
    revalidatePath(ruta(dep(d)))
    return { ok: true, mensaje: 'Hito añadido a tus Tareas.' }
}

export async function marcarHitoAccion(d: string, tareaId: string, hecho: boolean): Promise<void> {
    const { error } = await supabase.from('tasks').update({ status: hecho ? 'done' : 'todo', completed_at: hecho ? new Date().toISOString() : null }).eq('id', tareaId)
    if (error) throw new Error(error.message)
    revalidatePath(ruta(dep(d)))
}

export async function recordarAccion(d: string, hecho: string): Promise<{ ok: boolean; mensaje: string }> {
    const departamento = dep(d)
    if (hecho.trim().length < 3) return { ok: false, mensaje: 'Escribe qué debe recordar.' }
    const { error } = await supabase.from('agent_memoria').insert({ hecho: hecho.trim().slice(0, 600), departamento })
    if (error) return { ok: false, mensaje: error.message }
    revalidatePath(ruta(departamento))
    return { ok: true, mensaje: 'Guardado.' }
}

export async function olvidarAccion(d: string, id: string): Promise<void> {
    await supabase.from('agent_memoria').update({ activo: false, olvidado_at: new Date().toISOString() }).eq('id', id)
    revalidatePath(ruta(dep(d)))
}

export async function borrarHiloAccion(d: string): Promise<void> {
    await borrarHilo(dep(d), (await proyectoActivo()).id)
}
