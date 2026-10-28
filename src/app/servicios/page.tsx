import { listarCatalogo } from '@/lib/servicios/datos'
import { Catalogo } from './Catalogo'

export const dynamic = 'force-dynamic'

/** Mis servicios: paquetes mensuales, servicios adicionales y la política de cambios. Solo mis precios. */
export default async function PaginaServicios() {
    let catalogo: Awaited<ReturnType<typeof listarCatalogo>> = { areas: [], categorias: [], servicios: [] }
    let error: string | null = null
    try {
        catalogo = await listarCatalogo()
    } catch (e) {
        error = e instanceof Error ? e.message : String(e)
    }
    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <header>
                <h1 className="font-display text-2xl font-bold">Servicios</h1>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">Mi lista de precios por área y categoría. Los destacados (★) son los paquetes; todo se puede elegir al armar una cotización o una propuesta.</p>
            </header>
            {error ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm">
                    <p className="font-medium">No se pudo cargar el catálogo.</p>
                    <p className="mt-1 text-muted-foreground">{/service_areas|area_id|category_id|destacado/.test(error) ? 'Falta organizar el catálogo por áreas: ejecuta schema_update_servicios_areas.sql en el SQL Editor de Supabase.' : /servicios/.test(error) ? 'Falta crear la tabla: ejecuta schema_update_servicios.sql en el SQL Editor de Supabase.' : error}</p>
                </div>
            ) : <Catalogo inicial={catalogo} />}
        </div>
    )
}
