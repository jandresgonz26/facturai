/**
 * Catálogo de servicios (schema_update_servicios.sql): mis paquetes mensuales, los servicios adicionales y la
 * política de cambios. Sin dependencias de servidor: lo usan la página /servicios, las cotizaciones y las propuestas.
 */
import { itemVacio, type ItemPrecio } from '@/lib/propuestas/precios'

export type TipoServicio = 'paquete' | 'adicional' | 'politica'
export type UnidadServicio = 'mes' | 'unico' | 'hora' | 'porcentaje' | 'ninguna'

export type Servicio = {
    id: string
    tipo: TipoServicio
    nombre: string
    precio: number | null
    /** Con `precio`, un rango orientativo: «200–350 €». */
    precio_max: number | null
    unidad: UnidadServicio
    moneda: 'USD' | 'EUR'
    resumen: string | null
    incluye: string[]
    no_incluye: string[]
    orden: number
    activo: boolean
}

export const UNIDADES: { id: UnidadServicio; label: string }[] = [
    { id: 'mes', label: 'Al mes' },
    { id: 'unico', label: 'Pago único' },
    { id: 'hora', label: 'Por hora' },
    { id: 'porcentaje', label: '% sobre el paquete' },
]

const num = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' }).format(n)
const simbolo = (m: Servicio['moneda']) => (m === 'EUR' ? '€' : '$')

/** «55 €/mes», «200–350 € · pago único», «40–50 €/hora», «+30–60 % del paquete». */
export function precioTexto(s: Pick<Servicio, 'precio' | 'precio_max' | 'unidad' | 'moneda'>): string {
    if (s.precio === null) return 'A convenir'
    const valor = s.precio_max !== null && s.precio_max !== s.precio ? `${num(s.precio)}–${num(s.precio_max)}` : num(s.precio)
    if (s.unidad === 'porcentaje') return `+${valor} % del paquete`
    const m = simbolo(s.moneda)
    return s.unidad === 'mes' ? `${valor} ${m}/mes` : s.unidad === 'hora' ? `${valor} ${m}/hora` : s.unidad === 'unico' ? `${valor} ${m} · pago único` : `${valor} ${m}`
}

/** Línea de la tabla de precios de una propuesta a partir de un servicio del catálogo (con rango, el precio mínimo). */
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

/** Línea de una cotización: el nombre y lo que incluye van en la descripción (el «Servicio» es la categoría de facturación). */
export function aItemCotizacion(s: Servicio): { description: string; quantity: string; unit_price: string } {
    const incluye = s.incluye.length ? ` Incluye: ${s.incluye.join('; ')}.` : ''
    return {
        description: `${s.nombre}${s.unidad === 'mes' ? ' (mensual)' : ''}.${incluye}`.slice(0, 1000),
        quantity: '1',
        unit_price: s.precio === null || s.unidad === 'porcentaje' ? '' : String(s.precio),
    }
}
