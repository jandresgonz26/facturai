/**
 * Herramientas de 🧭 Dirección, el consejero de toda la empresa: un panorama con los números que importan
 * para decidir (ingresos, recurrencia, dependencia de clientes, cobros, pipeline, carga) y el historial de
 * consejos con su resultado, para aprender qué funcionó. Solo `actualizar_consejo` escribe (con confirmación).
 */
import { tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { errorMessage, todayISO } from '@/lib/actions/validation'

type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string }
async function run<T>(fn: () => Promise<T>): Promise<ToolResult<T>> {
    try {
        return { ok: true, data: await fn() }
    } catch (e) {
        console.error('[direccion tool]', e)
        return { ok: false, error: errorMessage(e) }
    }
}

const r2 = (n: number) => Math.round(n * 100) / 100
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : null)
const mesDe = (iso: string) => iso.slice(0, 7)
function mesesAtras(hoy: string, n: number): string[] {
    const [y, m] = hoy.split('-').map(Number)
    return Array.from({ length: n }, (_, i) => {
        const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1))
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
}

async function q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await p
    if (error) throw new Error(error.message)
    return (data ?? []) as T[]
}

/** Panorama de la empresa: lo calcula aquí, en código, para que el modelo no sume a mano. */
/**
 * `desdeMes` (YYYY-MM): analiza desde ese mes hasta hoy en vez de los últimos 6 meses (por ejemplo, si la
 * memoria dice que los meses anteriores tienen datos de prueba). Como máximo 12 meses.
 */
export async function panoramaEmpresa(desdeMes?: string) {
    const hoy = todayISO()
    const todos = mesesAtras(hoy, 12)
    const meses = desdeMes && desdeMes <= hoy.slice(0, 7) ? todos.filter((m) => m >= desdeMes) : todos.slice(-6)
    const desde = `${meses[0]}-01`
    type Inv = { client_id: string; issue_date: string; total_amount: number; status: string; paid_at: string | null; due_date: string | null; clients: { name: string } | null }
    type Cli = { id: string; name: string; stage: string | null; source: string | null; created_at: string; next_action_at: string | null }
    type Rec = { client_id: string; amount: number; interval_months: number | null; clients: { name: string } | null }
    type Quote = { status: string; total_amount: number; issue_date: string; client_name: string | null }
    type Task = { status: string; due_date: string | null; postponed_count: number | null; estimated_minutes: number | null }
    type Log = { value: number; status: string; invoice_id: string | null }
    type Ev = { departamento: string; created_at: string }

    const [invoices, clientes, recurrentes, cotizaciones, tareas, logs, ajustes, eventos] = await Promise.all([
        q<Inv>(supabase.from('invoices').select('client_id, issue_date, total_amount, status, paid_at, due_date, clients(name)').gte('issue_date', desde)),
        q<Cli>(supabase.from('clients').select('id, name, stage, source, created_at, next_action_at')),
        q<Rec>(supabase.from('recurring_services').select('client_id, amount, interval_months, clients(name)').eq('is_active', true)),
        q<Quote>(supabase.from('quotes').select('status, total_amount, issue_date, client_name').gte('issue_date', desde)),
        q<Task>(supabase.from('tasks').select('status, due_date, postponed_count, estimated_minutes').neq('status', 'done')),
        q<Log>(supabase.from('logs').select('value, status, invoice_id').is('invoice_id', null)),
        q<{ monthly_goal: number | null }>(supabase.from('company_settings').select('monthly_goal').limit(1)),
        q<Ev>(supabase.from('agent_events').select('departamento, created_at').gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())),
    ])
    // Pendientes de cobro: todas las facturas no pagadas, no solo las de los últimos 6 meses.
    const impagas = await q<Inv>(supabase.from('invoices').select('client_id, issue_date, total_amount, status, paid_at, due_date, clients(name)').neq('status', 'paid'))

    const porMes = meses.map((m) => ({
        mes: m,
        facturado: r2(invoices.filter((i) => mesDe(i.issue_date) === m).reduce((s, i) => s + Number(i.total_amount), 0)),
        cobrado: r2(invoices.filter((i) => i.paid_at && mesDe(i.paid_at) === m).reduce((s, i) => s + Number(i.total_amount), 0)),
    }))
    const total6 = porMes.reduce((s, m) => s + m.facturado, 0) // total del período analizado
    const porCliente = new Map<string, { cliente: string; facturado: number }>()
    for (const i of invoices) {
        const c = porCliente.get(i.client_id) ?? { cliente: i.clients?.name ?? 'Desconocido', facturado: 0 }
        c.facturado += Number(i.total_amount)
        porCliente.set(i.client_id, c)
    }
    const ranking = [...porCliente.values()].sort((a, b) => b.facturado - a.facturado)
    const mensualRecurrente = recurrentes.reduce((s, r) => s + Number(r.amount) / Math.max(1, r.interval_months ?? 1), 0)
    const meta = ajustes[0]?.monthly_goal ? Number(ajustes[0].monthly_goal) : null
    const mesActual = porMes[porMes.length - 1]
    const etapas = clientes.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.stage ?? 'sin etapa']: (acc[c.stage ?? 'sin etapa'] ?? 0) + 1 }), {})
    const hace90 = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const nuevos = clientes.filter((c) => c.created_at >= hace90)
    const pendientesCot = cotizaciones.filter((c) => c.status === 'pending')
    const decididas = cotizaciones.filter((c) => c.status === 'approved' || c.status === 'rejected')

    return {
        fecha: hoy,
        ingresos: {
            meses: porMes,
            promedioMensualFacturado: r2(total6 / meses.length),
            mesEnCurso: { mes: mesActual.mes, facturado: mesActual.facturado, cobrado: mesActual.cobrado, meta, avanceMetaPct: meta ? pct(mesActual.facturado, meta) : null },
        },
        recurrencia: {
            ingresoMensualRecurrenteUsd: r2(mensualRecurrente),
            serviciosActivos: recurrentes.length,
            pesoSobrePromedioFacturadoPct: pct(mensualRecurrente, total6 / meses.length),
        },
        dependenciaDeClientes: {
            top5DelPeriodo: ranking.slice(0, 5).map((c) => ({ cliente: c.cliente, facturado: r2(c.facturado), participacionPct: pct(c.facturado, total6) })),
            clientesQueFacturaron: ranking.length,
            participacionDelPrincipalPct: ranking[0] ? pct(ranking[0].facturado, total6) : null,
        },
        cobros: {
            porCobrarUsd: r2(impagas.reduce((s, i) => s + Number(i.total_amount), 0)),
            facturasImpagas: impagas.length,
            vencidas: impagas.filter((i) => i.due_date && i.due_date < hoy).map((i) => ({ cliente: i.clients?.name ?? 'Desconocido', monto: r2(Number(i.total_amount)), vencioEl: i.due_date })),
            trabajoSinFacturarUsd: r2(logs.reduce((s, l) => s + Number(l.value || 0), 0)),
        },
        clientes: {
            porEtapa: etapas,
            nuevosUltimos90Dias: nuevos.length,
            origenDeLosNuevos: nuevos.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.source ?? 'sin origen']: (acc[c.source ?? 'sin origen'] ?? 0) + 1 }), {}),
            leadsSinProximaAccion: clientes.filter((c) => (c.stage === 'lead' || c.stage === 'quoted') && !c.next_action_at).map((c) => c.name),
        },
        cotizaciones: {
            pendientes: pendientesCot.length,
            montoPendiente: r2(pendientesCot.reduce((s, c) => s + Number(c.total_amount), 0)),
            tasaDeAprobacionPct: decididas.length ? pct(decididas.filter((c) => c.status === 'approved').length, decididas.length) : null,
        },
        carga: {
            tareasAbiertas: tareas.length,
            vencidas: tareas.filter((t) => t.due_date && t.due_date < hoy).length,
            pospuestasTresVecesOMas: tareas.filter((t) => (t.postponed_count ?? 0) >= 3).length,
            horasEstimadasPendientes: r2(tareas.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0) / 60),
        },
        oficinaUltimos7Dias: eventos.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.departamento]: (acc[e.departamento] ?? 0) + 1 }), {}),
    }
}

export type Consejo = { id: string; semana: string; tipo: 'oportunidad' | 'riesgo' | 'decision'; titulo: string; detalle: string; impacto: 'alto' | 'medio' | 'bajo'; estado: 'propuesta' | 'aceptada' | 'descartada' | 'hecha'; resultado: string | null }

export async function listarConsejos(limite = 30): Promise<Consejo[]> {
    return q<Consejo>(supabase.from('direccion_consejos').select('id, semana, tipo, titulo, detalle, impacto, estado, resultado').order('semana', { ascending: false }).order('created_at', { ascending: false }).limit(limite))
}

export async function guardarConsejos(items: Omit<Consejo, 'id' | 'semana' | 'estado' | 'resultado'>[]): Promise<number> {
    if (items.length === 0) return 0
    const { error } = await supabase.from('direccion_consejos').insert(items.map((c) => ({ ...c, semana: todayISO() })))
    if (error) throw new Error(error.message)
    return items.length
}

export const direccionTools = {
    panorama_empresa: tool({
        description:
            'Panorama de toda la empresa para decidir: ingresos facturados y cobrados por mes (últimos 6, o desde el mes que indiques) y avance contra la meta, ingreso mensual recurrente, dependencia de los principales clientes, por cobrar y vencido, trabajo sin facturar, clientes por etapa y nuevos con su origen, cotizaciones pendientes y tasa de aprobación, carga de tareas y actividad de la oficina. Úsala para "¿cómo va la empresa?", "¿qué oportunidades ves?", "¿qué riesgos tengo?", "¿dependo de algún cliente?". Las cifras ya vienen calculadas: no las recalcules.',
        inputSchema: z.object({ desde_mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe('YYYY-MM: analizar desde ese mes (por ejemplo si la MEMORIA dice que meses anteriores no cuentan). Vacío = últimos 6 meses') }),
        execute: async ({ desde_mes }) => run(() => panoramaEmpresa(desde_mes)),
    }),

    consejos_direccion: tool({
        description:
            'Historial de consejos de Dirección (oportunidades, riesgos y decisiones de las revisiones semanales) con su estado (propuesta, aceptada, descartada, hecha) y su resultado. Úsala para "¿qué pasó con lo que me recomendaste?", para no repetir consejos ya descartados y para aprender de lo que funcionó.',
        inputSchema: z.object({ limite: z.number().int().min(1).max(60).optional().describe('Cuántos traer (por defecto 30)') }),
        execute: async ({ limite }) => run(() => listarConsejos(limite)),
    }),

    actualizar_consejo: tool({
        description:
            'Marca un consejo de Dirección como aceptado, descartado o hecho, con su resultado si lo hay ("lo hice y entraron dos clientes", "no aplica porque…"). Requiere confirmación. Resuelve el id con consejos_direccion.',
        inputSchema: z.object({
            consejo_id: z.string().uuid(),
            titulo: z.string().min(1).describe('Título del consejo, para la confirmación'),
            estado: z.enum(['aceptada', 'descartada', 'hecha']),
            resultado: z.string().max(600).optional().describe('Qué pasó, en palabras del dueño'),
        }),
        execute: async ({ consejo_id, estado, resultado }) =>
            run(async () => {
                const { data, error } = await supabase.from('direccion_consejos')
                    .update({ estado, resultado: resultado ?? null, updated_at: new Date().toISOString() })
                    .eq('id', consejo_id).select('titulo, estado, resultado').single()
                if (error) throw new Error(error.message)
                return data
            }),
    }),
}
