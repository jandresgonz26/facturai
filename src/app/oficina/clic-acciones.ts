'use server'
/**
 * Acciones de la Oficina para proyectos, encargos y confianza. Corren en el servidor detrás del control de
 * sesión (proxy.ts); son clics explícitos de José.
 */
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'
import { actualizarProyecto, crearProyecto, esProyectoId, type TipoProyecto } from '@/lib/agent/proyectos'
import { COOKIE_PROYECTO } from '@/lib/agent/proyecto-activo'
import { cancelarEncargo, responderEncargo } from '@/lib/agent/encargos'
import { guardarAutonomia } from '@/lib/agent/confianza'
import { borrarHilo } from '@/lib/agent/hilos'
import { proyectoActivo } from '@/lib/agent/proyecto-activo'

type Resultado = { ok: boolean; mensaje: string; id?: string }
const refrescar = () => revalidatePath('/oficina', 'layout')
const fallo = (e: unknown, def: string): Resultado => ({ ok: false, mensaje: e instanceof Error ? e.message : def })

export async function elegirProyectoAccion(id: string | null): Promise<void> {
    const c = await cookies()
    if (id && esProyectoId(id)) c.set(COOKIE_PROYECTO, id, { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 })
    else c.delete(COOKIE_PROYECTO)
    refrescar()
}

export async function crearProyectoAccion(f: FormData): Promise<Resultado> {
    try {
        const tipo = String(f.get('tipo') ?? 'producto') as TipoProyecto
        const p = await crearProyecto({ nombre: String(f.get('nombre') ?? ''), tipo: ['producto', 'cliente', 'interno'].includes(tipo) ? tipo : 'producto', descripcion: String(f.get('descripcion') ?? '') })
        await elegirProyectoAccion(p.id) // al crearlo, pasas a trabajar en él
        return { ok: true, mensaje: `Proyecto «${p.nombre}» creado. Ahora trabajas en él.`, id: p.id }
    } catch (e) { return fallo(e, 'No se pudo crear el proyecto.') }
}

export async function estadoProyectoAccion(id: string, estado: 'activo' | 'pausado' | 'archivado'): Promise<Resultado> {
    try {
        await actualizarProyecto(id, { estado })
        if (estado === 'archivado' && (await proyectoActivo()).id === id) await elegirProyectoAccion(null)
        refrescar()
        return { ok: true, mensaje: estado === 'archivado' ? 'Proyecto archivado.' : 'Proyecto actualizado.' }
    } catch (e) { return fallo(e, 'No se pudo actualizar el proyecto.') }
}

export async function responderEncargoAccion(id: string, respuesta: string): Promise<Resultado> {
    if (respuesta.trim().length < 1) return { ok: false, mensaje: 'Escribe tu respuesta.' }
    try { await responderEncargo(id, respuesta) } catch (e) { return fallo(e, 'No se pudo responder.') }
    refrescar()
    return { ok: true, mensaje: 'Listo: sigue trabajando y te avisa por Telegram.' }
}

export async function cancelarEncargoAccion(id: string): Promise<void> {
    await cancelarEncargo(id)
    refrescar()
}

export async function autonomiaAccion(dep: string, valor: boolean): Promise<void> {
    if (!(dep in DEPARTAMENTOS)) throw new Error('Departamento no válido')
    await guardarAutonomia(dep as Departamento, valor)
    refrescar()
}

export async function nuevaConversacionEquipoAccion(): Promise<void> {
    await borrarHilo('equipo', (await proyectoActivo()).id)
}
