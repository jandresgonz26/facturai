import { NextResponse, type NextRequest } from 'next/server'
import { pedirCambios } from '@/lib/propuestas/datos'
import { ActionError } from '@/lib/actions/validation'

/** El cliente deja un comentario pidiendo cambios; a José le llega por Telegram. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const body = (await req.json().catch(() => null)) as { mensaje?: unknown; nombre?: unknown } | null
    try {
        await pedirCambios(token, typeof body?.mensaje === 'string' ? body.mensaje : '', typeof body?.nombre === 'string' ? body.nombre : '')
        return NextResponse.json({ ok: true })
    } catch (e) {
        const mensaje = e instanceof ActionError ? e.message : 'No se pudo enviar tu comentario. Inténtalo de nuevo.'
        if (!(e instanceof ActionError)) console.error('[propuestas] cambios', e)
        return NextResponse.json({ ok: false, mensaje }, { status: 400 })
    }
}
