#!/usr/bin/env node
/**
 * Puente entre Spark (local, en el Mac) y FacturAI (en la nube).
 *
 * Spark no tiene API en la nube: su CLI lee la app que corre en esta
 * computadora. Este script hace de puente: lee aquí lo que merece atención y
 * lo deja en la base de FacturAI, para que el asistente pueda mencionarlo
 * desde Telegram aunque el Mac esté apagado después.
 *
 * PRIVACIDAD: solo se suben cabeceras (remitente, asunto, fecha). El cuerpo de
 * los correos se lee localmente para extraer esas cabeceras y se descarta; no
 * sale nunca de esta máquina.
 *
 * Uso:
 *   node --env-file=.env.local scripts/spark-sync.mjs [--days 14] [--limit 40] [--dry]
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const args = process.argv.slice(2)
const argVal = (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const DAYS = Number(argVal('days', 14))
const LIMIT = Number(argVal('limit', 40))
const DRY = args.includes('--dry')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Usa: node --env-file=.env.local ...')
    process.exit(1)
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
        const { stdout } = await run('spark', args, { maxBuffer: 32 * 1024 * 1024 })
        return stdout
    } catch (e) {
        const msg = e.stderr || e.message || String(e)
        if (/can't access your Spark Desktop/i.test(msg)) {
            throw new Error('Spark Desktop no está abierto o el CLI no tiene permiso. Abre Spark y vuelve a intentar.')
        }
        throw new Error(`Fallo al ejecutar spark: ${msg.trim()}`)
    }
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

/** Extrae solo las cabeceras del mensaje pedido. El cuerpo se descarta aquí. */
function parseHeaders(threadOut, wantedId) {
    const blocks = threadOut.split(/^\s{2}ID:\s*/m).slice(1)
    for (const block of blocks) {
        const id = block.split('\n')[0].trim()
        if (id !== wantedId) continue
        const grab = (label) => {
            const m = block.match(new RegExp(`^\\s{2}${label}:\\s*(.+)$`, 'm'))
            return m ? m[1].trim() : null
        }
        const from = grab('From')
        if (!from) return null
        // Formatos: 'Nombre <correo>' o solo 'correo'
        const withName = from.match(/^"?(.*?)"?\s*<([^>]+)>$/)
        return {
            message_id: id,
            from_name: withName ? withName[1].trim() || null : null,
            from_email: (withName ? withName[2] : from).trim().toLowerCase(),
            subject: grab('Subject') || '(sin asunto)',
            date: grab('Date'),
        }
    }
    return null
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

    const rows = []
    for (const id of ids) {
        try {
            const threadOut = await spark(['thread', id])
            const h = parseHeaders(threadOut, id)
            if (!h) continue
            // La cuenta destino aparece en el bloque; si no, se usa la primera.
            const toLine = threadOut.match(new RegExp(`^\\s{2}ID:\\s*${id}[\\s\\S]*?^\\s{2}To:\\s*(.+)$`, 'm'))
            const account = accounts.find((a) => toLine?.[1]?.toLowerCase().includes(a.toLowerCase())) || defaultAccount
            rows.push({
                message_id: h.message_id,
                account,
                from_name: h.from_name,
                from_email: h.from_email,
                subject: h.subject,
                sent_at: toIso(h.date),
            })
        } catch (e) {
            console.warn(`  · no se pudo leer el correo ${id}: ${e.message}`)
        }
    }

    if (rows.length === 0) {
        console.log('No se pudo extraer ninguna cabecera.')
        return
    }

    // Se cruza con los clientes para saber de quién viene.
    const clientsRes = await sb('clients?select=id,email&email=not.is.null')
    const clients = clientsRes.ok ? await clientsRes.json() : []
    const byEmail = new Map(clients.map((c) => [String(c.email).toLowerCase().trim(), c.id]))
    for (const r of rows) r.client_id = byEmail.get(r.from_email) ?? null

    // El filtro de ruido se aplica al leer, no aquí: así mejorar las reglas
    // también reclasifica lo ya sincronizado, en vez de congelar el veredicto.
    if (DRY) {
        console.log('\n--- prueba en seco, no se sube nada ---')
        for (const r of rows) {
            console.log(`  ${r.sent_at.slice(0, 10)}  ${r.from_email.padEnd(34)} ${r.client_id ? '[CLIENTE] ' : ''}${r.subject}`)
        }
        console.log(`\n${rows.length} correos. De clientes conocidos: ${rows.filter((r) => r.client_id).length}`)
        return
    }

    // upsert: no duplica si ya se sincronizó antes.
    const res = await sb('inbox_items?on_conflict=account,message_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(rows.map((r) => ({ ...r, synced_at: new Date().toISOString() }))),
    })
    if (!res.ok) {
        console.error('Error al subir:', res.status, await res.text())
        process.exit(1)
    }
    const saved = await res.json()
    console.log(`Listo: ${saved.length} correos sincronizados (${rows.filter((r) => r.client_id).length} de clientes conocidos).`)
}

main().catch((e) => {
    console.error(e.message)
    process.exit(1)
})
