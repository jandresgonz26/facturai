/**
 * Ejecuta una tarea guiada y transmite el avance en vivo (una línea JSON por evento: texto, consulta de datos,
 * fin con el entregable guardado o error). Detrás del control de sesión de proxy.ts, como el resto de /api.
 */
import { revalidatePath } from 'next/cache'
import { ejecutarTarea, type EventoTarea } from '@/lib/agent/entregables'
import { proyectoActivo } from '@/lib/agent/proyecto-activo'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request) {
    const body = (await req.json().catch(() => null)) as { tareaId?: unknown; valores?: unknown; pasoId?: unknown } | null
    const tareaId = typeof body?.tareaId === 'string' ? body.tareaId : ''
    const pasoId = typeof body?.pasoId === 'string' && /^[0-9a-f-]{36}$/i.test(body.pasoId) ? body.pasoId : null
    const valores = Object.fromEntries(Object.entries((body?.valores ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>

    const { id: proyecto } = await proyectoActivo()
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let abierto = true
            const enviar = (e: EventoTarea) => {
                if (!abierto) return
                try { controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`)) } catch { abierto = false } // la página se cerró: el entregable se guarda igual
            }
            try {
                const entregable = await ejecutarTarea(tareaId, valores, { pasoId, proyecto, onEvento: enviar })
                revalidatePath('/oficina', 'layout')
                enviar({ t: 'fin', entregable })
            } catch (e) {
                console.error('[tarea guiada]', e)
                enviar({ t: 'error', mensaje: e instanceof Error && !/api|socket|fetch/i.test(e.message) ? e.message : 'La tarea falló. Inténtalo de nuevo.' })
            }
            if (abierto) controller.close()
        },
    })
    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
}
