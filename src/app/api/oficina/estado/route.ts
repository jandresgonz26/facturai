import { NextResponse } from 'next/server'
import { estadoOficina } from '@/lib/agent/eventos'

export const dynamic = 'force-dynamic'

/** Estado de la oficina para la vista 3D: qué hace cada departamento y la actividad reciente. Requiere sesión (proxy). */
export async function GET() {
    try {
        return NextResponse.json({ ok: true, ...(await estadoOficina()) })
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'No se pudo leer la oficina' }, { status: 500 })
    }
}
