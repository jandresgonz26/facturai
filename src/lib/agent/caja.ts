/**
 * La caja de herramientas de la Oficina, armada para cada conversación: las de siempre más las que dependen
 * del proyecto activo (cerebro, objetivos, planes y encargos crean y listan dentro de él).
 */
import { agentTools } from './tools'
import { marketingTools } from './tools-marketing'
import { seoTools } from './tools-seo'
import { direccionTools } from './tools-direccion'
import { memoriaTools } from './tools-memoria'
import { objetivosTools } from './tools-objetivos'
import { cerebroTools } from './cerebro'
import { planesTools } from './planes'
import { encargosTools } from './encargos'
import { checklistTools } from './checklist'
import type { Alcance, ProyectoId } from './proyectos'

/** `lectura`: qué ven los listados (las rutinas de los lunes miran todos los proyectos). */
/** `checklist`: slug de Seguimiento de Tareas del proyecto activo (si lo tiene), para no tener que nombrarlo. */
export function herramientasPara(proyecto: ProyectoId = null, lectura: Alcance = proyecto, checklist: string | null = null) {
    return {
        ...agentTools, ...marketingTools, ...seoTools, ...direccionTools, ...memoriaTools,
        ...objetivosTools(proyecto, lectura), ...cerebroTools(proyecto), ...planesTools(proyecto, lectura), ...encargosTools(proyecto, lectura),
        ...checklistTools(checklist),
    }
}
export type Herramientas = ReturnType<typeof herramientasPara>
