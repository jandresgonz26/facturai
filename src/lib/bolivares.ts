/**
 * Facturas en bolívares: la plataforma trabaja en USD, pero a los clientes con
 * invoice_currency = 'VES' la factura se les emite solo en Bs. Aquí están las
 * cuentas que comparten el PDF, el DOCX, los correos y la pantalla.
 *
 * Sin dependencias de servidor: se usa tanto en el navegador como en el bot.
 */

interface BolivarInvoiceLike {
    total_amount: number
    ves_rate?: number | null
    ves_total?: number | null
}

/** La factura se emite en bolívares (tiene su total en Bs fijado). */
export function isBolivarInvoice(invoice: BolivarInvoiceLike): boolean {
    return invoice.ves_total != null && Number(invoice.total_amount) > 0
}

/** Bs 34.178,55 */
export function fmtBs(n: number): string {
    return `Bs ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 854,4637 Bs/USD */
export function fmtRate(rate: number): string {
    return `${Number(rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} Bs/USD`
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Montos en Bs de cada línea. El total en Bs es el que manda (puede ser lo
 * que el cliente pagó de verdad), así que las líneas se reparten con la tasa
 * efectiva total_bs / total_usd y el redondeo sobrante se ajusta en la línea
 * más grande: la suma de las líneas siempre da exactamente el total impreso.
 */
export function bolivarLines(invoice: BolivarInvoiceLike, itemValues: number[]): number[] {
    const total = Number(invoice.ves_total ?? 0)
    const usd = Number(invoice.total_amount)
    if (!usd || itemValues.length === 0) return itemValues.map(() => 0)
    const rate = total / usd
    const lines = itemValues.map((v) => round2(Number(v || 0) * rate))
    const diff = round2(total - lines.reduce((s, x) => s + x, 0))
    if (diff !== 0) {
        let biggest = 0
        lines.forEach((x, i) => {
            if (Math.abs(x) > Math.abs(lines[biggest])) biggest = i
        })
        lines[biggest] = round2(lines[biggest] + diff)
    }
    return lines
}
