/**
 * Control interno de proyectos (schema_update_control.sql): lectura y escritura en el servidor, detrás de la
 * sesión de José. Nada de esto llega al cliente ni se cruza con facturas.
 */
import { randomUUID } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { ActionError } from '@/lib/actions/validation'
import { leerPropuesta, type Propuesta } from '@/lib/propuestas/datos'
import { calcular as calcularPropuesta, dinero as dineroPropuesta, frecuencia } from '@/lib/propuestas/precios'
import { calcular, type Acuerdo, type Cuota, type Movimiento, type Resumen } from './calculo'

export type ProyectoControl = {
    id: string
    nombre: string
    client_id: string | null
    propuesta_id: string | null
    estado: 'activo' | 'cerrado'
    moneda: 'USD' | 'EUR'
    notas: string | null
    created_at: string
    clients?: { name: string } | null
    proposals?: { number: string; title: string } | null
}

/** La factura de una cuota, tal como está en Facturación. */
export type FacturaCuota = { id: string; invoice_number: string; status: 'draft' | 'sent' | 'paid'; paid_at: string | null; total_amount: number }

export type ControlCompleto = {
    proyecto: ProyectoControl
    cuotas: Cuota[]
    acuerdos: Acuerdo[]
    movimientos: Movimiento[]
    resumen: Resumen
    /** Puente con Facturación: factura de cada cuota (por id de cuota). `null` si falta ejecutar schema_update_proyectos_facturas.sql. */
    facturas: Record<string, FacturaCuota> | null
    /** Facturas del cliente que todavía no están enlazadas a ninguna cuota (para enlazar una ya hecha). */
    facturasSueltas: FacturaCuota[]
}

const num = (rows: Record<string, unknown>[] | null) => (rows ?? []).map((r) => ({ ...r, proyecto_id: String(r.proyecto_id ?? ""), monto: Number(r.monto) }))

export async function listarControles(): Promise<(ProyectoControl & { resumen: Resumen })[]> {
    const [{ data: ps, error }, { data: cs }, { data: as }, { data: ms }] = await Promise.all([
        supabase.from('control_proyectos').select('*, clients(name), proposals(number, title)').order('created_at', { ascending: false }),
        supabase.from('control_cuotas').select('*'),
        supabase.from('control_acuerdos').select('*'),
        supabase.from('control_movimientos').select('*'),
    ])
    if (error) throw new ActionError(`No se pudo cargar el control de proyectos: ${error.message}`)
    return ((ps ?? []) as ProyectoControl[]).map((p) => ({
        ...p,
        resumen: calcular(num(cs).filter((c) => c.proyecto_id === p.id) as unknown as Cuota[], num(as).filter((a) => a.proyecto_id === p.id) as unknown as Acuerdo[], num(ms).filter((m) => m.proyecto_id === p.id) as unknown as Movimiento[]),
    }))
}

export async function leerControl(id: string): Promise<ControlCompleto> {
    const [{ data: p, error }, { data: cs }, { data: as }, { data: ms }] = await Promise.all([
        supabase.from('control_proyectos').select('*, clients(name), proposals(number, title)').eq('id', id).maybeSingle(),
        supabase.from('control_cuotas').select('*').eq('proyecto_id', id).order('orden'),
        supabase.from('control_acuerdos').select('*').eq('proyecto_id', id).order('fecha'),
        supabase.from('control_movimientos').select('*').eq('proyecto_id', id).order('fecha'),
    ])
    if (error) throw new ActionError(`No se pudo cargar el proyecto: ${error.message}`)
    if (!p) throw new ActionError('Ese proyecto no existe.')
    const cuotas = num(cs) as unknown as Cuota[]
    const acuerdos = num(as) as unknown as Acuerdo[]
    const movimientos = num(ms) as unknown as Movimiento[]
    const { facturas, facturasSueltas } = await facturasDeCuotas(id, (p as ProyectoControl).client_id, (cs ?? []) as Record<string, unknown>[])
    return { proyecto: p as ProyectoControl, cuotas, acuerdos, movimientos, resumen: calcular(cuotas, acuerdos, movimientos), facturas, facturasSueltas }
}

// ─── Puente con Facturación ──────────────────────────────────────────────────

const CAMPOS_FACTURA = 'id, invoice_number, status, paid_at, total_amount'
const aFactura = (f: Record<string, unknown>): FacturaCuota => ({ id: String(f.id), invoice_number: String(f.invoice_number), status: f.status as FacturaCuota['status'], paid_at: (f.paid_at as string | null) ?? null, total_amount: Number(f.total_amount) })

async function facturasDeCuotas(proyectoId: string, clientId: string | null, filas: Record<string, unknown>[]): Promise<{ facturas: Record<string, FacturaCuota> | null; facturasSueltas: FacturaCuota[] }> {
    // Sin la columna (SQL sin ejecutar) el proyecto se ve igual que antes, sin el puente.
    if (filas.length && !('invoice_id' in filas[0])) return { facturas: null, facturasSueltas: [] }
    if (!filas.length) {
        const prueba = await supabase.from('control_cuotas').select('invoice_id').eq('proyecto_id', proyectoId).limit(1)
        if (prueba.error) return { facturas: null, facturasSueltas: [] }
    }
    const ids = filas.map((c) => c.invoice_id as string | null).filter((x): x is string => !!x)
    const facturas: Record<string, FacturaCuota> = {}
    if (ids.length) {
        const { data } = await supabase.from('invoices').select(CAMPOS_FACTURA).in('id', ids)
        const porId = new Map((data ?? []).map((f) => [String(f.id), aFactura(f)]))
        for (const c of filas) if (c.invoice_id && porId.has(c.invoice_id as string)) facturas[String(c.id)] = porId.get(c.invoice_id as string)!
    }
    let facturasSueltas: FacturaCuota[] = []
    if (clientId) {
        const [{ data: delCliente }, { data: enlazadas }] = await Promise.all([
            supabase.from('invoices').select(CAMPOS_FACTURA).eq('client_id', clientId).order('issue_date', { ascending: false }).limit(30),
            supabase.from('control_cuotas').select('invoice_id').not('invoice_id', 'is', null),
        ])
        const usadas = new Set((enlazadas ?? []).map((x) => x.invoice_id as string))
        facturasSueltas = (delCliente ?? []).map(aFactura).filter((f) => !usadas.has(f.id))
    }
    return { facturas, facturasSueltas }
}

/** Posición de una cuota del plan (sin contar los cobros sueltos), que es la que tiene en la propuesta. */
const posicionEnPlan = (cuotas: { id: string; orden: number; extra: boolean }[], cuotaId: string) =>
    [...cuotas].filter((c) => !c.extra).sort((a, b) => a.orden - b.orden).findIndex((c) => c.id === cuotaId)

/**
 * Factura una cuota del proyecto al cliente. Si en Facturación ya hay un ítem suelto sin facturar que es esta
 * cuota (mismo cliente y monto, y menciona la propuesta o el concepto), lo usa en vez de duplicarlo.
 * Si el cliente ya la pagó, la factura queda pagada con la fecha en que se completó.
 */
export async function facturarCuota(proyectoId: string, cuotaId: string): Promise<{ invoice_number: string; pagada: boolean; reutilizado: boolean }> {
    const control = await leerControl(proyectoId)
    if (!control.facturas) throw new ActionError('Falta ejecutar schema_update_proyectos_facturas.sql en el SQL Editor de Supabase.')
    const p = control.proyecto
    if (!p.client_id) throw new ActionError('Este proyecto no tiene cliente: asígnale uno para poder facturar.')
    const cuota = control.cuotas.find((c) => c.id === cuotaId)
    if (!cuota) throw new ActionError('Esa cuota ya no existe.')
    if (control.facturas[cuotaId]) throw new ActionError(`Esta cuota ya tiene la factura ${control.facturas[cuotaId].invoice_number}.`)

    const { getClient } = await import('@/lib/actions/clients')
    const client = await getClient(p.client_id)
    const moneda = p.moneda
    const rate = moneda === 'EUR' ? await (await import('@/lib/currency')).getEurToUsdRate() : 1

    // ¿Ya hay un ítem suelto que es esta cuota? (p. ej. el de una factura que se borró)
    const claves = [p.proposals?.number, cuota.concepto.replace(/^Cuota \d+\s*·\s*/i, '').trim()].filter((x): x is string => !!x && x.length > 3).map((x) => x.toLowerCase())
    const { data: sueltos } = await supabase.from('logs').select('id, description, value, original_amount').eq('client_id', client.id).eq('status', 'pending').is('invoice_id', null)
    const igual = (sueltos ?? []).find((l) => Math.abs(Number(l.original_amount ?? l.value) - cuota.monto) < 0.01 && claves.some((k) => String(l.description).toLowerCase().includes(k)))

    let logIds: string[]
    let creados: string[] = []
    if (igual) logIds = [igual.id as string]
    else {
        const { resolveCategoryId } = await import('@/lib/actions/categories')
        const descripcion = `${p.proposals?.number ? `${p.proposals.number} · ` : ''}${p.nombre} — ${cuota.concepto}`.slice(0, 300)
        const r = await supabase.from('logs').insert({ client_id: client.id, description: descripcion, original_amount: cuota.monto, value: Math.round(cuota.monto * rate * 100) / 100, currency: moneda, category_id: await resolveCategoryId(), status: 'pending' }).select('id').single()
        creados = [revisar(r, 'preparar el ítem de la factura').id as string]
        logIds = creados
    }
    const { createInvoice } = await import('@/lib/actions/invoices')
    let invoice
    try {
        ;({ invoice } = await createInvoice({ client_id: client.id, log_ids: logIds }))
    } catch (e) {
        if (creados.length) await supabase.from('logs').delete().in('id', creados)
        throw e
    }
    revisar(await supabase.from('control_cuotas').update({ invoice_id: invoice.id }).eq('id', cuotaId), 'enlazar la factura con la cuota')
    if (p.propuesta_id && !cuota.extra) {
        const { registrarFacturaDeCuota } = await import('@/lib/propuestas/datos')
        await registrarFacturaDeCuota(p.propuesta_id, posicionEnPlan(control.cuotas, cuotaId), invoice).catch((e) => console.warn('[control] no se pudo anotar la factura en la propuesta', e))
    }
    const pagadas = await sincronizarPagos(proyectoId)
    return { invoice_number: invoice.invoice_number, pagada: pagadas > 0, reutilizado: !!igual }
}

/** Enlaza (o desenlaza, con null) una factura ya hecha a una cuota. */
export async function enlazarFactura(proyectoId: string, cuotaId: string, invoiceId: string | null): Promise<void> {
    if (invoiceId) {
        const { data: ya } = await supabase.from('control_cuotas').select('id').eq('invoice_id', invoiceId).neq('id', cuotaId).limit(1)
        if (ya?.length) throw new ActionError('Esa factura ya está enlazada a otra cuota.')
    }
    revisar(await supabase.from('control_cuotas').update({ invoice_id: invoiceId }).eq('id', cuotaId).eq('proyecto_id', proyectoId), 'enlazar la factura')
    if (invoiceId) await sincronizarPagos(proyectoId)
}

/** Lo llama la propuesta al facturar una cuota: la cuota del proyecto (misma posición en el plan) queda con esa factura. */
export async function enlazarFacturaDePropuesta(propuestaId: string, posicion: number, invoiceId: string): Promise<void> {
    const proyectoId = await controlDePropuesta(propuestaId)
    if (!proyectoId || posicion < 0) return
    const { data, error } = await supabase.from('control_cuotas').select('id, orden, extra, invoice_id').eq('proyecto_id', proyectoId)
    if (error || !data) return
    const plan = (data as { id: string; orden: number; extra: boolean; invoice_id: string | null }[]).filter((c) => !c.extra).sort((a, b) => a.orden - b.orden)
    const cuota = plan[posicion]
    if (!cuota || cuota.invoice_id) return
    await supabase.from('control_cuotas').update({ invoice_id: invoiceId }).eq('id', cuota.id)
    await sincronizarPagos(proyectoId)
}

/**
 * Las facturas de cuotas que el cliente ya completó con sus abonos quedan pagadas, con la fecha en que se
 * completaron. No revierte nada: si se borra un abono, la factura sigue como esté. Devuelve cuántas marcó.
 */
export async function sincronizarPagos(proyectoId: string): Promise<number> {
    const control = await leerControl(proyectoId)
    if (!control.facturas) return 0
    const { markInvoicePaid } = await import('@/lib/actions/invoices')
    const hoy = new Date().toISOString().slice(0, 10)
    let n = 0
    for (const c of control.resumen.cuotas) {
        const f = control.facturas[c.id]
        if (!f || f.status === 'paid' || c.estado !== 'pagada') continue
        const fechaPago = c.pagadaEl && c.pagadaEl <= hoy ? c.pagadaEl : hoy
        await markInvoicePaid(f.id, fechaPago)
        n++
    }
    return n
}

function revisar<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
    if (r.error) throw new ActionError(`No se pudo ${que}: ${r.error.message}`)
    return r.data as T
}

/** «1.830», «1.830,50», «1830.5» o «1830,5»: el punto con tres cifras detrás es separador de miles. */
const leerMonto = (v: unknown) => {
    const t = String(v ?? '').trim().replace(/[$€\s]/g, '')
    return Number(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.'))
}
const monto = (v: unknown, minimo = 0) => {
    const n = Math.round(leerMonto(v) * 100) / 100
    if (!Number.isFinite(n) || n < minimo || (minimo > 0 && n === 0)) throw new ActionError('Revisa el monto.')
    return n
}
const fecha = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10))
const texto = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function crearControl(input: { nombre: string; client_id?: string | null; moneda?: 'USD' | 'EUR'; notas?: string }): Promise<string> {
    const nombre = input.nombre.trim()
    if (nombre.length < 3) throw new ActionError('Ponle un nombre al proyecto.')
    const r = await supabase.from('control_proyectos').insert({ nombre, client_id: input.client_id || null, moneda: input.moneda === 'EUR' ? 'EUR' : 'USD', notas: texto(input.notas) }).select('id').single()
    return revisar(r, 'crear el proyecto').id
}

// ─── Desde una propuesta ─────────────────────────────────────────────────────

/**
 * Lo que se cobra según la propuesta: las cuotas de su plan de pagos o, sin plan, el pago único entero. Usa lo que
 * el cliente aceptó (opción y extras); si aún no la aceptó, la opción recomendada sin extras.
 */
function cobrosDePropuesta(p: Propuesta): { cuotas: { concepto: string; monto: number; detalle: string | null }[]; nota: string | null } {
    const t = p.accepted_snapshot?.totales ?? calcularPropuesta(p.pricing)
    const cuotas = t.cuotas.length
        ? t.cuotas.map((c, i) => ({ concepto: c.cuota.concepto.trim() || `Cuota ${i + 1}`, monto: c.monto, detalle: `${c.cuota.pct} % de la propuesta ${p.number}` }))
        : t.unico.total > 0 ? [{ concepto: 'Pago único', monto: t.unico.total, detalle: `Propuesta ${p.number}` }] : []
    // Lo recurrente se cobra con los servicios fijos, no con cuotas: queda anotado para tenerlo a la vista.
    const nota = t.recurrentes.length
        ? `Además, recurrente: ${t.recurrentes.map((r) => `${dineroPropuesta(r.bloque.total, p.currency)} ${frecuencia(r.frecuencia).label.toLowerCase()}`).join(' + ')} (se cobra con los servicios fijos).`
        : null
    return { cuotas, nota }
}

async function insertarCuotas(proyectoId: string, cuotas: { concepto: string; monto: number; detalle: string | null }[]): Promise<void> {
    if (!cuotas.length) return
    revisar(await supabase.from('control_cuotas').insert(cuotas.map((c, i) => ({ proyecto_id: proyectoId, concepto: c.concepto.slice(0, 160), monto: c.monto, detalle: c.detalle, extra: false, orden: i + 1 }))), 'cargar las cuotas de la propuesta')
}

export type PropuestaEnlazable = { id: string; number: string; title: string; client_id: string; status: string }

/** Propuestas para los selectores del control (sin el contenido, que pesa). */
export async function propuestasEnlazables(clientId?: string | null): Promise<PropuestaEnlazable[]> {
    let q = supabase.from('proposals').select('id, number, title, client_id, status').neq('status', 'rejected').order('created_at', { ascending: false }).limit(200)
    if (clientId) q = q.eq('client_id', clientId)
    const { data } = await q
    return (data ?? []) as PropuestaEnlazable[]
}

/** El control interno que ya salió de esta propuesta, si lo hay. */
export async function controlDePropuesta(propuestaId: string): Promise<string | null> {
    const { data } = await supabase.from('control_proyectos').select('id').eq('propuesta_id', propuestaId).order('created_at').limit(1)
    return (data?.[0]?.id as string | undefined) ?? null
}

/** Crea el control enlazado a la propuesta, con su cliente, moneda y cuotas. Si ya existe uno, devuelve ese. */
export async function crearControlDesdePropuesta(propuestaId: string, nombre?: string): Promise<{ id: string; nuevo: boolean }> {
    const existente = await controlDePropuesta(propuestaId)
    if (existente) return { id: existente, nuevo: false }
    const p = await leerPropuesta(propuestaId)
    const { cuotas, nota } = cobrosDePropuesta(p)
    const r = await supabase.from('control_proyectos').insert({
        nombre: (nombre?.trim() || p.title).slice(0, 200), client_id: p.client_id, propuesta_id: p.id, moneda: p.currency, notas: nota,
    }).select('id').single()
    const id = revisar(r, 'crear el proyecto').id as string
    await insertarCuotas(id, cuotas)
    return { id, nuevo: true }
}

/** Enlaza (o desenlaza) una propuesta a un control ya creado. Si el control aún no tiene cuotas, trae las de la propuesta. */
export async function enlazarPropuesta(controlId: string, propuestaId: string | null): Promise<{ cuotas: number }> {
    if (!propuestaId) {
        revisar(await supabase.from('control_proyectos').update({ propuesta_id: null }).eq('id', controlId), 'quitar el enlace')
        return { cuotas: 0 }
    }
    const p = await leerPropuesta(propuestaId)
    const { data: actual } = await supabase.from('control_proyectos').select('client_id, notas').eq('id', controlId).maybeSingle()
    if (!actual) throw new ActionError('Ese proyecto no existe.')
    if (actual.client_id && actual.client_id !== p.client_id) throw new ActionError('Esa propuesta es de otro cliente.')
    const { count } = await supabase.from('control_cuotas').select('id', { count: 'exact', head: true }).eq('proyecto_id', controlId)
    const { cuotas, nota } = (count ?? 0) === 0 ? cobrosDePropuesta(p) : { cuotas: [], nota: null }
    revisar(await supabase.from('control_proyectos').update({
        propuesta_id: p.id, client_id: p.client_id, ...(cuotas.length ? { moneda: p.currency } : {}), ...(nota && !actual.notas ? { notas: nota } : {}),
    }).eq('id', controlId), 'enlazar la propuesta')
    await insertarCuotas(controlId, cuotas)
    return { cuotas: cuotas.length }
}

export async function actualizarControl(id: string, c: { nombre?: string; estado?: 'activo' | 'cerrado'; notas?: string | null }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (c.nombre !== undefined) row.nombre = c.nombre.trim()
    if (c.estado) row.estado = c.estado
    if (c.notas !== undefined) row.notas = texto(c.notas, 5000)
    revisar(await supabase.from('control_proyectos').update(row).eq('id', id), 'guardar')
}

export async function borrarControl(id: string): Promise<void> {
    revisar(await supabase.from('control_proyectos').delete().eq('id', id), 'borrar el proyecto')
}

export async function agregarCuota(proyectoId: string, c: { concepto: string; monto: unknown; vence?: string | null; detalle?: string; extra?: boolean }): Promise<void> {
    const concepto = c.concepto.trim()
    if (!concepto) throw new ActionError('Ponle un concepto a la cuota.')
    const { data: ult } = await supabase.from('control_cuotas').select('orden').eq('proyecto_id', proyectoId).order('orden', { ascending: false }).limit(1)
    revisar(await supabase.from('control_cuotas').insert({ proyecto_id: proyectoId, concepto, monto: monto(c.monto), vence: c.vence || null, detalle: texto(c.detalle), extra: !!c.extra, orden: (ult?.[0]?.orden ?? 0) + 1 }), 'agregar la cuota')
}

export async function actualizarCuota(id: string, c: { concepto?: string; monto?: unknown; vence?: string | null; detalle?: string | null; extra?: boolean }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (c.concepto !== undefined) {
        if (!c.concepto.trim()) throw new ActionError('Ponle un concepto a la cuota.')
        row.concepto = c.concepto.trim()
    }
    if (c.extra !== undefined) row.extra = !!c.extra
    if (c.monto !== undefined) row.monto = monto(c.monto)
    if (c.vence !== undefined) row.vence = c.vence || null
    if (c.detalle !== undefined) row.detalle = texto(c.detalle)
    revisar(await supabase.from('control_cuotas').update(row).eq('id', id), 'guardar la cuota')
}

export async function agregarMovimiento(proyectoId: string, m: { lado: 'cliente' | 'proveedor'; proveedor?: string; fecha?: string; monto: unknown; metodo?: string; nota?: string }): Promise<void> {
    const proveedor = m.lado === 'proveedor' ? texto(m.proveedor, 120) : null
    if (m.lado === 'proveedor' && !proveedor) throw new ActionError('¿A quién le pagaste?')
    revisar(await supabase.from('control_movimientos').insert({ proyecto_id: proyectoId, lado: m.lado, proveedor, fecha: fecha(m.fecha), monto: monto(m.monto, 0.01), metodo: texto(m.metodo, 60), nota: texto(m.nota, 500) }), 'registrar el pago')
}

export async function actualizarMovimiento(id: string, m: { fecha?: string; monto?: unknown; metodo?: string | null; nota?: string | null }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (m.fecha !== undefined) row.fecha = fecha(m.fecha)
    if (m.monto !== undefined) row.monto = monto(m.monto, 0.01)
    if (m.metodo !== undefined) row.metodo = texto(m.metodo, 60)
    if (m.nota !== undefined) row.nota = texto(m.nota, 500)
    revisar(await supabase.from('control_movimientos').update(row).eq('id', id), 'guardar el pago')
}

/**
 * Un requerimiento nuevo a mitad de proyecto, de una vez: lo que se le cobra al cliente (un cobro suelto que
 * puede ir detrás de una cuota concreta, para que los abonos lo cubran en ese turno) y lo que se le paga al
 * programador por hacerlo (un acuerdo más con él). Cualquiera de las dos partes puede ir vacía.
 */
export async function agregarExtra(proyectoId: string, e: { concepto: string; cobro?: unknown; despuesDe?: number | null; vence?: string | null; proveedor?: string; pago?: unknown; estado?: 'acordado' | 'por_confirmar'; detalle?: string }): Promise<{ cuota: boolean; acuerdo: boolean }> {
    const concepto = texto(e.concepto, 200)
    if (!concepto) throw new ActionError('¿Qué es el extra?')
    const cobro = String(e.cobro ?? '').trim() ? monto(e.cobro) : 0
    const pago = String(e.pago ?? '').trim() ? monto(e.pago) : 0
    const proveedor = texto(e.proveedor, 120)
    if (pago > 0 && !proveedor) throw new ActionError('¿A qué programador le pagas el extra?')
    if (cobro <= 0 && pago <= 0) throw new ActionError('Pon lo que cobras al cliente, lo que le pagas al programador o las dos cosas.')

    if (cobro > 0) {
        const { data: filas } = await supabase.from('control_cuotas').select('id, orden').eq('proyecto_id', proyectoId).order('orden')
        const todas = (filas ?? []) as { id: string; orden: number }[]
        let orden = (todas.at(-1)?.orden ?? 0) + 1
        if (e.despuesDe != null && todas.some((c) => c.orden === e.despuesDe)) {
            // Hace sitio detrás de esa cuota: las siguientes bajan un puesto (de la última hacia atrás).
            for (const c of [...todas].reverse().filter((c) => c.orden > e.despuesDe!)) {
                revisar(await supabase.from('control_cuotas').update({ orden: c.orden + 1 }).eq('id', c.id), 'ordenar las cuotas')
            }
            orden = e.despuesDe + 1
        }
        revisar(await supabase.from('control_cuotas').insert({ proyecto_id: proyectoId, concepto: `Extra · ${concepto}`, monto: cobro, vence: e.vence || null, detalle: texto(e.detalle), extra: true, orden }), 'añadir el cobro del extra')
    }
    if (pago > 0) {
        revisar(await supabase.from('control_acuerdos').insert({ proyecto_id: proyectoId, proveedor, concepto: `Extra · ${concepto}`, monto: pago, estado: e.estado === 'por_confirmar' ? 'por_confirmar' : 'acordado', fecha: fecha(undefined), detalle: texto(e.detalle, 20000) }), 'guardar el acuerdo del extra')
    }
    return { cuota: cobro > 0, acuerdo: pago > 0 }
}

export async function agregarAcuerdo(proyectoId: string, a: { proveedor: string; concepto: string; monto: unknown; estado?: 'acordado' | 'por_confirmar'; fecha?: string; detalle?: string }): Promise<string> {
    const proveedor = texto(a.proveedor, 120)
    const concepto = texto(a.concepto, 200)
    if (!proveedor || !concepto) throw new ActionError('Indica quién y por qué.')
    const r = await supabase.from('control_acuerdos').insert({ proyecto_id: proyectoId, proveedor, concepto, monto: monto(a.monto), estado: a.estado === 'por_confirmar' ? 'por_confirmar' : 'acordado', fecha: fecha(a.fecha), detalle: texto(a.detalle, 20000) }).select('id').single()
    return revisar(r, 'guardar el acuerdo').id
}

export async function actualizarAcuerdo(id: string, a: { proveedor?: string; concepto?: string; monto?: unknown; estado?: 'acordado' | 'por_confirmar'; fecha?: string; detalle?: string | null }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (a.proveedor !== undefined) {
        const proveedor = texto(a.proveedor, 120)
        if (!proveedor) throw new ActionError('Indica el programador.')
        row.proveedor = proveedor
    }
    if (a.concepto !== undefined) {
        if (!a.concepto.trim()) throw new ActionError('Indica qué hará.')
        row.concepto = a.concepto.trim().slice(0, 200)
    }
    if (a.fecha !== undefined) row.fecha = fecha(a.fecha)
    if (a.monto !== undefined) row.monto = monto(a.monto)
    if (a.estado) row.estado = a.estado
    if (a.detalle !== undefined) row.detalle = texto(a.detalle, 20000)
    revisar(await supabase.from('control_acuerdos').update(row).eq('id', id), 'guardar el acuerdo')
}

const TABLAS = { cuota: 'control_cuotas', acuerdo: 'control_acuerdos', movimiento: 'control_movimientos' } as const

export async function borrarFila(tipo: keyof typeof TABLAS, id: string): Promise<void> {
    if (tipo === 'acuerdo') {
        const { data } = await supabase.from('control_acuerdos').select('archivo_path').eq('id', id).maybeSingle()
        if (data?.archivo_path) await supabase.storage.from('control').remove([data.archivo_path])
    }
    revisar(await supabase.from(TABLAS[tipo]).delete().eq('id', id), 'borrar')
}

// ─── Archivos (propuestas de los programadores), bucket privado «control» ────

const TIPOS_ARCHIVO = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

export async function adjuntarArchivo(acuerdoId: string, file: File): Promise<void> {
    if (!TIPOS_ARCHIVO.includes(file.type)) throw new ActionError('Sube un PDF o una imagen (PNG, JPG o WebP).')
    if (file.size > 15 * 1024 * 1024) throw new ActionError('El archivo pesa más de 15 MB.')
    const { data: a } = await supabase.from('control_acuerdos').select('proyecto_id, archivo_path').eq('id', acuerdoId).maybeSingle()
    if (!a) throw new ActionError('Ese acuerdo no existe.')
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const ruta = `${a.proyecto_id}/${randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('control').upload(ruta, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
    if (error) throw new ActionError(`No se pudo subir el archivo: ${error.message}`)
    if (a.archivo_path) await supabase.storage.from('control').remove([a.archivo_path])
    revisar(await supabase.from('control_acuerdos').update({ archivo_path: ruta, archivo_nombre: file.name.slice(0, 200) }).eq('id', acuerdoId), 'guardar el archivo')
}

export async function enlaceArchivo(acuerdoId: string): Promise<string> {
    const { data: a } = await supabase.from('control_acuerdos').select('archivo_path, archivo_nombre').eq('id', acuerdoId).maybeSingle()
    if (!a?.archivo_path) throw new ActionError('Ese acuerdo no tiene archivo.')
    const { data, error } = await supabase.storage.from('control').createSignedUrl(a.archivo_path, 300)
    if (error || !data) throw new ActionError('No se pudo abrir el archivo.')
    return data.signedUrl
}
