#!/usr/bin/env node
// Crea (o restablece) el usuario con el que se entra a la app. No hay
// pantalla de registro a propósito: es una app de una sola persona y la
// cuenta se crea desde aquí, directamente en el esquema auth de Supabase.
//
// Uso:
//   node --env-file=.env.local scripts/create-user.mjs correo@dominio.com
//
// Imprime una contraseña temporal. Cámbiala en Ajustes → Seguridad.

import { randomBytes } from 'node:crypto'
import { Client } from 'pg'

const email = (process.argv[2] || '').trim().toLowerCase()
if (!email || !email.includes('@')) {
    console.error('Uso: node --env-file=.env.local scripts/create-user.mjs correo@dominio.com')
    process.exit(1)
}
const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
    console.error('Falta SUPABASE_DB_URL en el entorno (revisa .env.local).')
    process.exit(1)
}

// Legible pero no adivinable: 16 caracteres sin ambigüedades (0/O, 1/l).
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const password = Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join('')

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
    await client.query('begin')
    const existing = await client.query('select id from auth.users where email = $1', [email])
    let userId
    if (existing.rowCount) {
        userId = existing.rows[0].id
        await client.query(
            `update auth.users
                set encrypted_password = crypt($2, gen_salt('bf')),
                    email_confirmed_at = coalesce(email_confirmed_at, now()),
                    updated_at = now()
              where id = $1`,
            [userId, password]
        )
        console.log(`Usuario ya existía; contraseña restablecida para ${email}.`)
    } else {
        const inserted = await client.query(
            `insert into auth.users (
                instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user
             ) values (
                '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
                $1, crypt($2, gen_salt('bf')), now(),
                '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
                '', '', '', '', false
             ) returning id`,
            [email, password]
        )
        userId = inserted.rows[0].id
        await client.query(
            `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             values (gen_random_uuid(), $1::uuid, $2::text, jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true), 'email', now(), now(), now())`,
            [userId, String(userId), email]
        )
        console.log(`Usuario creado: ${email}`)
    }
    await client.query('commit')
    console.log(`Contraseña temporal: ${password}`)
    console.log('Cámbiala en Ajustes → Seguridad después de entrar.')
} catch (e) {
    await client.query('rollback')
    console.error('ERROR:', e instanceof Error ? e.message : e)
    process.exitCode = 1
} finally {
    await client.end()
}
