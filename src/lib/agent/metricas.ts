/**
 * Métricas que alimentan solas el avance de los objetivos de cada agente. Cada una sabe calcular su valor de
 * hoy desde los datos (FacturAI, Brevo o la plataforma SEO). Un objetivo «manual» guarda su valor a mano.
 */
import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/actions/validation'
import type { Departamento } from './shared'
import { contactosDeLista } from './tools-marketing'
import { carteraSeo } from './tools-seo'

export type Unidad = 'usd' | 'numero' | 'pct'
export type Metrica = { key: string; etiqueta: string; departamento: Departamento; unidad: Unidad; menorEsMejor?: boolean; calcular: () => Promise<number> }

const mes = () => todayISO().slice(0, 7)
const r2 = (n: number) => Math.round(n * 100) / 100
async function suma(p: PromiseLike<{ data: unknown; error: { message: string } | null }>, campo = 'total_amount'): Promise<number> {
    const { data, error } = await p
    if (error) throw new Error(error.message)
    return r2(((data ?? []) as Record<string, unknown>[]).reduce((s, r) => s + Number(r[campo] ?? 0), 0))
}
async function cuenta(p: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
    const { count, error } = await p
    if (error) throw new Error(error.message)
    return count ?? 0
}

export const METRICAS: Metrica[] = [
    { key: 'facturado_mes', etiqueta: 'Facturado este mes', departamento: 'finanzas', unidad: 'usd',
        calcular: () => suma(supabase.from('invoices').select('total_amount').gte('issue_date', `${mes()}-01`).lte('issue_date', `${mes()}-31`)) },
    { key: 'cobrado_mes', etiqueta: 'Cobrado este mes', departamento: 'finanzas', unidad: 'usd',
        calcular: () => suma(supabase.from('invoices').select('total_amount, paid_at').gte('paid_at', `${mes()}-01T00:00:00`).lte('paid_at', `${mes()}-31T23:59:59`)) },
    { key: 'por_cobrar', etiqueta: 'Por cobrar', departamento: 'finanzas', unidad: 'usd', menorEsMejor: true,
        calcular: () => suma(supabase.from('invoices').select('total_amount').neq('status', 'paid')) },
    { key: 'ingreso_recurrente', etiqueta: 'Ingreso recurrente mensual', departamento: 'finanzas', unidad: 'usd',
        calcular: async () => {
            const { data, error } = await supabase.from('recurring_services').select('amount, interval_months').eq('is_active', true)
            if (error) throw new Error(error.message)
            return r2((data ?? []).reduce((s, r) => s + Number(r.amount) / Math.max(1, Number(r.interval_months ?? 1)), 0))
        } },
    { key: 'clientes_activos', etiqueta: 'Clientes activos', departamento: 'ventas', unidad: 'numero',
        calcular: () => cuenta(supabase.from('clients').select('id', { count: 'exact', head: true }).eq('stage', 'active')) },
    { key: 'clientes_nuevos_mes', etiqueta: 'Clientes y leads nuevos este mes', departamento: 'ventas', unidad: 'numero',
        calcular: () => cuenta(supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', `${mes()}-01T00:00:00`)) },
    { key: 'cotizaciones_pendientes', etiqueta: 'Cotizaciones sin respuesta', departamento: 'ventas', unidad: 'numero', menorEsMejor: true,
        calcular: () => cuenta(supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'pending')) },
    { key: 'suscriptores_boletin', etiqueta: 'Suscriptores del boletín', departamento: 'marketing', unidad: 'numero', calcular: () => contactosDeLista(5) },
    { key: 'lista_espera_wapalink', etiqueta: 'Lista de espera de Wapalink', departamento: 'marketing', unidad: 'numero', calcular: () => contactosDeLista(4) },
    { key: 'leads_asistente', etiqueta: 'Leads del asistente de WhatsApp', departamento: 'marketing', unidad: 'numero', calcular: () => contactosDeLista(3) },
    { key: 'clics_seo_cartera', etiqueta: 'Clics SEO de la cartera (último mes completo)', departamento: 'seo', unidad: 'numero',
        calcular: async () => (await carteraSeo() as unknown as { clientes: { gsc: { clics: number } | null }[] }).clientes.reduce((s, c) => s + (c.gsc?.clics ?? 0), 0) },
    { key: 'tareas_vencidas', etiqueta: 'Tareas vencidas', departamento: 'operaciones', unidad: 'numero', menorEsMejor: true,
        calcular: () => cuenta(supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').lt('due_date', todayISO())) },
    { key: 'tareas_hechas_mes', etiqueta: 'Tareas completadas este mes', departamento: 'operaciones', unidad: 'numero',
        calcular: () => cuenta(supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('completed_at', `${mes()}-01T00:00:00`)) },
]

export const METRICA = new Map(METRICAS.map((m) => [m.key, m]))

/** Valor de hoy de una métrica (null si no se pudo calcular: el objetivo muestra «sin dato»). */
export async function valorDe(key: string): Promise<number | null> {
    const m = METRICA.get(key)
    if (!m) return null
    try { return await m.calcular() } catch (e) { console.warn('[métrica]', key, e instanceof Error ? e.message : e); return null }
}

/** Avance de 0 a 1 entre el valor inicial y la meta (o desde 0 si no hay inicial), respetando «menos es mejor». */
export function avance(o: { valor_inicial: number | null; valor_meta: number | null }, valor: number | null, menorEsMejor = false): number | null {
    if (valor === null || o.valor_meta === null) return null
    const inicio = o.valor_inicial ?? (menorEsMejor ? null : 0)
    if (inicio === null) return valor <= o.valor_meta ? 1 : null
    const total = o.valor_meta - inicio
    if (total === 0) return 1
    return Math.max(0, Math.min(1, (valor - inicio) / total))
}
