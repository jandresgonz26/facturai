import { NextResponse, type NextRequest } from 'next/server'
import { aceptarPropuesta } from '@/lib/propuestas/datos'
import { ActionError } from '@/lib/actions/validation'

/** El cliente acepta la propuesta desde su enlace. El servidor vuelve a calcular todo a partir de su elección. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const body = (await req.json().catch(() => null)) as { nombre?: unknown; opcion_id?: unknown; extras_ids?: unknown } | null
    try {
        await aceptarPropuesta(token, {
            nombre: typeof body?.nombre === 'string' ? body.nombre : '',
            opcion_id: typeof body?.opcion_id === 'string' ? body.opcion_id : '',
            extras_ids: Array.isArray(body?.extras_ids) ? body.extras_ids.filter((x): x is string => typeof x === 'string').slice(0, 30) : [],
        })
        return NextResponse.json({ ok: true })
    } catch (e) {
        const mensaje = e instanceof ActionError ? e.message : 'No se pudo registrar la aceptación. Inténtalo de nuevo.'
        if (!(e instanceof ActionError)) console.error('[propuestas] aceptar', e)
        return NextResponse.json({ ok: false, mensaje }, { status: 400 })
    }
}
