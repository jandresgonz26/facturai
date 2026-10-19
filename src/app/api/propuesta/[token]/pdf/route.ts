import { NextResponse, type NextRequest } from 'next/server'
import { pdfDe, propuestaPublica } from '@/lib/propuestas/datos'
import { respuestaPdf } from '@/lib/propuestas/respuesta-pdf'

export const runtime = 'nodejs'

/** «Descargar PDF» en la página del cliente. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const p = await propuestaPublica((await params).token)
    if (!p) return NextResponse.json({ ok: false, error: 'No encontrada' }, { status: 404 })
    return respuestaPdf(await pdfDe(p))
}
