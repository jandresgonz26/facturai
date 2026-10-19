import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { adjuntarArchivo } from '@/lib/control/datos'

export const runtime = 'nodejs'

/** Adjunta la propuesta del programador (PDF o imagen) a un acuerdo. Protegida por la sesión (proxy.ts). */
export async function POST(req: NextRequest) {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const acuerdo = String(form?.get('acuerdo') ?? '')
    const proyecto = String(form?.get('proyecto') ?? '')
    if (!(file instanceof File) || !acuerdo) return NextResponse.json({ ok: false, mensaje: 'Falta el archivo.' }, { status: 400 })
    try {
        await adjuntarArchivo(acuerdo, file)
        if (proyecto) revalidatePath(`/control/${proyecto}`)
        return NextResponse.json({ ok: true })
    } catch (e) {
        return NextResponse.json({ ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo subir.' }, { status: 400 })
    }
}
