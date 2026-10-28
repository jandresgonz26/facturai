/**
 * Catálogo de servicios (schema_update_servicios.sql + schema_update_servicios_areas.sql), en tres niveles:
 *   Área (Marketing digital, Desarrollo web, Diseño gráfico…) → Categoría (las mismas de facturación) → Servicio.
 * Cada servicio tiene su forma de cobro (mensual, pago único, por horas) y los paquetes van destacados.
 * Sin dependencias de servidor: lo usan la página /servicios, las cotizaciones y las propuestas.
 */
import { itemVacio, type ItemPrecio } from '@/lib/propuestas/precios'

export type UnidadServicio = 'mes' | 'unico' | 'hora' | 'porcentaje' | 'ninguna'

export type Area = { id: string; nombre: string; color: string; orden: number }
/** Categoría de facturación (su nombre sale en las facturas) con su área y sus condiciones. */
export type Categoria = { id: string; name: string; area_id: string | null; nota: string | null; orden: number }

export type Servicio = {
    id: string
    category_id: string | null
    nombre: string
    precio: number | null
    /** Con `precio`, un rango orientativo: «200–350 €». */
    precio_max: number | null
    unidad: UnidadServicio
    moneda: 'USD' | 'EUR'
    resumen: string | null
    incluye: string[]
    no_incluye: string[]
    /** Paquete o servicio estrella: sale arriba y en tarjeta. */
    destacado: boolean
    orden: number
    activo: boolean
}

export type Catalogo = { areas: Area[]; categorias: Categoria[]; servicios: Servicio[] }

export const UNIDADES: { id: UnidadServicio; label: string; corto: string }[] = [
    { id: 'mes', label: 'Mensual', corto: 'Mensual' },
    { id: 'unico', label: 'Pago único', corto: 'Pago único' },
    { id: 'hora', label: 'Por horas', corto: 'Por horas' },
    { id: 'porcentaje', label: '% sobre un paquete', corto: '% del paquete' },
]
export const unidadLabel = (u: UnidadServicio) => UNIDADES.find((x) => x.id === u)?.corto ?? ''

const num = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' }).format(n)
const simbolo = (m: Servicio['moneda']) => (m === 'EUR' ? '€' : '$')

/** «55 €/mes», «200–350 €», «40–50 €/hora», «+30–60 % del paquete». */
export function precioTexto(s: Pick<Servicio, 'precio' | 'precio_max' | 'unidad' | 'moneda'>): string {
    if (s.precio === null) return 'A convenir'
    const valor = s.precio_max !== null && s.precio_max !== s.precio ? `${num(s.precio)}–${num(s.precio_max)}` : num(s.precio)
    if (s.unidad === 'porcentaje') return `+${valor} % del paquete`
    const m = simbolo(s.moneda)
    return s.unidad === 'mes' ? `${valor} ${m}/mes` : s.unidad === 'hora' ? `${valor} ${m}/hora` : `${valor} ${m}`
}

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Búsqueda tolerante (sin tildes ni mayúsculas) en el nombre, la descripción, lo que incluye y su categoría y área. */
export function coincide(s: Servicio, q: string, cat?: Categoria, area?: Area): boolean {
    const palabras = plano(q).split(/\s+/).filter(Boolean)
    if (palabras.length === 0) return true
    const texto = plano([s.nombre, s.resumen ?? '', ...s.incluye, cat?.name ?? '', area?.nombre ?? ''].join(' '))
    return palabras.every((p) => texto.includes(p))
}

/** Orden de lectura: áreas por su orden, categorías por su orden y nombre, y dentro, destacados primero. */
export function agrupar(c: Catalogo, servicios: Servicio[]) {
    const porCat = new Map<string, Servicio[]>()
    for (const s of servicios) porCat.set(s.category_id ?? '', [...(porCat.get(s.category_id ?? '') ?? []), s])
    const ordenar = (xs: Servicio[]) => [...xs].sort((a, b) => Number(b.destacado) - Number(a.destacado) || a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    const cats = (areaId: string | null) => c.categorias.filter((k) => k.area_id === areaId).sort((a, b) => a.orden - b.orden || a.name.localeCompare(b.name, 'es'))
    const areas = [...c.areas].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    return [
        ...areas.map((a) => ({ area: a as Area | null, categorias: cats(a.id).map((k) => ({ categoria: k as Categoria | null, servicios: ordenar(porCat.get(k.id) ?? []) })) })),
        {
            area: null,
            categorias: [
                ...cats(null).map((k) => ({ categoria: k as Categoria | null, servicios: ordenar(porCat.get(k.id) ?? []) })),
                { categoria: null, servicios: ordenar(porCat.get('') ?? []) },
            ],
        },
    ]
}

/** Línea de la tabla de precios de una propuesta (con rango, el precio mínimo y la nota «orientativo»). */
export function aItemPropuesta(s: Servicio): ItemPrecio {
    const rango = s.precio_max !== null && s.precio !== null && s.precio_max !== s.precio
    if (s.unidad === 'porcentaje') return itemVacio({ servicio: s.nombre, descripcion: `${precioTexto(s)}. ${s.resumen ?? ''}`.trim(), a_convenir: true })
    return itemVacio({
        servicio: s.nombre,
        descripcion: [s.resumen, rango ? `Precio orientativo: ${precioTexto(s)}.` : null].filter(Boolean).join(' '),
        precio: s.precio ?? 0,
        a_convenir: s.precio === null,
        frecuencia: s.unidad === 'mes' ? 'mensual' : 'unico',
        unidad: s.unidad === 'hora' ? 'horas' : '',
    })
}

/** Línea de una cotización: su categoría de facturación como «Servicio» y el nombre y lo que incluye en la descripción. */
export function aItemCotizacion(s: Servicio, categoria?: string): { service: string; description: string; quantity: string; unit_price: string } {
    const incluye = s.incluye.length ? ` Incluye: ${s.incluye.join('; ')}.` : ''
    return {
        service: categoria ?? '',
        description: `${s.nombre}${s.unidad === 'mes' ? ' (mensual)' : ''}.${incluye}`.slice(0, 1000),
        quantity: '1',
        unit_price: s.precio === null || s.unidad === 'porcentaje' ? '' : String(s.precio),
    }
}
