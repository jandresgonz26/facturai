import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { registrarVista } from '@/lib/propuestas/datos'

/**
 * La página de la propuesta avisa que el cliente la abrió (desde el navegador, así las vistas previas de
 * WhatsApp o Telegram, que no ejecutan JavaScript, no cuentan). Si quien la abre es José con su sesión,
 * no se cuenta.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => req.cookies.getAll(), setAll: () => undefined },
    })
    const { data } = await sb.auth.getUser().catch(() => ({ data: { user: null } }))
    if (!data.user) await registrarVista(token).catch((e) => console.warn('[propuestas] vista', e))
    return NextResponse.json({ ok: true })
}
