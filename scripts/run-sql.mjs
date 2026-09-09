#!/usr/bin/env node
// Ejecuta un archivo .sql directamente contra Postgres (Supabase), para
// migraciones (ALTER TABLE, CREATE TABLE, etc.) que la clave anon no puede
// hacer. Requiere SUPABASE_DB_URL en el entorno (ver .env.local).
//
// Uso:
//   node --env-file=.env.local scripts/run-sql.mjs schema_update_algo.sql

import { readFile } from 'node:fs/promises'
import { Client } from 'pg'

const file = process.argv[2]
if (!file) {
    console.error('Uso: node --env-file=.env.local scripts/run-sql.mjs <archivo.sql>')
    process.exit(1)
}

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
    console.error('Falta SUPABASE_DB_URL en el entorno (revisa .env.local).')
    process.exit(1)
}

const sql = await readFile(file, 'utf8')

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
    await client.query(sql)
    console.log(`OK: ${file} ejecutado correctamente.`)
} catch (e) {
    console.error(`ERROR ejecutando ${file}:`, e instanceof Error ? e.message : e)
    process.exitCode = 1
} finally {
    await client.end()
}
