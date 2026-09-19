import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { listInboxItems } from './inbox'

/**
 * Resumen de lo que llegó al correo mientras el usuario no estaba.
 *
 * El caso real: trabaja con clientes y equipo en España, seis horas por
 * delante. Cuando se despierta, ellos llevan media jornada escribiendo, y se
 * encuentra un montón de correos de golpe. Esto lo lee por él y le dice qué
 * le están pidiendo, una vez al día, en el aviso de la mañana.
 *
 * Solo se genera si hay algo que resumir: si llegaron uno o dos correos, el
 * aviso normal de "fulano espera respuesta" ya los cubre y este sobra.
 */

/** Horas hacia atrás que cuentan como "mientras no estabas" (8am - 14h = 6pm de ayer). */
const WINDOW_HOURS = 14
/** Con menos de esto, no hace falta resumen: basta el aviso suelto. */
const MIN_THREADS = 3
/** Cuánto cuerpo se le pasa al modelo por hilo. */
const MAX_BODY_CHARS = 1500

export interface EmailDigest {
    text: string
    thread_count: number
}

export async function buildMorningEmailDigest(now = new Date()): Promise<EmailDigest | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return null

    const since = new Date(now.getTime() - WINDOW_HOURS * 3600 * 1000)
    const items = (await listInboxItems({ pending_only: true, limit: 40 }).catch(() => []))
        .filter((i) => new Date(i.sent_at) >= since)
        .slice(0, 8)
    if (items.length < MIN_THREADS) return null

    const corpus = items
        .map((i) => {
            const quien = i.clients?.name ? `${i.from_name || i.from_email} (cliente: ${i.clients.name})` : i.from_name || i.from_email
            const cuerpo = i.body ? i.body.slice(0, MAX_BODY_CHARS) : '(sin cuerpo sincronizado)'
            return `— De: ${quien}\n  Asunto: ${i.subject}\n  Contenido:\n${cuerpo}`
        })
        .join('\n\n')

    const openai = createOpenAI({ apiKey })
    const { text } = await generateText({
        model: openai(process.env.OPENAI_MODEL || 'gpt-5.4-mini'),
        system: [
            'Eres el asistente de José, que dirige JAM Tech. Trabaja con clientes y equipo en España, seis horas por delante, así que amanece con correo acumulado.',
            'Resume lo que le escribieron MIENTRAS NO ESTABA, para que en diez segundos sepa qué le piden.',
            'Reglas:',
            '- Una viñeta por hilo, empezando por "• ". Agrupa los mensajes del mismo asunto en una sola.',
            '- Máximo dos líneas por viñeta. Nombra a quién escribe y QUÉ espera de él (una decisión, un dato, una respuesta).',
            '- Concreto y en español: nombres, cifras y qué falta. Nada de relleno, saludos ni "te informo que".',
            '- Si un correo no pide nada de él (una confirmación, un "gracias"), no lo menciones.',
            '- Resalta con **negritas** solo el nombre de quien escribe.',
            '- No inventes nada que no esté en el texto. Si un hilo no trae cuerpo, dilo en tres palabras ("sin detalle sincronizado").',
            '- Responde SOLO con las viñetas, sin encabezado ni cierre.',
        ].join('\n'),
        prompt: `Correos recibidos en las últimas ${WINDOW_HOURS} horas:\n\n${corpus}`,
    })

    const clean = text.trim()
    return clean ? { text: clean, thread_count: items.length } : null
}
