import { NextRequest } from 'next/server'
import { transcribeAudio } from '@/lib/agent/transcribe'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
    const form = await req.formData()
    const file = form.get('audio')
    if (!(file instanceof Blob) || file.size === 0) {
        return Response.json({ error: 'No se recibió audio' }, { status: 400 })
    }
    if (file.size > 20 * 1024 * 1024) {
        return Response.json({ error: 'El audio es demasiado largo' }, { status: 413 })
    }
    const result = await transcribeAudio(new Uint8Array(await file.arrayBuffer()))
    if (!result.ok) return Response.json({ error: result.error }, { status: 422 })
    return Response.json({ text: result.text })
}
