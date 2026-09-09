import type { Client, Invoice } from '@/types'

/**
 * Nota de condiciones de pago a imprimir en una factura. El override de la
 * factura (invoice.payment_note) manda sobre la nota estándar del cliente:
 * así una condición fija ("pagar en los primeros 10 días de cada mes") no se
 * arrastra a una factura puntual donde no aplica. Devuelve null si no hay
 * nada que imprimir.
 */
export function resolvePaymentNote(
    invoice: Pick<Invoice, 'payment_note'>,
    client: Pick<Client, 'payment_terms'> | null | undefined
): string | null {
    if (invoice.payment_note !== null && invoice.payment_note !== undefined) {
        return invoice.payment_note.trim() || null
    }
    return client?.payment_terms || null
}
