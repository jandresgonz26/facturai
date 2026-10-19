import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'

const TIPOS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' }

/**
 * Imágenes del editor de propuestas → bucket público «propuestas» (nombre aleatorio). Solo PNG y JPG,
 * que son los que también entran en el PDF. Protegida por la sesión (proxy.ts).
 */
export async function POST(req: NextRequest) {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'No llegó ninguna imagen.' }, { status: 400 })
    const ext = TIPOS[file.type]
    if (!ext) return NextResponse.json({ ok: false, error: 'Usa imágenes PNG o JPG (son las que también salen en el PDF).' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'La imagen pesa más de 5 MB.' }, { status: 400 })
    const ruta = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('propuestas').upload(ruta, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (error) return NextResponse.json({ ok: false, error: `No se pudo subir la imagen: ${error.message}` }, { status: 500 })
    const { data } = supabase.storage.from('propuestas').getPublicUrl(ruta)
    return NextResponse.json({ ok: true, url: data.publicUrl })
}
