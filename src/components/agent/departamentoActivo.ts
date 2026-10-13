import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import { DEPARTAMENTOS, departamentoDe, type Departamento } from '@/lib/agent/shared'

const PREFIJOS = (Object.keys(DEPARTAMENTOS) as Departamento[]).map((d) => ({ d, re: new RegExp(`^\\s*${DEPARTAMENTOS[d].nombre}\\s*[:,]`, 'i') }))

function textoDe(m: UIMessage): string {
    return m.parts.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join(' ')
}

/**
 * Qué departamento está hablando, para el encabezado del chat. Manda el último mensaje de José si empieza
 * con un departamento («Dirección: …», como lo escribe el menú de la oficina); si no, el de la última
 * herramienta que usó el asistente. null = conversación general.
 */
export function departamentoActivo(messages: UIMessage[]): Departamento | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role === 'user') {
            const t = textoDe(m)
            const hit = PREFIJOS.find((p) => p.re.test(t))
            if (hit) return hit.d
            break
        }
    }
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role !== 'assistant') continue
        const tools = m.parts.filter(isToolUIPart)
        if (tools.length) return departamentoDe(getToolName(tools[tools.length - 1]))
    }
    return null
}
