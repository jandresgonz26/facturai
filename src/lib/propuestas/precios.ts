/**
 * Tabla de inversión de una propuesta: modelo y cálculo. Sin dependencias de servidor ni de React:
 * la usan el editor, la página pública (el cliente elige opción y extras en vivo), el PDF y la
 * aceptación (el servidor vuelve a calcular; nunca confía en los totales que manda el navegador).
 *
 * - Opciones (paquetes): una o varias; con varias, el cliente elige una al aceptar.
 * - Extras: ítems opcionales que el cliente marca él mismo.
 * - Ítems: cantidad × precio (con unidad: «20 horas × $25»), frecuencia, descuento propio,
 *   «incluido sin costo» o «a convenir» (no suman).
 * - Ajustes: descuento general (sobre el pago único, lo recurrente o ambos) e impuesto opcional.
 * - Plan de pagos: reparte el pago único en partes (50 % al firmar / 50 % al entregar).
 */

export type Frecuencia = 'unico' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
export const FRECUENCIAS: { id: Frecuencia; label: string; sufijo: string; meses: number }[] = [
    { id: 'unico', label: 'Pago único', sufijo: '', meses: 0 },
    { id: 'mensual', label: 'Mensual', sufijo: '/mes', meses: 1 },
    { id: 'trimestral', label: 'Trimestral', sufijo: '/trimestre', meses: 3 },
    { id: 'semestral', label: 'Semestral', sufijo: '/semestre', meses: 6 },
    { id: 'anual', label: 'Anual', sufijo: '/año', meses: 12 },
]
export const frecuencia = (f: Frecuencia) => FRECUENCIAS.find((x) => x.id === f) ?? FRECUENCIAS[0]

export type Descuento = { tipo: 'pct' | 'monto'; valor: number }

export type ItemPrecio = {
    id: string
    servicio: string
    descripcion: string
    cantidad: number
    /** «horas», «páginas», «meses»… Si hay unidad se muestra «20 horas × $25». */
    unidad: string
    precio: number
    frecuencia: Frecuencia
    descuento: Descuento | null
    /** Se muestra el precio normal tachado junto al precio con descuento. */
    tachado: boolean
    /** Incluido sin costo: se muestra como «Incluido» y no suma. */
    incluido: boolean
    /** Precio a convenir: se muestra así y no suma. */
    a_convenir: boolean
}

export type OpcionPrecio = { id: string; nombre: string; descripcion: string; recomendada: boolean; items: ItemPrecio[] }

export type Cuota = { id: string; concepto: string; pct: number }

export type Pricing = {
    titulo: string
    opciones: OpcionPrecio[]
    extras: ItemPrecio[]
    descuento: (Descuento & { motivo: string; aplica: 'unico' | 'recurrente' | 'ambos' }) | null
    impuesto: { nombre: string; pct: number } | null
    plan_pagos: Cuota[]
    nota: string
}

export type Moneda = 'USD' | 'EUR'

export const uid = () => Math.random().toString(36).slice(2, 10)
const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100

export function itemVacio(p: Partial<ItemPrecio> = {}): ItemPrecio {
    return { id: uid(), servicio: '', descripcion: '', cantidad: 1, unidad: '', precio: 0, frecuencia: 'unico', descuento: null, tachado: false, incluido: false, a_convenir: false, ...p }
}

export function opcionVacia(p: Partial<OpcionPrecio> = {}): OpcionPrecio {
    return { id: uid(), nombre: '', descripcion: '', recomendada: false, items: [itemVacio()], ...p }
}

export function pricingVacio(): Pricing {
    return { titulo: 'Inversión', opciones: [opcionVacia()], extras: [], descuento: null, impuesto: null, plan_pagos: [], nota: '' }
}

/** Normaliza lo que venga de la base o del navegador: nunca rompe, completa lo que falte. */
export function normalizarPricing(raw: unknown): Pricing {
    const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Pricing>
    const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d)
    const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')
    const desc = (d: unknown): Descuento | null => {
        const x = d as Descuento | null
        if (!x || (x.tipo !== 'pct' && x.tipo !== 'monto')) return null
        const valor = Math.max(0, num(x.valor))
        return valor > 0 ? { tipo: x.tipo, valor: x.tipo === 'pct' ? Math.min(100, valor) : valor } : null
    }
    const item = (i: Partial<ItemPrecio>): ItemPrecio => ({
        id: str(i.id, 40) || uid(),
        servicio: str(i.servicio, 200),
        descripcion: str(i.descripcion, 1000),
        cantidad: Math.max(0, num(i.cantidad, 1)),
        unidad: str(i.unidad, 40),
        precio: Math.max(0, num(i.precio)),
        frecuencia: FRECUENCIAS.some((f) => f.id === i.frecuencia) ? (i.frecuencia as Frecuencia) : 'unico',
        descuento: desc(i.descuento),
        tachado: !!i.tachado,
        incluido: !!i.incluido,
        a_convenir: !!i.a_convenir,
    })
    const opciones = (Array.isArray(p.opciones) ? p.opciones : []).slice(0, 6).map((o) => ({
        id: str(o?.id, 40) || uid(),
        nombre: str(o?.nombre, 120),
        descripcion: str(o?.descripcion, 600),
        recomendada: !!o?.recomendada,
        items: (Array.isArray(o?.items) ? o.items : []).slice(0, 60).map(item),
    }))
    const d = p.descuento as Pricing['descuento']
    const dBase = desc(d)
    return {
        titulo: str(p.titulo, 120) || 'Inversión',
        opciones: opciones.length ? opciones : [opcionVacia({ items: [] })],
        extras: (Array.isArray(p.extras) ? p.extras : []).slice(0, 30).map(item),
        descuento: dBase ? { ...dBase, motivo: str(d?.motivo, 160), aplica: d?.aplica === 'recurrente' || d?.aplica === 'ambos' ? d.aplica : 'unico' } : null,
        impuesto: p.impuesto && num(p.impuesto.pct) > 0 ? { nombre: str(p.impuesto.nombre, 40) || 'IVA', pct: Math.min(100, num(p.impuesto.pct)) } : null,
        plan_pagos: (Array.isArray(p.plan_pagos) ? p.plan_pagos : []).slice(0, 12).map((c) => ({ id: str(c?.id, 40) || uid(), concepto: str(c?.concepto, 160), pct: Math.max(0, Math.min(100, num(c?.pct))) })).filter((c) => c.pct > 0),
        nota: str(p.nota, 2000),
    }
}

// ─── Cálculo ──────────────────────────────────────────────────────────────────

export type LineaCalculada = {
    item: ItemPrecio
    /** cantidad × precio, antes del descuento del ítem. */
    bruto: number
    /** Lo que suma (0 si es incluido o a convenir). */
    neto: number
    esExtra: boolean
}

export type Bloque = { subtotal: number; descuento: number; impuesto: number; total: number }

export type Totales = {
    lineas: LineaCalculada[]
    unico: Bloque
    /** Por frecuencia (solo las que tienen algo). */
    recurrentes: { frecuencia: Frecuencia; bloque: Bloque }[]
    /** Lo recurrente llevado a un mes, para comparar y listar. */
    recurrenteMensual: number
    cuotas: { cuota: Cuota; monto: number }[]
    /** Las cuotas no suman 100 %. */
    planIncompleto: boolean
}

export function brutoItem(i: ItemPrecio): number {
    return r2(i.cantidad * i.precio)
}

export function netoItem(i: ItemPrecio): number {
    if (i.incluido || i.a_convenir) return 0
    const b = brutoItem(i)
    if (!i.descuento) return b
    const off = i.descuento.tipo === 'pct' ? (b * i.descuento.valor) / 100 : i.descuento.valor
    return r2(Math.max(0, b - off))
}

function bloque(subtotal: number, p: Pricing, tipo: 'unico' | 'recurrente', baseDescuentoMonto: number): Bloque {
    let descuento = 0
    const d = p.descuento
    if (d && subtotal > 0 && (d.aplica === 'ambos' || d.aplica === tipo)) {
        if (d.tipo === 'pct') descuento = r2((subtotal * d.valor) / 100)
        // Un monto fijo se reparte en proporción si aplica a varios bloques.
        else descuento = r2(Math.min(subtotal, baseDescuentoMonto > 0 ? (d.valor * subtotal) / baseDescuentoMonto : 0))
    }
    const base = r2(subtotal - descuento)
    const impuesto = p.impuesto ? r2((base * p.impuesto.pct) / 100) : 0
    return { subtotal: r2(subtotal), descuento, impuesto, total: r2(base + impuesto) }
}

/**
 * Totales de una opción con los extras elegidos. Si `opcionId` no existe, usa la recomendada (o la primera).
 */
export function calcular(p: Pricing, opcionId?: string | null, extrasIds: string[] = []): Totales {
    const opcion = opcionPorId(p, opcionId)
    const extrasSet = new Set(extrasIds)
    const lineas: LineaCalculada[] = [
        ...(opcion?.items ?? []).map((item) => ({ item, bruto: brutoItem(item), neto: netoItem(item), esExtra: false })),
        ...p.extras.filter((e) => extrasSet.has(e.id)).map((item) => ({ item, bruto: brutoItem(item), neto: netoItem(item), esExtra: true })),
    ]
    const sumaUnico = r2(lineas.filter((l) => l.item.frecuencia === 'unico').reduce((s, l) => s + l.neto, 0))
    const porFrecuencia = FRECUENCIAS.filter((f) => f.id !== 'unico').map((f) => ({ f: f.id, suma: r2(lineas.filter((l) => l.item.frecuencia === f.id).reduce((s, l) => s + l.neto, 0)) }))

    // Para repartir un descuento de monto fijo entre los bloques a los que aplica.
    const d = p.descuento
    const sumaRecurrente = porFrecuencia.reduce((s, x) => s + x.suma, 0)
    const baseMonto = !d || d.tipo !== 'monto' ? 0 : d.aplica === 'unico' ? sumaUnico : d.aplica === 'recurrente' ? sumaRecurrente : sumaUnico + sumaRecurrente

    const unico = bloque(sumaUnico, p, 'unico', baseMonto)
    const recurrentes = porFrecuencia.filter((x) => x.suma > 0).map((x) => ({ frecuencia: x.f, bloque: bloque(x.suma, p, 'recurrente', baseMonto) }))
    const recurrenteMensual = r2(recurrentes.reduce((s, r) => s + r.bloque.total / frecuencia(r.frecuencia).meses, 0))

    // Plan de pagos: la última cuota absorbe el redondeo para que la suma cuadre al céntimo.
    const plan = p.plan_pagos.filter((c) => c.pct > 0)
    const sumaPct = plan.reduce((s, c) => s + c.pct, 0)
    let acumulado = 0
    const cuotas = plan.map((cuota, i) => {
        const esUltima = i === plan.length - 1 && Math.abs(sumaPct - 100) < 0.001
        const monto = esUltima ? r2(unico.total - acumulado) : r2((unico.total * cuota.pct) / 100)
        acumulado = r2(acumulado + monto)
        return { cuota, monto }
    })
    return { lineas, unico, recurrentes, recurrenteMensual, cuotas, planIncompleto: plan.length > 0 && Math.abs(sumaPct - 100) >= 0.001 }
}

export function opcionPorId(p: Pricing, id?: string | null): OpcionPrecio | undefined {
    return p.opciones.find((o) => o.id === id) ?? p.opciones.find((o) => o.recomendada) ?? p.opciones[0]
}

/** ¿La tabla tiene algo que mostrar? (al menos un ítem con servicio o precio). */
export function tieneContenido(p: Pricing): boolean {
    return [...p.opciones.flatMap((o) => o.items), ...p.extras].some((i) => i.servicio.trim() || i.precio > 0)
}

// ─── Formato ──────────────────────────────────────────────────────────────────

export function dinero(n: number, moneda: Moneda): string {
    const s = new Intl.NumberFormat('es-ES', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2, useGrouping: true }).format(n)
    return moneda === 'EUR' ? `${s} €` : `$${s}`
}

/** «20 horas × $25» o «3 × $100»; vacío si la cantidad es 1 y no hay unidad. */
export function detalleCantidad(i: ItemPrecio, moneda: Moneda): string {
    if (i.a_convenir || i.incluido) return ''
    if (i.cantidad === 1 && !i.unidad) return ''
    const cant = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(i.cantidad)
    return `${cant}${i.unidad ? ` ${i.unidad}` : ''} × ${dinero(i.precio, moneda)}`
}

/** El precio de una línea tal como se muestra: «Incluido», «A convenir» o el monto con su frecuencia. */
export function precioLinea(i: ItemPrecio, moneda: Moneda): string {
    if (i.incluido) return 'Incluido'
    if (i.a_convenir) return 'A convenir'
    return `${dinero(netoItem(i), moneda)}${frecuencia(i.frecuencia).sufijo}`
}

export function textoDescuento(d: Descuento, moneda: Moneda): string {
    return d.tipo === 'pct' ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(d.valor)} %` : dinero(d.valor, moneda)
}
