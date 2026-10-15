/**
 * Despertador de los avisos de Seguimiento de Tareas: la base del checklist (trigger con pg_net) lo llama cuando
 * el cliente cambia un estado desde su enlace. No confía en el cuerpo: espera un momento para juntar los cambios
 * seguidos (el cliente suele marcar varias tareas) y vuelve a leer el registro con su propia clave.
 */
import { after } from 'next/server'
import { avisarCambios } from '@/lib/agent/checklist'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ESPERA_MS = 60_000
let programado = false

export async function POST() {
    if (!programado) {
        programado = true
        after(async () => {
            await new Promise((r) => setTimeout(r, ESPERA_MS))
            programado = false
            try { await avisarCambios() } catch (e) { console.error('[checklist] aviso', e) }
        })
    }
    return Response.json({ ok: true })
}
