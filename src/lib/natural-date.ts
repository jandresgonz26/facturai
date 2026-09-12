/**
 * Detecta una fecha escrita en español dentro de un título de tarea
 * ("llamar al banco mañana", "pagar el hosting el viernes") y la separa del
 * texto, para no obligar a abrir el selector de fecha en la captura rápida.
 *
 * Deliberadamente no reconoce horas ("3pm", "a las 3"): las tareas no tienen
 * un campo de hora, solo de día, así que inventar una y no guardarla en
 * ningún lado sería peor que no reconocerla — el texto de la hora se queda
 * tal cual en el título en vez de perderse en silencio.
 */

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

const stripAccents = (s: string) =>
    s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()

function addDays(base: string, days: number): string {
    const d = new Date(`${base}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().split('T')[0]
}

/** Próxima fecha (desde mañana en adelante) que cae en ese día de la semana. */
function nextWeekday(today: string, targetDow: number): string {
    const d = new Date(`${today}T00:00:00Z`)
    const todayDow = d.getUTCDay()
    let delta = targetDow - todayDow
    if (delta <= 0) delta += 7
    return addDays(today, delta)
}

export interface ParsedDate {
    /** Título sin la frase de fecha reconocida (recortado; puede quedar vacío). */
    title: string
    /** Fecha detectada en YYYY-MM-DD, o null si no se reconoció ninguna. */
    date: string | null
}

/**
 * `today` en YYYY-MM-DD, en la zona del usuario (pásale `todayISO()`).
 * No lanza: ante cualquier frase que no reconoce, devuelve `date: null` y el
 * título intacto.
 */
export function parseSpanishDatePhrase(rawTitle: string, today: string): ParsedDate {
    const title = rawTitle.trim()
    if (!title) return { title, date: null }

    // Se busca sobre una versión normalizada (sin acentos/mayúsculas) pero se
    // recorta sobre el título original, para no perder la ortografía del resto.
    const normalized = stripAccents(title)

    const patterns: { re: RegExp; date: (m: RegExpMatchArray) => string }[] = [
        { re: /\bpasado\s*ma[nñ]ana\b/, date: () => addDays(today, 2) },
        { re: /\bma[nñ]ana\b/, date: () => addDays(today, 1) },
        { re: /\bhoy\b/, date: () => today },
        { re: /\ben\s+(\d{1,2})\s+d[ií]as?\b/, date: (m) => addDays(today, Number(m[1])) },
        {
            re: new RegExp(`\\b(?:el\\s+)?(${WEEKDAYS.join('|')})\\b`),
            date: (m) => nextWeekday(today, WEEKDAYS.indexOf(m[1])),
        },
    ]

    for (const p of patterns) {
        const m = normalized.match(p.re)
        if (!m || m.index == null) continue
        const date = p.date(m)
        // El recorte usa la posición encontrada en el texto normalizado: como
        // solo se le quitan acentos y mayúsculas (nunca caracteres), los
        // índices coinciden uno a uno con el título original.
        const cleaned = (title.slice(0, m.index) + title.slice(m.index + m[0].length))
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+([,.;:])/g, '$1')
            .trim()
        return { title: cleaned || title, date }
    }

    return { title, date: null }
}
