import { NextResponse, type NextRequest } from 'next/server'
import { enlaceArchivo } from '@/lib/control/datos'

/** Abre el archivo de un acuerdo con un enlace firmado de 5 minutos (el bucket es privado). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        return NextResponse.redirect(await enlaceArchivo((await params).id))
    } catch (e) {
        return NextResponse.json({ ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo abrir.' }, { status: 404 })
    }
}
