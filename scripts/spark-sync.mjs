#!/usr/bin/env node
/**
 * Puente entre Spark (local, en el Mac) y FacturAI (en la nube).
 *
 * Spark no tiene API en la nube: su CLI lee la app que corre en esta
 * computadora. Este script hace de puente: lee aquí lo que merece atención y
 * lo deja en la base de FacturAI, para que el asistente pueda mencionarlo
 * desde Telegram aunque el Mac esté apagado después.
 *
 * Se guarda UN REGISTRO POR HILO (no por mensaje): un hilo con varias
 * respuestas se identifica por un token estable que da el propio CLI de
 * Spark (el mismo sin importar qué mensaje del hilo se consulte), así que
 * cada mensaje nuevo actualiza la misma fila en vez de crear una casi
 * duplicada — y el asistente nunca tiene que adivinar cuál de varias filas
 * parecidas es la más reciente.
 *
 * PRIVACIDAD: se sube el cuerpo del hilo (no solo cabeceras) para que el
 * asistente pueda resumirlo, pero con salvaguardas decididas explícitamente
 * por el usuario, todas aplicadas AQUÍ, antes de que nada salga del Mac:
 *   - Solo si no parece ruido automático (mismo criterio que ya usa la app
 *     para ocultar avisos de WordPress, seguridad, tickets, etc.), y solo si
 *     el remitente no está silenciado.
 *   - Las líneas que parecen traer una contraseña o clave se tachan antes de
 *     subir nada (best-effort: es un filtro de texto, no infalible).
 *   - En la nube el cuerpo vence a los 30 días (lo borra el cron del
 *     asistente); las cabeceras se quedan igual que siempre.
 *
 * Uso:
 *   node --env-file=.env.local scripts/spark-sync.mjs [--days 14] [--limit 40] [--dry]
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

// launchd (el programador que corre esto en segundo plano cada 30 min) usa un
// PATH mínimo que no incluye /usr/local/bin, donde quedó el symlink del CLI
// de Spark: desde una terminal normal "spark" se encuentra, desde launchd no
// (falla en silencio con ENOENT). Se usa la ruta absoluta por eso.
const SPARK_BIN = process.env.SPARK_BIN || '/usr/local/bin/spark'

const args = process.argv.slice(2)
const argVal = (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const DAYS = Number(argVal('days', 14))
// Candidatos a REVISAR. En la práctica hay ~107 sin responder en 3 semanas y
// casi la mitad es ruido (notificaciones de sus propios sistemas, WordPress,
// y correos que mandó él mismo), así que con un tope bajo el ruido desplazaba
// al trabajo real y nunca llegaba a subirse.
const LIMIT = Number(argVal('limit', 150))
// Hilos ÚTILES que se suben como mucho. El tope se cuenta después de filtrar,
// no antes: es lo que garantiza que sean 40 correos que importan.
const MAX_THREADS = Number(argVal('max', 60))
const DRY = args.includes('--dry')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
// Este proceso corre sin usuario, y desde que la base de datos exige sesión
// la clave anon ya no puede escribir: hace falta la service role key.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Usa: node --env-file=.env.local ...')
    process.exit(1)
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Aviso: sin SUPABASE_SERVICE_ROLE_KEY en .env.local; con la base de datos cerrada, la sincronización no podrá escribir.')
}

const sb = (path, init = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    })

async function spark(args) {
    try {
        const { stdout } = await run(SPARK_BIN, args, { maxBuffer: 32 * 1024 * 1024 })
        return stdout
    } catch (e) {
        const msg = e.stderr || e.message || String(e)
        if (e.code === 'ENOENT') {
            throw new Error(`No se encuentra el CLI de Spark en ${SPARK_BIN}. Revisa el symlink (ver README) o define SPARK_BIN.`)
        }
        if (/can't access your Spark Desktop/i.test(msg)) {
            throw new Error('Spark Desktop no está abierto o el CLI no tiene permiso. Abre Spark y vuelve a intentar.')
        }
        throw new Error(`Fallo al ejecutar spark: ${msg.trim()}`)
    }
}

// ───────────── Ruido automático ─────────────
// Copia deliberada (no importada) de src/lib/inbox-noise.ts: este script
// corre por su cuenta vía launchd, sin pasar por el bundler de Next, así que
// depender de un import cruzado ahí sería un punto de fallo silencioso más
// (ya hubo uno con el PATH). Si esas reglas cambian, conviene revisar esta
// copia también. Aquí decide solo si vale la pena bajar el cuerpo; el
// veredicto real de qué se muestra lo sigue calculando la app al leer.
const NOISE_LOCAL_PARTS = [
    'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
    'notification', 'notifications', 'notificacion', 'notificaciones',
    'wordpress', 'mailer', 'mailer-daemon', 'postmaster', 'bounce', 'bounces',
    'alerts', 'alert', 'newsletter', 'noticias', 'automated', 'automatic',
]
const NOISE_DOMAINS = ['facebookmail.com', 'notify.wellsfargo.com', 'em1.cloudflare.com', 'news.domestika.org', 'notifications.hubspot.com']
const NOISE_SUBJECTS = [
    /^re:?\s*recibimos tu (consulta|mensaje|solicitud)/i,
    /^recibimos tu (consulta|mensaje|solicitud)/i,
    /gracias por (contactarnos|escribirnos|tu mensaje)/i,
    // Notificaciones de sus propios sistemas (jami@jamtech.cloud): briefings y
    // cotizaciones automáticas. Son decenas al día y no esperan respuesta.
    /^nuevo briefing:/i,
    /^recibimos tu briefing/i,
    /jami cotiz(ó|o) sola/i,
    /^tu cotizaci(ó|o)n de/i,
    // Avisos de las webs que administra
    /tu sitio se ha actualizado a wordpress/i,
    /se acerca al l[ií]mite/i,
    // Altas y verificaciones de plataformas
    /^registro exitoso/i,
    /nueva ip detectada/i,
    /c(ó|o)digo de seguridad/i,
    /te da la bienvenida/i,
    /notificaci(ó|o)n de cobro seniat/i,
    /restablecer (la )?contrase(ñ|n)a|password reset/i,
    /backup (error )?report|informe de copia/i,
    /error de inicio de sesi(ó|o)n|failed login/i,
    /\[ticket id:|ticket #\d+/i,
    /su opini(ó|o)n es muy importante|encuesta de satisfacci(ó|o)n/i,
    /^informe de (instagram|facebook|google ads|analytics)/i,
    /activar la protecci(ó|o)n avanzada/i,
    /notificaci(ó|o)n tributaria/i,
    /pago registrado del recibo/i,
    /informe de la exploraci(ó|o)n|scan report/i,
]

/**
 * Dominios de correo personal: coinciden muchísimos remitentes distintos, así
 * que enlazar un cliente por dominio ahí sería un disparate.
 */
const GENERIC_DOMAINS = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'me.com', 'protonmail.com'])

function isLikelyNoise(fromEmail, subject, { isKnownClient, mutedSenders }) {
    const email = fromEmail.toLowerCase().trim()
    const [local = '', domain = ''] = email.split('@')
    if (mutedSenders.has(email)) return true
    if (NOISE_SUBJECTS.some((re) => re.test(subject))) return true
    if (isKnownClient) return false
    if (NOISE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true
    if (NOISE_LOCAL_PARTS.some((p) => local === p || local.startsWith(`${p}.`) || local.startsWith(`${p}-`) || local.startsWith(`${p}+`))) return true
    return false
}

// ───────────── Redacción de secretos ─────────────
// Best-effort, decidido explícitamente por el usuario: sus correos de hosting
// traen credenciales en texto plano de vez en cuando. No es infalible (es un
// filtro de texto), pero tacha el caso común "Usuario: X / Contraseña: Y".
const SECRET_PATTERNS = [
    /\b(contrase[nñ]as?|claves?|passwords?|pwd)\s*:?\s*(es|son)?\s*[:=]\s*(\S+)/gi,
    /\b(token|api[\s_-]?key|secret|secreto)\s*[:=]\s*(\S+)/gi,
]
function redactSecrets(text) {
    let out = text
    for (const re of SECRET_PATTERNS) {
        out = out.replace(re, (full, label) => `${label}: [omitido]`)
    }
    return out
}

// Con la firma completa (la de Asiri incluye RGPD, aviso legal y promo, y se
// repite en cada mensaje del hilo) un hilo de 13 mensajes se iba muy por
// encima de esto — y como se recorta por el final, lo que se perdía eran
// justo los mensajes más recientes, que es lo que más importa. Con la firma
// fuera (stripSignature), el margen alcanza para hilos bastante largos.
const MAX_BODY_CHARS = 12000

/**
 * El CLI de Spark marca el arranque del bloque de firma con "Firma email -
 * <nombre> --" antes de imprimirlo (visto en la práctica: contactos, avisos
 * legales y promoción repetidos en cada mensaje del hilo). Se corta ahí: es
 * ruido para un resumen y se come el presupuesto de caracteres a lo tonto.
 * Si el marcador no aparece, se deja el cuerpo tal cual (mejor de más que
 * arriesgarse a cortar contenido real).
 */
function stripSignature(body) {
    const m = body.match(/^\s*Firma email\b/im)
    return m && m.index != null ? body.slice(0, m.index).trim() : body
}

/**
 * Se filtra por "sin responder" y categoría personal porque es lo único que en
 * la práctica separa lo que pide acción del ruido: las estrellas el usuario las
 * usa como archivo, y casi no deja correo sin leer.
 */
async function listCandidateIds() {
    const filter = `is:unreplied category:personal newer_than:${DAYS}d`
    const out = await spark(['emails', '--filter', filter, '--limit', String(LIMIT)])
    const ids = []
    for (const line of out.split('\n')) {
        // Las filas empiezan con el ID numérico; la cabecera de la tabla no.
        const m = line.match(/^\s{2,}(\d{3,})\s{2,}/)
        if (m) ids.push(m[1])
    }
    return ids
}

/** Un mensaje dentro de un hilo: cabeceras + su propio cuerpo. */
function parseMessages(threadOut) {
    const HEADER_RE = /^\s{2}(Subject|From|To|Cc|Bcc|Date|Type):/
    const blocks = threadOut.split(/^\s{2}ID:\s*/m).slice(1)
    const messages = []
    for (const block of blocks) {
        const lines = block.split('\n')
        const id = lines[0].trim()
        const grab = (label) => {
            const m = block.match(new RegExp(`^\\s{2}${label}:\\s*(.+)$`, 'm'))
            return m ? m[1].trim() : null
        }
        const from = grab('From')
        if (!from) continue
        // Cuerpo: todo lo que sigue a la última cabecera reconocida.
        let bodyStart = -1
        for (let i = 0; i < lines.length; i++) {
            if (HEADER_RE.test(lines[i])) bodyStart = i + 1
        }
        const body =
            bodyStart >= 0
                ? stripSignature(
                      lines
                          .slice(bodyStart)
                          .map((l) => l.replace(/^ {1,2}/, '')) // Spark indenta cada línea con 2 espacios.
                          .join('\n')
                          .trim()
                  )
                : ''
        const withName = from.match(/^"?(.*?)"?\s*<([^>]+)>$/)
        // Algunos remitentes mandan el nombre roto ("undefined - Releasit"):
        // se limpia el prefijo para no mostrarlo tal cual en los avisos.
        const rawName = withName ? withName[1].trim().replace(/^undefined\s*-\s*/i, '') : ''
        messages.push({
            message_id: id,
            from_name: rawName || null,
            from_email: (withName ? withName[2] : from).trim().toLowerCase(),
            subject: grab('Subject') || '(sin asunto)',
            date: grab('Date'),
            body,
        })
    }
    return messages
}

/**
 * Identidad del hilo: el mismo token sin importar qué mensaje se haya usado
 * para pedirlo (comprobado a mano: `spark thread <id-viejo>` y
 * `spark thread <id-nuevo>` del mismo hilo devuelven el mismo Link). Si algún
 * hilo no trae Link (caso raro), se usa el id del propio mensaje como
 * respaldo: degrada a "una fila por mensaje" solo para ese caso, en vez de
 * romper la sincronización.
 */
function extractThreadKey(threadOut, fallbackId) {
    const m = threadOut.match(/^Link:\s*(.+)$/m)
    return m ? m[1].trim() : fallbackId
}

/** El hilo completo como un solo texto, para que el asistente pueda resumirlo de verdad, no solo el último mensaje. */
function renderThread(messages) {
    const text = messages
        .map((m) => `--- ${m.from_name || m.from_email} (${m.date || 'sin fecha'}) ---\n${m.body || '(sin contenido)'}`)
        .join('\n\n')
    const redacted = redactSecrets(text)
    if (redacted.length <= MAX_BODY_CHARS) return redacted
    // Si aún así no cabe, se recorta por el PRINCIPIO: lo reciente pesa más
    // que el contexto de apertura, y es justo lo que se quiere poder leer.
    return `[…se omiten los mensajes más antiguos del hilo…]\n\n${redacted.slice(-MAX_BODY_CHARS)}`
}

/** La fecha viene como 'YYYY-MM-DD HH:mm' en hora local del Mac. */
function toIso(dateStr) {
    if (!dateStr) return new Date().toISOString()
    const parsed = new Date(dateStr.replace(' ', 'T'))
    return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

async function main() {
    console.log(`Buscando correos sin responder de los últimos ${DAYS} días…`)
    const ids = await listCandidateIds()
    if (ids.length === 0) {
        console.log('No hay candidatos. Nada que sincronizar.')
        return
    }
    console.log(`${ids.length} candidatos. Leyendo cabeceras…`)

    // Cuenta a la que pertenece cada correo, para no mezclar buzones.
    const accountsOut = await spark(['accounts'])
    const accounts = [...accountsOut.matchAll(/^Email Account:\s*(\S+)/gm)].map((m) => m[1])
    const defaultAccount = accounts[0] || 'desconocida'

    // Para decidir ruido y de quién es cada correo, antes de leer cuerpos.
    const [clientsRes, mutedRes] = await Promise.all([
        sb('clients?select=id,email&email=not.is.null'),
        sb('muted_senders?select=from_email&muted=eq.true'),
    ])
    const clients = clientsRes.ok ? await clientsRes.json() : []
    const byEmail = new Map(clients.map((c) => [String(c.email).toLowerCase().trim(), c.id]))
    // También por dominio: los correos de un cliente llegan de varias personas
    // (aromero@, maycres@, ifernandez@ … todos de asiri.es) y comparar solo
    // contra la dirección exacta de la ficha daba siempre "0 clientes
    // conocidos". Los dominios genéricos quedan fuera, claro.
    const byDomain = new Map()
    for (const c of clients) {
        const domain = String(c.email).toLowerCase().trim().split('@')[1]
        if (!domain || GENERIC_DOMAINS.has(domain)) continue
        if (!byDomain.has(domain)) byDomain.set(domain, c.id)
    }
    const mutedSenders = new Set(mutedRes.ok ? (await mutedRes.json()).map((m) => String(m.from_email).toLowerCase()) : [])
    // Sus propias direcciones: un hilo cuyo último mensaje lo escribió él no
    // espera respuesta suya, espera del otro lado.
    const ownAddresses = new Set(accounts.map((a) => a.toLowerCase()))

    const rows = []
    // Varios candidatos de esta misma corrida pueden ser mensajes del mismo
    // hilo (ej. 4 respuestas seguidas todas "sin responder" a la vez): se
    // procesa cada hilo una sola vez, no una por mensaje.
    const threadKeysSeen = new Set()
    const skipped = { noise: 0, own: 0 }
    for (const id of ids) {
        if (rows.length >= MAX_THREADS) break
        try {
            const threadOut = await spark(['thread', id])
            const messages = parseMessages(threadOut)
            if (messages.length === 0) continue
            const threadKey = extractThreadKey(threadOut, id)
            if (threadKeysSeen.has(threadKey)) continue
            threadKeysSeen.add(threadKey)

            // El último mensaje del hilo (no necesariamente el candidato que
            // disparó la consulta): spark thread siempre trae el hilo
            // completo y al día, así que esto es lo más reciente que existe
            // ahora mismo, venga de donde venga el id de arranque.
            const latest = messages[messages.length - 1]

            // Si el último en escribir fue él, la pelota está del otro lado.
            if (ownAddresses.has(latest.from_email)) {
                skipped.own++
                continue
            }

            const client_id = byEmail.get(latest.from_email) ?? byDomain.get(latest.from_email.split('@')[1]) ?? null
            // El ruido ya no se sube: antes ocupaba sitio en el tope y
            // desplazaba a los correos que sí importan.
            if (isLikelyNoise(latest.from_email, latest.subject, { isKnownClient: !!client_id, mutedSenders })) {
                skipped.noise++
                continue
            }

            // La cuenta destino aparece en el bloque; si no, se usa la primera.
            const toLine = threadOut.match(new RegExp(`^\\s{2}ID:\\s*${latest.message_id}[\\s\\S]*?^\\s{2}To:\\s*(.+)$`, 'm'))
            const account = accounts.find((a) => toLine?.[1]?.toLowerCase().includes(a.toLowerCase())) || defaultAccount
            rows.push({
                thread_key: threadKey,
                message_id: latest.message_id,
                account,
                from_name: latest.from_name,
                from_email: latest.from_email,
                subject: latest.subject,
                sent_at: toIso(latest.date),
                client_id,
                body: renderThread(messages),
                body_synced_at: new Date().toISOString(),
            })
        } catch (e) {
            console.warn(`  · no se pudo leer el correo ${id}: ${e.message}`)
        }
    }
    console.log(`Descartados: ${skipped.noise} automáticos, ${skipped.own} que respondiste tú.`)

    if (rows.length === 0) {
        console.log('No se pudo extraer ninguna cabecera.')
        return
    }

    if (DRY) {
        console.log('\n--- prueba en seco, no se sube nada ---')
        for (const r of rows) {
            console.log(
                `  ${r.sent_at.slice(0, 10)}  ${r.from_email.padEnd(34)} ${r.client_id ? '[CLIENTE] ' : ''}${r.subject}`
            )
        }
        console.log(`\n${rows.length} hilos que esperan respuesta. De clientes conocidos: ${rows.filter((r) => r.client_id).length}.`)
        return
    }

    // upsert por hilo: si ya existía una fila para este thread_key, se
    // actualiza en el sitio (cabeceras + cuerpo al día), no se duplica. Un
    // 502/503 de la pasarela de Supabase es transitorio y ya se vio en la
    // práctica; como esto corre sola cada 30 min sin que nadie lo mire, vale
    // la pena un segundo intento antes de rendirse y dejar el ciclo perdido.
    const upload = () =>
        sb('inbox_items?on_conflict=account,thread_key', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(rows.map((r) => ({ ...r, synced_at: new Date().toISOString() }))),
        })
    let res = await upload()
    if (!res.ok && res.status >= 500) {
        console.warn(`Aviso: ${res.status} al subir, reintentando en 3s…`)
        await new Promise((r) => setTimeout(r, 3000))
        res = await upload()
    }
    if (!res.ok) {
        console.error('Error al subir:', res.status, await res.text())
        process.exit(1)
    }
    const saved = await res.json()
    console.log(`Listo: ${saved.length} hilos sincronizados (${rows.filter((r) => r.client_id).length} de clientes conocidos).`)
}

main().catch((e) => {
    console.error(e.message)
    process.exit(1)
})
