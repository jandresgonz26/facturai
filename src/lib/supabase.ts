import { createBrowserClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Desde octubre de 2026 FacturAI vive en el proyecto de Supabase de la web de JAM Tech,
// dentro de su propio esquema `facturai` (las tablas de la web siguen en `public`).
export const DB_SCHEMA = process.env.SUPABASE_DB_SCHEMA || 'facturai'

/**
 * Un solo `supabase` para toda la app, pero con dos caras:
 *
 * - En el navegador es un cliente con sesión (cookies): las peticiones van
 *   firmadas con el token del usuario que inició sesión, que es lo que las
 *   políticas RLS exigen desde que la base de datos se cerró.
 * - En el servidor (webhook de Telegram, cron, API del agente) no hay un
 *   usuario delante, así que usa la service role key, que salta RLS. Esa
 *   clave no lleva prefijo NEXT_PUBLIC y nunca llega al bundle del cliente.
 *   Si falta, cae a la clave anon: seguirá funcionando en local mientras las
 *   políticas estén abiertas, y fallará de forma visible cuando no lo estén.
 */
// El esquema es dinámico, por eso el tipo genérico lleva `string` y no el `"public"` por defecto.
function makeClient(): SupabaseClient<any, string, string> {
    if (typeof window === 'undefined') {
        const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey
        return createClient(supabaseUrl, serverKey, {
            db: { schema: DB_SCHEMA },
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
    }
    return createBrowserClient(supabaseUrl, supabaseAnonKey, { db: { schema: DB_SCHEMA } })
}

export const supabase = makeClient()
