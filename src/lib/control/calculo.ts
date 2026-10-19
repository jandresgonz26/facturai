/**
 * Cuentas del control interno de un proyecto, sin dependencias de servidor:
 * - Los abonos del cliente se aplican a las cuotas en orden (la primera sin pagar recibe primero),
 *   así se sabe «Cuota 2 completada, faltan $X de la 3» sin cuadrarlo a mano.
 * - Por programador: lo acordado, lo pagado, lo que falta y lo que le toca «al ritmo» de lo cobrado
 *   (si el cliente ha pagado el 50 %, al programador le corresponde el 50 % de lo acordado).
 * - Margen previsto (todo lo que se cobra − todo lo acordado) y margen de hoy (cobrado − pagado).
 */

export type Cuota = { id: string; orden: number; concepto: string; monto: number; vence: string | null; detalle: string | null; extra: boolean }
export type Acuerdo = { id: string; proveedor: string; concepto: string; monto: number; estado: 'acordado' | 'por_confirmar'; fecha: string; detalle: string | null; archivo_path: string | null; archivo_nombre: string | null }
export type Movimiento = { id: string; lado: 'cliente' | 'proveedor'; proveedor: string | null; fecha: string; monto: number; metodo: string | null; nota: string | null }

export type EstadoCuota = 'pagada' | 'parcial' | 'vencida' | 'pendiente'
export type CuotaCalculada = Cuota & { aplicado: number; falta: number; estado: EstadoCuota; pagadaEl: string | null }

export type CuentaProveedor = {
    proveedor: string
    acuerdos: Acuerdo[]
    pagos: Movimiento[]
    acordado: number
    porConfirmar: number
    pagado: number
    falta: number
    /** Lo que le correspondería hoy según lo que ya pagó el cliente, menos lo ya pagado (≥ 0). */
    alRitmo: number
}

export type Resumen = {
    cuotas: CuotaCalculada[]
    abonos: Movimiento[]
    totalCobrar: number
    cobrado: number
    porCobrar: number
    /** Si el cliente pagó de más. */
    aFavor: number
    proximaCuota: CuotaCalculada | null
    proveedores: CuentaProveedor[]
    totalPagar: number
    porConfirmar: number
    pagado: number
    porPagar: number
    margenPrevisto: number
    margenHoy: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const hoy = () => new Date().toISOString().slice(0, 10)

export function calcular(cuotas: Cuota[], acuerdos: Acuerdo[], movimientos: Movimiento[]): Resumen {
    const ordenadas = [...cuotas].sort((a, b) => a.orden - b.orden || a.concepto.localeCompare(b.concepto))
    const abonos = movimientos.filter((m) => m.lado === 'cliente').sort((a, b) => a.fecha.localeCompare(b.fecha))
    const cobrado = r2(abonos.reduce((s, m) => s + Number(m.monto), 0))

    // Aplicación en orden, recordando con qué abono se completó cada cuota.
    let disponible = cobrado
    const acumuladoPorFecha = abonos.map((a, i) => ({ fecha: a.fecha, total: r2(abonos.slice(0, i + 1).reduce((s, m) => s + Number(m.monto), 0)) }))
    let necesario = 0
    const calc: CuotaCalculada[] = ordenadas.map((c) => {
        const monto = Number(c.monto)
        const aplicado = r2(Math.min(monto, Math.max(0, disponible)))
        disponible = r2(disponible - aplicado)
        necesario = r2(necesario + monto)
        const falta = r2(monto - aplicado)
        const pagadaEl = falta <= 0.005 ? acumuladoPorFecha.find((x) => x.total >= necesario - 0.005)?.fecha ?? null : null
        const estado: EstadoCuota = falta <= 0.005 ? 'pagada' : aplicado > 0 ? 'parcial' : c.vence && c.vence < hoy() ? 'vencida' : 'pendiente'
        return { ...c, monto, aplicado, falta, estado, pagadaEl }
    })
    const totalCobrar = r2(calc.reduce((s, c) => s + c.monto, 0))
    const porCobrar = r2(Math.max(0, totalCobrar - cobrado))
    const aFavor = r2(Math.max(0, cobrado - totalCobrar))
    const avance = totalCobrar > 0 ? Math.min(1, cobrado / totalCobrar) : 0

    const nombres = [...new Set([...acuerdos.map((a) => a.proveedor.trim()), ...movimientos.filter((m) => m.lado === 'proveedor').map((m) => (m.proveedor ?? '').trim())].filter(Boolean))]
    const proveedores: CuentaProveedor[] = nombres.map((proveedor) => {
        const suyos = acuerdos.filter((a) => a.proveedor.trim() === proveedor).sort((a, b) => a.fecha.localeCompare(b.fecha))
        const pagos = movimientos.filter((m) => m.lado === 'proveedor' && (m.proveedor ?? '').trim() === proveedor).sort((a, b) => a.fecha.localeCompare(b.fecha))
        const acordado = r2(suyos.filter((a) => a.estado === 'acordado').reduce((s, a) => s + Number(a.monto), 0))
        const porConfirmar = r2(suyos.filter((a) => a.estado === 'por_confirmar').reduce((s, a) => s + Number(a.monto), 0))
        const pagado = r2(pagos.reduce((s, m) => s + Number(m.monto), 0))
        return { proveedor, acuerdos: suyos, pagos, acordado, porConfirmar, pagado, falta: r2(acordado - pagado), alRitmo: r2(Math.max(0, acordado * avance - pagado)) }
    })
    const totalPagar = r2(proveedores.reduce((s, p) => s + p.acordado, 0))
    const pagado = r2(proveedores.reduce((s, p) => s + p.pagado, 0))

    return {
        cuotas: calc,
        abonos,
        totalCobrar,
        cobrado,
        porCobrar,
        aFavor,
        proximaCuota: calc.find((c) => c.estado !== 'pagada') ?? null,
        proveedores,
        totalPagar,
        porConfirmar: r2(proveedores.reduce((s, p) => s + p.porConfirmar, 0)),
        pagado,
        porPagar: r2(proveedores.reduce((s, p) => s + Math.max(0, p.falta), 0)),
        margenPrevisto: r2(totalCobrar - totalPagar),
        margenHoy: r2(cobrado - pagado),
    }
}

export function dinero(n: number, moneda: 'USD' | 'EUR' = 'USD'): string {
    const s = new Intl.NumberFormat('es-ES', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(n)
    return moneda === 'EUR' ? `${s} €` : `$${s}`
}
