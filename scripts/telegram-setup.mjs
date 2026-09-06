#!/usr/bin/env node
/**
 * Registra el webhook del bot de Telegram apuntando a esta app.
 *   node scripts/telegram-setup.mjs https://tu-dominio.com
 * Lee TELEGRAM_BOT_TOKEN y TELEGRAM_WEBHOOK_SECRET de .env.local (o del entorno).
 */
import fs from 'node:fs'

const base = process.argv[2]
if (!base) {
    console.error('Uso: node scripts/telegram-setup.mjs https://tu-dominio.com')
    process.exit(1)
}
if (fs.existsSync('.env.local')) {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
        const i = line.indexOf('=')
        if (i > 0 && !line.startsWith('#')) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
    }
}
const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
if (!token || !secret) {
    console.error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_WEBHOOK_SECRET')
    process.exit(1)
}
const api = (m, body) =>
    fetch(`https://api.telegram.org/bot${token}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())

const me = await api('getMe', {})
console.log('Bot:', me.ok ? `@${me.result.username}` : me)
const url = `${base.replace(/\/$/, '')}/api/telegram`
const hook = await api('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true })
console.log('setWebhook:', hook.ok ? `OK → ${url}` : hook)
const cmds = await api('setMyCommands', {
    commands: [
        { command: 'pendiente', description: 'Qué tengo pendiente hoy' },
        { command: 'nuevo', description: 'Empezar conversación de cero' },
        { command: 'ayuda', description: 'Cómo usar el asistente' },
    ],
})
console.log('setMyCommands:', cmds.ok ? 'OK' : cmds)
const info = await api('getWebhookInfo', {})
console.log('Webhook info:', JSON.stringify(info.result, null, 2))
