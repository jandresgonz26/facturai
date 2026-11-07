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
    return { ok: true, mensaje: r.data!.nuevo ? 'Proyecto creado con las cuotas de la propuesta.' : 'Esta propuesta ya tenía su proyecto: te lo abro.', data: r.data!.id }
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
export const actualizarCuotaAccion = async (pid: string, id: string, c: { concepto?: string; monto?: string; vence?: string | null; detalle?: string | null; extra?: boolean }) => hacer(pid, () => d.actualizarCuota(id, c), 'Cuota actualizada.')
export const agregarMovimientoAccion = async (pid: string, m: { lado: 'cliente' | 'proveedor'; proveedor?: string; fecha?: string; monto: string; metodo?: string; nota?: string }, marcarFacturas = true) => {
    const r = await hacer(pid, async () => {
        await d.agregarMovimiento(pid, m)
        // Abono del cliente: las facturas de las cuotas que quedan completas pasan a pagadas.
        return m.lado === 'cliente' && marcarFacturas ? d.sincronizarPagos(pid).catch(() => 0) : 0
    }, '')
    if (!r.ok) return r
    revalidatePath('/invoices')
    const n = r.data ?? 0
    return { ok: true as const, mensaje: m.lado === 'proveedor' ? 'Pago registrado.' : n ? `Abono registrado y ${n === 1 ? 'su factura quedó pagada' : `${n} facturas quedaron pagadas`}.` : 'Abono registrado.' }
}
export const facturarCuotaAccion = async (pid: string, cuotaId: string) => {
    const r = await hacer(pid, () => d.facturarCuota(pid, cuotaId), '')
    if (!r.ok) return r
    revalidatePath('/invoices')
    const { invoice_number, pagada, reutilizado } = r.data!
    return { ok: true as const, mensaje: `Factura ${invoice_number} creada${pagada ? ' y marcada como pagada (el cliente ya pagó esta cuota)' : ' en borrador: envíasela desde Facturas'}.${reutilizado ? ' Usé el ítem que ya estaba pendiente en Facturación.' : ''}` }
}
export const enlazarFacturaAccion = async (pid: string, cuotaId: string, invoiceId: string | null) => {
    const r = await hacer(pid, () => d.enlazarFactura(pid, cuotaId, invoiceId), invoiceId ? 'Factura enlazada.' : 'Factura desenlazada.')
    revalidatePath('/invoices')
    return r
}
export const agregarAcuerdoAccion = async (pid: string, a: { proveedor: string; concepto: string; monto: string; estado?: 'acordado' | 'por_confirmar'; fecha?: string; detalle?: string }) => hacer(pid, () => d.agregarAcuerdo(pid, a), 'Acuerdo guardado.')
export const actualizarAcuerdoAccion = async (pid: string, id: string, a: { proveedor?: string; concepto?: string; monto?: string; estado?: 'acordado' | 'por_confirmar'; fecha?: string; detalle?: string | null }) => hacer(pid, () => d.actualizarAcuerdo(id, a), 'Acuerdo actualizado.')
export const actualizarMovimientoAccion = async (pid: string, id: string, m: { fecha?: string; monto?: string; metodo?: string | null; nota?: string | null }) =>
    hacer(pid, async () => { await d.actualizarMovimiento(id, m); await d.sincronizarPagos(pid).catch(() => 0) }, 'Actualizado.')
export const agregarExtraAccion = async (pid: string, e: { concepto: string; cobro?: string; despuesDe?: number | null; vence?: string | null; proveedor?: string; pago?: string; estado?: 'acordado' | 'por_confirmar'; detalle?: string }) => {
    const r = await hacer(pid, () => d.agregarExtra(pid, e), '')
    if (!r.ok) return r
    const { cuota, acuerdo } = r.data!
    return { ok: true as const, mensaje: cuota && acuerdo ? 'Extra añadido: el cobro al cliente y el pago al programador.' : cuota ? 'Extra añadido al cobro del cliente.' : 'Extra añadido al acuerdo con el programador.' }
}
export const borrarFilaAccion = async (pid: string, tipo: 'cuota' | 'acuerdo' | 'movimiento', id: string) => hacer(pid, () => d.borrarFila(tipo, id), 'Borrado.')
