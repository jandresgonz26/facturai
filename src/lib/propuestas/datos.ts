/**
 * Propuestas comerciales (schema_update_propuestas.sql): lectura y escritura en el servidor.
 * Las usan las acciones de /propuestas (sesión de José, detrás de proxy.ts) y las rutas públicas de
 * /propuesta/<token> (el cliente, sin sesión). Las públicas solo encuentran una propuesta por su token y
 * solo si ya se envió; nunca exponen el id ni nada de otras propuestas.
 */
import { randomBytes } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { getClient } from '@/lib/actions/clients'
import { setClientStage } from '@/lib/actions/crm'
import { ActionError, round2, todayISO } from '@/lib/actions/validation'
import type { Client } from '@/types'
import { normalizarBloques, plantillaJamTech, type Bloque } from './bloques'
import { calcular, normalizarPricing, opcionPorId, pricingVacio, type Moneda, type Pricing, type Totales } from './precios'

import { estadoDe, ESTADOS, type EstadoPropuesta } from './tipos'
export { estadoDe, ESTADOS, type EstadoPropuesta }

/** Lo que el cliente vio y eligió al aceptar. */
export type Aceptacion = {
    nombre: string
    fecha: string
    opcion_id: string
    opcion_nombre: string
    extras_ids: string[]
    title: string
    content: Bloque[]
    pricing: Pricing
    totales: Totales
}

/** Facturación hecha desde la propuesta aceptada. */
export type Facturacion = {
    cuotas_facturadas?: string[]
    unico_facturado?: boolean
    facturas?: { invoice_id: string; invoice_number: string; concepto: string }[]
    fijos?: { id: string; descripcion: string }[]
}

export type Propuesta = {
    id: string
    number: string
    client_id: string
    title: string
    content: Bloque[]
    pricing: Pricing
    currency: Moneda
    total_once: number
    total_recurring: number
    status: EstadoPropuesta
    token: string
    valid_until: string | null
    sent_at: string | null
    first_viewed_at: string | null
    last_viewed_at: string | null
    view_count: number
    accepted_at: string | null
    accepted_by: string | null
    accepted_snapshot: Aceptacion | null
    rejected_at: string | null
    billing: Facturacion
    created_at: string
    updated_at: string
    clients?: Pick<Client, 'id' | 'name' | 'contact_name' | 'email' | 'phone' | 'stage'> | null
}

export type EventoPropuesta = { id: string; kind: string; detail: Record<string, unknown>; created_at: string }

const SELECT = '*, clients(id, name, contact_name, email, phone, stage)'

function fila(r: Record<string, unknown>): Propuesta {
    return {
        ...(r as unknown as Propuesta),
        content: normalizarBloques(r.content),
        pricing: normalizarPricing(r.pricing),
        total_once: Number(r.total_once ?? 0),
        total_recurring: Number(r.total_recurring ?? 0),
        view_count: Number(r.view_count ?? 0),
        billing: (r.billing && typeof r.billing === 'object' ? r.billing : {}) as Facturacion,
    }
}

const nuevoToken = () => randomBytes(18).toString('base64url')

async function siguienteNumero(): Promise<string> {
    const { data, error } = await supabase.from('proposals').select('number').order('created_at', { ascending: false }).limit(50)
    if (error) throw new ActionError(`No se pudo calcular el número: ${error.message}`)
    const max = (data ?? []).reduce((m, r) => Math.max(m, Number(/PRO-(\d+)/.exec(r.number ?? '')?.[1] ?? 0)), 0)
    return `PRO-${String(max + 1).padStart(4, '0')}`
}

async function evento(proposalId: string, kind: string, detail: Record<string, unknown> = {}): Promise<void> {
    const { error } = await supabase.from('proposal_events').insert({ proposal_id: proposalId, kind, detail })
    if (error) console.warn('[propuestas] no se pudo registrar el evento', kind, error.message)
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listarPropuestas(o: { clientId?: string; estado?: EstadoPropuesta } = {}): Promise<Propuesta[]> {
    let q = supabase.from('proposals').select(SELECT).order('updated_at', { ascending: false }).limit(200)
    if (o.clientId) q = q.eq('client_id', o.clientId)
    if (o.estado) q = q.eq('status', o.estado)
    const { data, error } = await q
    if (error) throw new ActionError(`No se pudieron cargar las propuestas: ${error.message}`)
    return (data ?? []).map(fila)
}

export async function leerPropuesta(id: string): Promise<Propuesta> {
    const { data, error } = await supabase.from('proposals').select(SELECT).eq('id', id).maybeSingle()
    if (error) throw new ActionError(`No se pudo cargar la propuesta: ${error.message}`)
    if (!data) throw new ActionError('Esa propuesta no existe.')
    return fila(data)
}

/** Para el cliente: solo por token y solo si ya salió del borrador. */
export async function propuestaPublica(token: string): Promise<Propuesta | null> {
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null
    const { data } = await supabase.from('proposals').select(SELECT).eq('token', token).maybeSingle()
    if (!data || data.status === 'draft') return null
    return fila(data)
}

export async function eventosDe(id: string): Promise<EventoPropuesta[]> {
    const { data } = await supabase.from('proposal_events').select('id, kind, detail, created_at').eq('proposal_id', id).order('created_at', { ascending: false }).limit(100)
    return (data ?? []) as EventoPropuesta[]
}

export const vencida = (p: Pick<Propuesta, 'valid_until'>) => !!p.valid_until && p.valid_until < todayISO()

// ─── Escritura (José) ────────────────────────────────────────────────────────

function totalesLista(p: Pricing) {
    const t = calcular(p, opcionPorId(p)?.id)
    return { total_once: t.unico.total, total_recurring: t.recurrenteMensual }
}

export async function crearPropuesta(input: { client_id: string; title: string }): Promise<Propuesta> {
    const title = input.title.trim()
    if (title.length < 3) throw new ActionError('Ponle un título a la propuesta.')
    const client = await getClient(input.client_id)
    const pricing = pricingVacio()
    const { data, error } = await supabase
        .from('proposals')
        .insert({ number: await siguienteNumero(), client_id: client.id, title, content: plantillaJamTech(), pricing, currency: client.preferred_input_currency === 'EUR' ? 'EUR' : 'USD', token: nuevoToken(), ...totalesLista(pricing) })
        .select(SELECT)
        .single()
    if (error) throw new ActionError(`No se pudo crear la propuesta: ${error.message}`)
    await evento(data.id, 'created')
    return fila(data)
}

export async function guardarPropuesta(id: string, cambios: { title?: string; content?: unknown; pricing?: unknown; valid_until?: string | null; client_id?: string; currency?: Moneda }): Promise<{ updated_at: string }> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (cambios.title !== undefined) {
        const t = cambios.title.trim()
        if (t.length < 3) throw new ActionError('El título es muy corto.')
        row.title = t.slice(0, 200)
    }
    if (cambios.content !== undefined) {
        if (!Array.isArray(cambios.content)) throw new ActionError('Contenido inválido.')
        if (JSON.stringify(cambios.content).length > 900_000) throw new ActionError('La propuesta es demasiado larga.')
        row.content = cambios.content
    }
    if (cambios.pricing !== undefined) {
        const p = normalizarPricing(cambios.pricing)
        row.pricing = p
        Object.assign(row, totalesLista(p))
    }
    if (cambios.valid_until !== undefined) row.valid_until = cambios.valid_until || null
    if (cambios.currency) row.currency = cambios.currency === 'EUR' ? 'EUR' : 'USD'
    if (cambios.client_id) row.client_id = (await getClient(cambios.client_id)).id
    const { data, error } = await supabase.from('proposals').update(row).eq('id', id).select('updated_at').single()
    if (error) throw new ActionError(`No se pudo guardar: ${error.message}`)
    return { updated_at: data.updated_at }
}

/** Salir del borrador: el enlace empieza a funcionar y el lead pasa a «cotizado». */
export async function marcarEnviada(id: string): Promise<Propuesta> {
    const p = await leerPropuesta(id)
    if (p.status === 'draft' || p.status === 'rejected') {
        const { error } = await supabase.from('proposals').update({ status: 'sent', sent_at: p.sent_at ?? new Date().toISOString(), rejected_at: null }).eq('id', id)
        if (error) throw new ActionError(`No se pudo marcar como enviada: ${error.message}`)
        await evento(id, p.status === 'rejected' ? 'reopened' : 'sent')
        if (p.clients?.stage === 'lead') await setClientStage(p.client_id, 'quoted').catch(() => undefined)
    }
    return leerPropuesta(id)
}

export async function marcarRechazada(id: string): Promise<void> {
    const { error } = await supabase.from('proposals').update({ status: 'rejected', rejected_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new ActionError(`No se pudo marcar como rechazada: ${error.message}`)
    await evento(id, 'rejected', { por: 'José' })
}

/** Volver a abrir una aceptada (p. ej. para cambiarla y que el cliente acepte de nuevo). La aceptación anterior queda en el historial. */
export async function reabrir(id: string): Promise<void> {
    const p = await leerPropuesta(id)
    if (p.accepted_snapshot) await evento(id, 'reopened', { aceptacion_anterior: { nombre: p.accepted_by, fecha: p.accepted_at, opcion: p.accepted_snapshot.opcion_nombre, total: p.accepted_snapshot.totales.unico.total } })
    const { error } = await supabase.from('proposals').update({ status: 'sent', accepted_at: null, accepted_by: null, accepted_snapshot: null, rejected_at: null }).eq('id', id)
    if (error) throw new ActionError(`No se pudo reabrir: ${error.message}`)
}

export async function duplicarPropuesta(id: string, clientId?: string): Promise<Propuesta> {
    const p = await leerPropuesta(id)
    const client = await getClient(clientId || p.client_id)
    const { data, error } = await supabase
        .from('proposals')
        .insert({ number: await siguienteNumero(), client_id: client.id, title: `${p.title} (copia)`.slice(0, 200), content: p.content, pricing: p.pricing, currency: p.currency, token: nuevoToken(), total_once: p.total_once, total_recurring: p.total_recurring })
        .select(SELECT)
        .single()
    if (error) throw new ActionError(`No se pudo duplicar: ${error.message}`)
    await evento(data.id, 'created', { copia_de: p.number })
    return fila(data)
}

export async function borrarPropuesta(id: string): Promise<void> {
    const p = await leerPropuesta(id)
    if (p.status === 'accepted') throw new ActionError('Una propuesta aceptada no se borra: queda como registro de lo que aceptó el cliente.')
    const { error } = await supabase.from('proposals').delete().eq('id', id)
    if (error) throw new ActionError(`No se pudo borrar: ${error.message}`)
}

// ─── Lo que hace el cliente (rutas públicas) ─────────────────────────────────

export async function registrarVista(token: string): Promise<void> {
    const p = await propuestaPublica(token)
    if (!p) return
    const ahora = new Date().toISOString()
    const primera = !p.first_viewed_at
    const row: Record<string, unknown> = { view_count: p.view_count + 1, last_viewed_at: ahora }
    if (primera) row.first_viewed_at = ahora
    if (p.status === 'sent') row.status = 'viewed'
    await supabase.from('proposals').update(row).eq('id', p.id)
    // Solo la primera vez (o si pasaron días): el resto de aperturas quedan contadas.
    const pasaronDias = p.last_viewed_at && Date.now() - new Date(p.last_viewed_at).getTime() > 3 * 86_400_000
    if (primera || pasaronDias) {
        await evento(p.id, 'viewed', { vez: p.view_count + 1 })
        await avisar(`👀 **${p.clients?.name ?? 'El cliente'}** ${primera ? 'abrió' : 'volvió a abrir'} la propuesta **${p.number} · ${p.title}**${primera ? '' : ` (${p.view_count + 1} veces en total)`}.`)
    }
}

export async function pedirCambios(token: string, mensaje: string, nombre: string): Promise<void> {
    const p = await propuestaPublica(token)
    if (!p) throw new ActionError('Esta propuesta no está disponible.')
    if (p.status === 'accepted' || p.status === 'rejected') throw new ActionError('Esta propuesta ya está cerrada. Escríbenos directamente para cualquier cambio.')
    const texto = mensaje.trim().slice(0, 2000)
    if (texto.length < 3) throw new ActionError('Escribe qué te gustaría cambiar.')
    const { count } = await supabase.from('proposal_events').select('id', { count: 'exact', head: true }).eq('proposal_id', p.id).eq('kind', 'changes_requested')
    if ((count ?? 0) >= 30) throw new ActionError('Recibimos muchos comentarios en esta propuesta. Escríbenos directamente.')
    const quien = nombre.trim().slice(0, 100)
    await supabase.from('proposals').update({ status: 'changes_requested' }).eq('id', p.id)
    await evento(p.id, 'changes_requested', { mensaje: texto, nombre: quien })
    await avisar(`✏️ **${p.clients?.name ?? 'El cliente'}** pidió cambios en **${p.number} · ${p.title}**${quien ? ` (${quien})` : ''}:\n\n> ${texto.replace(/\n+/g, '\n> ')}`)
}

export async function aceptarPropuesta(token: string, input: { nombre: string; opcion_id: string; extras_ids: string[] }): Promise<void> {
    const p = await propuestaPublica(token)
    if (!p) throw new ActionError('Esta propuesta no está disponible.')
    if (p.status === 'accepted') throw new ActionError('Esta propuesta ya fue aceptada.')
    if (p.status === 'rejected') throw new ActionError('Esta propuesta ya está cerrada. Escríbenos para actualizarla.')
    if (vencida(p)) throw new ActionError('Esta propuesta venció. Escríbenos para actualizarla.')
    const nombre = input.nombre.trim().replace(/\s+/g, ' ').slice(0, 120)
    if (nombre.length < 3) throw new ActionError('Escribe tu nombre completo para aceptar.')
    const opcion = p.pricing.opciones.find((o) => o.id === input.opcion_id) ?? (p.pricing.opciones.length === 1 ? p.pricing.opciones[0] : undefined)
    if (!opcion) throw new ActionError('Elige una de las opciones antes de aceptar.')
    const extras = p.pricing.extras.filter((e) => input.extras_ids.includes(e.id)).map((e) => e.id)
    const totales = calcular(p.pricing, opcion.id, extras)
    const fecha = new Date().toISOString()
    const snapshot: Aceptacion = { nombre, fecha, opcion_id: opcion.id, opcion_nombre: opcion.nombre, extras_ids: extras, title: p.title, content: p.content, pricing: p.pricing, totales }
    // Condición en el update: si dos aceptaciones llegan a la vez, solo la primera gana.
    const { data, error } = await supabase.from('proposals').update({ status: 'accepted', accepted_at: fecha, accepted_by: nombre, accepted_snapshot: snapshot }).eq('id', p.id).neq('status', 'accepted').select('id')
    if (error) throw new ActionError('No se pudo registrar la aceptación. Inténtalo de nuevo.')
    if (!data?.length) throw new ActionError('Esta propuesta ya fue aceptada.')
    await evento(p.id, 'accepted', { nombre, opcion: opcion.nombre, extras: extras.length, total_unico: totales.unico.total, recurrente_mensual: totales.recurrenteMensual })
    if (p.clients?.stage === 'lead' || p.clients?.stage === 'quoted') await setClientStage(p.client_id, 'active').catch(() => undefined)

    const { dinero } = await import('./precios')
    const partes = [
        totales.unico.total > 0 ? `${dinero(totales.unico.total, p.currency)} de pago único` : '',
        ...totales.recurrentes.map((r) => `${dinero(r.bloque.total, p.currency)} ${r.frecuencia === 'mensual' ? 'al mes' : r.frecuencia === 'anual' ? 'al año' : r.frecuencia}`),
    ].filter(Boolean)
    await avisar(`🎉 **${p.clients?.name ?? 'El cliente'} aceptó la propuesta ${p.number} · ${p.title}**\n\nAceptó: ${nombre}${p.pricing.opciones.length > 1 ? `\nOpción: ${opcion.nombre || 'sin nombre'}` : ''}${extras.length ? `\nExtras: ${extras.length}` : ''}${partes.length ? `\nTotal: ${partes.join(' + ')}` : ''}\n\nDesde la propuesta en FacturAI puedes crear la factura y los servicios fijos.`)
    const { registrarEvento } = await import('@/lib/agent/eventos')
    await registrarEvento({ departamento: 'ventas', tipo: 'aviso', titulo: `${p.clients?.name ?? 'Un cliente'} aceptó la propuesta ${p.number}`, estado: 'hecho', fuente: 'cron', detalle: { propuesta: p.id } }).catch(() => undefined)
}

// ─── De la propuesta aceptada a la facturación ───────────────────────────────

async function insertarLogs(client: Client, lineas: { descripcion: string; monto: number }[]): Promise<string[]> {
    const { getEurToUsdRate } = await import('@/lib/currency')
    const { resolveCategoryId } = await import('@/lib/actions/categories')
    const currency = client.preferred_input_currency || 'USD'
    const rate = currency === 'EUR' ? await getEurToUsdRate() : 1
    const category_id = await resolveCategoryId()
    const rows = lineas.filter((l) => l.monto !== 0).map((l) => ({ client_id: client.id, description: l.descripcion.slice(0, 300), original_amount: round2(l.monto), value: round2(l.monto * rate), currency, category_id, status: 'pending' }))
    if (!rows.length) throw new ActionError('No hay montos que facturar.')
    const { data, error } = await supabase.from('logs').insert(rows).select('id')
    if (error) throw new ActionError(`No se pudieron preparar los ítems: ${error.message}`)
    return (data ?? []).map((r) => r.id as string)
}

/** Factura el pago único aceptado: una cuota del plan de pagos, o todo el pago único con su detalle. */
export async function facturarDesdePropuesta(id: string, cuotaId?: string): Promise<{ invoice_id: string; invoice_number: string }> {
    const p = await leerPropuesta(id)
    const a = p.accepted_snapshot
    if (p.status !== 'accepted' || !a) throw new ActionError('Primero el cliente tiene que aceptar la propuesta.')
    const client = await getClient(p.client_id)
    const b = p.billing ?? {}
    const t = a.totales
    let lineas: { descripcion: string; monto: number }[]
    let concepto: string
    let cuotaFacturada: string | null = null
    if (t.cuotas.length) {
        const c = t.cuotas.find((x) => x.cuota.id === cuotaId) ?? t.cuotas.find((x) => !(b.cuotas_facturadas ?? []).includes(x.cuota.id))
        if (!c) throw new ActionError('Todas las cuotas ya están facturadas.')
        if ((b.cuotas_facturadas ?? []).includes(c.cuota.id)) throw new ActionError('Esa cuota ya está facturada.')
        cuotaFacturada = c.cuota.id
        concepto = `${c.cuota.concepto || 'Cuota'} (${c.cuota.pct} %)`
        lineas = [{ descripcion: `${p.number} · ${a.title} — ${concepto}`, monto: c.monto }]
    } else {
        if (b.unico_facturado) throw new ActionError('El pago único de esta propuesta ya está facturado.')
        if (t.unico.total <= 0) throw new ActionError('Esta propuesta no tiene pago único que facturar.')
        concepto = 'Pago único'
        lineas = t.lineas.filter((l) => l.item.frecuencia === 'unico' && l.neto > 0).map((l) => ({ descripcion: [l.item.servicio, l.item.descripcion].filter(Boolean).join(' — ') || a.title, monto: l.neto }))
        if (t.unico.descuento > 0) lineas.push({ descripcion: `Descuento${a.pricing.descuento?.motivo ? `: ${a.pricing.descuento.motivo}` : ''}`, monto: -t.unico.descuento })
        if (t.unico.impuesto > 0 && a.pricing.impuesto) lineas.push({ descripcion: `${a.pricing.impuesto.nombre} (${a.pricing.impuesto.pct} %)`, monto: t.unico.impuesto })
    }
    const logIds = await insertarLogs(client, lineas)
    const { createInvoice } = await import('@/lib/actions/invoices')
    let invoice
    try {
        ;({ invoice } = await createInvoice({ client_id: client.id, log_ids: logIds }))
    } catch (e) {
        await supabase.from('logs').delete().in('id', logIds)
        throw e
    }
    const billing: Facturacion = {
        ...b,
        cuotas_facturadas: cuotaFacturada ? [...(b.cuotas_facturadas ?? []), cuotaFacturada] : b.cuotas_facturadas,
        unico_facturado: cuotaFacturada ? b.unico_facturado : true,
        facturas: [...(b.facturas ?? []), { invoice_id: invoice.id, invoice_number: invoice.invoice_number, concepto }],
    }
    await supabase.from('proposals').update({ billing }).eq('id', id)
    await evento(id, 'invoiced', { factura: invoice.invoice_number, concepto })
    return { invoice_id: invoice.id, invoice_number: invoice.invoice_number }
}

/** Convierte lo recurrente aceptado en servicios fijos del cliente (con su descuento e impuesto repartidos). */
export async function crearFijosDesdePropuesta(id: string): Promise<{ creados: number }> {
    const p = await leerPropuesta(id)
    const a = p.accepted_snapshot
    if (p.status !== 'accepted' || !a) throw new ActionError('Primero el cliente tiene que aceptar la propuesta.')
    if (p.billing?.fijos?.length) throw new ActionError('Los servicios fijos de esta propuesta ya se crearon.')
    const { frecuencia } = await import('./precios')
    const { addRecurringService } = await import('@/lib/actions/recurring')
    const factor = new Map(a.totales.recurrentes.map((r) => [r.frecuencia, r.bloque.subtotal > 0 ? r.bloque.total / r.bloque.subtotal : 1]))
    const lineas = a.totales.lineas.filter((l) => l.item.frecuencia !== 'unico' && l.neto > 0)
    if (!lineas.length) throw new ActionError('Esta propuesta no tiene servicios recurrentes.')
    const fijos: { id: string; descripcion: string }[] = []
    for (const l of lineas) {
        const descripcion = (l.item.servicio || a.title).slice(0, 200)
        const s = await addRecurringService({ client_id: p.client_id, description: descripcion, amount: round2(l.neto * (factor.get(l.item.frecuencia) ?? 1)), interval_months: frecuencia(l.item.frecuencia).meses })
        fijos.push({ id: s.id, descripcion })
    }
    await supabase.from('proposals').update({ billing: { ...p.billing, fijos } }).eq('id', id)
    await evento(id, 'recurring_created', { servicios: fijos.length })
    return { creados: fijos.length }
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

async function avisar(texto: string): Promise<void> {
    try {
        const chatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
        if (chatIds.length === 0 || !process.env.TELEGRAM_BOT_TOKEN) return
        const [{ sendMessage }, { mdToTelegramHtml }, { appendAssistantMessage }] = await Promise.all([import('@/lib/telegram/api'), import('@/lib/telegram/format'), import('@/lib/telegram/session')])
        for (const chatId of chatIds) {
            await sendMessage(chatId, mdToTelegramHtml(texto))
            await appendAssistantMessage(chatId, `[Aviso de Propuestas]\n\n${texto}`)
        }
    } catch (e) {
        console.warn('[propuestas] no se pudo avisar por Telegram', e)
    }
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/** El PDF de una propuesta: lo aceptado si ya se aceptó, la versión actual si no. */
export async function pdfDe(p: Propuesta): Promise<{ bytes: Buffer; nombre: string }> {
    const { generarPdf, nombrePdf } = await import('./pdf')
    const a = p.status === 'accepted' ? p.accepted_snapshot : null
    const d = {
        numero: p.number,
        titulo: a?.title ?? p.title,
        cliente: p.clients?.name ?? '',
        fecha: p.sent_at ?? p.created_at,
        validaHasta: p.valid_until,
        moneda: p.currency,
        content: a?.content ?? p.content,
        pricing: a?.pricing ?? p.pricing,
        aceptada: a ? { opcionId: a.opcion_id, extras: a.extras_ids, nombre: a.nombre, fecha: a.fecha } : null,
    }
    return { bytes: await generarPdf(d), nombre: nombrePdf(d) }
}
