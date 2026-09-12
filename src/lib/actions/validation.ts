import { z } from 'zod'

/**
 * Error de negocio con mensaje en español pensado para mostrarse
 * al usuario (o devolverse al asistente para que lo explique).
 */
export class ActionError extends Error {
    code: string
    constructor(message: string, code = 'ACTION_ERROR') {
        super(message)
        this.name = 'ActionError'
        this.code = code
    }
}

/** Valida la entrada contra un esquema zod y lanza ActionError legible si falla. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input)
    if (!result.success) {
        const detail = result.error.issues
            .map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`)
            .join('; ')
        throw new ActionError(`Datos incompletos o inválidos. ${detail}`, 'VALIDATION')
    }
    return result.data
}

export const uuidSchema = z.uuid('Identificador inválido')
export const periodSchema = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El periodo debe tener formato YYYY-MM')
export const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
export const moneySchema = z
    .number('El monto debe ser un número')
    .finite()
    .positive('El monto debe ser mayor que 0')
export const descriptionSchema = z
    .string('La descripción es obligatoria')
    .trim()
    .min(3, 'La descripción debe tener al menos 3 caracteres')
    .max(300, 'La descripción es demasiado larga')

export function currentPeriod(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function periodRange(period: string): { start: string; end: string } {
    const [y, m] = period.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString()
    const end = new Date(Date.UTC(y, m, 1)).toISOString()
    return { start, end }
}

/**
 * Zona horaria del usuario. El servidor corre en UTC, así que usar la fecha del
 * sistema haría que a partir de las 8 de la noche en Venezuela ya se considere
 * el día siguiente: una factura emitida de noche saldría fechada mañana.
 */
export const USER_TIMEZONE = process.env.USER_TIMEZONE || 'America/Caracas'

/** Fecha de hoy (YYYY-MM-DD) tal como la ve el usuario, no el servidor. */
export function todayISO(date = new Date()): string {
    // en-CA da directamente el formato YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: USER_TIMEZONE }).format(date)
}

/** Mañana (YYYY-MM-DD) para el usuario: para "posponer a mañana" con un clic. */
export function tomorrowISO(date = new Date()): string {
    return addDaysISO(todayISO(date), 1)
}

/** Suma (o resta, con negativo) días a una fecha YYYY-MM-DD sin líos de zona horaria. */
export function addDaysISO(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().split('T')[0]
}

export function round2(n: number): number {
    return Math.round(n * 100) / 100
}

/** Minúsculas, sin acentos, sin espacios sobrantes: para comparar nombres. */
export function normalizeText(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

export function errorMessage(e: unknown): string {
    if (e instanceof Error) return e.message
    if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message)
    return String(e)
}
