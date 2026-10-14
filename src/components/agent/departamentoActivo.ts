import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import { DEPARTAMENTOS, departamentoDe, type Departamento } from '@/lib/agent/shared'

// «Dirección: …» (menú de la oficina) o «Ramón, …» (por el nombre del agente).
// En la respuesta, la firma con la que habla cada agente: «**Valeria · Finanzas:**» o «Valeria, de Finanzas:».
const FIRMAS = (Object.keys(DEPARTAMENTOS) as Departamento[]).map((d) => ({ d, re: new RegExp(`\\**\\s*${DEPARTAMENTOS[d].persona}\\s*(?:·|,\\s*de)\\s*${DEPARTAMENTOS[d].nombre}`, 'gi') }))
const PREFIJOS = (Object.keys(DEPARTAMENTOS) as Departamento[]).map((d) => ({ d, re: new RegExp(`^\\s*(${DEPARTAMENTOS[d].nombre}|${DEPARTAMENTOS[d].persona})\\s*[:,]`, 'i') }))

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
    // La última firma en la última respuesta (en la puerta de entrada puede hablar más de uno: manda el último).
    const ultima = [...messages].reverse().find((m) => m.role === 'assistant')
    if (ultima) {
        const t = textoDe(ultima)
        let mejor: { d: Departamento; i: number } | null = null
        for (const f of FIRMAS) for (const hit of t.matchAll(f.re)) if (!mejor || hit.index > mejor.i) mejor = { d: f.d, i: hit.index }
        if (mejor) return mejor.d
    }
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role !== 'assistant') continue
        const tools = m.parts.filter(isToolUIPart)
        if (tools.length) return departamentoDe(getToolName(tools[tools.length - 1]))
    }
    return null
}
