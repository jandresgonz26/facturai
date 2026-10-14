/** Proyecto en el que está trabajando José en la web (cookie): la Oficina, los chats y las tareas guiadas lo usan. */
import { cookies } from 'next/headers'
import { esProyectoId, leerProyecto, type Proyecto, type ProyectoId } from './proyectos'

export const COOKIE_PROYECTO = 'oficina_proyecto'

/** Si la cookie apunta a un proyecto archivado o borrado, se vuelve a JAM Tech. */
export async function proyectoActivo(): Promise<{ id: ProyectoId; proyecto: Proyecto | null }> {
    const v = (await cookies()).get(COOKIE_PROYECTO)?.value
    if (!esProyectoId(v)) return { id: null, proyecto: null }
    const p = await leerProyecto(v).catch(() => null)
    return p && p.estado !== 'archivado' ? { id: p.id, proyecto: p } : { id: null, proyecto: null }
}
