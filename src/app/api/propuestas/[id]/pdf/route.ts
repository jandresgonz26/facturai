import { NextResponse, type NextRequest } from 'next/server'
import { leerPropuesta, pdfDe } from '@/lib/propuestas/datos'
import { respuestaPdf } from '@/lib/propuestas/respuesta-pdf'

export const runtime = 'nodejs'

/** PDF desde el panel (también en borrador). Protegido por la sesión (proxy.ts). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const p = await leerPropuesta((await params).id)
        return respuestaPdf(await pdfDe(p), req.nextUrl.searchParams.has('ver'))
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'No se pudo generar el PDF' }, { status: 400 })
    }
}
