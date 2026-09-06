/**
 * Carga la imagen de cabecera de los documentos tanto en el navegador como
 * en el servidor (bot de Telegram). En el navegador se pide a /invoice-header.png;
 * en Node se pide al propio servidor (APP_BASE_URL o localhost:PORT).
 */
export interface HeaderImage {
    dataUrl: string
    bytes: Uint8Array
    width: number
    height: number
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: dv.getUint32(16), height: dv.getUint32(20) }
}

function toBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
}

function headerUrl(): string {
    if (typeof window !== 'undefined') return '/invoice-header.png'
    const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
    return `${base.replace(/\/$/, '')}/invoice-header.png`
}

let cached: HeaderImage | null | undefined

export async function loadHeaderImage(): Promise<HeaderImage | null> {
    if (cached !== undefined && typeof window === 'undefined') return cached
    try {
        const res = await fetch(headerUrl())
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        const dims = pngDimensions(bytes)
        if (!dims) throw new Error('No es un PNG válido')
        const img: HeaderImage = { dataUrl: `data:image/png;base64,${toBase64(bytes)}`, bytes, ...dims }
        if (typeof window === 'undefined') cached = img
        return img
    } catch (e) {
        console.error('No se pudo cargar la cabecera del documento', e)
        if (typeof window === 'undefined') cached = null
        return null
    }
}
