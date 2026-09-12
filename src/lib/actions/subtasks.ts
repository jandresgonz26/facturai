import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { TaskSubtask } from '@/types'
import { ActionError, parseInput, uuidSchema } from './validation'

/**
 * Checklist dentro de una tarea, para las que tienen varios pasos ("Migración
 * Peleteiro": DNS, backups, subir archivos, probar). Vive en su propia tabla
 * en vez de un array en `tasks` para poder marcar un paso sin reescribir
 * todo el JSON, y porque cada paso necesita su propio id estable.
 */

const titleSchema = z.string().trim().min(1, 'El paso necesita un texto').max(300, 'El texto es demasiado largo')

export async function addSubtask(taskId: string, rawTitle: string): Promise<TaskSubtask> {
    const task_id = parseInput(uuidSchema, taskId)
    const title = parseInput(titleSchema, rawTitle)

    const { data: last } = await supabase
        .from('task_subtasks')
        .select('position')
        .eq('task_id', task_id)
        .order('position', { ascending: false })
        .limit(1)
    const position = Number(last?.[0]?.position ?? 0) + 1

    const { data, error } = await supabase.from('task_subtasks').insert({ task_id, title, position }).select().single()
    if (error) throw new ActionError(`No se pudo agregar el paso: ${error.message}`)
    return data as TaskSubtask
}

export async function toggleSubtask(id: string, done: boolean): Promise<TaskSubtask> {
    const subtaskId = parseInput(uuidSchema, id)
    const { data, error } = await supabase.from('task_subtasks').update({ done }).eq('id', subtaskId).select().single()
    if (error) throw new ActionError(`No se pudo actualizar el paso: ${error.message}`)
    return data as TaskSubtask
}

export async function deleteSubtask(id: string): Promise<void> {
    const subtaskId = parseInput(uuidSchema, id)
    const { error } = await supabase.from('task_subtasks').delete().eq('id', subtaskId)
    if (error) throw new ActionError(`No se pudo eliminar el paso: ${error.message}`)
}
