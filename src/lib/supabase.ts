import { createBrowserClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

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
function makeClient(): SupabaseClient {
    if (typeof window === 'undefined') {
        const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey
        return createClient(supabaseUrl, serverKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
    }
    return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = makeClient()
