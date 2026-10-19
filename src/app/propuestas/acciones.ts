'use server'
/**
 * Acciones del panel de propuestas (detrás de la sesión de José, proxy.ts). Envuelven src/lib/propuestas
 * y devuelven siempre { ok, mensaje } para que la interfaz muestre el error tal cual.
 */
import { revalidatePath } from 'next/cache'
import { listQuotes } from '@/lib/actions/quotes'
import { createLead } from '@/lib/actions/crm'
import * as datos from '@/lib/propuestas/datos'
import { reescribir, redactarPropuesta, type BorradorIA } from '@/lib/propuestas/ia'
import type { Moneda } from '@/lib/propuestas/precios'

type Resultado<T = undefined> = { ok: true; mensaje: string; data?: T } | { ok: false; mensaje: string }
const fallo = (e: unknown, def: string): { ok: false; mensaje: string } => ({ ok: false, mensaje: e instanceof Error ? e.message : def })
const refrescar = (id?: string) => {
    revalidatePath('/propuestas')
    if (id) revalidatePath(`/propuestas/${id}`)
}

export async function crearPropuestaAccion(input: { client_id?: string; nuevo_cliente?: string; title: string }): Promise<Resultado<{ id: string }>> {
    try {
        let clientId = input.client_id
        if (!clientId) {
            const nombre = (input.nuevo_cliente ?? '').trim()
            if (nombre.length < 2) return { ok: false, mensaje: 'Elige un cliente o escribe el nombre del nuevo.' }
            clientId = (await createLead({ name: nombre, source: 'Propuesta' })).id
        }
        const p = await datos.crearPropuesta({ client_id: clientId, title: input.title })
        refrescar()
        return { ok: true, mensaje: 'Propuesta creada.', data: { id: p.id } }
    } catch (e) {
        return fallo(e, 'No se pudo crear la propuesta.')
    }
}

export async function guardarPropuestaAccion(id: string, cambios: { title?: string; content?: unknown; pricing?: unknown; valid_until?: string | null; client_id?: string; currency?: Moneda }): Promise<Resultado<{ updated_at: string }>> {
    try {
        const r = await datos.guardarPropuesta(id, cambios)
        return { ok: true, mensaje: 'Guardado', data: r }
    } catch (e) {
        return fallo(e, 'No se pudo guardar.')
    }
}

export async function enviarPropuestaAccion(id: string): Promise<Resultado> {
    try {
        await datos.marcarEnviada(id)
        refrescar(id)
        return { ok: true, mensaje: 'Lista para el cliente: el enlace ya funciona.' }
    } catch (e) {
        return fallo(e, 'No se pudo marcar como enviada.')
    }
}

export async function rechazarPropuestaAccion(id: string): Promise<Resultado> {
    try {
        await datos.marcarRechazada(id)
        refrescar(id)
        return { ok: true, mensaje: 'Marcada como rechazada.' }
    } catch (e) {
        return fallo(e, 'No se pudo cambiar el estado.')
    }
}

export async function reabrirPropuestaAccion(id: string): Promise<Resultado> {
    try {
        await datos.reabrir(id)
        refrescar(id)
        return { ok: true, mensaje: 'Reabierta: el cliente puede volver a aceptarla. La aceptación anterior queda en la actividad.' }
    } catch (e) {
        return fallo(e, 'No se pudo reabrir.')
    }
}

export async function duplicarPropuestaAccion(id: string, clientId?: string): Promise<Resultado<{ id: string }>> {
    try {
        const p = await datos.duplicarPropuesta(id, clientId)
        refrescar()
        return { ok: true, mensaje: 'Copia creada.', data: { id: p.id } }
    } catch (e) {
        return fallo(e, 'No se pudo duplicar.')
    }
}

export async function borrarPropuestaAccion(id: string): Promise<Resultado> {
    try {
        await datos.borrarPropuesta(id)
        refrescar()
        return { ok: true, mensaje: 'Propuesta borrada.' }
    } catch (e) {
        return fallo(e, 'No se pudo borrar.')
    }
}

export async function facturarPropuestaAccion(id: string, cuotaId?: string): Promise<Resultado<{ invoice_id: string }>> {
    try {
        const r = await datos.facturarDesdePropuesta(id, cuotaId)
        refrescar(id)
        revalidatePath('/invoices')
        return { ok: true, mensaje: `Factura ${r.invoice_number} creada como borrador. Revísala en Facturas antes de enviarla.`, data: { invoice_id: r.invoice_id } }
    } catch (e) {
        return fallo(e, 'No se pudo crear la factura.')
    }
}

export async function crearFijosAccion(id: string): Promise<Resultado> {
    try {
        const r = await datos.crearFijosDesdePropuesta(id)
        refrescar(id)
        return { ok: true, mensaje: `${r.creados} ${r.creados === 1 ? 'servicio fijo creado' : 'servicios fijos creados'}: se cargarán en el cierre de cada mes.` }
    } catch (e) {
        return fallo(e, 'No se pudieron crear los servicios fijos.')
    }
}

export async function eventosAccion(id: string): Promise<datos.EventoPropuesta[]> {
    return datos.eventosDe(id)
}

export async function cotizacionesAccion(clientId: string): Promise<{ id: string; label: string; currency: string; items: { service: string; description: string; quantity: number; unit_price: number }[] }[]> {
    const qs = await listQuotes(100)
    return qs
        .filter((q) => q.quote_type === 'amount')
        .sort((a, b) => Number(b.client_id === clientId) - Number(a.client_id === clientId))
        .map((q) => ({ id: q.id, label: `${q.quote_number} · ${q.client_name} · ${q.issue_date}`, currency: q.currency, items: q.items }))
}

export async function redactarAccion(input: { clientId: string; titulo: string; notas: string }): Promise<Resultado<BorradorIA>> {
    try {
        const b = await redactarPropuesta(input)
        return { ok: true, mensaje: b.faltante ? `Borrador listo. Falta: ${b.faltante}` : 'Borrador listo: revísalo y ajusta lo que haga falta.', data: b }
    } catch (e) {
        return fallo(e, 'No se pudo redactar con IA.')
    }
}

export async function reescribirAccion(markdown: string, instruccion: string): Promise<Resultado<string>> {
    try {
        return { ok: true, mensaje: 'Listo.', data: await reescribir(markdown, instruccion) }
    } catch (e) {
        return fallo(e, 'No se pudo reescribir.')
    }
}
