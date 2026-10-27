'use server'
/** Acciones del control interno de proyectos (sesión de José, proxy.ts). Devuelven { ok, mensaje }. */
import { revalidatePath } from 'next/cache'
import * as d from '@/lib/control/datos'

type Resultado<T = undefined> = { ok: true; mensaje: string; data?: T } | { ok: false; mensaje: string }
const fallo = (e: unknown): { ok: false; mensaje: string } => ({ ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo guardar.' })

async function hacer<T>(proyectoId: string | null, fn: () => Promise<T>, mensaje: string): Promise<Resultado<T>> {
    try {
        const data = await fn()
        revalidatePath('/control')
        if (proyectoId) revalidatePath(`/control/${proyectoId}`)
        return { ok: true, mensaje, data }
    } catch (e) {
        return fallo(e)
    }
}

export const crearControlAccion = async (input: { nombre: string; client_id?: string | null; moneda?: 'USD' | 'EUR'; notas?: string; propuesta_id?: string | null }) =>
    input.propuesta_id ? desdePropuesta(input.propuesta_id, input.nombre) : hacer(null, () => d.crearControl(input), 'Proyecto creado.')

/** Crea (o abre, si ya existe) el control de una propuesta, con sus cuotas. */
export const crearControlDesdePropuestaAccion = async (propuestaId: string) => desdePropuesta(propuestaId)

async function desdePropuesta(propuestaId: string, nombre?: string): Promise<Resultado<string>> {
    const r = await hacer(null, () => d.crearControlDesdePropuesta(propuestaId, nombre), '')
    if (!r.ok) return r
    revalidatePath(`/propuestas/${propuestaId}`)
    return { ok: true, mensaje: r.data!.nuevo ? 'Control creado con las cuotas de la propuesta.' : 'Esta propuesta ya tenía su control: te lo abro.', data: r.data!.id }
}

export const enlazarPropuestaAccion = async (controlId: string, propuestaId: string | null) => {
    const r = await hacer(controlId, () => d.enlazarPropuesta(controlId, propuestaId), '')
    if (!r.ok) return r
    if (propuestaId) revalidatePath(`/propuestas/${propuestaId}`)
    const n = r.data?.cuotas ?? 0
    return { ok: true as const, mensaje: !propuestaId ? 'Propuesta desenlazada.' : n ? `Propuesta enlazada y ${n} ${n === 1 ? 'cuota cargada' : 'cuotas cargadas'}.` : 'Propuesta enlazada. Tus cuotas no se tocaron.' }
}
export const actualizarControlAccion = async (id: string, c: { nombre?: string; estado?: 'activo' | 'cerrado'; notas?: string | null }) => hacer(id, () => d.actualizarControl(id, c), 'Guardado.')
export const borrarControlAccion = async (id: string) => hacer(null, () => d.borrarControl(id), 'Proyecto borrado.')
export const agregarCuotaAccion = async (pid: string, c: { concepto: string; monto: string; vence?: string | null; detalle?: string; extra?: boolean }) => hacer(pid, () => d.agregarCuota(pid, c), c.extra ? 'Cobro añadido.' : 'Cuota añadida.')
export const actualizarCuotaAccion = async (pid: string, id: string, c: { concepto?: string; monto?: string; vence?: string | null; detalle?: string | null }) => hacer(pid, () => d.actualizarCuota(id, c), 'Cuota actualizada.')
export const agregarMovimientoAccion = async (pid: string, m: { lado: 'cliente' | 'proveedor'; proveedor?: string; fecha?: string; monto: string; metodo?: string; nota?: string }) => hacer(pid, () => d.agregarMovimiento(pid, m), m.lado === 'cliente' ? 'Abono registrado.' : 'Pago registrado.')
export const agregarAcuerdoAccion = async (pid: string, a: { proveedor: string; concepto: string; monto: string; estado?: 'acordado' | 'por_confirmar'; fecha?: string; detalle?: string }) => hacer(pid, () => d.agregarAcuerdo(pid, a), 'Acuerdo guardado.')
export const actualizarAcuerdoAccion = async (pid: string, id: string, a: { concepto?: string; monto?: string; estado?: 'acordado' | 'por_confirmar'; detalle?: string | null }) => hacer(pid, () => d.actualizarAcuerdo(id, a), 'Acuerdo actualizado.')
export const borrarFilaAccion = async (pid: string, tipo: 'cuota' | 'acuerdo' | 'movimiento', id: string) => hacer(pid, () => d.borrarFila(tipo, id), 'Borrado.')
