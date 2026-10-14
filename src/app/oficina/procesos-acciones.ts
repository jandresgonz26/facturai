'use server'
/**
 * Acciones de los procesos guiados de la Oficina: cerebro de la empresa, entregables y planes (las tareas
 * guiadas corren en /api/oficina/tarea, que transmite el avance en vivo). Corren en el servidor (las tablas
 * no se exponen al navegador) detrás del control de sesión (proxy.ts).
 * Son clics explícitos de José; las escrituras que propone un agente en el chat siguen pasando por confirmación.
 */
import { revalidatePath } from 'next/cache'
import { guardarSeccion } from '@/lib/agent/cerebro'
import type { SeccionCerebro } from '@/lib/agent/cerebro-secciones'
import { cambiarEstadoEntregable, type Entregable } from '@/lib/agent/entregables'
import { actualizarPaso, cambiarEstadoPlan, generarPlan, pasoATarea, quitarPaso, type EstadoPaso, type EstadoPlan } from '@/lib/agent/planes'

type Resultado<T = undefined> = { ok: true; mensaje: string; data?: T } | { ok: false; mensaje: string }
const fallo = (e: unknown, def: string): { ok: false; mensaje: string } => ({ ok: false, mensaje: e instanceof Error ? e.message : def })
const refrescar = () => revalidatePath('/oficina', 'layout')

export async function guardarCerebroAccion(seccion: SeccionCerebro, contenido: string): Promise<Resultado> {
    try { await guardarSeccion(seccion, contenido) } catch (e) { return fallo(e, 'No se pudo guardar.') }
    refrescar()
    return { ok: true, mensaje: 'Guardado. Todos los agentes ya lo usan.' }
}

export async function estadoEntregableAccion(id: string, estado: Entregable['estado']): Promise<void> {
    await cambiarEstadoEntregable(id, estado)
    refrescar()
}

export async function generarPlanAccion(meta: string, fechaLimite: string | null, contexto: string | null): Promise<Resultado<{ id: string }>> {
    try {
        const p = await generarPlan({ meta, fecha_limite: fechaLimite || null, contexto })
        refrescar()
        return { ok: true, mensaje: 'Plan listo para revisar.', data: { id: p.id } }
    } catch (e) {
        return fallo(e, 'No se pudo generar el plan.')
    }
}

export async function estadoPlanAccion(id: string, estado: EstadoPlan): Promise<Resultado> {
    try { await cambiarEstadoPlan(id, estado) } catch (e) { return fallo(e, 'No se pudo cambiar el plan.') }
    refrescar()
    return { ok: true, mensaje: estado === 'activo' ? 'Plan en marcha.' : 'Plan actualizado.' }
}

export async function pasoEstadoAccion(pasoId: string, estado: EstadoPaso, entregableId?: string | null): Promise<Resultado<{ completado: boolean; siguiente: string | null }>> {
    try {
        if (entregableId && estado === 'hecho') await cambiarEstadoEntregable(entregableId, 'aprobado')
        const r = await actualizarPaso(pasoId, estado)
        refrescar()
        return { ok: true, mensaje: r.plan_completado ? '¡Plan completado!' : r.siguiente ? `Sigue: ${r.siguiente}` : 'Paso actualizado.', data: { completado: r.plan_completado, siguiente: r.siguiente } }
    } catch (e) {
        return fallo(e, 'No se pudo actualizar el paso.')
    }
}

export async function quitarPasoAccion(pasoId: string): Promise<Resultado> {
    try { await quitarPaso(pasoId) } catch (e) { return fallo(e, 'No se pudo quitar.') }
    refrescar()
    return { ok: true, mensaje: 'Paso quitado.' }
}

export async function pasoATareaAccion(pasoId: string): Promise<Resultado> {
    try { await pasoATarea(pasoId) } catch (e) { return fallo(e, 'No se pudo crear la tarea.') }
    refrescar()
    return { ok: true, mensaje: 'Añadido a tus Tareas con su fecha.' }
}
