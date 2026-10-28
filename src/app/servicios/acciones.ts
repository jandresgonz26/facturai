'use server'
/** Acciones del catálogo de servicios (sesión de José, proxy.ts). Devuelven { ok, mensaje }. */
import { revalidatePath } from 'next/cache'
import * as d from '@/lib/servicios/datos'
import type { Servicio } from '@/lib/servicios/tipos'

type Resultado<T = undefined> = { ok: true; mensaje: string; data?: T } | { ok: false; mensaje: string }

async function hacer<T>(fn: () => Promise<T>, mensaje: string): Promise<Resultado<T>> {
    try {
        const data = await fn()
        revalidatePath('/servicios')
        return { ok: true, mensaje, data }
    } catch (e) {
        return { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo guardar.' }
    }
}

export const crearServicioAccion = async (i: d.ServicioInput) => hacer(() => d.crearServicio(i), 'Servicio creado.')
export const actualizarServicioAccion = async (id: string, i: d.ServicioInput) => hacer(() => d.actualizarServicio(id, i), 'Guardado.')
export const activarServicioAccion = async (id: string, activo: boolean) => hacer(() => d.setServicioActivo(id, activo), activo ? 'Servicio reactivado.' : 'Servicio archivado.')

/** Para los selectores de cotizaciones y propuestas: paquetes y adicionales activos (sin la política). */
export async function catalogoAccion(): Promise<Servicio[]> {
    try {
        return (await d.listarServicios({ soloActivos: true })).filter((s) => s.tipo !== 'politica')
    } catch {
        return []
    }
}
