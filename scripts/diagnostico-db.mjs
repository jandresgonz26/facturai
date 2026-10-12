#!/usr/bin/env node
// Diagnóstico de solo lectura de la base de FacturAI: conexión, tamaño y filas por tabla.
// No modifica nada ni imprime credenciales.
//
// Uso:
//   node --env-file=.env.local scripts/diagnostico-db.mjs

import pg from 'pg'

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

try {
  await c.connect()
  const q = async (s) => (await c.query(s)).rows
  console.log('Conectado. Solo lectura:', (await q('show transaction_read_only'))[0].transaction_read_only)
  console.log('Tamaño de la base:', (await q('select pg_size_pretty(pg_database_size(current_database())) s'))[0].s)
  const rows = await q(`
    select c.relname t, c.reltuples::bigint est, pg_size_pretty(pg_total_relation_size(c.oid)) sz
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname = 'public'
    order by pg_total_relation_size(c.oid) desc`)
  for (const r of rows) console.log(r.t.padEnd(28), String(r.est).padStart(8), r.sz)
  const st = (await q("select count(*) n, pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) s from storage.objects"))[0]
  console.log('Archivos en Storage:', st.n, '·', st.s)
  console.log('Usuarios de Auth:', (await q('select count(*) n from auth.users'))[0].n)
} catch (e) {
  console.log('ERROR:', e.message)
} finally {
  await c.end().catch(() => {})
}
