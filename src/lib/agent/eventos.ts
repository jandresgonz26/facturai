/**
 * Registro de actividad de la oficina: cada herramienta que usa el asistente y
 * cada rutina automática deja un evento con su departamento. De aquí se alimentan
 * la oficina en 3D y el historial de "qué hizo cada quien".
 */
import { supabase } from '@/lib/supabase'
import { DEPARTAMENTOS, type Departamento } from './shared'

export type EstadoEvento = 'en_curso' | 'hecho' | 'espera_aprobacion' | 'cancelado' | 'error'
export type TipoEvento = 'herramienta' | 'rutina' | 'aviso'
export type FuenteEvento = 'chat' | 'telegram' | 'cron'

export interface AgentEvent {
    id: string
    created_at: string
    departamento: Departamento
    tipo: TipoEvento
    titulo: string
    detalle: Record<string, unknown> | null
    estado: EstadoEvento
    fuente: FuenteEvento
}

export async function registrarEvento(e: {
    departamento: Departamento
    tipo: TipoEvento
    titulo: string
    estado?: EstadoEvento
    fuente?: FuenteEvento
    detalle?: Record<string, unknown>
}): Promise<void> {
    const { error } = await supabase.from('agent_events').insert({
        departamento: e.departamento,
        tipo: e.tipo,
        titulo: e.titulo.slice(0, 200),
        estado: e.estado ?? 'hecho',
        fuente: e.fuente ?? 'chat',
        detalle: e.detalle ?? null,
    })
    // Un fallo aquí no debe romper el turno del asistente: solo se pierde una línea del historial.
    if (error) console.warn('[oficina] no se pudo registrar el evento', error.message)
}

export async function listarEventos(limit = 30): Promise<AgentEvent[]> {
    const { data, error } = await supabase
        .from('agent_events')
        .select('id, created_at, departamento, tipo, titulo, detalle, estado, fuente')
        .order('created_at', { ascending: false })
        .limit(limit)
    if (error) throw new Error(error.message)
    return (data ?? []) as AgentEvent[]
}

export type EstadoDepartamento = 'libre' | 'trabajando' | 'esperando'

/**
 * Qué está haciendo cada departamento ahora mismo, deducido de sus últimos eventos:
 * trabajando si hizo algo en el último minuto, esperando si tiene una propuesta sin
 * confirmar, libre en cualquier otro caso.
 */
export async function estadoOficina(): Promise<{
    departamentos: Record<Departamento, { estado: EstadoDepartamento; ultimo: AgentEvent | null }>
    eventos: AgentEvent[]
}> {
    const eventos = await listarEventos(40)
    const ahora = Date.now()
    const departamentos = Object.fromEntries(
        (Object.keys(DEPARTAMENTOS) as Departamento[]).map((dep) => {
            const ultimo = eventos.find((e) => e.departamento === dep) ?? null
            let estado: EstadoDepartamento = 'libre'
            if (ultimo) {
                const edad = ahora - new Date(ultimo.created_at).getTime()
                if (ultimo.estado === 'espera_aprobacion' && edad < 30 * 60_000) estado = 'esperando'
                else if (ultimo.estado === 'en_curso' || edad < 60_000) estado = 'trabajando'
            }
            return [dep, { estado, ultimo }]
        })
    ) as Record<Departamento, { estado: EstadoDepartamento; ultimo: AgentEvent | null }>
    return { departamentos, eventos }
}
