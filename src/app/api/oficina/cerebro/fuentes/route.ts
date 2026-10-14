/**
 * Añade fuentes al cerebro del proyecto activo: enlaces (uno por línea), archivos (PDF, imágenes, texto) y una
 * nota pegada. Cada una se procesa por separado: una que falla no impide las demás. Detrás de la sesión (proxy.ts).
 */
import { revalidatePath } from 'next/cache'
import { agregarArchivo, agregarNota, agregarUrl, listarFuentes } from '@/lib/agent/cerebro-fuentes'
import { proyectoActivo } from '@/lib/agent/proyecto-activo'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_BYTES = 8 * 1024 * 1024
const MAX_URLS = 5
const MAX_ARCHIVOS = 5

export async function POST(req: Request) {
    const form = await req.formData().catch(() => null)
    if (!form) return Response.json({ ok: false, error: 'Petición inválida (¿archivos de más de 8 MB?)' }, { status: 400 })
    const { id: proyecto } = await proyectoActivo()
    const urls = String(form.get('urls') ?? '').split(/[\n\s,]+/).map((u) => u.trim()).filter(Boolean).slice(0, MAX_URLS)
    const archivos = form.getAll('archivos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_ARCHIVOS)
    const nota = String(form.get('nota') ?? '').trim()
    if (archivos.reduce((s, f) => s + f.size, 0) > MAX_BYTES) return Response.json({ ok: false, error: 'Los archivos pesan más de 8 MB en total. Súbelos de a uno o comprime el PDF.' }, { status: 400 })

    const errores: string[] = []
    let agregadas = 0
    const intentar = async (fn: () => Promise<void>) => { try { await fn(); agregadas++ } catch (e) { errores.push(e instanceof Error ? e.message : 'Error desconocido') } }
    await Promise.all([
        ...urls.map((u) => intentar(() => agregarUrl(proyecto, u))),
        ...archivos.map((f) => intentar(async () => agregarArchivo(proyecto, { nombre: f.name, tipo: f.type || 'application/octet-stream', datos: new Uint8Array(await f.arrayBuffer()) }))),
        ...(nota.length >= 30 ? [intentar(() => agregarNota(proyecto, nota))] : nota ? [Promise.resolve(void errores.push('La nota es muy corta (escribe al menos una frase completa).'))] : []),
    ])
    revalidatePath('/oficina/cerebro')
    return Response.json({ ok: agregadas > 0, agregadas, errores, fuentes: await listarFuentes(proyecto) })
}
