/**
 * Control interno de proyectos (schema_update_control.sql): lectura y escritura en el servidor, detrás de la
 * sesión de José. Nada de esto llega al cliente ni se cruza con facturas.
 */
import { randomUUID } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { ActionError } from '@/lib/actions/validation'
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

export type ControlCompleto = { proyecto: ProyectoControl; cuotas: Cuota[]; acuerdos: Acuerdo[]; movimientos: Movimiento[]; resumen: Resumen }

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
    return { proyecto: p as ProyectoControl, cuotas, acuerdos, movimientos, resumen: calcular(cuotas, acuerdos, movimientos) }
}

function revisar<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
    if (r.error) throw new ActionError(`No se pudo ${que}: ${r.error.message}`)
    return r.data as T
}

const monto = (v: unknown, minimo = 0) => {
    const n = Math.round(Number(String(v ?? '').replace(',', '.')) * 100) / 100
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

export async function actualizarCuota(id: string, c: { concepto?: string; monto?: unknown; vence?: string | null; detalle?: string | null }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (c.concepto !== undefined) row.concepto = c.concepto.trim()
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

export async function agregarAcuerdo(proyectoId: string, a: { proveedor: string; concepto: string; monto: unknown; estado?: 'acordado' | 'por_confirmar'; fecha?: string; detalle?: string }): Promise<string> {
    const proveedor = texto(a.proveedor, 120)
    const concepto = texto(a.concepto, 200)
    if (!proveedor || !concepto) throw new ActionError('Indica quién y por qué.')
    const r = await supabase.from('control_acuerdos').insert({ proyecto_id: proyectoId, proveedor, concepto, monto: monto(a.monto), estado: a.estado === 'por_confirmar' ? 'por_confirmar' : 'acordado', fecha: fecha(a.fecha), detalle: texto(a.detalle, 20000) }).select('id').single()
    return revisar(r, 'guardar el acuerdo').id
}

export async function actualizarAcuerdo(id: string, a: { concepto?: string; monto?: unknown; estado?: 'acordado' | 'por_confirmar'; detalle?: string | null }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (a.concepto !== undefined) row.concepto = a.concepto.trim()
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
