#!/usr/bin/env node
// Exporta la base de FacturAI completa (estructura + datos) a la carpeta migracion/,
// para mudarla a otro proyecto de Supabase. Solo lee; no modifica nada ni imprime credenciales.
//
// Uso:
//   node --env-file=.env.local scripts/exportar-db.mjs
//
// Genera:
//   migracion/estructura.json  tablas, columnas, claves, índices, funciones, triggers, políticas, tipos, secuencias, vistas
//   migracion/datos/<tabla>.jsonl  una fila JSON por línea
//   migracion/resumen.json     conteo de filas por tabla, archivos de Storage y usuarios

import { mkdir, writeFile } from 'node:fs/promises'
import pg from 'pg'

const OUT = 'migracion'
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})
const q = async (sql, params = []) => (await c.query(sql, params)).rows

try {
  await c.connect()
  await mkdir(`${OUT}/datos`, { recursive: true })

  const tablas = await q(`
    select c.relname as nombre, c.relrowsecurity as rls, obj_description(c.oid) as comentario
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by c.relname`)

  const estructura = { tablas: [], tipos: [], funciones: [], triggers: [], politicas: [], secuencias: [], vistas: [], extensiones: [] }

  for (const t of tablas) {
    const columnas = await q(`
      select a.attname as nombre, format_type(a.atttypid, a.atttypmod) as tipo, a.attnotnull as no_nulo,
             pg_get_expr(d.adbin, d.adrelid) as valor_defecto, a.attidentity as identidad, a.attgenerated as generada
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = ('public.' || quote_ident($1))::regclass and a.attnum > 0 and not a.attisdropped
      order by a.attnum`, [t.nombre])
    const restricciones = await q(`
      select conname as nombre, contype as tipo, pg_get_constraintdef(oid) as definicion
      from pg_constraint where conrelid = ('public.' || quote_ident($1))::regclass order by contype, conname`, [t.nombre])
    const indices = await q(`
      select indexname as nombre, indexdef as definicion from pg_indexes
      where schemaname = 'public' and tablename = $1
        and indexname not in (select conname from pg_constraint where conrelid = ('public.' || quote_ident($1))::regclass)`, [t.nombre])
    estructura.tablas.push({ ...t, columnas, restricciones, indices })

    // Datos: una fila JSON por línea, con los tipos tal como los devuelve Postgres
    const filas = await q(`select to_jsonb(x)::text as fila from public.${quoteIdent(t.nombre)} x`)
    await writeFile(`${OUT}/datos/${t.nombre}.jsonl`, filas.map((r) => r.fila).join('\n') + (filas.length ? '\n' : ''))
    t.filas = filas.length
  }

  estructura.tipos = await q(`
    select t.typname as nombre, array_agg(e.enumlabel order by e.enumsortorder) as valores
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' group by t.typname`)
  estructura.funciones = await q(`
    select p.proname as nombre, pg_get_functiondef(p.oid) as definicion
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')`)
  estructura.triggers = await q(`
    select t.tgname as nombre, c.relname as tabla, pg_get_triggerdef(t.oid) as definicion
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal`)
  estructura.politicas = await q(`
    select tablename as tabla, policyname as nombre, cmd as comando, roles, permissive as permisiva, qual as usando, with_check as con_verificacion
    from pg_policies where schemaname = 'public'`)
  estructura.secuencias = await q(`select sequencename as nombre, last_value as ultimo_valor from pg_sequences where schemaname = 'public'`)
  estructura.vistas = await q(`select viewname as nombre, definition as definicion from pg_views where schemaname = 'public'`)
  estructura.extensiones = (await q(`select extname from pg_extension order by 1`)).map((r) => r.extname)

  const buckets = await q(`select id, name as nombre, public as publico from storage.buckets`)
  const archivos = await q(`select bucket_id as bucket, name as nombre, metadata->>'size' as bytes, metadata->>'mimetype' as tipo from storage.objects`)
  const usuarios = await q(`select email, created_at from auth.users order by created_at`)

  const resumen = {
    exportado: new Date().toISOString(),
    tamano_db: (await q(`select pg_size_pretty(pg_database_size(current_database())) s`))[0].s,
    tablas: Object.fromEntries(tablas.map((t) => [t.nombre, t.filas])),
    buckets, archivos, usuarios,
  }
  await writeFile(`${OUT}/estructura.json`, JSON.stringify(estructura, null, 2))
  await writeFile(`${OUT}/resumen.json`, JSON.stringify(resumen, null, 2))

  console.log(`Exportado en ${OUT}/ · ${tablas.length} tablas, ${Object.values(resumen.tablas).reduce((a, b) => a + b, 0)} filas`)
  for (const t of tablas) console.log('  ' + t.nombre.padEnd(24) + String(t.filas).padStart(6) + ' filas')
  console.log(`  funciones ${estructura.funciones.length} · triggers ${estructura.triggers.length} · políticas ${estructura.politicas.length} · tipos ${estructura.tipos.length} · vistas ${estructura.vistas.length}`)
  console.log(`  Storage: ${archivos.length} archivos en ${buckets.length} bucket(s) · usuarios: ${usuarios.length}`)
} catch (e) {
  console.log('ERROR:', e.message)
  process.exitCode = 1
} finally {
  await c.end().catch(() => {})
}

function quoteIdent(s) { return '"' + s.replace(/"/g, '""') + '"' }
