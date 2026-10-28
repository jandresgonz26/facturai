'use server'
/** Acciones del catálogo de servicios (sesión de José, proxy.ts). Devuelven { ok, mensaje }. */
import { revalidatePath } from 'next/cache'
import * as d from '@/lib/servicios/datos'
import type { Catalogo } from '@/lib/servicios/tipos'

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
export const duplicarServicioAccion = async (id: string) => hacer(() => d.duplicarServicio(id), 'Servicio duplicado: edita la copia.')
export const moverServicioAccion = async (id: string, dir: -1 | 1) => hacer(() => d.moverServicio(id, dir === -1 ? -1 : 1), 'Orden guardado.')
export const activarServicioAccion = async (id: string, activo: boolean) => hacer(() => d.setServicioActivo(id, activo), activo ? 'Servicio reactivado.' : 'Servicio archivado.')

export const crearAreaAccion = async (nombre: string, color: string) => hacer(() => d.crearArea(nombre, color), 'Área creada.')
export const actualizarAreaAccion = async (id: string, nombre: string, color: string) => hacer(() => d.actualizarArea(id, nombre, color), 'Área guardada.')
export const borrarAreaAccion = async (id: string) => hacer(() => d.borrarArea(id), 'Área borrada: sus categorías quedan sin área.')
export const crearCategoriaAccion = async (name: string, areaId: string | null) => hacer(() => d.crearCategoria(name, areaId), 'Categoría creada.')
export const actualizarCategoriaAccion = async (id: string, c: { name?: string; area_id?: string | null; nota?: string | null }) => hacer(() => d.actualizarCategoria(id, c), 'Categoría guardada.')

/** Catálogo para los buscadores de cotizaciones y propuestas: solo servicios activos. */
export async function catalogoAccion(): Promise<Catalogo> {
    try {
        return await d.listarCatalogo({ soloActivos: true })
    } catch {
        return { areas: [], categorias: [], servicios: [] }
    }
}
